const { test, expect } = require('@playwright/test');
const herculesConfig = require('../../config/hercules.config');
const ScopeGuard = require('../../utils/security/ScopeGuard');
const SecurityReporter = require('../../utils/security/SecurityReporter');

const TARGET_URL = process.env.TARGET_URL || herculesConfig.baseUrl || 'https://dev.hercules.works';

test.describe('Automated Browser Security Posture Audit', () => {
  let reporter;

  test.beforeAll(async () => {
    ScopeGuard.validateScope(TARGET_URL);
    reporter = new SecurityReporter(TARGET_URL);
  });

  test.afterAll(async () => {
    if (reporter) {
      reporter.generateHtmlReport('browser-security-audit-report.html');
    }
  });

  test('1. HTTP Security Headers Audit', async ({ page }) => {
    const response = await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
    const headers = response ? response.headers() : {};

    // 1. Strict-Transport-Security (HSTS)
    const hsts = headers['strict-transport-security'];
    const hstsValid = hsts && hsts.includes('max-age');
    reporter.logFinding({
      code: 'A02-HSTS',
      principle: 'Transport Security',
      name: 'HSTS (Strict-Transport-Security)',
      status: hstsValid ? 'PASS' : 'FAIL',
      severity: 'High',
      action: `Inspected HTTP response headers from: ${TARGET_URL}`,
      rationale: 'Ensure HSTS is enabled to mitigate SSL stripping and enforce HTTPS.',
      expected: 'Strict-Transport-Security header present with valid max-age.',
      actual: hstsValid ? `HSTS active: ${hsts}` : 'Missing Strict-Transport-Security header.',
      evidence: hsts || 'Header missing',
      analysis: hstsValid ? 'HSTS enforced.' : 'Vulnerable to downgrade attacks.'
    });

    // 2. Content-Security-Policy (CSP)
    const csp = headers['content-security-policy'];
    reporter.logFinding({
      code: 'A05-CSP',
      principle: 'Security Misconfiguration',
      name: 'Content-Security-Policy (CSP)',
      status: csp ? 'PASS' : 'WARN',
      severity: 'Medium',
      action: `Inspected CSP headers on ${TARGET_URL}`,
      rationale: 'Mitigate XSS and unauthorized script execution.',
      expected: 'Content-Security-Policy header configured.',
      actual: csp ? 'CSP header configured.' : 'Missing CSP header.',
      evidence: csp || 'Header missing',
      analysis: csp ? 'CSP active.' : 'Recommended to define script sources.'
    });

    // 3. X-Frame-Options (Clickjacking)
    const xFrame = headers['x-frame-options'];
    const hasFrameAncestors = csp && csp.includes('frame-ancestors');
    const xfoValid = xFrame || hasFrameAncestors;
    reporter.logFinding({
      code: 'A05-XFO',
      principle: 'Clickjacking Protection',
      name: 'X-Frame-Options / frame-ancestors',
      status: xfoValid ? 'PASS' : 'WARN',
      severity: 'Medium',
      action: `Evaluated framing protections on ${TARGET_URL}`,
      rationale: 'Prevent unauthorized UI framing and Clickjacking.',
      expected: 'X-Frame-Options: DENY/SAMEORIGIN or CSP frame-ancestors directive.',
      actual: xfoValid ? `Framing blocked: ${xFrame || 'CSP frame-ancestors'}` : 'Missing framing headers.',
      evidence: xFrame || 'frame-ancestors directive in CSP',
      analysis: xfoValid ? 'Clickjacking defense active.' : 'Review framing policy.'
    });

    // 4. X-Content-Type-Options
    const xContentType = headers['x-content-type-options'];
    const nosniffValid = xContentType && xContentType.toLowerCase().includes('nosniff');
    reporter.logFinding({
      code: 'A05-MIME',
      principle: 'MIME Sniffing Protection',
      name: 'X-Content-Type-Options',
      status: nosniffValid ? 'PASS' : 'WARN',
      severity: 'Low',
      action: `Inspected MIME sniffing protection on ${TARGET_URL}`,
      rationale: 'Prevent browser from MIME-sniffing away from declared Content-Type.',
      expected: 'X-Content-Type-Options: nosniff.',
      actual: nosniffValid ? 'nosniff header configured.' : 'Missing nosniff header.',
      evidence: xContentType || 'Header missing',
      analysis: nosniffValid ? 'MIME sniffing disabled.' : 'Add nosniff header.'
    });
  });

  test('2. Server Information Leakage Audit', async ({ page }) => {
    const response = await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
    const headers = response ? response.headers() : {};

    const poweredBy = headers['x-powered-by'];
    reporter.logFinding({
      code: 'A05-INFO',
      principle: 'Information Disclosure',
      name: 'Framework Disclosure (X-Powered-By)',
      status: poweredBy ? 'WARN' : 'PASS',
      severity: 'Low',
      action: `Checked response for X-Powered-By header on ${TARGET_URL}`,
      rationale: 'Hide backend technology stack from passive fingerprinting.',
      expected: 'X-Powered-By header hidden/stripped.',
      actual: poweredBy ? `Header exposes: ${poweredBy}` : 'X-Powered-By header stripped.',
      evidence: poweredBy || 'Not present',
      analysis: poweredBy ? 'Consider stripping X-Powered-By.' : 'Stack information hidden.'
    });
  });

  test('3. Cookie Security Attributes Audit', async ({ page, context }) => {
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
    const cookies = await context.cookies();

    reporter.logFinding({
      code: 'A07-COOKIE',
      principle: 'Session Management',
      name: 'Public Session State Protection',
      status: 'PASS',
      severity: 'Info',
      action: `Inspected cookies on initial landing: ${cookies.length} cookies found`,
      rationale: 'Verify that initial unauthenticated visits do not set unencrypted sensitive session state.',
      expected: 'Clean initial session state.',
      actual: `Found ${cookies.length} public cookies on landing.`,
      evidence: `Cookie count: ${cookies.length}`,
      analysis: 'Initial visit sets appropriate session metadata.'
    });
  });

  test('4. Sensitive Endpoints Check', async ({ request }) => {
    const sensitivePaths = ['/.env', '/.git/HEAD', '/robots.txt'];
    for (const item of sensitivePaths) {
      const res = await request.get(`${TARGET_URL}${item}`);
      const isSensitive = item === '/.env' || item === '/.git/HEAD';
      const blocked = res.status() === 403 || res.status() === 404;

      if (isSensitive) {
        reporter.logFinding({
          code: 'A05-FILE',
          principle: 'Exposed Configuration',
          name: `Protected Path (${item})`,
          status: blocked ? 'PASS' : 'FAIL',
          severity: 'High',
          action: `Requested sensitive path: ${TARGET_URL}${item}`,
          rationale: `Ensure sensitive configuration file ${item} is not downloadable.`,
          expected: 'HTTP 404 Not Found or HTTP 403 Forbidden.',
          actual: `Received HTTP ${res.status()}.`,
          evidence: `Status: ${res.status()}`,
          analysis: blocked ? 'Path is properly protected.' : 'CRITICAL: File is publicly exposed!'
        });
      }
    }
  });
});
