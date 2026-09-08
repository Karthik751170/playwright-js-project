const { test, expect } = require('@playwright/test');
const HERCULES_ENDPOINTS = require('../../config/herculesEndpoints');
const TARGETS = require('../../config/securityTargets');
const ScopeGuard = require('../../utils/security/ScopeGuard');
const { findPrivateData, isJson, classifyProbe } = require('../../utils/security/probeHelpers');

/**
 * Dual-path authorization parity.
 *
 * Every API endpoint here is reachable two ways: directly on its own origin
 * (devapi / devapi-ai) and through the front end's Next.js proxy on
 * dev.hercules.works (/api/backend, /api/ai-backend, /api/data-backend).
 *
 * A reverse proxy is one of the most common places for authorization to
 * diverge from the origin it fronts -- it may inject a service credential,
 * strip a header the origin relies on, or be trusted by the origin as
 * internal traffic. If the proxy path is more permissive than the direct path,
 * the app's own front-door becomes an auth bypass.
 *
 * These tests assert the two paths agree. Nothing tested this before because
 * the proxy prefixes were not known to the suite.
 */

const ENDPOINTS = [
  { label: 'Account details', path: HERCULES_ENDPOINTS.ACCOUNT.GET_DETAILS },
  { label: 'Chat history', path: HERCULES_ENDPOINTS.CAMPAIGNS.GET_HISTORY },
  { label: 'Admin survey list', path: HERCULES_ENDPOINTS.ADMIN.GET_ADMIN_SURVEYS },
  { label: 'My audience templates', path: HERCULES_ENDPOINTS.AUDIENCE.GET_MY_TEMPLATES },
  { label: 'Account credits', path: HERCULES_ENDPOINTS.BILLING.ACCOUNT_CREDITS },
  { label: 'Superadmin analytics', path: HERCULES_ENDPOINTS.ADMIN.SUPERADMIN_ANALYTICS },
];

/** An endpoint is "open" if an unauthenticated caller gets a usable 200. */
function isOpen(status, headers) {
  return status === 200 && classifyProbe({ status, headers }) === 'EXERCISED';
}

test.describe('API Path Parity (direct origin vs Next.js proxy)', () => {
  test.beforeAll(() => {
    for (const origin of TARGETS.ALL_ORIGINS) ScopeGuard.validateScope(origin);
  });

  test('PARITY-01: the proxy path must not be more permissive than the direct path', async ({ request }) => {
    let compared = 0;

    for (const ep of ENDPOINTS) {
      const directUrl = TARGETS.resolveUrl(ep.path);
      const proxyUrl = TARGETS.resolveViaProxy(ep.path);
      if (!proxyUrl) continue;

      const [direct, proxied] = await Promise.all([
        request.get(directUrl, { headers: { Accept: 'application/json' }, failOnStatusCode: false }),
        request.get(proxyUrl, { headers: { Accept: 'application/json' }, failOnStatusCode: false }),
      ]);

      const directOpen = isOpen(direct.status(), direct.headers());
      const proxyOpen = isOpen(proxied.status(), proxied.headers());
      const proxyBody = await proxied.text();

      // Only compare when at least one path produced an auth decision.
      const directState = classifyProbe({ status: direct.status(), headers: direct.headers() });
      const proxyState = classifyProbe({ status: proxied.status(), headers: proxied.headers() });
      if (directState === 'UNREACHABLE_ROUTE' && proxyState === 'UNREACHABLE_ROUTE') continue;
      compared++;

      expect(
        proxyOpen && !directOpen,
        `AUTH BYPASS via proxy: ${ep.label} is denied on the direct origin ` +
          `(${directUrl} -> HTTP ${direct.status()}) but served unauthenticated through the front-end proxy ` +
          `(${proxyUrl} -> HTTP ${proxied.status()}). The proxy is more permissive than the API it fronts.\n` +
          `Body: ${proxyBody.slice(0, 300)}`
      ).toBe(false);

      // Whatever the proxy returns unauthenticated must carry no private data.
      expect(
        findPrivateData(proxyBody, isJson(proxied.headers())),
        `${ep.label} leaked private data through the proxy path ${proxyUrl}`
      ).toEqual([]);
    }

    expect(
      compared,
      'No endpoint pair produced an authorization decision on either path; nothing was compared.'
    ).toBeGreaterThan(0);
  });

  test('PARITY-02: the proxy must not accept client-supplied internal trust headers', async ({ request }) => {
    const proxyUrl = TARGETS.resolveViaProxy(HERCULES_ENDPOINTS.ACCOUNT.GET_DETAILS);
    test.skip(!proxyUrl, 'Endpoint is not proxied.');

    // If the origin trusts the proxy as "internal", these are what an attacker
    // sends to impersonate it.
    const spoofs = [
      { 'X-Forwarded-For': '127.0.0.1' },
      { 'X-Forwarded-Host': 'localhost' },
      { 'X-Real-IP': '127.0.0.1' },
      { 'X-Internal-Request': 'true' },
      { 'X-Proxy-Authorization': 'internal' },
    ];

    for (const headers of spoofs) {
      const res = await request.get(proxyUrl, {
        headers: { ...headers, Accept: 'application/json' },
        failOnStatusCode: false,
      });
      const label = Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join(', ');
      const body = await res.text();

      expect(
        isOpen(res.status(), res.headers()),
        `Proxy served account details unauthenticated when the request carried "${label}" ` +
          `(HTTP ${res.status()}). Internal-trust decisions must never derive from client-controlled headers.\n` +
          `Body: ${body.slice(0, 250)}`
      ).toBe(false);
    }
  });

  test('PARITY-03: proxy failures must not disclose internal infrastructure', async ({ request }) => {
    // The data-backend proxy currently returns 502 with the upstream URL in the
    // body, which names an internal host to any anonymous caller.
    const url = `${TARGETS.WEB_BASE}${TARGETS.PROXY_PREFIXES.data}${HERCULES_ENDPOINTS.ACCOUNT.GET_DETAILS}`;
    const res = await request.get(url, { headers: { Accept: 'application/json' }, failOnStatusCode: false });
    const body = await res.text();

    if (res.status() < 500) {
      test.info().annotations.push({
        type: 'probe-coverage',
        description: `Data-backend proxy returned HTTP ${res.status()}; no error path to inspect.`,
      });
      return;
    }

    // A 5xx is itself worth surfacing, but the assertion is about disclosure.
    expect(
      body,
      `Proxy error response names an internal upstream host to an anonymous caller (HTTP ${res.status()}): ` +
        `${body.slice(0, 250)}\nError responses should be opaque; log the upstream detail server-side instead.`
    ).not.toMatch(/https?:\/\/[a-z0-9.-]*(?:api|internal|backend)[a-z0-9.-]*\./i);
  });
});
