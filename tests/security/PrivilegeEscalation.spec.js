const { test, expect } = require('@playwright/test');
const HERCULES_ENDPOINTS = require('../../config/herculesEndpoints');
const TARGETS = require('../../config/securityTargets');
const ScopeGuard = require('../../utils/security/ScopeGuard');
const {
  loadSession, authHeaders, findPrivateData, isJson,
  classifyProbe, PROBE_STATE_LABEL, verifySessionIsLive,
} = require('../../utils/security/probeHelpers');

/**
 * Vertical privilege escalation.
 *
 * The suite already probes admin endpoints UNAUTHENTICATED, which only proves
 * they need a login. The real question -- can an ordinary authenticated user
 * reach them? -- was never asked. That is where broken function-level
 * authorization actually lives (OWASP API #5): the check exists but only
 * verifies authentication, not role.
 */

const ADMIN_ENDPOINTS = [
  { label: 'Admin survey list', method: 'GET', path: HERCULES_ENDPOINTS.ADMIN.GET_ADMIN_SURVEYS },
  { label: 'Superadmin user analytics', method: 'GET', path: HERCULES_ENDPOINTS.ADMIN.SUPERADMIN_ANALYTICS },
  { label: 'Admin status sync', method: 'POST', path: HERCULES_ENDPOINTS.ADMIN.SYNC_SURVEY_STATUS },
  { label: 'Admin survey update', method: 'POST', path: HERCULES_ENDPOINTS.ADMIN.UPDATE_STATUS_ADMIN },
];

test.describe('Vertical Privilege Escalation', () => {
  let session;

  test.beforeAll(() => {
    for (const origin of TARGETS.ALL_ORIGINS) ScopeGuard.validateScope(origin);
    session = loadSession();
  });

  test('PRIV-01: admin endpoints must reject a valid non-admin session', async ({ request }) => {
    const liveness = await verifySessionIsLive(request, session);
    test.skip(
      !liveness.live,
      `This test needs a live NON-ADMIN session to be meaningful: ${liveness.reason}. ` +
        `Unauthenticated probing of these endpoints is already covered by the DAST suite.`
    );

    // If the configured session IS an admin, the test cannot distinguish correct
    // access from escalation. Fail loudly rather than reporting a false pass.
    const adminProbe = await request.get(TARGETS.resolveUrl(HERCULES_ENDPOINTS.ADMIN.GET_ADMIN_SURVEYS), {
      headers: { ...authHeaders(session), Accept: 'application/json' },
      failOnStatusCode: false,
    });

    let exercised = 0;

    for (const ep of ADMIN_ENDPOINTS) {
      const url = TARGETS.resolveUrl(ep.path);
      const res =
        ep.method === 'GET'
          ? await request.get(url, { headers: { ...authHeaders(session), Accept: 'application/json' }, failOnStatusCode: false })
          : await request.post(url, {
              headers: { ...authHeaders(session), 'Content-Type': 'application/json', Accept: 'application/json' },
              data: {},
              failOnStatusCode: false,
            });

      const body = await res.text();
      const state = classifyProbe({ status: res.status(), headers: res.headers() });

      if (state === 'UNREACHABLE_ROUTE' || state === 'UNREACHABLE_SHELL') {
        test.info().annotations.push({
          type: 'probe-coverage',
          description: `${ep.label}: ${PROBE_STATE_LABEL[state]} (HTTP ${res.status()}) - no role decision exercised`,
        });
        continue;
      }
      exercised++;

      // 401/403 is correct. A 200 means an ordinary user reached an admin function.
      expect(
        res.status(),
        `PRIVILEGE ESCALATION: ${ep.label} (${ep.method} ${url}) returned HTTP 200 to a NON-ADMIN ` +
          `authenticated session. The endpoint checks authentication but not role. Body: ${body.slice(0, 300)}`
      ).not.toBe(200);

      expect(
        findPrivateData(body, isJson(res.headers())),
        `${ep.label} leaked private data to a non-admin session`
      ).toEqual([]);
    }

    expect(
      exercised,
      `No admin endpoint produced a role decision (statuses were all 404/405). ` +
        `Either the admin routes moved or config/herculesEndpoints.js is stale - this test proved nothing.`
    ).toBeGreaterThan(0);

    if (adminProbe.status() === 200) {
      throw new Error(
        'The configured session appears to have ADMIN rights (admin survey list returned 200), so this test ' +
          'cannot distinguish legitimate access from escalation. Point SECURITY_STORAGE_STATE at an ordinary ' +
          'non-admin account.'
      );
    }
  });

  test('PRIV-02: client-supplied role hints must not grant elevation', async ({ request }) => {
    const liveness = await verifySessionIsLive(request, session);
    test.skip(!liveness.live, `Needs a live non-admin session: ${liveness.reason}`);

    const url = TARGETS.resolveUrl(HERCULES_ENDPOINTS.ADMIN.GET_ADMIN_SURVEYS);

    // Headers an attacker would try after seeing a 403.
    const spoofHeaders = [
      { 'X-Admin': 'true' },
      { 'X-Role': 'superadmin' },
      { 'X-User-Role': 'admin' },
      { 'X-Forwarded-For': '127.0.0.1' },       // trusted-proxy bypass
      { 'X-Original-URL': '/V2/dashboard/admin-surveys' }, // reverse-proxy path confusion
      { 'X-Forwarded-Host': 'localhost' },
    ];

    for (const headers of spoofHeaders) {
      const res = await request.get(url, {
        headers: { ...authHeaders(session), ...headers, Accept: 'application/json' },
        failOnStatusCode: false,
      });
      const label = Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join(', ');

      expect(
        res.status(),
        `Admin endpoint returned HTTP 200 when the request carried "${label}". ` +
          `Role must be derived from the verified session, never from a client-supplied header.`
      ).not.toBe(200);
    }
  });
});
