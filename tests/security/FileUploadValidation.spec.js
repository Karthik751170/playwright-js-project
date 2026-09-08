const { test, expect } = require('@playwright/test');
const HERCULES_ENDPOINTS = require('../../config/herculesEndpoints');
const TARGETS = require('../../config/securityTargets');
const ScopeGuard = require('../../utils/security/ScopeGuard');
const {
  loadSession, authHeaders, classifyProbe, PROBE_STATE_LABEL, verifySessionIsLive, isHtml,
} = require('../../utils/security/probeHelpers');

/**
 * Media upload validation.
 *
 * The old suite POSTed 5MB to /api/upload -- a path that does not exist -- and
 * counted the resulting 404 as a pass. The real upload path is
 * /api/chats/{chatId}/inject-media, which needs an authenticated session and an
 * owned chat, so most of this file skips without one. That is the honest
 * outcome: it is not evidence the upload path is safe.
 */

const MALICIOUS_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>';

async function findOwnedChatId(request, session) {
  const res = await request.get(TARGETS.resolveUrl(HERCULES_ENDPOINTS.CAMPAIGNS.GET_HISTORY), {
    headers: { ...authHeaders(session), Accept: 'application/json' },
    failOnStatusCode: false,
  });
  if (res.status() !== 200) return null;
  try {
    const parsed = JSON.parse(await res.text());
    const rows = Array.isArray(parsed) ? parsed : parsed.chats || parsed.data || parsed.results || [];
    const row = rows.find((r) => r && (r.id || r.chatId || r._id));
    return row ? row.id || row.chatId || row._id : null;
  } catch (e) {
    return null;
  }
}

test.describe('Media Upload Validation', () => {
  let session;

  test.beforeAll(() => {
    for (const origin of TARGETS.ALL_ORIGINS) ScopeGuard.validateScope(origin);
    session = loadSession();
  });

  test('UPLOAD-01: the media endpoint must require authentication', async ({ request }) => {
    const url = TARGETS.resolveUrl(HERCULES_ENDPOINTS.DRAGON_QUESTIONS.INJECT_MEDIA('chat_probe_unauth'));
    const res = await request.post(url, {
      multipart: {
        file: { name: 'probe.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(MALICIOUS_SVG) },
      },
      failOnStatusCode: false,
    });
    const state = classifyProbe({ status: res.status(), headers: res.headers() });
    test.skip(
      state === 'UNREACHABLE_ROUTE',
      `Media endpoint absent here (HTTP ${res.status()}): ${PROBE_STATE_LABEL[state]}. ` +
        `Update config/herculesEndpoints.js if the route moved.`
    );

    expect(
      res.status(),
      `Unauthenticated upload to ${url} returned HTTP 200. Anonymous file upload is a storage-abuse and ` +
        `stored-XSS vector.`
    ).not.toBe(200);
  });

  test('UPLOAD-02: oversized uploads must be bounded', async ({ request }) => {
    const liveness = await verifySessionIsLive(request, session);
    test.skip(!liveness.live, `Needs a live session and an owned chat: ${liveness.reason}`);
    ScopeGuard.assertMutationAllowed(TARGETS.AI_API_BASE, 'oversized upload probe');

    const chatId = await findOwnedChatId(request, session);
    test.skip(!chatId, 'No owned chat available to upload into.');

    const url = TARGETS.resolveUrl(HERCULES_ENDPOINTS.DRAGON_QUESTIONS.INJECT_MEDIA(chatId));
    const res = await request.post(url, {
      multipart: {
        file: { name: 'big.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(20 * 1024 * 1024, 0x41) },
      },
      headers: authHeaders(session),
      timeout: 120000,
      failOnStatusCode: false,
    });

    expect(
      [400, 413, 415, 422, 429].includes(res.status()),
      `A 20MB upload returned HTTP ${res.status()} instead of an explicit size rejection (413/400/422). ` +
        `Unbounded upload size is a storage and memory exhaustion vector.`
    ).toBe(true);
  });

  test('UPLOAD-03: dangerous file types must be rejected, not stored and served', async ({ request }) => {
    const liveness = await verifySessionIsLive(request, session);
    test.skip(!liveness.live, `Needs a live session and an owned chat: ${liveness.reason}`);
    ScopeGuard.assertMutationAllowed(TARGETS.AI_API_BASE, 'malicious upload probe');

    const chatId = await findOwnedChatId(request, session);
    test.skip(!chatId, 'No owned chat available to upload into.');
    const url = TARGETS.resolveUrl(HERCULES_ENDPOINTS.DRAGON_QUESTIONS.INJECT_MEDIA(chatId));

    const payloads = [
      { label: 'SVG with inline script', name: 'x.svg', mime: 'image/svg+xml', body: MALICIOUS_SVG },
      { label: 'HTML disguised as image', name: 'x.png', mime: 'image/png', body: '<html><script>alert(1)</script></html>' },
      { label: 'PHP web shell', name: 'shell.php', mime: 'application/x-php', body: '<?php system($_GET["c"]); ?>' },
      { label: 'double extension', name: 'x.png.html', mime: 'text/html', body: '<script>alert(1)</script>' },
    ];

    for (const p of payloads) {
      const res = await request.post(url, {
        multipart: { file: { name: p.name, mimeType: p.mime, buffer: Buffer.from(p.body) } },
        headers: authHeaders(session),
        failOnStatusCode: false,
      });
      const body = await res.text();

      if (res.status() !== 200) continue; // rejected: good

      // If it was accepted, the stored copy must not be served back as
      // executable content on an origin that shares cookies with the app.
      const urlMatch = body.match(/https?:\/\/[^\s"']+/);
      expect(
        urlMatch,
        `${p.label} was accepted (HTTP 200) but no stored URL was returned, so the outcome cannot be verified. ` +
          `Body: ${body.slice(0, 250)}`
      ).toBeTruthy();

      const stored = await request.get(urlMatch[0], { failOnStatusCode: false });
      expect(
        isHtml(stored.headers()) || (stored.headers()['content-type'] || '').includes('svg'),
        `${p.label} was stored and is served back as ${stored.headers()['content-type']} from ${urlMatch[0]}. ` +
          `Serving attacker-controlled markup from an app origin is stored XSS; serve uploads from a separate ` +
          `origin with Content-Disposition: attachment and a forced content type.`
      ).toBe(false);
    }
  });
});
