const { test, expect } = require('@playwright/test');
const HERCULES_ENDPOINTS = require('../../config/herculesEndpoints');
const TARGETS = require('../../config/securityTargets');
const ScopeGuard = require('../../utils/security/ScopeGuard');
const {
  loadSession, authHeaders, findPrivateData, isJson,
  classifyProbe, PROBE_STATE_LABEL, verifySessionIsLive,
} = require('../../utils/security/probeHelpers');

/**
 * Share links and guest-session claiming -- both previously untested.
 *
 * Guest sessions are the interesting one: POST /api/chat works unauthenticated
 * and returns a guest_id, and /api/chat/claim-guest-session converts a guest
 * session into an owned one. If a guest id is guessable or claimable by anyone
 * who learns it, an attacker can either steal a victim's guest conversation or
 * graft their own content into a victim's account.
 */

test.describe('Share Links & Guest Session Claiming', () => {
  let session;

  test.beforeAll(() => {
    for (const origin of TARGETS.ALL_ORIGINS) ScopeGuard.validateScope(origin);
    session = loadSession();
  });

  test('GUEST-01: guest identifiers must be unguessable', async ({ request }) => {
    test.setTimeout(180000);
    ScopeGuard.assertMutationAllowed(TARGETS.AI_API_BASE, 'guest chat creation');

    // Create two guest sessions and compare their identifiers. Sequential or
    // low-entropy ids would let an attacker walk other people's conversations.
    const created = [];
    for (let i = 0; i < 2; i++) {
      const res = await request.post(TARGETS.resolveUrl(HERCULES_ENDPOINTS.AI_CHAT.CHAT), {
        data: { prompt: 'Reply with OK.', request_id: require('crypto').randomUUID() },
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        timeout: 120000,
        failOnStatusCode: false,
      });
      if (res.status() !== 200) continue;
      try {
        const data = JSON.parse(await res.text()).data || {};
        if (data.guest_id) created.push({ guestId: data.guest_id, chatId: data.chat_id });
      } catch (e) {
        /* ignore */
      }
    }

    test.skip(created.length < 2, `Could not create two guest sessions (got ${created.length}); nothing to compare.`);

    const [a, b] = created;
    console.log(`[GUEST-01] guest ids: ${a.guestId} / ${b.guestId}`);

    expect(a.guestId, 'Two guest sessions were issued the same identifier').not.toBe(b.guestId);
    // A UUIDv4 is 36 chars; anything materially shorter is worth flagging.
    expect(
      a.guestId.length,
      `Guest identifier "${a.guestId}" is only ${a.guestId.length} chars: too short to resist enumeration.`
    ).toBeGreaterThanOrEqual(32);
    // Adjacent ids must not be sequential.
    expect(
      Math.abs(parseInt(a.guestId.replace(/\D/g, '').slice(0, 12) || '0', 10) -
        parseInt(b.guestId.replace(/\D/g, '').slice(0, 12) || '0', 10)),
      `Guest identifiers appear sequential (${a.guestId} vs ${b.guestId}), so other sessions can be enumerated.`
    ).not.toBe(1);
  });

  test('GUEST-02: a guest session must not be claimable without proving ownership', async ({ request }) => {
    const liveness = await verifySessionIsLive(request, session);
    test.skip(!liveness.live, `Needs a live session to attempt a claim: ${liveness.reason}`);
    ScopeGuard.assertMutationAllowed(TARGETS.AI_API_BASE, 'guest session claim');

    const url = TARGETS.resolveUrl(HERCULES_ENDPOINTS.AUTH.CLAIM_GUEST_SESSION);

    // Claim identifiers that belong to nobody / somebody else.
    for (const guestId of ['00000000-0000-0000-0000-000000000000', 'guest_probe_not_mine', '1']) {
      const res = await request.post(url, {
        data: { guest_id: guestId, guestId },
        headers: { ...authHeaders(session), 'Content-Type': 'application/json', Accept: 'application/json' },
        failOnStatusCode: false,
      });
      const body = await res.text();
      const state = classifyProbe({ status: res.status(), headers: res.headers() });
      if (state === 'UNREACHABLE_ROUTE') continue;

      expect(
        res.status(),
        `Claiming an arbitrary guest session "${guestId}" returned HTTP 200. If any authenticated user can ` +
          `claim any guest id, conversations can be stolen or grafted into another account. ` +
          `Body: ${body.slice(0, 250)}`
      ).not.toBe(200);
    }
  });

  test('SHARE-01: share tokens must be unguessable and must not leak private data', async ({ request }) => {
    const guessable = ['1', 'test', 'null', '00000000-0000-0000-0000-000000000000', 'shared'];
    let exercised = 0;

    for (const id of guessable) {
      const url = TARGETS.resolveUrl(HERCULES_ENDPOINTS.CAMPAIGNS.GET_SHARE_TURN(encodeURIComponent(id), 'turn_probe'));
      const res = await request.get(url, { headers: { Accept: 'application/json' }, failOnStatusCode: false });
      const body = await res.text();
      const state = classifyProbe({ status: res.status(), headers: res.headers() });
      if (state === 'UNREACHABLE_ROUTE' || state === 'UNREACHABLE_SHELL') continue;
      exercised++;

      expect(
        findPrivateData(body, isJson(res.headers())),
        `Share endpoint leaked private data for the guessable id "${id}" at ${url}`
      ).toEqual([]);
    }

    test.skip(exercised === 0, 'Share-turn route produced no auth decision; nothing exercised.');
  });

  test('SHARE-02: revoking a share must invalidate the link', async ({ request }) => {
    const liveness = await verifySessionIsLive(request, session);
    test.skip(
      !liveness.live,
      `Needs a live session plus an owned chat to share and revoke: ${liveness.reason}. ` +
        `End-to-end share revocation is exercised by the two-tenant suite when Mailosaur is configured.`
    );

    // Locate an owned chat to share.
    const history = await request.get(TARGETS.resolveUrl(HERCULES_ENDPOINTS.CAMPAIGNS.GET_HISTORY), {
      headers: { ...authHeaders(session), Accept: 'application/json' },
      failOnStatusCode: false,
    });
    test.skip(history.status() !== 200, `Could not list chats (HTTP ${history.status()}).`);

    let chatId = null;
    try {
      const parsed = JSON.parse(await history.text());
      const rows = Array.isArray(parsed) ? parsed : parsed.chats || parsed.data || parsed.results || [];
      const row = rows.find((r) => r && (r.id || r.chatId || r._id));
      if (row) chatId = row.id || row.chatId || row._id;
    } catch (e) {
      /* ignore */
    }
    test.skip(!chatId, 'No owned chat available to test share revocation.');
    ScopeGuard.assertMutationAllowed(TARGETS.AI_API_BASE, 'share/revoke probe');

    const shareUrl = TARGETS.resolveUrl(HERCULES_ENDPOINTS.CAMPAIGNS.SHARE_CHAT(chatId));
    const enable = await request.post(shareUrl, {
      data: { shared: true },
      headers: { ...authHeaders(session), 'Content-Type': 'application/json', Accept: 'application/json' },
      failOnStatusCode: false,
    });
    const enableState = classifyProbe({ status: enable.status(), headers: enable.headers() });
    test.skip(
      enableState !== 'EXERCISED',
      `Share endpoint returned HTTP ${enable.status()} (${PROBE_STATE_LABEL[enableState]}); cannot test revocation.`
    );

    // Turn sharing off again, then confirm an anonymous read is denied.
    await request.post(shareUrl, {
      data: { shared: false },
      headers: { ...authHeaders(session), 'Content-Type': 'application/json', Accept: 'application/json' },
      failOnStatusCode: false,
    });

    const anonRead = await request.get(TARGETS.resolveUrl(HERCULES_ENDPOINTS.CAMPAIGNS.GET_CHAT_BY_ID(chatId)), {
      headers: { Accept: 'application/json' },
      failOnStatusCode: false,
    });
    const anonBody = await anonRead.text();

    expect(
      anonRead.status(),
      `After sharing was revoked, an anonymous caller could still read chat ${chatId} (HTTP 200). ` +
        `Revocation must take effect immediately. Body: ${anonBody.slice(0, 250)}`
    ).not.toBe(200);
  });
});
