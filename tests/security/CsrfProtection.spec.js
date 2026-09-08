const { test, expect } = require('@playwright/test');
const HERCULES_ENDPOINTS = require('../../config/herculesEndpoints');
const TARGETS = require('../../config/securityTargets');
const ScopeGuard = require('../../utils/security/ScopeGuard');
const { loadSession, verifySessionIsLive } = require('../../utils/security/probeHelpers');

/**
 * CSRF.
 *
 * Previously untested, and the session-cookie audit established why it matters:
 * dragonAccessToken / dragonRefreshToken are SameSite=None (necessary, because
 * the API is a separate origin from the front end). SameSite=None means the
 * cookie itself contributes NO CSRF protection, so protection must come from a
 * token or an Origin/Referer check.
 *
 * Whether CSRF applies at all depends on one thing: does the API accept COOKIE
 * authentication? If it is strictly Bearer-header, an attacker's page cannot
 * forge an authenticated request and CSRF is moot. CSRF-01 determines that
 * first, and the rest of the file branches on the answer -- rather than
 * asserting a risk that may not exist.
 */

const ATTACKER_ORIGIN = 'https://evil-attacker-website.example';

test.describe('CSRF Protection', () => {
  let session;
  let cookieAuthAccepted = null; // null = undetermined

  test.beforeAll(() => {
    for (const origin of TARGETS.ALL_ORIGINS) ScopeGuard.validateScope(origin);
    session = loadSession();
  });

  test('CSRF-01: determine whether the API accepts cookie authentication', async ({ request }) => {
    const liveness = await verifySessionIsLive(request, session);
    test.skip(!liveness.live, `Needs a live session to classify the auth mechanism: ${liveness.reason}`);

    const url = TARGETS.resolveUrl(HERCULES_ENDPOINTS.ACCOUNT.GET_DETAILS);

    // Cookie only, no Authorization header: this is what a cross-site request
    // from an attacker's page would carry.
    const cookieOnly = await request.get(url, {
      headers: { Cookie: session.header, Accept: 'application/json' },
      failOnStatusCode: false,
    });
    cookieAuthAccepted = cookieOnly.status() === 200;

    console.log(
      `[CSRF-01] Cookie-only authentication ${cookieAuthAccepted ? 'IS ACCEPTED' : 'is rejected'} ` +
        `(HTTP ${cookieOnly.status()}).`
    );

    test.info().annotations.push({
      type: 'csrf-applicability',
      description: cookieAuthAccepted
        ? 'API accepts cookie auth AND cookies are SameSite=None: CSRF is applicable and must be defended by token or Origin check.'
        : 'API rejects cookie-only auth (Bearer header required), so a cross-site page cannot forge an authenticated request. CSRF surface is minimal.',
    });

    // Not an assertion about right or wrong -- this test classifies the surface.
    expect([200, 401, 403]).toContain(cookieOnly.status());
  });

  test('CSRF-02: state-changing requests must reject a foreign Origin', async ({ request }) => {
    const liveness = await verifySessionIsLive(request, session);
    test.skip(!liveness.live, `Needs a live session: ${liveness.reason}`);
    test.skip(
      cookieAuthAccepted === false,
      'API requires a Bearer header, so a cross-site page cannot forge an authenticated request. CSRF not applicable.'
    );
    ScopeGuard.assertMutationAllowed(TARGETS.CORE_API_BASE, 'CSRF state-change probe');

    // A read-modify endpoint that is safe to call with an invalid body: a correct
    // server rejects it on Origin grounds before it ever validates the payload.
    const stateChanging = [
      { label: 'Update account details', url: TARGETS.resolveUrl(HERCULES_ENDPOINTS.ACCOUNT.UPDATE_DETAILS) },
      { label: 'Update survey', url: TARGETS.resolveUrl(HERCULES_ENDPOINTS.SURVEY.UPDATE_SURVEY) },
    ];

    for (const ep of stateChanging) {
      const res = await request.post(ep.url, {
        headers: {
          Cookie: session.header, // cookie only, as a forged cross-site request would be
          Origin: ATTACKER_ORIGIN,
          Referer: `${ATTACKER_ORIGIN}/csrf.html`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        data: {},
        failOnStatusCode: false,
      });

      // 401/403 = rejected. 400/422 = reached validation, i.e. Origin was NOT
      // checked; only the malformed body stopped it, which is not a defence.
      expect(
        [401, 403],
        `${ep.label} (${ep.url}) answered HTTP ${res.status()} to a cookie-authenticated request from ` +
          `Origin: ${ATTACKER_ORIGIN}. With SameSite=None cookies, a foreign Origin must be rejected ` +
          `(401/403) before the payload is considered. A 400/422 means the request was authenticated and ` +
          `only the body stopped it.`
      ).toContain(res.status());
    }
  });

  test('CSRF-03: CORS must not reflect an arbitrary origin with credentials', async ({ request }) => {
    // Runs unauthenticated: this is a property of the response headers.
    for (const [label, base] of [
      ['Core API', TARGETS.CORE_API_BASE],
      ['AI API', TARGETS.AI_API_BASE],
      ['Web', TARGETS.WEB_BASE],
    ]) {
      const res = await request.get(base, {
        headers: { Origin: ATTACKER_ORIGIN, Accept: 'application/json' },
        failOnStatusCode: false,
      });
      const acao = res.headers()['access-control-allow-origin'];
      const acac = res.headers()['access-control-allow-credentials'];

      const reflectsAttacker = acao === ATTACKER_ORIGIN || acao === '*';
      const withCredentials = acac === 'true';

      expect(
        reflectsAttacker && withCredentials,
        `${label} (${base}) reflected Access-Control-Allow-Origin: ${acao} together with ` +
          `Allow-Credentials: true. Any website could then read authenticated responses from this origin.`
      ).toBe(false);

      // A wildcard with credentials is rejected by browsers, but a wildcard alone
      // is still worth surfacing on an API origin.
      if (acao === '*' && base !== TARGETS.WEB_BASE) {
        test.info().annotations.push({
          type: 'cors-note',
          description: `${label} sends Access-Control-Allow-Origin: * (without credentials). Fine for genuinely public data; confirm nothing behind this origin is tenant-scoped.`,
        });
      }
    }
  });

  test('CSRF-04: preflight must not approve arbitrary cross-origin mutations', async ({ request }) => {
    const url = TARGETS.resolveUrl(HERCULES_ENDPOINTS.ACCOUNT.UPDATE_DETAILS);
    const res = await request.fetch(url, {
      method: 'OPTIONS',
      headers: {
        Origin: ATTACKER_ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,authorization',
      },
      failOnStatusCode: false,
    });

    const acao = res.headers()['access-control-allow-origin'];
    const acac = res.headers()['access-control-allow-credentials'];

    expect(
      acao === ATTACKER_ORIGIN && acac === 'true',
      `Preflight for ${url} approved cross-origin credentialed POST from ${ATTACKER_ORIGIN} ` +
        `(ACAO: ${acao}, ACAC: ${acac}). This authorises browser-driven CSRF against a state-changing endpoint.`
    ).toBe(false);
  });
});
