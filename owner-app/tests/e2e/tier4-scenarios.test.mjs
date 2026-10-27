/**
 * Tier 4: Real-World Workload Scenarios
 * Tests complete end-to-end shopkeeper daily operational workflows:
 * - Scenario 1: Morning Opening Routine (Cash drawer, customer debt inspection, alert audit)
 * - Scenario 2: Peak Daytime Trading (Multi-category expenses, POS sales, credit purchases, debt recovery)
 * - Scenario 3: Evening Closing & Anomaly Detection (POS bill deletion flagged, investigation, wages paid, closing profit)
 * - Scenario 4: Month-End Audit & 1-Tap PDF Statement Export (Data rollup, category aggregation, jsPDF verification)
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNTING_CONTRACT } from './helpers/contracts.mjs';
import { HisaabStateEngine } from './helpers/state-engine.mjs';
import { PdfStatementVerifier } from './helpers/pdf-verifier.mjs';

describe('Tier 4: Real-World Workload Scenarios', () => {

  // --- Scenario 1: Morning Opening Routine ---
  test('Scenario 1: Shopkeeper Morning Opening Routine', () => {
    const today = ACCOUNTING_CONTRACT.todayPK();
    const engine = new HisaabStateEngine({
      today,
      shopOverrides: {
        shop_name: 'Madina Super Store',
        shop_code: 'G10',
        today_sale: 0,
        today_sale_date: today,
        today_missing: 0,
      },
      expenses: [],
      customers: [
        { id: 'c1', name: 'Haji Rasheed', phone: '0300-1111111', balance: 5200 },
        { id: 'c2', name: 'Tariq Mehmood', phone: '0345-2222222', balance: 3400 },
        { id: 'c3', name: 'Advance Customer', phone: '0321-3333333', balance: -500 },
      ],
      alerts: [],
    });

    // 1. Verify shop profile and initial zero-state for new day
    assert.equal(engine.shop.shop_name, 'Madina Super Store');
    assert.equal(engine.shop.today_sale_date, today);
    assert.equal(engine.todaySale, 0);
    assert.equal(engine.todayTotalExpenses, 0);
    assert.equal(engine.todayNetProfit, 0);

    // 2. Audit pending Khata receivables across all credit customers
    // 5200 + 3400 = 8600 (ignoring advance of -500)
    assert.equal(engine.totalKhataReceivables, 8600, 'Morning receivables must sum only positive balances');

    // 3. Confirm zero security tamper flags at opening
    assert.equal(engine.todayMissing, 0);
    assert.equal(engine.alerts.length, 0);
  });

  // --- Scenario 2: Peak Daytime Trading Workflow ---
  test('Scenario 2: Peak Daytime Trading Operations with Real-Time Math Recalibration', () => {
    const today = ACCOUNTING_CONTRACT.todayPK();
    const engine = new HisaabStateEngine({
      today,
      shopOverrides: {
        today_sale: 0,
        today_sale_date: today,
      },
      expenses: [],
      customers: [
        { id: 'c_rasheed', name: 'Haji Rasheed', phone: '0300-7654321', balance: 5000 },
      ],
      entries: { c_rasheed: [] },
    });

    // 08:30 AM: Morning tea & milk delivery logged under Chai / Pani
    const expChai = engine.addExpense({ title: 'Morning Chai & Milk', amount: 450, category: 'Chai / Pani' });
    assert.equal(engine.todayTotalExpenses, 450);
    assert.equal(engine.todayNetProfit, -450);

    // 10:00 AM: Goods delivery via rickshaw logged under Transport / Rickshaw
    const expTransport = engine.addExpense({ title: 'Wholesale Rickshaw Delivery', amount: 1200, category: 'Transport / Rickshaw' });
    assert.equal(engine.todayTotalExpenses, 1650);

    // 11:30 AM: Generator fuel during power outage logged under Maintenance
    const expGen = engine.addExpense({ title: 'Generator Fuel 5 Liters', amount: 2400, category: 'Maintenance' });
    assert.equal(engine.todayTotalExpenses, 4050);

    // 01:00 PM: POS updates today's sales to Rs. 84,500
    engine.shop.today_sale = 84500;
    assert.equal(engine.todaySale, 84500);
    // Net profit immediately reflects: 84500 - 4050 = 80450
    assert.equal(engine.todayNetProfit, 80450);

    // 02:30 PM: Haji Rasheed takes monthly groceries on credit for Rs. 6,800
    const entryUdhaar = engine.addKhataEntry({
      customerId: 'c_rasheed',
      type: 'udhaar',
      amount: 6800,
      note: 'Rice, Oil, Sugar on credit',
    });
    assert.equal(entryUdhaar.updatedBalance, 11800); // 5000 + 6800
    assert.equal(engine.totalKhataReceivables, 11800);

    // 03:45 PM: New customer Farhan Ali arrives, added to Khata
    const custFarhan = engine.addCustomer({ name: 'Farhan Ali Tailor', phone: '0321-9998877' });
    assert.equal(custFarhan.balance, 0);

    // Farhan makes advance payment of Rs. 1,000 for upcoming supplies
    engine.addKhataEntry({
      customerId: custFarhan.id,
      type: 'payment',
      amount: 1000,
      note: 'Advance for sugar bags',
    });
    assert.equal(custFarhan.balance, -1000);
    // Receivables remain 11,800 because advance does not reduce other customers' debt
    assert.equal(engine.totalKhataReceivables, 11800);

    // 05:00 PM: Haji Rasheed stops by and pays Rs. 4,000 cash
    engine.addKhataEntry({
      customerId: 'c_rasheed',
      type: 'payment',
      amount: 4000,
      note: 'Cash payment on account',
    });
    assert.equal(engine.customers.find((c) => c.id === 'c_rasheed').balance, 7800); // 11800 - 4000
    assert.equal(engine.totalKhataReceivables, 7800);

    // Final Net profit check remains intact: 80,450
    assert.equal(engine.todayNetProfit, 80450);
  });

  // --- Scenario 3: Evening Closing & Anomaly Detection ---
  test('Scenario 3: Evening POS Anomaly Detection, Resolution & Daily Close Audit', () => {
    const today = ACCOUNTING_CONTRACT.todayPK();
    const engine = new HisaabStateEngine({
      today,
      shopOverrides: {
        today_sale: 84500,
        today_sale_date: today,
        today_missing: 0,
      },
      expenses: [
        { id: 'e1', amount: 450, category: 'Chai / Pani', date: today },
        { id: 'e2', amount: 1200, category: 'Transport / Rickshaw', date: today },
        { id: 'e3', amount: 2400, category: 'Maintenance', date: today },
      ],
      alerts: [],
    });

    // 1. Mid-evening: POS cashier deletes Bill INV-0042 of Rs. 3,200
    engine.shop.today_missing = 3200;
    engine.alerts.push({
      id: 'alt_42',
      type: 'deleted',
      severity: 'high',
      day: today,
      amount: 3200,
      seen: false,
      message_en: 'Cashier deleted Bill INV-0042 (Rs. 3,200) from POS.',
    });

    // 2. Owner alerted via Hisaab banner
    assert.equal(engine.todayMissing, 3200);
    assert.ok(engine.todayMissing > 0, 'Tamper banner must be active');

    // 3. Owner investigates and marks alert as seen
    const unacknowledged = engine.alerts.filter((a) => !a.seen).length;
    assert.equal(unacknowledged, 1);
    const resolved = engine.acknowledgeAllAlerts();
    assert.equal(resolved, 1);
    assert.equal(engine.alerts.filter((a) => !a.seen).length, 0);

    // 4. Owner pays counter boy daily wage (Staff / Tankhwa: Rs. 1,500)
    engine.addExpense({ title: 'Counter Boy Daily Wage', amount: 1500, category: 'Staff / Tankhwa' });
    assert.equal(engine.todayTotalExpenses, 5550); // 450 + 1200 + 2400 + 1500

    // 5. Daily Close Reconciliation
    // Gross Sales: 84,500 | Total Kharcha: 5,550 | Net Profit (Munafa): 78,950
    assert.equal(engine.todaySale, 84500);
    assert.equal(engine.todayTotalExpenses, 5550);
    assert.equal(engine.todayNetProfit, 78950);
  });

  // --- Scenario 4: Month-End Audit & 1-Tap jsPDF Statement Export ---
  test('Scenario 4: Month-End Financial Audit & 1-Tap jsPDF Statement Generation', () => {
    const ym = '2026-10';
    const monthExpenses = [
      { id: 'm1', date: `${ym}-01`, title: 'Dukaan Monthly Rent', amount: 35000, category: 'Dukaan Kiraya' },
      { id: 'm2', date: `${ym}-05`, title: 'Senior Cashier Salary', amount: 32000, category: 'Staff / Tankhwa' },
      { id: 'm3', date: `${ym}-05`, title: 'Helper Boy Wage', amount: 18000, category: 'Staff / Tankhwa' },
      { id: 'm4', date: `${ym}-10`, title: 'Commercial Electric Bill', amount: 14800, category: 'Bijli / Bills' },
      { id: 'm5', date: `${ym}-12`, title: 'PTCL Internet Bill', amount: 3200, category: 'Bijli / Bills' },
      { id: 'm6', date: `${ym}-18`, title: 'Generator Mobil Oil & Servicing', amount: 4500, category: 'Maintenance' },
      { id: 'm7', date: `${ym}-22`, title: 'Wholesale Rickshaw Freight', amount: 3600, category: 'Transport / Rickshaw' },
      { id: 'm8', date: `${ym}-25`, title: 'Monthly Tea & Sugar Stock', amount: 4800, category: 'Chai / Pani' },
      { id: 'm9', date: `${ym}-28`, title: 'Packaging Bags Wholesale', amount: 6000, category: 'Other' },
    ];

    const engine = new HisaabStateEngine({
      shopOverrides: {
        shop_name: 'Al-Madina Super Store',
        shop_code: 'G10',
        today_sale: 85000,
      },
      expenses: monthExpenses,
    });

    // 1. Aggregate monthly summary
    const summary = engine.getMonthlySummary(ym);
    assert.equal(summary.yearMonth, ym);
    assert.equal(summary.expensesCount, 9);
    assert.equal(summary.totalExpenses, 121900); // Sum of all 9 expenses

    // 2. Verify category breakdown table
    assert.equal(summary.categoryBreakdown['Dukaan Kiraya'], 35000);
    assert.equal(summary.categoryBreakdown['Staff / Tankhwa'], 50000); // 32000 + 18000
    assert.equal(summary.categoryBreakdown['Bijli / Bills'], 18000);    // 14800 + 3200
    assert.equal(summary.categoryBreakdown['Maintenance'], 4500);
    assert.equal(summary.categoryBreakdown['Transport / Rickshaw'], 3600);
    assert.equal(summary.categoryBreakdown['Chai / Pani'], 4800);
    assert.equal(summary.categoryBreakdown['Other'], 6000);

    // 3. 1-Tap PDF Statement Generation
    const catList = Object.entries(summary.categoryBreakdown).map(([name, total]) => ({ name, total }));
    const pdf = PdfStatementVerifier.generateAndVerify({
      shopName: engine.shop.shop_name,
      shopCode: engine.shop.shop_code,
      month: 'October 2026',
      sale: summary.totalSales,
      expense: summary.totalExpenses,
      profit: summary.netProfit,
      margin: ((summary.netProfit / summary.totalSales) * 100).toFixed(1),
      catBreakdown: catList,
      items: summary.expensesList,
    });

    assert.equal(pdf.success, true);
    assert.equal(pdf.totalPages >= 1, true);
    assert.ok(pdf.byteLength > 2000, 'PDF buffer must contain substantial document bytes');
    assert.equal(pdf.cardsCount, 4, 'Must render the 4 standard financial KPI cards');
  });
});
