const { test, expect } = require('@playwright/test');
const HERCULES_ENDPOINTS = require('../../config/herculesEndpoints');
const TARGETS = require('../../config/securityTargets');
const ScopeGuard = require('../../utils/security/ScopeGuard');
const {
  loadSession,
  authHeaders,
  findPrivateData,
  classifyProbe,
  PROBE_STATE_LABEL,
  isJson,
  isHtml,
  verifySessionIsLive,
} = require('../../utils/security/probeHelpers');

/**
 * Advanced API security gates.
 *
 * Two rules this file follows, both of which the previous version broke:
 *   1. A success status is never in an allowed-status list for a probe carrying
 *      a forged credential. `expect([401,403,404,200]).toContain(status)` can
 *      only fail on a 500.
 *   2. Assertions are never wrapped in `try { } catch (e) {}`. A swallowed
 *      assertion is a test that cannot fail.
 *
 * Endpoints resolve through config/securityTargets because dev.hercules.works
 * hosts no API -- every /V2/* and /api/* path returns the SPA's HTML 404 there,
 * which is indistinguishable from a hardened endpoint.
 */

const FORGED_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhdHRhY2tlciIsInRlbmFudElkIjoidW5hdXRob3JpemVkX29yZyJ9.invalid_signature_probe';

const b64Url = (obj) =>
  Buffer.from(JSON.stringify(obj)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Records why a probe was inconclusive so a skip is never mistaken for a pass. */
function annotate(description) {
  test.info().annotations.push({ type: 'probe-coverage', description });
}

test.describe('Advanced Enterprise AppSec & Strict Security Gates', () => {
  let session;

  test.beforeAll(() => {
    for (const origin of TARGETS.ALL_ORIGINS) {
      ScopeGuard.validateScope(origin);
    }
    session = loadSession();
  });

  test('BOLA-01: forged cross-tenant credentials must not return protected resources', async ({ request }) => {
    const endpoints = [
      { label: 'Survey details', path: `${HERCULES_ENDPOINTS.SURVEY.GET_SURVEY_DETAILS}?surveyId=srv_probe_99812` },
      { label: 'Audience report', path: HERCULES_ENDPOINTS.ANALYTICS.AUDIENCE_INSIGHTS('srv_probe_99812') },
      { label: 'Campaign chat', path: HERCULES_ENDPOINTS.CAMPAIGNS.GET_CHAT_BY_ID('cmp_probe_772') },
      { label: 'Account details', path: HERCULES_ENDPOINTS.ACCOUNT.GET_DETAILS },
      { label: 'Chat history', path: HERCULES_ENDPOINTS.CAMPAIGNS.GET_HISTORY },
    ];

    let exercisedOrDenied = 0;

    for (const ep of endpoints) {
      const url = TARGETS.resolveUrl(ep.path);
      const response = await request.get(url, {
        headers: {
          Authorization: `Bearer ${FORGED_TOKEN}`,
          'X-Tenant-ID': 'unauthorized_tenant_probe',
          Accept: 'application/json',
        },
        failOnStatusCode: false,
      });

      const status = response.status();
      const body = await response.text();
      const state = classifyProbe({ status, headers: response.headers() });

      if (state === 'UNREACHABLE_ROUTE' || state === 'UNREACHABLE_SHELL') {
        annotate(`${ep.label}: ${PROBE_STATE_LABEL[state]} (HTTP ${status}) - no authorization decision exercised`);
        continue;
      }
      exercisedOrDenied++;

      // The strict gate: a forged token must never yield a successful response.
      expect(
        status,
        `${ep.label} (${url}) returned HTTP ${status} to a forged cross-tenant token. ` +
          `A protected endpoint must answer 401 or 403.`
      ).not.toBe(200);

      // And whatever it returned must carry no private data.
      const leaks = findPrivateData(body, isJson(response.headers()));
      expect(
        leaks,
        `${ep.label} (${url}) leaked ${leaks.join(', ')} to a forged token. Body: ${body.slice(0, 300)}`
      ).toEqual([]);
    }

    expect(
      exercisedOrDenied,
      'No endpoint produced an authorization decision, so this test proved nothing. ' +
        'Check config/securityTargets origins and that the endpoint catalog is current.'
    ).toBeGreaterThan(0);
  });

  test('RATE-01: signup OTP endpoint must not absorb an unthrottled burst', async ({ request }) => {
    const burstCount = 25;
    const url = TARGETS.resolveUrl(HERCULES_ENDPOINTS.AUTH.SIGNUP_OTP);

    const responses = await Promise.all(
      Array.from({ length: burstCount }, () =>
        request.post(url, {
          data: { email: `rate_probe_${Date.now()}@${process.env.MAILOSAUR_SERVER_ID || 'rrepibcg'}.mailosaur.net` },
          headers: { 'Content-Type': 'application/json' },
          failOnStatusCode: false,
        })
      )
    );

    const statusCodes = responses.map((r) => r.status());

    // The signup endpoint in the catalog may not exist on this deployment. An
    // all-404 burst exercised no limiter, so it must skip -- not pass.
    const allAbsent = responses.every(
      (r) => classifyProbe({ status: r.status(), headers: r.headers() }) === 'UNREACHABLE_ROUTE'
    );
    test.skip(
      allAbsent,
      `Every request to ${url} returned 404/405, so no rate limiter was exercised. ` +
        `config/herculesEndpoints.js AUTH.SIGNUP_OTP appears stale for this deployment.`
    );

    const serverErrors = statusCodes.filter((c) => c >= 500);
    const accepted = statusCodes.filter((c) => c === 200).length;
    const throttled = statusCodes.filter((c) => c === 429).length;
    const rateHeaders = responses.some((r) =>
      Object.keys(r.headers()).some((h) => h.includes('ratelimit') || h === 'retry-after')
    );

    // A burst must never crash the backend.
    expect(
      serverErrors,
      `Signup OTP endpoint returned ${serverErrors.length} server error(s) under a ${burstCount}-request burst ` +
        `(codes: ${statusCodes.join(', ')}). It should shed load, not fail.`
    ).toEqual([]);

    // Accepting every concurrent OTP send with no throttling signal is an abuse
    // path: it enables mail-bombing and signup spam. Absorbing the burst is the
    // absence of a rate limit, not evidence of resilience.
    if (accepted === burstCount && throttled === 0 && !rateHeaders) {
      expect(
        accepted,
        `Signup OTP endpoint accepted all ${burstCount} concurrent requests with no 429 and no rate-limit ` +
          `headers. Either add a limiter or, if the real threshold is higher, raise burstCount to locate it.`
      ).toBeLessThan(burstCount);
    } else {
      annotate(
        `Rate limiting observed or requests rejected upfront: ${throttled} x 429, ` +
          `${accepted} x 200, rate-limit headers ${rateHeaders ? 'present' : 'absent'} (codes: ${statusCodes.join(', ')})`
      );
    }
  });

  test('JWT-01: an alg:none token must be rejected and must not elevate', async ({ request }) => {
    const algNoneToken =
      `${b64Url({ alg: 'none', typ: 'JWT' })}.` +
      `${b64Url({ sub: 'admin', role: 'superuser', isAdmin: true, exp: Math.floor(Date.now() / 1000) + 3600 })}.`;

    const url = TARGETS.resolveUrl(HERCULES_ENDPOINTS.ACCOUNT.GET_DETAILS);
    const response = await request.get(url, {
      headers: { Authorization: `Bearer ${algNoneToken}`, Accept: 'application/json' },
      failOnStatusCode: false,
    });

    const status = response.status();
    const body = await response.text();
    const state = classifyProbe({ status, headers: response.headers() });

    test.skip(
      state === 'UNREACHABLE_ROUTE' || state === 'UNREACHABLE_SHELL',
      `Account endpoint ${url} returned HTTP ${status} (${PROBE_STATE_LABEL[state]}). ` +
        `No JWT verification was exercised, so this gate would be vacuous.`
    );

    expect(
      status,
      `Unsigned alg:none token was accepted with HTTP ${status} at ${url}. Signature verification is not enforced.`
    ).not.toBe(200);

    // Belt and braces: the forged claims must not come back under any status.
    expect(body, 'Forged superuser role was reflected in the response').not.toMatch(/"role"\s*:\s*"superuser"/i);
    expect(body, 'Forged isAdmin claim was reflected in the response').not.toMatch(/"(?:isAdmin|is_admin)"\s*:\s*true/i);
    expect(findPrivateData(body, isJson(response.headers())), 'Private data returned to an unsigned token').toEqual([]);
  });

  test('JWT-02: an expired token must not yield an authenticated session', async ({ request }) => {
    const expiredToken =
      `${b64Url({ alg: 'HS256', typ: 'JWT' })}.` +
      `${b64Url({ sub: 'user_test', exp: Math.floor(Date.now() / 1000) - 7200 })}.stale_sig`;

    const url = TARGETS.resolveUrl(HERCULES_ENDPOINTS.AUTH.SYNC);
    // /api/auth/sync is POST-only; a GET returns 405 and would skip this gate.
    const response = await request.post(url, {
      data: {},
      headers: { Authorization: `Bearer ${expiredToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      failOnStatusCode: false,
    });

    const status = response.status();
    const body = await response.text();
    const state = classifyProbe({ status, headers: response.headers() });

    test.skip(
      state === 'UNREACHABLE_ROUTE' || state === 'UNREACHABLE_SHELL',
      `Auth sync endpoint ${url} returned HTTP ${status} (${PROBE_STATE_LABEL[state]}). No expiry check was exercised.`
    );

    expect(status, `Expired token accepted with HTTP ${status} at ${url}`).not.toBe(200);
    expect(body, 'Expired token produced an authenticated session').not.toMatch(
      /"(?:isLoggedIn|authenticated|isAuthenticated)"\s*:\s*true/i
    );
    expect(findPrivateData(body, isJson(response.headers())), 'Private data returned to an expired token').toEqual([]);
  });

  test('BIZ-01: query parameters must not bind to privileged account fields', async ({ request }) => {
    const liveness = await verifySessionIsLive(request, session);
    test.skip(
      !liveness.live,
      `Mass assignment needs a live session to read account state back: ${liveness.reason}. ` +
        `Refresh with "npx playwright test tests/auth.setup.js" or set SECURITY_STORAGE_STATE.`
    );

    const accountUrl = TARGETS.resolveUrl(HERCULES_ENDPOINTS.ACCOUNT.GET_DETAILS);
    const headers = { ...authHeaders(session), Accept: 'application/json' };

    const baseline = await request.get(accountUrl, { headers, failOnStatusCode: false });
    const polluted = await request.get(
      `${accountUrl}?isAdmin=true&role=superuser&plan=enterprise_unlimited&quota=999999&credits=999999`,
      { headers, failOnStatusCode: false }
    );

    const baselineBody = await baseline.text();
    const pollutedBody = await polluted.text();

    // The privilege claim must not appear as a result of the injected params.
    const elevatedPattern = /"(?:role|isAdmin|is_admin)"\s*:\s*(?:"superuser"|true)/i;
    expect(
      elevatedPattern.test(pollutedBody) && !elevatedPattern.test(baselineBody),
      `Injected query parameters elevated the returned account state at ${accountUrl}. ` +
        `Polluted body: ${pollutedBody.slice(0, 300)}`
    ).toBe(false);

    // Read-back: account state must be identical with and without the injection.
    expect(
      pollutedBody,
      'Injected privilege parameters changed the account response. Verify which fields the query string can influence.'
    ).toBe(baselineBody);
  });

  test('BIZ-02: cost estimator must reject negative and non-numeric inputs', async ({ request }) => {
    const url = TARGETS.resolveUrl(HERCULES_ENDPOINTS.BILLING.ESTIMATE_COST);
    // Read-only: asks for an estimate, never deducts credits.
    const response = await request.post(url, {
      data: { sampleSize: -100, reward: -5000, credits: 'NaN', price: -99.99 },
      headers: { ...authHeaders(session), 'Content-Type': 'application/json', Accept: 'application/json' },
      failOnStatusCode: false,
    });

    const status = response.status();
    const body = await response.text();
    const state = classifyProbe({ status, headers: response.headers() });

    test.skip(
      state !== 'EXERCISED',
      `Estimator ${url} returned HTTP ${status} (${PROBE_STATE_LABEL[state]}). Pricing logic was not exercised.`
    );

    expect(status, `Estimator crashed on out-of-bounds input (HTTP ${status}) instead of validating it`).toBeLessThan(500);
    expect(body, 'Estimator returned a negative monetary value for negative inputs').not.toMatch(
      /"(?:cost|total|amount|credits|price)"\s*:\s*-\d/i
    );
    expect(body, 'Estimator returned NaN/null for a monetary value').not.toMatch(
      /"(?:cost|total|amount|credits|price)"\s*:\s*(?:"?NaN"?|null)/i
    );
  });

  test('FILE-01: SVG script payloads must not be reflected into HTML', async ({ request }) => {
    const maliciousSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(\'XSS\')"><script>alert(1)</script></svg>';

    const probes = [
      { label: 'web root (?avatar_url)', path: `/?avatar_url=${encodeURIComponent(maliciousSvg)}` },
      { label: 'survey details (?surveyId)', path: `${HERCULES_ENDPOINTS.SURVEY.GET_SURVEY_DETAILS}?surveyId=${encodeURIComponent(maliciousSvg)}` },
      { label: 'campaign chat (path id)', path: HERCULES_ENDPOINTS.CAMPAIGNS.GET_CHAT_BY_ID(encodeURIComponent(maliciousSvg)) },
    ];

    for (const probe of probes) {
      const url = TARGETS.resolveUrl(probe.path);
      const response = await request.get(url, { headers: authHeaders(session), failOnStatusCode: false });
      const body = await response.text();

      // Only an HTML context makes reflected markup executable.
      if (!isHtml(response.headers())) {
        annotate(`${probe.label}: response was not HTML (${response.status()}), reflected markup not executable`);
        continue;
      }

      expect(body, `${probe.label} (${url}) reflected a raw <script> tag into HTML`).not.toContain(
        '<script>alert(1)</script>'
      );
      expect(body, `${probe.label} (${url}) reflected an svg onload handler into HTML`).not.toMatch(
        /<svg[^>]+onload\s*=/i
      );
    }
  });
});
