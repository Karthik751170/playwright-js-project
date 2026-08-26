const { test, expect } = require('../../fixtures/zapFixture');
const herculesConfig = require('../../config/hercules.config');
const path = require('path');

test.describe('OWASP ZAP Passive Security Scan - Hercules Platform', () => {
  const TARGET_URL = process.env.TARGET_URL || herculesConfig.baseUrl || 'https://dev.hercules.works';
  const REPORT_PATH = path.resolve(process.cwd(), 'test-results/security/zap-passive-report.html');

  test.beforeAll(async ({ zap }) => {
    const isReady = await zap.isReady();
    if (!isReady) {
      throw new Error(
        'OWASP ZAP daemon is not reachable on ' +
        (process.env.ZAP_URL || 'http://127.0.0.1:8080') +
        '. Please start ZAP first (e.g., using `npm run zap:start`).'
      );
    }
    await zap.newSession('Hercules_Passive_Scan', true);
  });

  test('Execute User Flow on dev.hercules.works & Validate Security Posture', async ({ page, zap }) => {
    // 1. Navigate application flows through the ZAP Proxy
    console.log(`[ZAP] Navigating through: ${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Navigate to key public/app routes to allow ZAP to passively inspect them
    const routesToScan = ['/pricing', '/ai'];
    for (const route of routesToScan) {
      try {
        console.log(`[ZAP] Inspecting route: ${TARGET_URL}${route}`);
        await page.goto(`${TARGET_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(2000);
      } catch (err) {
        console.log(`[ZAP] Note on route ${route}: ${err.message}`);
      }
    }

    // 2. Wait for ZAP's passive scanner to finish processing all HTTP requests/responses
    console.log('[ZAP] Waiting for passive scan queue to finish...');
    await zap.waitForPassiveScan(60000);

    // 3. Retrieve and display alert statistics
    const summary = await zap.getAlertSummary(TARGET_URL);
    console.log('\n================ OWASP ZAP SCAN SUMMARY ================');
    console.table(summary);
    console.log('========================================================\n');

    // 4. Export detailed HTML Security Report
    await zap.saveReport(REPORT_PATH, 'html', 'Security Scan Report - ' + TARGET_URL);
    console.log(`[ZAP] Full HTML report saved to: ${REPORT_PATH}`);

    // 5. Security Quality Gate: Enforce 0 High and 0 Medium vulnerabilities
    await zap.assertThresholds({
      baseUrl: TARGET_URL,
      maxHigh: 0,
      maxMedium: 0,
      maxLow: 10,
    });
  });
});
