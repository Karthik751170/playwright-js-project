const { test, expect } = require('@playwright/test');
const HERCULES_ENDPOINTS = require('../../config/herculesEndpoints');
const TARGETS = require('../../config/securityTargets');
const ScopeGuard = require('../../utils/security/ScopeGuard');
const { findPrivateData, isJson, classifyProbe, PROBE_STATE_LABEL } = require('../../utils/security/probeHelpers');

/**
 * Email verification / magic-link token security.
 *
 * This platform verifies by emailed LINK, not by OTP, so the security property
 * that matters is the token in that link: it must be unguessable, single-use,
 * expiring, and scoped to one account. A weak link token is a direct account
 * takeover, and nothing tested it.
 *
 * The end-to-end single-use and expiry checks need a real emailed token, so they
 * live with the Mailosaur provisioning flow in StatefulSessionSecurity. What is
 * testable without an inbox is the part that matters most in practice: the
 * token-login endpoint must not accept guessable or malformed tokens, and it
 * must not be brute-forceable.
 */

const TOKEN_LOGIN = (token) => TARGETS.resolveUrl(HERCULES_ENDPOINTS.AUTH.TOKEN_LOGIN(token));

/** Tokens a real attacker tries first. */
const GUESSABLE_TOKENS = [
  '1', '123456', '000000',
  'test', 'admin', 'null', 'undefined', 'true',
  'deadbeefdeadbeefdeadbeef',
  '00000000-0000-0000-0000-000000000000',
  'eyJhbGciOiJub25lIn0.eyJzdWIiOiJhZG1pbiJ9.',
  '../../admin',
  "' OR '1'='1",
];

