/**
 * HisaabLive E2E Test Suite - Canonical Test Fixtures
 */
import { ACCOUNTING_CONTRACT } from './contracts.mjs';

export const createShopFixture = (overrides = {}) => ({
  id: 'shop_test_01',
  shop_code: 'G10',
  shop_name: 'Al-Madina Super Store',
  owner_phone: '0300-1234567',
  status: 'active',
  today_sale: 68500,
  today_sale_date: ACCOUNTING_CONTRACT.todayPK(),
  today_missing: 0,
  start_date: '2026-10-01',
  current_expiry: '2026-11-26',
  license_active: true,
  ...overrides,
});

export const createExpensesFixture = () => [
  { id: 'exp_1', title: 'Generator Fuel', amount: 2500, category: 'Maintenance', date: ACCOUNTING_CONTRACT.todayPK() },
  { id: 'exp_2', title: 'Bakery Tea & Refreshments', amount: 450, category: 'Chai / Pani', date: ACCOUNTING_CONTRACT.todayPK() },
  { id: 'exp_3', title: 'Counter Boy Daily Wage', amount: 1500, category: 'Staff / Tankhwa', date: ACCOUNTING_CONTRACT.todayPK() },
  { id: 'exp_4', title: 'Rickshaw Goods Delivery', amount: 600, category: 'Transport / Rickshaw', date: ACCOUNTING_CONTRACT.todayPK() },
];

export const createCustomersFixture = () => [
  { id: 'cust_1', name: 'Muhammad Tariq (G-10/4)', phone: '0345-1234567', balance: 2800 },
  { id: 'cust_2', name: 'Haji Rasheed Ahmed', phone: '0300-7654321', balance: 5200 },
  { id: 'cust_3', name: 'Farhan Ali (Tailor Master)', phone: '0321-9876543', balance: -750 }, // Advance paid
  { id: 'cust_4', name: 'Shahid Khan (Driver)', phone: '0333-5551234', balance: 0 },         // Setteled
];

export const createEntriesFixture = () => ({
  cust_1: [
    { id: 'ent_101', type: 'udhaar', amount: 2800, note: 'Rice & Cooking Oil', date: ACCOUNTING_CONTRACT.todayPK() },
  ],
  cust_2: [
    { id: 'ent_201', type: 'udhaar', amount: 7200, note: 'Monthly Ration Grocery', date: '2026-10-24' },
    { id: 'ent_202', type: 'payment', amount: 2000, note: 'Partial Cash Payment', date: ACCOUNTING_CONTRACT.todayPK() },
  ],
  cust_3: [
    { id: 'ent_301', type: 'payment', amount: 750, note: 'Advance for sugar', date: ACCOUNTING_CONTRACT.todayPK() },
  ],
});

export const createAlertsFixture = () => [
  {
    id: 'alt_1',
    type: 'deleted',
    severity: 'high',
    day: ACCOUNTING_CONTRACT.todayPK(),
    amount: 4000,
    seen: false,
    message_en: 'Cashier deleted Bill INV-0004 (Rs. 4,000) from POS today.',
    message_ur: 'کیشیئر نے پی او ایس سے بل INV-0004 (4,000 روپے) ڈیلیٹ کیا۔',
  },
  {
    id: 'alt_2',
    type: 'lowered',
    severity: 'medium',
    day: ACCOUNTING_CONTRACT.todayPK(),
    amount: 6300,
    seen: false,
    message_en: 'Bill INV-0007 total was lowered from Rs. 7,000 to Rs. 700 in POS.',
    message_ur: 'بل INV-0007 کی رقم 7,000 سے کم کر کے 700 کر دی گئی۔',
  },
];
