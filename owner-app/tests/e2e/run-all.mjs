#!/usr/bin/env node
/**
 * HisaabLive Master E2E Test Suite Runner
 * Executes all 4 tiers of requirement-driven E2E tests and produces a structured summary report.
 *
 * Usage:
 *   node owner-app/tests/e2e/run-all.mjs
 *   node tests/e2e/run-all.mjs (from owner-app)
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors and glyphs for terminal output
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GRAY = '\x1b[90m';

const TIERS = [
  {
    name: 'Tier 1: Feature Coverage (Happy Paths)',
    file: 'tier1-features.test.mjs',
    scope: 'R1 Navigation, R2 Deep Slate Tokens, R3 Safe-Area, R4 Data Integrity',
  },
  {
    name: 'Tier 2: Boundary & Corner Cases',
    file: 'tier2-boundaries.test.mjs',
    scope: 'Zero sales/expenses, empty rosters, customer advances, large values, search',
  },
  {
    name: 'Tier 3: Cross-Feature Interactions',
    file: 'tier3-interactions.test.mjs',
    scope: 'Expense mutations & profit coupling, Khata lifecycle, bilingual & theme sync',
  },
  {
    name: 'Tier 4: Real-World Workload Scenarios',
    file: 'tier4-scenarios.test.mjs',
    scope: 'Morning opening, peak trading, POS tamper resolution, month-end PDF export',
  },
];

console.log(`${BOLD}${CYAN}================================================================================${RESET}`);
console.log(`${BOLD}${CYAN}     HisaabLive Shop Owner Dashboard Redesign - Automated E2E Test Suite       ${RESET}`);
console.log(`${BOLD}${CYAN}================================================================================${RESET}`);
console.log(`${GRAY}Target Directory : ${path.resolve(__dirname, '../../')}${RESET}`);
console.log(`${GRAY}Node Version     : ${process.version}${RESET}`);
console.log(`${GRAY}Timestamp        : ${new Date().toISOString()}${RESET}\n`);

let totalTests = 0;
let totalPass = 0;
let totalFail = 0;
const results = [];
const overallStartTime = Date.now();

for (const tier of TIERS) {
  const filePath = path.join(__dirname, tier.file);
  const startTime = Date.now();

  console.log(`${BOLD}▶ Executing ${tier.name}...${RESET}`);
  console.log(`  ${GRAY}Scope: ${tier.scope}${RESET}`);

  const proc = spawnSync(process.execPath, ['--test', filePath], {
    cwd: path.resolve(__dirname, '../../'),
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '1' },
  });

  const durationMs = Date.now() - startTime;
  const stdout = proc.stdout || '';
  const stderr = proc.stderr || '';

  // Parse node:test output metrics: "ℹ tests X", "ℹ pass Y", "ℹ fail Z"
  const testsMatch = stdout.match(/ℹ\s+tests\s+(\d+)/);
  const passMatch = stdout.match(/ℹ\s+pass\s+(\d+)/);
  const failMatch = stdout.match(/ℹ\s+fail\s+(\d+)/);

  const testsCount = testsMatch ? parseInt(testsMatch[1], 10) : 0;
  const passCount = passMatch ? parseInt(passMatch[1], 10) : 0;
  const failCount = failMatch ? parseInt(failMatch[1], 10) : 0;

  totalTests += testsCount;
  totalPass += passCount;
  totalFail += failCount;

  const passed = proc.status === 0 && failCount === 0;

  results.push({
    name: tier.name,
    file: tier.file,
    passed,
    tests: testsCount,
    passedCount: passCount,
    failedCount: failCount,
    durationMs,
    output: stdout,
    error: stderr,
  });

  if (passed) {
    console.log(`  ${GREEN}✔ PASSED${RESET} (${testsCount} tests passed in ${durationMs}ms)\n`);
  } else {
    console.log(`  ${RED}✖ FAILED${RESET} (${failCount} tests failed in ${durationMs}ms)`);
    if (stderr || stdout) {
      console.log(`${RED}${stderr || stdout}${RESET}\n`);
    }
  }
}

const totalDurationMs = Date.now() - overallStartTime;

// Summary Table
console.log(`${BOLD}${CYAN}--------------------------------------------------------------------------------${RESET}`);
console.log(`${BOLD}E2E TEST SUITE EXECUTION SUMMARY${RESET}`);
console.log(`${BOLD}${CYAN}--------------------------------------------------------------------------------${RESET}`);

for (const r of results) {
  const statusBadge = r.passed ? `${GREEN}✔ PASS${RESET}` : `${RED}✖ FAIL${RESET}`;
  const testInfo = `${r.passedCount}/${r.tests} tests`;
  const timeInfo = `${r.durationMs}ms`;
  console.log(`  ${statusBadge}  ${BOLD}${r.name.padEnd(46)}${RESET} [${testInfo.padStart(12)}] (${timeInfo.padStart(6)})`);
}

console.log(`${BOLD}${CYAN}--------------------------------------------------------------------------------${RESET}`);
console.log(`  ${BOLD}Total Tiers Executed :${RESET} ${TIERS.length}`);
console.log(`  ${BOLD}Total Test Cases     :${RESET} ${totalTests}`);
console.log(`  ${BOLD}Passed               :${RESET} ${GREEN}${totalPass}${RESET}`);
console.log(`  ${BOLD}Failed               :${RESET} ${totalFail > 0 ? RED : GREEN}${totalFail}${RESET}`);
console.log(`  ${BOLD}Total Duration       :${RESET} ${totalDurationMs}ms`);
console.log(`${BOLD}${CYAN}================================================================================${RESET}`);

if (totalFail > 0) {
  console.error(`\n${RED}${BOLD}E2E TEST SUITE FAILED: ${totalFail} test(s) failed.${RESET}`);
  process.exit(1);
} else {
  console.log(`\n${GREEN}${BOLD}E2E TEST SUITE PASSED: All ${totalPass} tests passed successfully!${RESET}\n`);
  process.exit(0);
}
