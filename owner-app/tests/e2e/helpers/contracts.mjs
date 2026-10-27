/**
 * HisaabLive E2E Test Suite - Authoritative Contracts & Specifications
 * Derived directly from ORIGINAL_REQUEST.md and PROJECT.md
 */

// R1: 4-Tab Navigation & Modals Specification
export const NAVIGATION_CONTRACT = {
  requiredTabs: ['hisaab', 'expenses', 'khata', 'reports'],
  tabLabelsEn: {
    hisaab: 'Live Hisaab',
    expenses: 'Expenses',
    khata: 'Khata Ledger',
    reports: 'Monthly Reports',
  },
  tabLabelsUr: {
    hisaab: 'لائیو حساب',
    expenses: 'اخراجات',
    khata: 'کھاتہ لیجر',
    reports: 'ماہانہ رپورٹ',
  },
  requiredModals: [
    'expense_add_modal',
    'khata_add_customer_modal',
    'khata_add_entry_modal',
    'statement_report_modal',
    'alerts_modal',
  ],
};

// R2: Soft-Modern Minimalist Deep Slate Color System
export const COLOR_SYSTEM_CONTRACT = {
  baseSlateDark: '#090d16',
  baseSlateLight: '#f1f5f9',
  cardSlateDark: '#1a243b',
  cardSlateLight: '#ffffff',
  borderSlateDark: '#223354',
  borderSlateLight: '#e2e8f0',
  semanticAccents: {
    emeraldMint: '#10b981', // Incoming sales & received payments
    amberWarm: '#f59e0b',   // Pending customer Khata receivables
    roseCrimson: '#f43f5e', // Outgoing expenses & alerts
    skyCyan: '#38bdf8',     // Primary brand accents & indicators
  },
};

// R3: Mobile Safe-Area & Notch Handling
export const SAFE_AREA_CONTRACT = {
  viewportMetaRequired: 'viewport-fit=cover',
  headerClassRequired: 'pt-safe',
  tabBarClassRequired: 'pb-safe',
  modalBottomPaddingRequired: 'pb-safe',
  cssVariables: [
    '--sat',
    '--sab',
    '--sal',
    '--sar',
  ],
};

// R4: Accounting & Business Logic Formulas
export const ACCOUNTING_CONTRACT = {
  expenseCategories: [
    'Chai / Pani',
    'Bijli / Bills',
    'Staff / Tankhwa',
    'Dukaan Kiraya',
    'Transport / Rickshaw',
    'Maintenance',
    'Other',
  ],
  todayPK: () => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  },
  // Today's Net Profit (Munafa) = Today's Sale - Today's Expenses
  calculateNetProfit: (sale, totalExpenses) => {
    return (Number(sale) || 0) - (Number(totalExpenses) || 0);
  },
  // Total Khata Receivables = Sum of all positive customer balances (customers who owe money)
  calculateReceivables: (customers) => {
    return (customers || [])
      .filter((c) => (Number(c.balance) || 0) > 0)
      .reduce((sum, c) => sum + Number(c.balance), 0);
  },
  // Khata entry impact on customer balance:
  // Udhaar Diya (+) increases what customer owes
  // Wasool Hua / Payment (-) decreases what customer owes
  applyEntryToBalance: (currentBalance, type, amount) => {
    const amt = Number(amount) || 0;
    if (type === 'udhaar') {
      return (Number(currentBalance) || 0) + amt;
    } else if (type === 'payment' || type === 'wasool') {
      return (Number(currentBalance) || 0) - amt;
    }
    throw new Error(`Unknown Khata entry type: ${type}`);
  },
  // Revert Khata entry impact
  revertEntryFromBalance: (currentBalance, type, amount) => {
    const amt = Number(amount) || 0;
    if (type === 'udhaar') {
      return (Number(currentBalance) || 0) - amt;
    } else if (type === 'payment' || type === 'wasool') {
      return (Number(currentBalance) || 0) + amt;
    }
    throw new Error(`Unknown Khata entry type: ${type}`);
  },
};

// Localization Contract
export const LOCALIZATION_CONTRACT = {
  supportedLanguages: ['en', 'ur'],
  requiredKeys: [
    'total_sale',
    'total_expense',
    'profit',
    'tab_hisaab',
    'tab_khata',
    'month_title',
    'month_sale',
    'month_expense',
    'month_profit',
    'khata_total',
    'add_customer',
    'customer_name',
    'customer_phone',
    'search',
    'no_customers',
    'save',
    'back',
    'balance',
    'owes',
    'advance',
    'udhaar',
    'payment',
    'amount',
    'note',
    'no_entries',
    'missing_today',
  ],
};
