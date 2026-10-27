/**
 * Tier 2: Boundary & Corner Cases
 * Tests edge conditions, zero/negative balances, extreme values, empty states,
 * and search filtering corner cases according to PROJECT.md.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNTING_CONTRACT } from './helpers/contracts.mjs';
import { HisaabStateEngine } from './helpers/state-engine.mjs';

describe('Tier 2: Boundary & Corner Cases', () => {

  // --- T2.1 & T2.2: Zero Sales and Zero Expenses Boundaries ---
  describe('Sales and Expenses Arithmetic Boundaries', () => {
    test('Zero-sales day results in formatted negative Net Profit (loss) without arithmetic faults', () => {
      const engine = new HisaabStateEngine({
        shopOverrides: { today_sale: 0 },
        expenses: [
          { id: 'e1', amount: 3500, category: 'Maintenance', date: ACCOUNTING_CONTRACT.todayPK() },
          { id: 'e2', amount: 1500, category: 'Staff / Tankhwa', date: ACCOUNTING_CONTRACT.todayPK() },
        ],
      });

      assert.equal(engine.todaySale, 0);
      assert.equal(engine.todayTotalExpenses, 5000);
      assert.equal(engine.todayNetProfit, -5000);
      assert.ok(engine.todayNetProfit < 0, 'Net profit should be negative on zero sale day');
    });

    test('Zero-expenses day preserves 100% of Today Sale as Net Profit', () => {
      const engine = new HisaabStateEngine({
        shopOverrides: { today_sale: 75000 },
        expenses: [],
      });

      assert.equal(engine.todaySale, 75000);
      assert.equal(engine.todayTotalExpenses, 0);
      assert.equal(engine.todayNetProfit, 75000);
    });
  });

  // --- T2.3: Empty List States ---
  describe('Empty Datasets and Null State Handling', () => {
    test('Empty expenses collection safely yields 0 total expenses and empty list', () => {
      const engine = new HisaabStateEngine({ expenses: [] });
      assert.deepEqual(engine.todayExpensesList, []);
      assert.equal(engine.todayTotalExpenses, 0);
      assert.equal(engine.getExpensesByCategory()['Chai / Pani'], 0);
    });

    test('Empty Khata customer roster yields 0 total receivables', () => {
      const engine = new HisaabStateEngine({ customers: [], entries: {} });
      assert.deepEqual(engine.customers, []);
      assert.equal(engine.totalKhataReceivables, 0);
    });

    test('Customer with zero transaction entries displays balance 0 and empty ledger', () => {
      const engine = new HisaabStateEngine({
        customers: [{ id: 'c_empty', name: 'New Customer', phone: '0311-0000000', balance: 0 }],
        entries: { c_empty: [] },
      });
      assert.equal(engine.customers[0].balance, 0);
      assert.deepEqual(engine.entries.c_empty, []);
    });
  });

  // --- T2.4: Zero and Negative Khata Balances ---
  describe('Khata Balance Boundaries (Zero & Customer Advances)', () => {
    test('Customer with exact zero balance is excluded from positive receivables', () => {
      const engine = new HisaabStateEngine({
        customers: [
          { id: 'c1', name: 'Zero Balance Customer', phone: '0300-1111111', balance: 0 },
        ],
      });
      assert.equal(engine.totalKhataReceivables, 0);
    });

    test('Customer with advance overpayment (negative balance) is excluded from positive receivables', () => {
      const engine = new HisaabStateEngine({
        customers: [
          { id: 'c1', name: 'Advance Payer', phone: '0300-2222222', balance: -1500 }, // Overpaid advance
          { id: 'c2', name: 'Debtor', phone: '0300-3333333', balance: 4000 },        // Owes Rs. 4,000
        ],
      });

      // Total receivables must strictly sum only positive balances (4,000), not (4,000 - 1,500 = 2,500)
      assert.equal(engine.totalKhataReceivables, 4000);
    });

    test('Receivables with mixed positive, negative, and zero balances sums only positive debts', () => {
      const customers = [
        { id: 'c1', balance: 2800 },  // Positive
        { id: 'c2', balance: 5200 },  // Positive
        { id: 'c3', balance: -750 },  // Negative (Advance)
        { id: 'c4', balance: 0 },     // Zero
        { id: 'c5', balance: 10000 }, // Positive
        { id: 'c6', balance: -5000 }, // Negative
      ];
      const receivables = ACCOUNTING_CONTRACT.calculateReceivables(customers);
      assert.equal(receivables, 18000); // 2800 + 5200 + 10000
    });
  });

  // --- T2.5: Extreme Values & Precision Stress ---
  describe('Extreme Values & Precision Stress', () => {
    test('Handles multi-crore sales and expenses without integer overflow', () => {
      const largeSale = 125000000; // PKR 12.5 Crore
      const largeExp = 45000000;   // PKR 4.5 Crore
      const engine = new HisaabStateEngine({
        shopOverrides: { today_sale: largeSale },
        expenses: [
          { id: 'big_exp', amount: largeExp, category: 'Dukaan Kiraya', date: ACCOUNTING_CONTRACT.todayPK() },
        ],
      });

      assert.equal(engine.todaySale, largeSale);
      assert.equal(engine.todayTotalExpenses, largeExp);
      assert.equal(engine.todayNetProfit, 80000000); // 8 Crore
      assert.equal(engine.todayNetProfit.toLocaleString(), '80,000,000');
    });

    test('Handles fractional currency amounts without floating point drift', () => {
      const engine = new HisaabStateEngine({
        shopOverrides: { today_sale: 1000.75 },
        expenses: [
          { id: 'f1', amount: 150.25, category: 'Chai / Pani', date: ACCOUNTING_CONTRACT.todayPK() },
          { id: 'f2', amount: 200.50, category: 'Other', date: ACCOUNTING_CONTRACT.todayPK() },
        ],
      });

      assert.equal(engine.todayTotalExpenses, 350.75);
      assert.equal(Number(engine.todayNetProfit.toFixed(2)), 650.00);
    });

    test('Accepts very long customer names and notes without crashing', () => {
      const longName = 'Al-Hajj Malik Muhammad Sultan Khan Niazi of Mianwali Warehouse Branch #4';
      const longNote = 'Payment received via cross cheque #48201948 drawn on Habib Bank Limited Blue Area Islamabad';
      const engine = new HisaabStateEngine({ customers: [], entries: {} });

      const customer = engine.addCustomer({ name: longName, phone: '0300-9999999' });
      assert.equal(customer.name, longName);

      const entry = engine.addKhataEntry({
        customerId: customer.id,
        type: 'payment',
        amount: 25000,
        note: longNote,
      });
      assert.equal(entry.entry.note, longNote);
    });
  });

  // --- T2.6: Search Filtering Corner Cases ---
  describe('Khata Search Filtering Corner Cases', () => {
    const testCustomers = [
      { id: 'c1', name: 'Muhammad Tariq', phone: '0345-1234567', balance: 2800 },
      { id: 'c2', name: 'Haji Rasheed Ahmed', phone: '0300-7654321', balance: 5200 },
      { id: 'c3', name: 'Farhan Ali', phone: '0321-9876543', balance: -750 },
    ];

    test('Search non-matches return clean empty array without error', () => {
      const engine = new HisaabStateEngine({ customers: testCustomers });
      const results = engine.searchCustomers('xyzNonExistentName999');
      assert.deepEqual(results, []);
    });

    test('Search is case-insensitive for customer names', () => {
      const engine = new HisaabStateEngine({ customers: testCustomers });
      assert.equal(engine.searchCustomers('tariq').length, 1);
      assert.equal(engine.searchCustomers('TARIQ').length, 1);
      assert.equal(engine.searchCustomers('TaRiQ').length, 1);
      assert.equal(engine.searchCustomers('tariq')[0].name, 'Muhammad Tariq');
    });

    test('Search matches substring of phone number', () => {
      const engine = new HisaabStateEngine({ customers: testCustomers });
      const results = engine.searchCustomers('9876');
      assert.equal(results.length, 1);
      assert.equal(results[0].name, 'Farhan Ali');
    });

    test('Search handles regex meta-characters without crashing', () => {
      const engine = new HisaabStateEngine({ customers: testCustomers });
      assert.doesNotThrow(() => {
        const results = engine.searchCustomers('***[([\\^$');
        assert.deepEqual(results, []);
      });
    });
  });

  // --- T2.7: Midnight Date Rollover ---
  describe('Midnight Date Rollover Verification', () => {
    test('Sales from prior date reset to 0 if today_sale_date does not match todayPK', () => {
      const engine = new HisaabStateEngine({
        today: '2026-10-27',
        shopOverrides: {
          today_sale: 84000,
          today_sale_date: '2026-10-26', // Yesterday's date
          today_missing: 5000,
        },
      });

      // Since shop date is 2026-10-26 and today is 2026-10-27, sales and missing must evaluate to 0
      assert.equal(engine.todaySale, 0);
      assert.equal(engine.todayMissing, 0);
    });
  });

  // --- T2.8: Input Validation & Boundary Error Handling ---
  describe('Input Validation & Error Safeguards', () => {
    test('Adding expense with amount <= 0 throws validation error', () => {
      const engine = new HisaabStateEngine({ expenses: [] });
      assert.throws(() => {
        engine.addExpense({ title: 'Invalid Exp', amount: 0, category: 'Other' });
      }, /Amount must be greater than zero/);

      assert.throws(() => {
        engine.addExpense({ title: 'Negative Exp', amount: -500, category: 'Other' });
      }, /Amount must be greater than zero/);
    });

    test('Adding customer with empty name throws validation error', () => {
      const engine = new HisaabStateEngine({ customers: [] });
      assert.throws(() => {
        engine.addCustomer({ name: '   ', phone: '0300-1111111' });
      }, /Customer name is required/);
    });

    test('Adding Khata entry with invalid type throws error', () => {
      const engine = new HisaabStateEngine({
        customers: [{ id: 'c1', name: 'Test', balance: 0 }],
      });
      assert.throws(() => {
        engine.addKhataEntry({ customerId: 'c1', type: 'invalid_type', amount: 100 });
      }, /Invalid entry type/);
    });
  });
});