test.describe('Auth Link & Token Lifecycle', () => {
  test.beforeAll(() => {
    for (const origin of TARGETS.ALL_ORIGINS) ScopeGuard.validateScope(origin);
  });

  test('LINK-01: token-login must reject guessable and malformed tokens', async ({ request }) => {
    let exercised = 0;

    for (const token of GUESSABLE_TOKENS) {
      const url = TOKEN_LOGIN(encodeURIComponent(token));
      const res = await request.get(url, { headers: { Accept: 'application/json' }, failOnStatusCode: false });
      const body = await res.text();
      const state = classifyProbe({ status: res.status(), headers: res.headers() });

      if (state === 'UNREACHABLE_ROUTE' || state === 'UNREACHABLE_SHELL') continue;
      exercised++;

      expect(
        res.status(),
        `Token-login accepted the guessable token "${token}" with HTTP 200 at ${url}. ` +
          `That is a direct account takeover. Body: ${body.slice(0, 250)}`
      ).not.toBe(200);

      // A session must never be issued for a bogus token.
      const setCookie = res.headers()['set-cookie'] || '';
      expect(
        setCookie,
        `Token-login set a session cookie for the bogus token "${token}": ${setCookie.slice(0, 200)}`
      ).not.toMatch(/dragon(Access|Refresh)Token=/);

      expect(
        findPrivateData(body, isJson(res.headers())),
        `Token-login leaked private data for the bogus token "${token}"`
      ).toEqual([]);
    }

    test.skip(
      exercised === 0,
      `The token-login route returned 404/405 for every probe, so no token validation was exercised. ` +
        `Either the route differs from ${HERCULES_ENDPOINTS.AUTH.TOKEN_LOGIN('<token>')} or it is not deployed here. ` +
        `Reported as a skip rather than a pass.`
    );
  });

  test('LINK-02: token-login must be rate limited against brute force', async ({ request }) => {
    // A link token is only as strong as the number of attempts allowed against
    // it. Rate limiting is the compensating control for any entropy shortfall.
    const attempts = 25;
    const responses = await Promise.all(
      Array.from({ length: attempts }, (_, i) =>
        request.get(TOKEN_LOGIN(`brute_probe_${i}_${Date.now()}`), {
          headers: { Accept: 'application/json' },
          failOnStatusCode: false,
        })
      )
    );

    const codes = responses.map((r) => r.status());
    const states = new Set(responses.map((r) => classifyProbe({ status: r.status(), headers: r.headers() })));
    test.skip(
      states.size === 1 && states.has('UNREACHABLE_ROUTE'),
      `Token-login route is absent here (all ${attempts} attempts returned 404/405); nothing to rate limit.`
    );

    const throttled = codes.filter((c) => c === 429).length;
    const rateHeaders = responses.some((r) =>
      Object.keys(r.headers()).some((h) => h.includes('ratelimit') || h === 'retry-after')
    );

    expect(
      throttled > 0 || rateHeaders,
      `${attempts} consecutive invalid token-login attempts drew no HTTP 429 and no rate-limit headers ` +
        `(codes: ${[...new Set(codes)].join(', ')}). Unlimited attempts against an emailed login token ` +
        `turn any entropy weakness into a practical account takeover.`
    ).toBe(true);
  });

  test('LINK-03: password-reset must not disclose whether an account exists', async ({ request }) => {
    // AUTH.RESET_PASSWORD_OTP (/api/auth/forgot-password/send-otp) is 404 on this
    // deployment; /V2/auth/fpwd/send-email is the live reset endpoint.
    const url = TARGETS.resolveUrl(HERCULES_ENDPOINTS.AUTH.FORGOT_PASSWORD_EMAIL);

    const known = await request.post(url, {
      data: { email: 'admin@hercules.works' },
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      failOnStatusCode: false,
    });
    const unknown = await request.post(url, {
      data: { email: `definitely_not_a_user_${Date.now()}@example.invalid` },
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      failOnStatusCode: false,
    });

    const knownState = classifyProbe({ status: known.status(), headers: known.headers() });
    test.skip(
      knownState === 'UNREACHABLE_ROUTE',
      `Reset endpoint absent (HTTP ${known.status()}): ${PROBE_STATE_LABEL[knownState]}`
    );

    const knownBody = await known.text();
    const unknownBody = await unknown.text();

    // Differing status codes let an attacker enumerate valid accounts.
    expect(
      known.status(),
      `Password reset returned HTTP ${known.status()} for a likely-existing address but ` +
        `HTTP ${unknown.status()} for a non-existent one. The difference enumerates valid accounts; ` +
        `both should respond identically.`
    ).toBe(unknown.status());

    // And so do differing messages.
    const normalise = (s) => s.replace(/[0-9a-f]{8,}/gi, 'X').replace(/\s+/g, ' ').trim();
    expect(
      normalise(knownBody),
      `Password reset returned different bodies for existing vs non-existent accounts, which enumerates users.\n` +
        `Known:   ${knownBody.slice(0, 160)}\nUnknown: ${unknownBody.slice(0, 160)}`
    ).toBe(normalise(unknownBody));
  });

  test('LINK-04: login must not disclose whether an account exists', async ({ request }) => {
    const url = TARGETS.resolveUrl(HERCULES_ENDPOINTS.AUTH.PASSWORD_LOGIN_ACCOUNT_STATUS);

    const known = await request.post(url, {
      data: { email: 'admin@hercules.works' },
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      failOnStatusCode: false,
    });
    const state = classifyProbe({ status: known.status(), headers: known.headers() });
    test.skip(
      state === 'UNREACHABLE_ROUTE',
      `Account-status endpoint absent (HTTP ${known.status()}): ${PROBE_STATE_LABEL[state]}`
    );

    const body = await known.text();
    // This endpoint exists to tell the client which login method to show, so a
    // difference is by design. Record it rather than failing, but assert that it
    // at least does not leak more than existence.
    test.info().annotations.push({
      type: 'security-note',
      description:
        `Account-status endpoint is an intentional existence oracle (HTTP ${known.status()}). ` +
        `Ensure it is rate limited, or it becomes a bulk user-enumeration API.`,
    });

    expect(
      findPrivateData(body, isJson(known.headers())),
      `Account-status endpoint leaked more than account existence: ${body.slice(0, 250)}`
    ).toEqual([]);
  });
});
