const { test, expect } = require('../../fixtures/zapFixture');
const herculesConfig = require('../../config/hercules.config');
const path = require('path');

test.describe('OWASP ZAP - SQL Injection & SSRF Targeted Active Scan', () => {
  const TARGET_URL = process.env.TARGET_URL || herculesConfig.baseUrl || 'https://dev.hercules.works';
  const REPORT_PATH = path.resolve(process.cwd(), 'test-results/security/zap-sqli-ssrf-report.html');

  test.beforeAll(async ({ zap }) => {
    const isReady = await zap.isReady();
    if (!isReady) {
      throw new Error(
        'OWASP ZAP daemon is not reachable on ' +
        (process.env.ZAP_URL || 'http://127.0.0.1:8080') +
        '. Please start ZAP first (e.g., using `npm run zap:start`).'
      );
    }
    await zap.newSession('Hercules_SQLi_SSRF_Scan', true);
  });

  test('Crawl Application & Run Targeted SQLi + SSRF Penetration Tests', async ({ page, zap }) => {
    test.setTimeout(360000); // Allow up to 6 minutes for active fuzzing

    // 1. Crawl & Discover pages/endpoints through the ZAP proxy so ZAP learns the target's parameters
    console.log(`[ZAP] Populating site tree via Playwright navigation on: ${TARGET_URL}`);
    const pathsToSpider = ['/', '/pricing', '/ai'];
    for (const route of pathsToSpider) {
      try {
        console.log(`[ZAP] Visiting: ${TARGET_URL}${route}`);
        await page.goto(`${TARGET_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(1500);
      } catch (e) {
        console.log(`[ZAP] Notice on ${route}: ${e.message}`);
      }
    }

    // Wait for passive queue to finish initial indexing
    await zap.waitForPassiveScan(30000);

    // 2. Configure ZAP Active Scanner to ONLY run SQL Injection & SSRF rules
    console.log('[ZAP] Configuring scanner: Enabling SQL Injection (MySQL, Postgres, SQLite, MSSQL, Oracle) & SSRF rules...');
    await zap.enableSqlInjectionAndSsrfOnly();

    // 3. Launch Active Scan targeting the endpoints discovered
    console.log(`[ZAP Active Scan] Launching targeted SQLi/SSRF attack fuzzing on ${TARGET_URL}...`);
    const scanId = await zap.startActiveScan(TARGET_URL, true);
    console.log(`[ZAP Active Scan] Scan ID: ${scanId}. Fuzzing parameters for SQL Injection and SSRF...`);

    // 4. Wait for Active Scan to complete
    await zap.waitForActiveScan(scanId, 300000, 5000);
    console.log('[ZAP Active Scan] SQLi and SSRF scan completed.');

    // 5. Fetch all alerts and filter for SQLi and SSRF
    const allAlerts = await zap.getAlerts({ baseUrl: TARGET_URL });
    const sqliAndSsrfFindings = allAlerts.filter((a) => {
      const name = (a.alert || '').toLowerCase();
      return name.includes('sql injection') || name.includes('server side request forgery') || name.includes('ssrf');
    });

    console.log('\n================ TARGETED SCAN RESULTS ================');
    console.log(`Target URL: ${TARGET_URL}`);
    console.log(`SQLi & SSRF Vulnerabilities Found: ${sqliAndSsrfFindings.length}`);
    if (sqliAndSsrfFindings.length > 0) {
      console.table(sqliAndSsrfFindings.map((f) => ({
        Risk: f.risk,
        Alert: f.alert,
        Param: f.param,
        URL: f.url,
      })));
    } else {
      console.log('✅ No SQL Injection or SSRF vulnerabilities detected on scanned endpoints.');
    }
    console.log('=======================================================\n');

    // 6. Export HTML report
    await zap.saveReport(REPORT_PATH, 'html', 'SQLi & SSRF Security Audit - ' + TARGET_URL);
    console.log(`[ZAP] Detailed report generated at: ${REPORT_PATH}`);

    // 7. Fail test if any SQL Injection or SSRF is identified
    expect(sqliAndSsrfFindings.length, `Detected ${sqliAndSsrfFindings.length} SQL Injection or SSRF vulnerabilities!`).toBe(0);
  });
});
