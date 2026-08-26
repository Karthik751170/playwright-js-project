const { test, expect } = require('../../fixtures/zapFixture');
const herculesConfig = require('../../config/hercules.config');
const path = require('path');

test.describe('OWASP ZAP Active Penetration Scan - Hercules Platform', () => {
  const TARGET_URL = process.env.TARGET_URL || herculesConfig.baseUrl || 'https://dev.hercules.works';
  const REPORT_PATH = path.resolve(process.cwd(), 'test-results/security/zap-active-report.html');

  test.beforeAll(async ({ zap }) => {
    const isReady = await zap.isReady();
    if (!isReady) {
      throw new Error(
        'OWASP ZAP daemon is not reachable on ' +
        (process.env.ZAP_URL || 'http://127.0.0.1:8080') +
        '. Please start ZAP first (e.g., using `npm run zap:start`).'
      );
    }
  });

  test('Perform Active Vulnerability Scan on Target URL', async ({ zap }) => {
    console.log(`[ZAP Active Scan] Launching active attack fuzzing on: ${TARGET_URL}`);
    const scanId = await zap.startActiveScan(TARGET_URL, false);
    console.log(`[ZAP Active Scan] Scan ID: ${scanId}. Waiting for completion...`);

    await zap.waitForActiveScan(scanId, 300000, 5000);
    console.log('[ZAP Active Scan] Active scan complete.');

    // Retrieve summary
    const summary = await zap.getAlertSummary(TARGET_URL);
    console.log('\n================ ACTIVE SCAN SUMMARY ================');
    console.table(summary);
    console.log('=====================================================\n');

    // Export HTML report
    await zap.saveReport(REPORT_PATH, 'html', 'Active Security Scan Report - ' + TARGET_URL);
    console.log(`[ZAP Active Scan] Report saved to: ${REPORT_PATH}`);

    // Quality gate
    await zap.assertThresholds({
      baseUrl: TARGET_URL,
      maxHigh: 0,
      maxMedium: 0,
      maxLow: 5,
    });
  });
});
