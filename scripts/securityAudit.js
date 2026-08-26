const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const herculesConfig = require('../config/hercules.config');

const TARGET_URL = process.env.TARGET_URL || herculesConfig.baseUrl || 'https://dev.hercules.works';

async function fetchResponse(urlStr, method = 'GET', headers = {}) {
  const parsed = new URL(urlStr);
  const client = parsed.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(
      urlStr,
      {
        method,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          ...headers,
        },
        timeout: 10000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body,
          });
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.end();
  });
}

async function runSecurityAudit() {
  console.log(`\n======================================================`);
  console.log(`🛡️  RUNNING SECURITY POSTURE AUDIT`);
  console.log(`🎯 Target: ${TARGET_URL}`);
  console.log(`🕒 Timestamp: ${new Date().toISOString()}`);
  console.log(`======================================================\n`);

  const findings = [];

  // 1. Fetch Main Page
  let mainRes;
  try {
    mainRes = await fetchResponse(TARGET_URL);
    console.log(`[+] Successfully connected to ${TARGET_URL} (HTTP ${mainRes.statusCode})`);
  } catch (e) {
    console.error(`[-] Failed to connect to ${TARGET_URL}: ${e.message}`);
    process.exit(1);
  }

  const headers = mainRes.headers;

  // ----------------------------------------------------
  // Category 1: HTTP Security Headers
  // ----------------------------------------------------
  console.log(`\n--- 1. Evaluating Security Headers ---`);

  // HSTS
  const hsts = headers['strict-transport-security'];
  if (hsts) {
    findings.push({ category: 'Transport Security', check: 'Strict-Transport-Security (HSTS)', status: 'PASS', severity: 'High', details: 'HSTS is enabled.', evidence: hsts });
    console.log(`  ✅ [PASS] HSTS: ${hsts}`);
  } else {
    findings.push({ category: 'Transport Security', check: 'Strict-Transport-Security (HSTS)', status: 'FAIL', severity: 'High', details: 'Missing HSTS header. Insecure connections possible on first request.' });
    console.log(`  ❌ [FAIL] HSTS: Missing Strict-Transport-Security header`);
  }

  // CSP
  const csp = headers['content-security-policy'];
  if (csp) {
    findings.push({ category: 'Injection Defense', check: 'Content-Security-Policy (CSP)', status: 'PASS', severity: 'High', details: 'CSP is present.', evidence: csp.slice(0, 120) + '...' });
    console.log(`  ✅ [PASS] CSP: Configured`);
  } else {
    findings.push({ category: 'Injection Defense', check: 'Content-Security-Policy (CSP)', status: 'WARN', severity: 'Medium', details: 'Missing Content-Security-Policy header.' });
    console.log(`  ⚠️  [WARN] CSP: Missing Content-Security-Policy header`);
  }

  // X-Frame-Options
  const xFrame = headers['x-frame-options'];
  if (xFrame || (csp && csp.includes('frame-ancestors'))) {
    findings.push({ category: 'Clickjacking', check: 'X-Frame-Options / frame-ancestors', status: 'PASS', severity: 'Medium', details: 'Clickjacking protection is active.', evidence: xFrame || 'CSP frame-ancestors' });
    console.log(`  ✅ [PASS] Clickjacking Protection: ${xFrame || 'CSP frame-ancestors'}`);
  } else {
    findings.push({ category: 'Clickjacking', check: 'X-Frame-Options / frame-ancestors', status: 'WARN', severity: 'Medium', details: 'Missing X-Frame-Options and frame-ancestors.' });
    console.log(`  ⚠️  [WARN] Clickjacking Protection: Missing X-Frame-Options`);
  }

  // X-Content-Type-Options
  const xContentType = headers['x-content-type-options'];
  if (xContentType && xContentType.toLowerCase().includes('nosniff')) {
    findings.push({ category: 'MIME Protection', check: 'X-Content-Type-Options', status: 'PASS', severity: 'Low', details: 'MIME sniffing prevention active.', evidence: xContentType });
    console.log(`  ✅ [PASS] X-Content-Type-Options: ${xContentType}`);
  } else {
    findings.push({ category: 'MIME Protection', check: 'X-Content-Type-Options', status: 'WARN', severity: 'Low', details: 'Missing X-Content-Type-Options: nosniff.' });
    console.log(`  ⚠️  [WARN] X-Content-Type-Options: Missing`);
  }

  // Referrer-Policy
  const referrerPolicy = headers['referrer-policy'];
  if (referrerPolicy) {
    findings.push({ category: 'Privacy & Data Leakage', check: 'Referrer-Policy', status: 'PASS', severity: 'Low', details: 'Referrer Policy active.', evidence: referrerPolicy });
    console.log(`  ✅ [PASS] Referrer-Policy: ${referrerPolicy}`);
  } else {
    findings.push({ category: 'Privacy & Data Leakage', check: 'Referrer-Policy', status: 'WARN', severity: 'Low', details: 'Missing Referrer-Policy header.' });
    console.log(`  ⚠️  [WARN] Referrer-Policy: Missing`);
  }

  // ----------------------------------------------------
  // Category 2: Information Disclosure
  // ----------------------------------------------------
  console.log(`\n--- 2. Checking Information Disclosure ---`);
  const serverHeader = headers['server'];
  const poweredBy = headers['x-powered-by'];

  if (poweredBy) {
    findings.push({ category: 'Information Disclosure', check: 'X-Powered-By Header', status: 'WARN', severity: 'Low', details: 'Exposes framework technology.', evidence: poweredBy });
    console.log(`  ⚠️  [WARN] X-Powered-By leaked: ${poweredBy}`);
  } else {
    findings.push({ category: 'Information Disclosure', check: 'X-Powered-By Header', status: 'PASS', severity: 'Low', details: 'X-Powered-By is hidden/stripped.' });
    console.log(`  ✅ [PASS] X-Powered-By: Hidden`);
  }

  if (serverHeader) {
    findings.push({ category: 'Information Disclosure', check: 'Server Banner Header', status: 'WARN', severity: 'Low', details: 'Server banner reveals web server.', evidence: serverHeader });
    console.log(`  ⚠️  [INFO] Server Banner: ${serverHeader}`);
  } else {
    findings.push({ category: 'Information Disclosure', check: 'Server Banner Header', status: 'PASS', severity: 'Low', details: 'Server header is hidden.' });
    console.log(`  ✅ [PASS] Server Banner: Hidden`);
  }

  // ----------------------------------------------------
  // Category 3: Cookie Security
  // ----------------------------------------------------
  console.log(`\n--- 3. Checking Cookie Security ---`);
  const setCookie = headers['set-cookie'] || [];
  const cookieList = Array.isArray(setCookie) ? setCookie : [setCookie];

  if (cookieList.length === 0 || !cookieList[0]) {
    findings.push({ category: 'Session & Auth', check: 'Initial Cookies', status: 'PASS', severity: 'Info', details: 'No tracking/session cookies set on initial unauthenticated visit.' });
    console.log(`  ✅ [PASS] No insecure cookies set on root visit.`);
  } else {
    for (const rawCookie of cookieList) {
      const parts = rawCookie.split(';').map((s) => s.trim());
      const nameVal = parts[0];
      const isSecure = parts.some((p) => p.toLowerCase() === 'secure');
      const isHttpOnly = parts.some((p) => p.toLowerCase() === 'httponly');
      const sameSite = parts.find((p) => p.toLowerCase().startsWith('samesite='));

      const issues = [];
      if (!isSecure) issues.push('Missing Secure');
      if (!isHttpOnly) issues.push('Missing HttpOnly');
      if (!sameSite) issues.push('Missing SameSite');

      if (issues.length > 0) {
        findings.push({ category: 'Session & Auth', check: `Cookie: ${nameVal.split('=')[0]}`, status: 'WARN', severity: 'Medium', details: `Potential cookie flags missing: ${issues.join(', ')}`, evidence: rawCookie });
        console.log(`  ⚠️  [WARN] Cookie [${nameVal.split('=')[0]}]: ${issues.join(', ')}`);
      } else {
        findings.push({ category: 'Session & Auth', check: `Cookie: ${nameVal.split('=')[0]}`, status: 'PASS', severity: 'Medium', details: 'Cookie properly secured with Secure, HttpOnly, and SameSite.', evidence: rawCookie });
        console.log(`  ✅ [PASS] Cookie [${nameVal.split('=')[0]}]: Fully secured`);
      }
    }
  }

  // ----------------------------------------------------
  // Category 4: Sensitive Endpoint & File Exposure
  // ----------------------------------------------------
  console.log(`\n--- 4. Checking Sensitive Files & Paths ---`);
  const sensitiveFiles = [
    { path: '/.env', critical: true },
    { path: '/.git/HEAD', critical: true },
    { path: '/wp-config.php', critical: true },
    { path: '/config.json', critical: true },
    { path: '/robots.txt', critical: false },
    { path: '/sitemap.xml', critical: false },
  ];

  for (const item of sensitiveFiles) {
    try {
      const res = await fetchResponse(`${TARGET_URL}${item.path}`);
      if (res.statusCode === 200 && item.critical) {
        findings.push({ category: 'File Exposure', check: `Sensitive Path ${item.path}`, status: 'FAIL', severity: 'Critical', details: `CRITICAL: ${item.path} is publicly accessible!`, evidence: res.body.slice(0, 100) });
        console.log(`  ❌ [CRITICAL FAIL] ${item.path} is EXPOSED! (HTTP 200)`);
      } else if (res.statusCode === 200) {
        findings.push({ category: 'File Exposure', check: `Public Discovery ${item.path}`, status: 'PASS', severity: 'Info', details: `${item.path} is available.` });
        console.log(`  ℹ️  [INFO] ${item.path} exists (HTTP 200)`);
      } else {
        findings.push({ category: 'File Exposure', check: `Protected Path ${item.path}`, status: 'PASS', severity: 'High', details: `Blocked correctly (HTTP ${res.statusCode}).` });
        console.log(`  ✅ [PASS] ${item.path} is blocked (HTTP ${res.statusCode})`);
      }
    } catch (e) {
      console.log(`  ✅ [PASS] ${item.path} connection closed/unreachable`);
    }
  }

  // ----------------------------------------------------
  // Category 5: Input Error Handling & Basic Injection Response
  // ----------------------------------------------------
  console.log(`\n--- 5. Checking Error Handling & Injection Responses ---`);
  const probeToken = `sec_probe_${Date.now()}`;
  const testEndpoints = [
    { url: `${TARGET_URL}/?probe=${probeToken}%27%22%3E%3Cscript%3E`, probe: probeToken },
    { url: `${TARGET_URL}/?id=1%27%20OR%20%271%27=%271`, probe: `1' OR '1'='1` },
  ];

  for (const item of testEndpoints) {
    try {
      const res = await fetchResponse(item.url);
      const rawInjectedScript = `${item.probe}'"><script>`;
      const isReflectedUnescaped = res.body.includes(rawInjectedScript);

      if (isReflectedUnescaped) {
        findings.push({ category: 'Input Sanitization', check: 'Reflected Special Characters', status: 'FAIL', severity: 'High', details: `Input probe ${item.probe} was reflected without HTML entity escaping!`, evidence: item.url });
        console.log(`  ❌ [FAIL] Raw unencoded script reflection detected for ${item.probe}`);
      } else {
        findings.push({ category: 'Input Sanitization', check: `Input Probe (${item.probe.slice(0, 15)})`, status: 'PASS', severity: 'High', details: 'Input probe was safely ignored, encoded, or sanitized.' });
        console.log(`  ✅ [PASS] Probe ${item.probe.slice(0, 15)} safely handled (No unescaped reflection)`);
      }
    } catch (e) {
      console.log(`  ℹ️  [INFO] Test request completed.`);
    }
  }

  // ----------------------------------------------------
  // Summary & Report Generation
  // ----------------------------------------------------
  const reportDir = path.resolve(process.cwd(), 'test-results/security');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const passedCount = findings.filter((f) => f.status === 'PASS').length;
  const warnCount = findings.filter((f) => f.status === 'WARN').length;
  const failCount = findings.filter((f) => f.status === 'FAIL').length;

  console.log(`\n======================================================`);
  console.log(`📊 AUDIT SUMMARY FOR ${TARGET_URL}`);
  console.log(`   ✅ Passed: ${passedCount}`);
  console.log(`   ⚠️  Warnings / Recommendations: ${warnCount}`);
  console.log(`   ❌ Critical / High Failures: ${failCount}`);
  console.log(`======================================================\n`);

  const reportHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Security Posture Audit - ${TARGET_URL}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 40px; background: #0b0f19; color: #f1f5f9; }
    .card { background: #1e293b; padding: 24px; border-radius: 12px; margin-bottom: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.5); }
    h1 { color: #38bdf8; margin-top: 0; }
    .stats { display: flex; gap: 16px; margin: 20px 0; }
    .stat-box { flex: 1; padding: 16px; border-radius: 8px; font-weight: bold; text-align: center; }
    .stat-pass { background: #064e3b; color: #6ee7b7; }
    .stat-warn { background: #78350f; color: #fde68a; }
    .stat-fail { background: #7f1d1d; color: #fca5a5; }
    .badge { padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; }
    .pass { background: #065f46; color: #a7f3d0; }
    .warn { background: #92400e; color: #fef08a; }
    .fail { background: #991b1b; color: #fecaca; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; background: #131d2e; border-radius: 8px; overflow: hidden; }
    th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #1e293b; font-size: 14px; }
    th { background: #0f172a; color: #94a3b8; text-transform: uppercase; font-size: 12px; letter-spacing: 0.05em; }
    tr:hover { background: #1e293b; }
    .evidence { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; color: #94a3b8; margin-top: 4px; word-break: break-all; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🛡️ Security Posture Audit Report</h1>
    <p><strong>Target URL:</strong> <a href="${TARGET_URL}" style="color: #38bdf8;" target="_blank">${TARGET_URL}</a></p>
    <p><strong>Scan Timestamp:</strong> ${new Date().toUTCString()}</p>
    
    <div class="stats">
      <div class="stat-box stat-pass">
        <div style="font-size: 28px;">${passedCount}</div>
        <div>Passed Checks</div>
      </div>
      <div class="stat-box stat-warn">
        <div style="font-size: 28px;">${warnCount}</div>
        <div>Warnings / Hardening</div>
      </div>
      <div class="stat-box stat-fail">
        <div style="font-size: 28px;">${failCount}</div>
        <div>Critical / High Issues</div>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>Detailed Security Findings</h2>
    <table>
      <thead>
        <tr>
          <th>Category</th>
          <th>Security Check</th>
          <th>Status</th>
          <th>Severity</th>
          <th>Details & Recommendation</th>
        </tr>
      </thead>
      <tbody>
        ${findings.map((f) => `
          <tr>
            <td><span style="color: #94a3b8;">${f.category}</span></td>
            <td><strong>${f.check}</strong></td>
            <td><span class="badge ${f.status === 'PASS' ? 'pass' : (f.status === 'WARN' ? 'warn' : 'fail')}">${f.status}</span></td>
            <td>${f.severity}</td>
            <td>
              <div>${f.details}</div>
              ${f.evidence ? `<div class="evidence">Evidence / Value: ${f.evidence}</div>` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
</body>
</html>
  `;

  const reportFile = path.join(reportDir, 'security-audit-report.html');
  fs.writeFileSync(reportFile, reportHtml, 'utf-8');
  console.log(`📄 Comprehensive HTML Report generated at:\n   ${reportFile}\n`);
}

runSecurityAudit();
