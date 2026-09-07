const { test, expect } = require('@playwright/test');
const { setupMailosaurAccount, hasMailosaurCredentials } = require('../utils/MailosaurSetup');
const HERCULES_ENDPOINTS = require('../../config/herculesEndpoints');
const TARGETS = require('../../config/securityTargets');
const ScopeGuard = require('../../utils/security/ScopeGuard');
const { findPrivateData, isJson } = require('../../utils/security/probeHelpers');

/**
 * Stateful session security: real tenants, real objects, real credentials.
 *
 * What the previous version did and why it proved nothing:
 *   SEC-AUTH-01 spent five minutes provisioning a real user and creating a real
 *     survey, then attacked `/api/surveys/srv_victim_<random>` -- an id that
 *     never existed -- with a syntactically invalid token, and asserted 404.
 *     It measured "404 on a nonexistent row", not tenant isolation.
 *   SEC-AUTH-02 was named "post-logout invalidation" but never logged in or out;
 *     it replayed the literal string "stale_revoked_token_after_logout_12345".
 *   SEC-AUTH-03 was named "session fixation" but never compared a pre-auth
 *     session id with a post-auth one, and only console.logged cookie flags.
 *
 * This version provisions TWO real tenants, has tenant B attack tenant A's real
 * object with B's own VALID session (which is what actually tests authorization,
 * as opposed to testing the signature verifier), and re-checks afterwards that
 * A's object survived.
 */

const PROVISION_TIMEOUT = 420000;

/** Builds API auth headers from a browser context's cookies. */
async function sessionFromContext(context) {
  const cookies = await context.cookies();
  const scoped = cookies.filter((c) => (c.domain || '').includes('hercules.works'));
  const bearer = (scoped.find((c) => c.name === 'dragonAccessToken') || {}).value || null;
  return {
    cookies: scoped,
    headers: {
      Cookie: scoped.map((c) => `${c.name}=${c.value}`).join('; '),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      Accept: 'application/json',
    },
    bearer,
  };
}

