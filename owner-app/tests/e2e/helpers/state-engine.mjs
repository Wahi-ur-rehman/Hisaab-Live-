/**
 * HisaabLive E2E Test Suite - Headless State & Domain Engine
 * Simulates user interactions and business state transitions strictly
 * according to PROJECT.md and ORIGINAL_REQUEST.md contracts.
 */
import { ACCOUNTING_CONTRACT, NAVIGATION_CONTRACT, LOCALIZATION_CONTRACT } from './contracts.mjs';
import {
  createShopFixture,
  createExpensesFixture,
  createCustomersFixture,
  createEntriesFixture,
  createAlertsFixture,
} from './fixtures.mjs';

export class HisaabStateEngine {
  constructor(options = {}) {
    this.shop = createShopFixture(options.shopOverrides);
    this.expenses = options.expenses ? [...options.expenses] : createExpensesFixture();
    this.customers = options.customers ? [...options.customers] : createCustomersFixture();
    this.entries = options.entries ? JSON.parse(JSON.stringify(options.entries)) : createEntriesFixture();
    this.alerts = options.alerts ? [...options.alerts] : createAlertsFixture();

    this.activeTab = options.initialTab || 'hisaab';
    this.themeMode = options.initialTheme || 'dark';
    this.lang = options.initialLang || 'en';
    this.activeModal = null;
    this.selectedCustomerId = null;
    this.today = options.today || ACCOUNTING_CONTRACT.todayPK();
    this.listeners = [];
  }

  // --- Navigation & View Management ---
  setActiveTab(tabName) {
    if (!NAVIGATION_CONTRACT.requiredTabs.includes(tabName)) {
      throw new Error(`Invalid navigation tab requested: ${tabName}`);
    }
    this.activeTab = tabName;
    return this.activeTab;
  }

  openModal(modalName) {
    this.activeModal = modalName;
  }

  closeModal() {
    this.activeModal = null;
  }

  // --- Theme Mode ---
  toggleTheme() {
    this.themeMode = this.themeMode === 'dark' ? 'light' : 'dark';
    return this.themeMode;
  }

  // --- Language & RTL ---
  toggleLanguage() {
    this.lang = this.lang === 'en' ? 'ur' : 'en';
    return this.lang;
  }

  get isRtl() {
    return this.lang === 'ur';
  }

  get textDirection() {
    return this.isRtl ? 'rtl' : 'ltr';
  }

  // --- Live Hisaab Business Calculations ---
  get todaySale() {
    if (this.shop.today_sale_date === this.today) {
      return Number(this.shop.today_sale) || 0;
    }
    return 0; // Awaiting POS sync for new day
  }

  get todayMissing() {
    if (this.shop.today_sale_date === this.today) {
      return Number(this.shop.today_missing) || 0;
    }
    return 0;
  }

  get todayExpensesList() {
    return this.expenses.filter((e) => e.date === this.today);
  }

  get todayTotalExpenses() {
    return this.todayExpensesList.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }

  get todayNetProfit() {
    return ACCOUNTING_CONTRACT.calculateNetProfit(this.todaySale, this.todayTotalExpenses);
  }

  // --- Expenses CRUD ---
  addExpense({ title, amount, category, date }) {
    const amt = Number(amount);
    if (isNaN(amt) || amt <= 0) {
      throw new Error(`Invalid expense amount: ${amount}. Amount must be greater than zero.`);
    }
    if (!category || typeof category !== 'string') {
      throw new Error('Expense category is required.');
    }
    const newExpense = {
      id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: title || 'Untitled Expense',
      amount: amt,
      category,
      date: date || this.today,
      created_at: new Date().toISOString(),
    };
    this.expenses.push(newExpense);
    return newExpense;
  }

  deleteExpense(expenseId) {
    const index = this.expenses.findIndex((e) => e.id === expenseId);
    if (index === -1) {
      throw new Error(`Expense with ID ${expenseId} not found.`);
    }
    const [deleted] = this.expenses.splice(index, 1);
    return deleted;
  }

  getExpensesByCategory(targetDate = null) {
    const filterDate = targetDate || this.today;
    const filtered = this.expenses.filter((e) => e.date === filterDate);
    const breakdown = {};
    for (const cat of ACCOUNTING_CONTRACT.expenseCategories) {
      breakdown[cat] = 0;
    }
    for (const exp of filtered) {
      breakdown[exp.category] = (breakdown[exp.category] || 0) + Number(exp.amount || 0);
    }
    return breakdown;
  }

