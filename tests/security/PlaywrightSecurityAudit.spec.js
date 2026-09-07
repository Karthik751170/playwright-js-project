const { test, expect } = require('@playwright/test');
const TARGETS = require('../../config/securityTargets');
const ScopeGuard = require('../../utils/security/ScopeGuard');
const SecurityReporter = require('../../utils/security/SecurityReporter');
const { loadSession, authHeaders } = require('../../utils/security/probeHelpers');

/**
 * Browser-driven security posture audit.
 *
 * The previous version of this file imported `expect` and never called it: it
 * logged findings to the HTML report and always passed, including a cookie check
 * that hardcoded `status: 'PASS'` regardless of what it observed. Reporting
 * without asserting is documentation, not testing.
 *
 * Here every finding is logged AND asserted. High-severity controls fail the
 * build; hardening recommendations are raised as soft assertions so they are
 * visible in the report and the run summary without a single missing header
 * blocking a release.
 */

const TARGET_URL = TARGETS.WEB_BASE;

test.describe('Automated Browser Security Posture Audit', () => {
  let reporter;

  test.beforeAll(() => {
    for (const origin of TARGETS.ALL_ORIGINS) {
      ScopeGuard.validateScope(origin);
    }
    reporter = new SecurityReporter(TARGET_URL);
  });

  test.afterAll(() => {
    if (reporter) {
      const path = reporter.generateHtmlReport('browser-security-audit-report.html');
      const m = reporter.getMetrics();
      console.log(
        `[Report] ${path}\n` +
          `[Report] pass ${m.passCount}/${m.assessedCount} assessed | warn ${m.warnCount} | ` +
          `fail ${m.failCount} | inconclusive ${m.inconclusiveCount} | suppressed ${m.suppressedCount}`
      );
    }
  });

  test('1. HTTP security headers', async ({ page }) => {
    const response = await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
    expect(response, `No response from ${TARGET_URL}`).not.toBeNull();
    const headers = response.headers();

    // --- HSTS (High severity: asserted hard) ---
    const hsts = headers['strict-transport-security'];
    const maxAgeMatch = /max-age\s*=\s*(\d+)/i.exec(hsts || '');
    const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : null;
    const MIN_MAX_AGE = 31536000;
    const hstsValid = maxAge !== null && maxAge >= MIN_MAX_AGE;

    reporter.logFinding({
      code: 'A02-HSTS',
      principle: 'Transport Security',
      name: 'HSTS (Strict-Transport-Security)',
      status: hstsValid ? 'PASS' : 'FAIL',
      severity: 'High',
      action: `Inspected response headers from ${TARGET_URL}`,
      rationale: 'HSTS mitigates SSL stripping by forcing HTTPS. A max-age under a year leaves a wide downgrade window.',
      expected: `Strict-Transport-Security with max-age >= ${MIN_MAX_AGE}.`,
      actual: hstsValid
        ? `HSTS active with max-age=${maxAge}.`
        : `Non-compliant: ${hsts ? `max-age=${maxAge === null ? 'absent' : maxAge}` : 'header missing'}.`,
      evidence: `strict-transport-security: ${hsts || 'Header missing'}`,
      analysis: hstsValid ? 'HSTS enforced.' : 'Vulnerable to protocol downgrade / SSL stripping.',
    });
    expect(
      maxAge,
      `HSTS max-age must be >= ${MIN_MAX_AGE}. Header was: "${hsts || 'missing'}"`
    ).toBeGreaterThanOrEqual(MIN_MAX_AGE);

    // --- CSP (asserted soft: presence plus a check that it is not trivially permissive) ---
    const csp = headers['content-security-policy'];
    const cspPermissive = /unsafe-inline|unsafe-eval|script-src[^;]*\*/i.test(csp || '');
    reporter.logFinding({
      code: 'A05-CSP',
      principle: 'Security Misconfiguration',
      name: 'Content-Security-Policy (CSP)',
      status: !csp ? 'WARN' : cspPermissive ? 'WARN' : 'PASS',
      severity: 'Medium',
      action: `Inspected CSP header on ${TARGET_URL}`,
      rationale: 'CSP limits script origins. A policy with unsafe-inline/unsafe-eval or a wildcard script-src does not meaningfully constrain XSS.',
      expected: 'CSP present without unsafe-inline, unsafe-eval, or wildcard script-src.',
      actual: !csp ? 'CSP header missing.' : cspPermissive ? 'CSP present but permissive.' : 'CSP present and constrained.',
      evidence: `content-security-policy: ${csp || 'Header missing'}`,
      analysis: !csp ? 'Define a CSP.' : cspPermissive ? 'Tighten the directives before counting CSP as XSS mitigation.' : 'CSP constrains script sources.',
    });
    expect.soft(csp, `No Content-Security-Policy header on ${TARGET_URL}`).toBeTruthy();
    if (csp) {
      expect.soft(cspPermissive, `CSP is present but permissive: "${csp.slice(0, 200)}"`).toBe(false);
    }

    // --- Clickjacking ---
    const xFrame = headers['x-frame-options'];
    const hasFrameAncestors = (csp || '').includes('frame-ancestors');
    const xfoValid = Boolean(xFrame || hasFrameAncestors);
    reporter.logFinding({
      code: 'A05-XFO',
      principle: 'Clickjacking Protection',
      name: 'X-Frame-Options / frame-ancestors',
      status: xfoValid ? 'PASS' : 'WARN',
      severity: 'Medium',
      action: `Evaluated framing protections on ${TARGET_URL}`,
      rationale: 'Without a framing policy the app can be embedded in a hostile iframe for clickjacking.',
      expected: 'X-Frame-Options DENY/SAMEORIGIN, or a CSP frame-ancestors directive.',
      actual: xfoValid ? `Framing controlled by ${xFrame ? `X-Frame-Options: ${xFrame}` : 'CSP frame-ancestors'}.` : 'No framing policy present.',
      evidence: `x-frame-options: ${xFrame || 'absent'}\nCSP frame-ancestors: ${hasFrameAncestors ? 'present' : 'absent'}`,
      analysis: xfoValid ? 'Clickjacking defence declared.' : 'Add a framing policy.',
    });
    expect.soft(xfoValid, `Neither X-Frame-Options nor CSP frame-ancestors is set on ${TARGET_URL}`).toBe(true);

    // --- MIME sniffing ---
    const xContentType = headers['x-content-type-options'];
    const nosniffValid = Boolean(xContentType && xContentType.toLowerCase().includes('nosniff'));
    reporter.logFinding({
      code: 'A05-MIME',
      principle: 'MIME Sniffing Protection',
      name: 'X-Content-Type-Options',
      status: nosniffValid ? 'PASS' : 'WARN',
      severity: 'Low',
      action: `Inspected MIME sniffing protection on ${TARGET_URL}`,
      rationale: 'Stops the browser reinterpreting a response away from its declared Content-Type.',
      expected: 'X-Content-Type-Options: nosniff',
      actual: nosniffValid ? 'nosniff is set.' : `Header ${xContentType ? `is "${xContentType}"` : 'is missing'}.`,
      evidence: `x-content-type-options: ${xContentType || 'Header missing'}`,
      analysis: nosniffValid ? 'MIME sniffing disabled.' : 'Add the nosniff header.',
    });
    expect.soft(nosniffValid, `X-Content-Type-Options: nosniff is not set on ${TARGET_URL}`).toBe(true);
  });

  test('2. Server information leakage', async ({ page }) => {
    const response = await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
    const headers = response ? response.headers() : {};
    const poweredBy = headers['x-powered-by'];
    const server = headers['server'];
    // A bare product name is fine; a version number is a fingerprinting aid.
    const versionLeak = /\d+\.\d+/.test(`${poweredBy || ''} ${server || ''}`);

    reporter.logFinding({
      code: 'A05-INFO',
      principle: 'Information Disclosure',
      name: 'Framework / Server Version Disclosure',
      status: versionLeak ? 'WARN' : 'PASS',
      severity: 'Low',
      action: `Checked X-Powered-By and Server headers on ${TARGET_URL}`,
      rationale: 'Exposing exact stack versions lets an attacker match known CVEs without probing.',
      expected: 'No software version numbers in response headers.',
      actual: versionLeak
        ? `Version information exposed (x-powered-by: "${poweredBy || 'none'}", server: "${server || 'none'}").`
        : `No version numbers exposed (x-powered-by: "${poweredBy || 'absent'}", server: "${server || 'absent'}").`,
      evidence: `x-powered-by: ${poweredBy || 'absent'}\nserver: ${server || 'absent'}`,
      analysis: versionLeak ? 'Strip version details at the edge.' : 'No version fingerprint in headers.',
    });
    expect.soft(versionLeak, `Response headers expose a software version (x-powered-by: "${poweredBy}", server: "${server}")`).toBe(false);
  });

  test('3. Cookie security attributes', async ({ page, context }) => {
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
    const cookies = await context.cookies();

    // Any cookie that carries session state must be Secure + HttpOnly. The old
    // version of this test hardcoded PASS and reported only a cookie count.
    const SESSION_HINTS = /token|session|sid|auth|jwt/i;
    const sessionCookies = cookies.filter((c) => SESSION_HINTS.test(c.name));

    for (const cookie of sessionCookies) {
      const issues = [
        !cookie.secure && 'missing Secure',
        !cookie.httpOnly && 'missing HttpOnly',
        !cookie.sameSite && 'missing SameSite',
      ].filter(Boolean);

      reporter.logFinding({
        code: 'A07-COOKIE',
        principle: 'Session Management',
        name: `Session Cookie Hardening (${cookie.name})`,
        status: issues.length === 0 ? 'PASS' : 'FAIL',
        severity: 'High',
        action: `Inspected attributes of cookie "${cookie.name}" set on an unauthenticated visit to ${TARGET_URL}`,
        rationale: 'A session cookie without Secure can leak over HTTP; without HttpOnly any XSS can steal it.',
        expected: 'Secure; HttpOnly; SameSite set.',
        actual: issues.length === 0
          ? `Hardened (Secure, HttpOnly, SameSite=${cookie.sameSite}).`
          : `Insecure attributes: ${issues.join(', ')}.`,
        evidence: `name=${cookie.name}\nsecure=${cookie.secure}\nhttpOnly=${cookie.httpOnly}\nsameSite=${cookie.sameSite}\ndomain=${cookie.domain}`,
        analysis: issues.length === 0 ? 'Cookie is protected against interception and script theft.' : 'Set the missing attributes in the session configuration.',
      });

      expect(cookie.secure, `Session cookie "${cookie.name}" is missing the Secure flag`).toBe(true);
      expect(cookie.httpOnly, `Session cookie "${cookie.name}" is missing HttpOnly`).toBe(true);
    }

    // Report the non-session cookie surface without pretending it is a control.
    reporter.logFinding({
      code: 'A07-COOKIE-SURFACE',
      principle: 'Session Management',
      name: 'Unauthenticated Cookie Surface',
      status: 'INCONCLUSIVE',
      severity: 'Info',
      action: `Enumerated cookies set on an unauthenticated visit to ${TARGET_URL}`,
      rationale: 'Recorded for context. An unauthenticated landing page setting only analytics cookies is expected, and is not itself a security control.',
      expected: 'N/A - informational inventory.',
      actual: `${cookies.length} cookie(s) set, of which ${sessionCookies.length} look session-bearing: ${cookies.map((c) => c.name).join(', ') || 'none'}.`,
      evidence: cookies.map((c) => `${c.name} secure=${c.secure} httpOnly=${c.httpOnly} sameSite=${c.sameSite}`).join('\n') || 'No cookies set',
      analysis: 'Informational only; session cookie hardening is asserted separately above.',
    });
  });

  test('4. Sensitive path exposure', async ({ request }) => {
    const sensitivePaths = [
      '/.env',
      '/.env.local',
      '/.env.production',
      '/.git/HEAD',
      '/.git/config',
      '/.aws/credentials',
      '/config.json',
      '/docker-compose.yml',
    ];

    for (const item of sensitivePaths) {
      const url = `${TARGET_URL}${item}`;
      const res = await request.get(url, { failOnStatusCode: false });
      const body = await res.text();
      // A SPA returns its HTML 404 shell for unknown paths; that is not exposure.
      const servedContent =
        res.status() === 200 && !(res.headers()['content-type'] || '').includes('text/html');

      reporter.logFinding({
        code: 'A05-FILE',
        principle: 'Exposed Configuration',
        name: `Protected Path (${item})`,
        status: servedContent ? 'FAIL' : 'PASS',
        severity: 'High',
        action: `Requested sensitive path: ${url}`,
        rationale: `Configuration and VCS metadata must never be downloadable.`,
        expected: 'HTTP 403/404, or the SPA HTML shell - never the file contents.',
        actual: servedContent
          ? `EXPOSED: HTTP 200 served ${body.length} bytes of ${res.headers()['content-type'] || 'unknown'} content.`
          : `Not exposed (HTTP ${res.status()}${res.status() === 200 ? ', HTML shell' : ''}).`,
        evidence: `Status: ${res.status()}\nContent-Type: ${res.headers()['content-type'] || 'none'}\nBody preview: ${body.slice(0, 160).replace(/\s+/g, ' ')}`,
        analysis: servedContent ? 'Critical: file contents are publicly downloadable.' : 'Path is not serving file contents.',
      });

      expect(
        servedContent,
        `${item} is publicly downloadable at ${url} (HTTP 200, ${res.headers()['content-type']}). ` +
          `Body starts: ${body.slice(0, 120)}`
      ).toBe(false);
    }
  });

  test('5. Scan coverage: is an authenticated session available', async ({ request }) => {
    const session = loadSession();
    const { verifySessionIsLive } = require('../../utils/security/probeHelpers');
    const liveness = await verifySessionIsLive(request, session);

    reporter.logFinding({
      code: 'SESSION-00',
      principle: 'Scan Coverage',
      name: 'Authenticated Session Liveness',
      status: liveness.live ? 'PASS' : 'WARN',
      severity: liveness.live ? 'Info' : 'Medium',
      action: 'Probed the account endpoint with the configured storage state.',
      rationale: 'Authorization and injection controls can only reach authenticated code paths with a live session. Without one, this audit covers the public surface only.',
      expected: 'A live session so authenticated controls are meaningful.',
      actual: liveness.live
        ? `Session is live (${session.source}).`
        : `No usable session: ${liveness.reason}. Authenticated controls elsewhere in the suite will report INCONCLUSIVE.`,
      evidence: `Storage state: ${session ? session.source : 'none'}\nLiveness: ${liveness.reason}`,
      analysis: liveness.live
        ? 'Coverage includes authenticated paths.'
        : 'Refresh the session (npx playwright test tests/auth.setup.js) or set SECURITY_STORAGE_STATE.',
    });

    // Coverage is a warning, not a build failure: the public-surface controls above
    // are still valid. Surfaced as an annotation so it is visible in the run summary.
    if (!liveness.live) {
      test.info().annotations.push({
        type: 'scan-coverage',
        description: `Unauthenticated scan only: ${liveness.reason}`,
      });
    }
    expect(Boolean(authHeaders(session)), 'authHeaders should always return an object').toBe(true);
  });
});