/** Submits a prompt so the account owns at least one server-side object. */
async function createOwnedObject(page) {
  if (!page.url().includes('/ai')) {
    await page.goto(`${TARGETS.WEB_BASE}/ai`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(3000);
  }

  const textarea = page.locator("textarea[aria-label='Ask Hercules a question'], textarea").first();
  await textarea.waitFor({ state: 'visible', timeout: 30000 });
  await textarea.fill(`Create a 3-question beverage feedback survey ${Math.random().toString(36).slice(2, 7)}.`);

  const submitBtn = page
    .locator('button[aria-label="submit button"]')
    .or(page.getByRole('button', { name: 'Send' }))
    .or(page.locator('button[type="submit"]'))
    .first();

  if (await submitBtn.isVisible().catch(() => false)) {
    await submitBtn.click({ force: true });
  } else {
    await textarea.press('Enter');
  }
  // Submitting the prompt creates the chat server-side; no need to walk the
  // whole questionnaire, which is what made the old test slow and brittle.
  await page.waitForTimeout(6000);
}

/** Polls the API for a real object id owned by this session. */
async function findOwnedObjectId(request, session, attempts = 10) {
  for (let i = 0; i < attempts; i++) {
    const res = await request.get(TARGETS.resolveUrl(HERCULES_ENDPOINTS.CAMPAIGNS.GET_HISTORY), {
      headers: session.headers,
      failOnStatusCode: false,
    });
    if (res.status() === 200) {
      const body = await res.text();
      try {
        const parsed = JSON.parse(body);
        const rows = Array.isArray(parsed) ? parsed : parsed.chats || parsed.data || parsed.results || [];
        const row = rows.find((r) => r && (r.id || r.chatId || r._id));
        if (row) return row.id || row.chatId || row._id;
      } catch (e) {
        // fall through and retry
      }
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}

test.describe.serial('Stateful Session Security & Multi-Tenant BOLA', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.skip(
    !hasMailosaurCredentials(),
    'Account provisioning needs MAILOSAUR_UI_EMAIL, MAILOSAUR_UI_PASSWORD and MAILOSAUR_SERVER_ID. ' +
      'Skipping is deliberate: these tests cannot be faked without real tenants.'
  );

  /** @type {{page: any, context: any, session: any, objectId: string|null, preAuthCookies: any[]}} */
  let tenantA;

  test.beforeAll(async () => {
    for (const origin of TARGETS.ALL_ORIGINS) {
      ScopeGuard.validateScope(origin);
    }
  });

  test('SEC-AUTH-01: tenant B must not read or delete tenant A objects', async ({ browser, request }) => {
    test.setTimeout(PROVISION_TIMEOUT * 2);

    // ---- Provision tenant A and give it a real object ----
    console.log('[SEC-AUTH-01] Provisioning tenant A...');
    const a = await setupMailosaurAccount(browser);
    const sessionA = await sessionFromContext(a.herculesContext);
    tenantA = {
      page: a.page,
      context: a.herculesContext,
      session: sessionA,
      objectId: null,
      preAuthCookies: a.preAuthCookies,
      email: a.email,
    };

    expect(sessionA.cookies.length, 'Tenant A did not receive any session cookies').toBeGreaterThan(0);
    expect(sessionA.bearer, 'Tenant A has no dragonAccessToken; provisioning did not complete').toBeTruthy();

    await createOwnedObject(a.page);
    const objectIdA = await findOwnedObjectId(request, sessionA);
    tenantA.objectId = objectIdA;

    expect(
      objectIdA,
      'Could not obtain a real object id for tenant A, so there is nothing to test isolation against. ' +
        'This is a test-setup failure, not a security pass.'
    ).toBeTruthy();
    console.log(`[SEC-AUTH-01] Tenant A owns object ${objectIdA}`);

    // ---- Positive control: the owner CAN read it ----
    const objectUrl = TARGETS.resolveUrl(HERCULES_ENDPOINTS.CAMPAIGNS.GET_CHAT_BY_ID(objectIdA));
    const ownerRead = await request.get(objectUrl, { headers: sessionA.headers, failOnStatusCode: false });
    expect(
      ownerRead.status(),
      `Positive control failed: tenant A could not read its own object (HTTP ${ownerRead.status()}). ` +
        'Without this, a 404 to an attacker is indistinguishable from a 404 to everyone.'
    ).toBe(200);
    const ownerBody = await ownerRead.text();
    console.log('[SEC-AUTH-01] Positive control OK: owner reads their own object.');

    // ---- Provision tenant B: a DIFFERENT real tenant with a VALID session ----
    console.log('[SEC-AUTH-01] Provisioning tenant B...');
    const b = await setupMailosaurAccount(browser);
    const sessionB = await sessionFromContext(b.herculesContext);
    expect(sessionB.bearer, 'Tenant B has no access token; provisioning did not complete').toBeTruthy();
    expect(sessionB.bearer, 'Tenants A and B share a session token - provisioning reused one account').not.toBe(
      sessionA.bearer
    );

    // Confirm B's session is genuinely valid, so a denial below is authorization
    // working rather than B simply being unauthenticated.
    const bOwnHistory = await request.get(TARGETS.resolveUrl(HERCULES_ENDPOINTS.CAMPAIGNS.GET_HISTORY), {
      headers: sessionB.headers,
      failOnStatusCode: false,
    });
    expect(
      bOwnHistory.status(),
      `Tenant B's own session is not valid (HTTP ${bOwnHistory.status()}), so a denial on A's object would ` +
        'prove nothing about authorization.'
    ).toBe(200);
    console.log("[SEC-AUTH-01] Tenant B's session is valid.");

    // ---- The actual BOLA test: B reads A's real object with B's valid session ----
    const crossRead = await request.get(objectUrl, { headers: sessionB.headers, failOnStatusCode: false });
    const crossBody = await crossRead.text();

    expect(
      crossRead.status(),
      `BOLA: tenant B read tenant A's object ${objectIdA} with its own valid session (HTTP 200). ` +
        `Object-level authorization is not enforced. Body: ${crossBody.slice(0, 300)}`
    ).not.toBe(200);
    expect([401, 403, 404]).toContain(crossRead.status());
    expect(
      findPrivateData(crossBody, isJson(crossRead.headers())),
      "Tenant A's private data leaked to tenant B"
    ).toEqual([]);
    console.log(`[SEC-AUTH-01] Cross-tenant read correctly denied with HTTP ${crossRead.status()}.`);

    // ---- B attempts to DELETE A's object ----
    const crossDelete = await request.delete(objectUrl, { headers: sessionB.headers, failOnStatusCode: false });
    expect(
      [401, 403, 404],
      `BOLA: tenant B's DELETE on tenant A's object returned HTTP ${crossDelete.status()} instead of being denied.`
    ).toContain(crossDelete.status());
    console.log(`[SEC-AUTH-01] Cross-tenant delete correctly denied with HTTP ${crossDelete.status()}.`);

    // ---- Integrity re-check: A's object must still exist ----
    const afterAttack = await request.get(objectUrl, { headers: sessionA.headers, failOnStatusCode: false });
    expect(
      afterAttack.status(),
      `Tenant A's object no longer readable (HTTP ${afterAttack.status()}) after tenant B's delete attempt: ` +
        'the unauthorized delete took effect.'
    ).toBe(200);
    const afterBody = await afterAttack.text();
    expect(afterBody.length, "Tenant A's object was emptied by tenant B's delete attempt").toBeGreaterThan(0);
    console.log("[SEC-AUTH-01] Integrity confirmed: tenant A's object survived intact.");

    void ownerBody;
    await b.herculesContext.close().catch(() => {});
  });

  test('SEC-AUTH-02: a session must stop working after logout', async ({ request }) => {
    test.setTimeout(PROVISION_TIMEOUT);
    expect(tenantA, 'Tenant A was not provisioned by SEC-AUTH-01').toBeTruthy();

    const accountUrl = TARGETS.resolveUrl(HERCULES_ENDPOINTS.ACCOUNT.GET_DETAILS);

    // 1. Prove the captured session works BEFORE logout. Without this the test
    //    below passes trivially against any string.
    const before = await request.get(accountUrl, { headers: tenantA.session.headers, failOnStatusCode: false });
    expect(
      before.status(),
      `Tenant A's session was not usable before logout (HTTP ${before.status()}), so a rejection after ` +
        'logout would prove nothing.'
    ).toBe(200);

    // 2. Log out through the real endpoint, using that same session.
    const logout = await request.post(TARGETS.resolveUrl(HERCULES_ENDPOINTS.AUTH.LOGOUT), {
      headers: tenantA.session.headers,
      data: {},
      failOnStatusCode: false,
    });
    console.log(`[SEC-AUTH-02] Logout returned HTTP ${logout.status()}`);
    expect(logout.status(), `Logout endpoint failed with HTTP ${logout.status()}`).toBeLessThan(500);

    // 3. Replay the SAME token that worked in step 1. It must now be rejected.
    const after = await request.get(accountUrl, { headers: tenantA.session.headers, failOnStatusCode: false });
    const afterBody = await after.text();

    expect(
      after.status(),
      `Token replay succeeded after logout (HTTP 200): the session was not invalidated server-side, so a ` +
        `stolen token remains valid indefinitely. Body: ${afterBody.slice(0, 200)}`
    ).not.toBe(200);
    expect(
      findPrivateData(afterBody, isJson(after.headers())),
      'Private data returned to a logged-out session token'
    ).toEqual([]);
    console.log(`[SEC-AUTH-02] Replay after logout correctly rejected with HTTP ${after.status()}.`);
  });

  test('SEC-AUTH-03: session id must rotate on auth and cookies must be hardened', async () => {
    expect(tenantA, 'Tenant A was not provisioned by SEC-AUTH-01').toBeTruthy();

    const preAuth = tenantA.preAuthCookies || [];
    const postAuth = tenantA.session.cookies;

    // ---- Session fixation: the authenticated session id must not be a value
    //      that was already present before authenticating. ----
    const SESSION_COOKIE_NAMES = ['dragonAccessToken', 'dragonRefreshToken'];
    const authCookies = postAuth.filter((c) => SESSION_COOKIE_NAMES.includes(c.name));

    expect(
      authCookies.length,
      `No session cookies (${SESSION_COOKIE_NAMES.join('/')}) found after authentication. ` +
        `Cookies present: ${postAuth.map((c) => c.name).join(', ') || 'none'}`
    ).toBeGreaterThan(0);

    for (const cookie of authCookies) {
      const preValue = preAuth.find((c) => c.name === cookie.name);
      expect(
        preValue && preValue.value === cookie.value,
        `Session fixation: cookie ${cookie.name} kept the same value across the authentication boundary ` +
          '(pre-auth value was reused). It must be regenerated on login.'
      ).toBe(false);

      // ---- Cookie hardening ----
      expect(cookie.secure, `Session cookie ${cookie.name} is missing the Secure flag: it can be sent over HTTP.`).toBe(
        true
      );
      expect(
        cookie.httpOnly,
        `Session cookie ${cookie.name} is missing HttpOnly: JavaScript can read it, so any XSS steals the session.`
      ).toBe(true);
      expect(
        cookie.sameSite,
        `Session cookie ${cookie.name} has no SameSite attribute.`
      ).toBeTruthy();

      // SameSite=None is required here because the API is a separate origin
      // (devapi.hercules.works), so it is recorded rather than failed -- but it
      // does mean CSRF defence must come from tokens, not the cookie policy.
      if (cookie.sameSite === 'None') {
        test.info().annotations.push({
          type: 'security-note',
          description:
            `${cookie.name} uses SameSite=None (required for the cross-origin API). The cookie therefore ` +
            'provides no CSRF protection; state-changing endpoints must verify an anti-CSRF token or Origin header.',
        });
      }

      // Entropy: a guessable session id is as bad as none.
      expect(
        cookie.value.length,
        `Session cookie ${cookie.name} is only ${cookie.value.length} chars: too short to resist guessing.`
      ).toBeGreaterThanOrEqual(32);
    }

    console.log(
      `[SEC-AUTH-03] Verified ${authCookies.length} session cookie(s): rotated on auth, Secure, HttpOnly, >=32 chars.`
    );
  });

  test.afterAll(async () => {
    if (tenantA && tenantA.context) {
      await tenantA.context.close().catch(() => {});
    }
  });
});