  // --- Khata Ledger Management ---
  get totalKhataReceivables() {
    return ACCOUNTING_CONTRACT.calculateReceivables(this.customers);
  }

  addCustomer({ name, phone, address = '' }) {
    if (!name || name.trim() === '') {
      throw new Error('Customer name is required.');
    }
    const newCustomer = {
      id: `cust_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      phone: (phone || '').trim(),
      address: address.trim(),
      balance: 0,
      created_at: new Date().toISOString(),
    };
    this.customers.push(newCustomer);
    this.entries[newCustomer.id] = [];
    return newCustomer;
  }

  selectCustomer(customerId) {
    const customer = this.customers.find((c) => c.id === customerId);
    if (!customer) {
      throw new Error(`Customer with ID ${customerId} not found.`);
    }
    this.selectedCustomerId = customerId;
    return customer;
  }

  addKhataEntry({ customerId, type, amount, note, date }) {
    const customer = this.customers.find((c) => c.id === customerId);
    if (!customer) {
      throw new Error(`Customer with ID ${customerId} not found.`);
    }
    const amt = Number(amount);
    if (isNaN(amt) || amt <= 0) {
      throw new Error(`Invalid entry amount: ${amount}. Must be > 0.`);
    }
    if (type !== 'udhaar' && type !== 'payment' && type !== 'wasool') {
      throw new Error(`Invalid entry type: ${type}`);
    }

    const canonicalType = type === 'wasool' ? 'payment' : type;

    const entry = {
      id: `ent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: canonicalType,
      amount: amt,
      note: note || '',
      date: date || this.today,
      created_at: new Date().toISOString(),
    };

    if (!this.entries[customerId]) {
      this.entries[customerId] = [];
    }
    this.entries[customerId].unshift(entry);

    // Update customer balance atomically
    customer.balance = ACCOUNTING_CONTRACT.applyEntryToBalance(customer.balance, canonicalType, amt);
    return { entry, updatedBalance: customer.balance };
  }

  deleteKhataEntry(customerId, entryId) {
    const customer = this.customers.find((c) => c.id === customerId);
    if (!customer) {
      throw new Error(`Customer with ID ${customerId} not found.`);
    }
    const customerEntries = this.entries[customerId] || [];
    const index = customerEntries.findIndex((e) => e.id === entryId);
    if (index === -1) {
      throw new Error(`Entry ${entryId} not found for customer ${customerId}.`);
    }

    const [deletedEntry] = customerEntries.splice(index, 1);
    // Reverse balance effect
    customer.balance = ACCOUNTING_CONTRACT.revertEntryFromBalance(
      customer.balance,
      deletedEntry.type,
      deletedEntry.amount
    );
    return { deletedEntry, updatedBalance: customer.balance };
  }

  searchCustomers(query) {
    if (!query || query.trim() === '') {
      return [...this.customers];
    }
    const q = query.trim().toLowerCase();
    return this.customers.filter(
      (c) =>
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.phone && c.phone.toLowerCase().includes(q))
    );
  }

  // --- Monthly Report Aggregations ---
  getMonthlySummary(yearMonth) {
    const ym = yearMonth || this.today.slice(0, 7); // 'YYYY-MM'
    const monthExpenses = this.expenses.filter((e) => (e.date || '').startsWith(ym));
    const totalMonthExpense = monthExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    // Compute category breakdown
    const categoryBreakdown = {};
    for (const cat of ACCOUNTING_CONTRACT.expenseCategories) {
      categoryBreakdown[cat] = 0;
    }
    for (const exp of monthExpenses) {
      categoryBreakdown[exp.category] =
        (categoryBreakdown[exp.category] || 0) + Number(exp.amount || 0);
    }

    // Monthly sales (for demo/test calculation)
    const monthlySale = (Number(this.shop.today_sale) || 0) * 22; // Representative 22-day business month
    const monthlyProfit = monthlySale - totalMonthExpense;

    return {
      yearMonth: ym,
      totalSales: monthlySale,
      totalExpenses: totalMonthExpense,
      netProfit: monthlyProfit,
      expensesCount: monthExpenses.length,
      categoryBreakdown,
      expensesList: monthExpenses,
    };
  }

  // --- POS Alerts Handling ---
  acknowledgeAllAlerts() {
    const unseenCount = this.alerts.filter((a) => !a.seen).length;
    this.alerts.forEach((a) => {
      a.seen = true;
    });
    return unseenCount;
  }
}
