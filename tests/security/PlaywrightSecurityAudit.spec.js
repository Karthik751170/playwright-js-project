const { test, expect } = require('@playwright/test');
const herculesConfig = require('../../config/hercules.config');
const fs = require('fs');
const path = require('path');

test.describe('Automated Security Posture Audit - dev.hercules.works', () => {
  const BASE_URL = process.env.TARGET_URL || herculesConfig.baseUrl || 'https://dev.hercules.works';
  const reportFindings = [];

  test.afterAll(async () => {
    const reportDir = path.resolve(process.cwd(), 'test-results/security');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Security Audit Report - ${BASE_URL}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 40px; background: #0f172a; color: #e2e8f0; }
    h1 { color: #38bdf8; }
    .badge { padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; }
    .pass { background: #166534; color: #86efac; }
    .warn { background: #854d0e; color: #fde047; }
    .fail { background: #991b1b; color: #fca5a5; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; background: #1e293b; border-radius: 8px; overflow: hidden; }
    th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #334155; }
    th { background: #0f172a; color: #94a3b8; text-transform: uppercase; font-size: 12px; }
    tr:hover { background: #334155; }
    .evidence { font-family: monospace; font-size: 12px; color: #cbd5e1; word-break: break-all; }
  </style>
</head>
<body>
  <h1>🛡️ Security Posture Audit Report</h1>
  <p><strong>Target:</strong> ${BASE_URL}</p>
  <p><strong>Date:</strong> ${new Date().toISOString()}</p>
  <table>
    <thead>
      <tr>
        <th>Check / Principle</th>
        <th>Status</th>
        <th>Severity</th>
        <th>Details & Recommendation</th>
      </tr>
    </thead>
    <tbody>
      ${reportFindings.map((f) => `
        <tr>
          <td><strong>${f.name}</strong></td>
          <td><span class="badge ${f.status === 'PASS' ? 'pass' : (f.status === 'WARN' ? 'warn' : 'fail')}">${f.status}</span></td>
          <td>${f.severity}</td>
          <td>
            <div>${f.message}</div>
            ${f.evidence ? `<div class="evidence" style="margin-top: 6px; color: #94a3b8;">Value: ${f.evidence}</div>` : ''}
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>
    `;

    fs.writeFileSync(path.join(reportDir, 'native-security-audit-report.html'), reportHtml, 'utf-8');
    console.log(`\n[Report Generated] HTML report saved to: test-results/security/native-security-audit-report.html\n`);
  });

  test('1. HTTP Security Headers Audit', async ({ page }) => {
    const response = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    const headers = response ? response.headers() : {};

    // 1. Strict-Transport-Security (HSTS)
    const hsts = headers['strict-transport-security'];
    if (hsts && hsts.includes('max-age')) {
      reportFindings.push({ name: 'HSTS (Strict-Transport-Security)', status: 'PASS', severity: 'High', message: 'HSTS is enabled and enforces HTTPS connections.', evidence: hsts });
    } else {
      reportFindings.push({ name: 'HSTS (Strict-Transport-Security)', status: 'FAIL', severity: 'High', message: 'Missing Strict-Transport-Security header. Vulnerable to SSL stripping.' });
    }

    // 2. Content-Security-Policy (CSP)
    const csp = headers['content-security-policy'];
    if (csp) {
      reportFindings.push({ name: 'Content-Security-Policy (CSP)', status: 'PASS', severity: 'High', message: 'CSP header is present to mitigate XSS and unauthorized script injection.', evidence: csp });
    } else {
      reportFindings.push({ name: 'Content-Security-Policy (CSP)', status: 'WARN', severity: 'Medium', message: 'Missing Content-Security-Policy header. Consider adding CSP to restrict allowed script sources.' });
    }

    // 3. X-Frame-Options (Clickjacking)
    const xFrame = headers['x-frame-options'];
    const hasFrameAncestors = csp && csp.includes('frame-ancestors');
    if (xFrame || hasFrameAncestors) {
      reportFindings.push({ name: 'Clickjacking Protection (X-Frame-Options / frame-ancestors)', status: 'PASS', severity: 'Medium', message: 'Framing protections are active.', evidence: xFrame || 'frame-ancestors directive in CSP' });
    } else {
      reportFindings.push({ name: 'Clickjacking Protection', status: 'WARN', severity: 'Medium', message: 'Missing X-Frame-Options or CSP frame-ancestors. Site might be embeddable in malicious iframes.' });
    }

    // 4. X-Content-Type-Options
    const xContentType = headers['x-content-type-options'];
    if (xContentType && xContentType.toLowerCase().includes('nosniff')) {
      reportFindings.push({ name: 'MIME Sniffing (X-Content-Type-Options)', status: 'PASS', severity: 'Low', message: 'nosniff is configured properly.', evidence: xContentType });
    } else {
      reportFindings.push({ name: 'MIME Sniffing (X-Content-Type-Options)', status: 'WARN', severity: 'Low', message: 'Missing X-Content-Type-Options: nosniff header.' });
    }

    // 5. Referrer-Policy
    const referrerPolicy = headers['referrer-policy'];
    if (referrerPolicy) {
      reportFindings.push({ name: 'Referrer-Policy', status: 'PASS', severity: 'Low', message: 'Referrer policy is configured.', evidence: referrerPolicy });
    } else {
      reportFindings.push({ name: 'Referrer-Policy', status: 'WARN', severity: 'Low', message: 'Missing Referrer-Policy header. Sensitive URLs might leak in referer headers.' });
    }
  });

  test('2. Server Technology & Information Leakage Audit', async ({ page }) => {
    const response = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    const headers = response ? response.headers() : {};

    const serverHeader = headers['server'];
    const poweredBy = headers['x-powered-by'];

    if (poweredBy) {
      reportFindings.push({ name: 'Framework Disclosure (X-Powered-By)', status: 'WARN', severity: 'Low', message: 'X-Powered-By header discloses backend technology stack.', evidence: poweredBy });
    } else {
      reportFindings.push({ name: 'Framework Disclosure (X-Powered-By)', status: 'PASS', severity: 'Low', message: 'X-Powered-By header is stripped/hidden.' });
    }

    if (serverHeader) {
      reportFindings.push({ name: 'Server Banner (Server Header)', status: 'WARN', severity: 'Low', message: 'Server header exposes web server technology.', evidence: serverHeader });
    } else {
      reportFindings.push({ name: 'Server Banner (Server Header)', status: 'PASS', severity: 'Low', message: 'Server header is obfuscated/hidden.' });
    }
  });

  test('3. Cookie Security Attributes Audit', async ({ page, context }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    const cookies = await context.cookies();

    if (cookies.length === 0) {
      reportFindings.push({ name: 'Cookie Security Flags', status: 'PASS', severity: 'Info', message: 'No cookies are set on public initial visit.' });
      return;
    }

    for (const cookie of cookies) {
      const issues = [];
      if (!cookie.secure) issues.push('Missing Secure flag');
      if (!cookie.httpOnly && (cookie.name.toLowerCase().includes('session') || cookie.name.toLowerCase().includes('token') || cookie.name.toLowerCase().includes('auth'))) {
        issues.push('Auth/Session cookie missing HttpOnly flag');
      }
      if (!cookie.sameSite || cookie.sameSite === 'None') {
        issues.push(`SameSite attribute is ${cookie.sameSite || 'Unset'}`);
      }

      if (issues.length > 0) {
        reportFindings.push({
          name: `Cookie Security (${cookie.name})`,
          status: 'WARN',
          severity: 'Medium',
          message: `Cookie [${cookie.name}] has potential security gaps: ${issues.join(', ')}.`,
          evidence: `Secure=${cookie.secure}, HttpOnly=${cookie.httpOnly}, SameSite=${cookie.sameSite}`,
        });
      } else {
        reportFindings.push({
          name: `Cookie Security (${cookie.name})`,
          status: 'PASS',
          severity: 'Medium',
          message: `Cookie [${cookie.name}] has appropriate security flags (Secure, HttpOnly, SameSite).`,
          evidence: `Secure=${cookie.secure}, HttpOnly=${cookie.httpOnly}, SameSite=${cookie.sameSite}`,
        });
      }
    }
  });

  test('4. Sensitive Endpoints & Directory Indexing Check', async ({ request }) => {
    const sensitivePaths = ['/.env', '/.git/HEAD', '/robots.txt', '/sitemap.xml'];
    for (const item of sensitivePaths) {
      try {
        const res = await request.get(`${BASE_URL}${item}`);
        if (res.status() === 200 && (item === '/.env' || item === '/.git/HEAD')) {
          reportFindings.push({
            name: `Exposed File (${item})`,
            status: 'FAIL',
            severity: 'High',
            message: `CRITICAL: Sensitive file ${item} returned HTTP 200 and appears publicly accessible!`,
          });
        } else if (res.status() === 200 && (item === '/robots.txt' || item === '/sitemap.xml')) {
          reportFindings.push({
            name: `Public Discovery (${item})`,
            status: 'PASS',
            severity: 'Info',
            message: `${item} is available (standard public discovery file).`,
          });
        } else {
          reportFindings.push({
            name: `Protected Path (${item})`,
            status: 'PASS',
            severity: 'High',
            message: `Sensitive path ${item} is properly blocked (HTTP ${res.status()}).`,
          });
        }
      } catch (err) {
        // Ignored
      }
    }
  });
});
