const { test, expect } = require('@playwright/test');
const HERCULES_ENDPOINTS = require('../../config/herculesEndpoints');
const TARGETS = require('../../config/securityTargets');
const ScopeGuard = require('../../utils/security/ScopeGuard');
const {
  loadSession, authHeaders, classifyProbe, PROBE_STATE_LABEL, verifySessionIsLive,
} = require('../../utils/security/probeHelpers');

/**
 * Payment and credit integrity.
 *
 * Forging a payment-verification callback is one of the highest-severity
 * business-logic flaws there is: it converts "I said I paid" into credit.
 * Nothing tested it.
 *
 * Safety rules observed here:
 *   - ScopeGuard.assertMutationAllowed refuses to run any of this against a
 *     production origin.
 *   - Every probe uses a FORGED or NON-EXISTENT order/payment id, so a correct
 *     server rejects it and nothing real is charged, refunded or reversed.
 *   - No probe attempts to spend, refund or reverse a genuine transaction.
 * A failure here means the server ACCEPTED a forged payment, which is the
 * finding.
 */

test.describe('Payment & Credit Integrity', () => {
  let session;

  test.beforeAll(() => {
    for (const origin of TARGETS.ALL_ORIGINS) ScopeGuard.validateScope(origin);
    ScopeGuard.assertMutationAllowed(TARGETS.CORE_API_BASE, 'payment integrity probes');
    session = loadSession();
  });

  test('PAY-01: payment endpoints must require authentication', async ({ request }) => {
    const endpoints = [
      { label: 'Verify payment', path: HERCULES_ENDPOINTS.BILLING.VERIFY_PAYMENT },
      { label: 'Create order', path: HERCULES_ENDPOINTS.BILLING.CREATE_ORDER },
      { label: 'Apply refund', path: HERCULES_ENDPOINTS.BILLING.APPLY_REFUND },
      { label: 'Reverse transaction', path: HERCULES_ENDPOINTS.BILLING.REVERSE_TRANSACTION },
      { label: 'Deduct credits', path: HERCULES_ENDPOINTS.BILLING.DEDUCT_CREDITS },
      { label: 'Upgrade plan', path: HERCULES_ENDPOINTS.BILLING.UPGRADE_PLAN },
    ];

    let exercised = 0;
    for (const ep of endpoints) {
      const url = TARGETS.resolveUrl(ep.path);
      const res = await request.post(url, {
        data: {},
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        failOnStatusCode: false,
      });
      const state = classifyProbe({ status: res.status(), headers: res.headers() });
      if (state === 'UNREACHABLE_ROUTE' || state === 'UNREACHABLE_SHELL') continue;
      exercised++;

      const body = await res.text();
      expect(
        res.status(),
        `${ep.label} (${url}) answered HTTP ${res.status()} to an UNAUTHENTICATED request. ` +
          `Money-moving endpoints must reject anonymous callers outright. Body: ${body.slice(0, 250)}`
      ).not.toBe(200);
      // A 422 means it validated the payload before checking auth: order matters.
      expect(
        [401, 403],
        `${ep.label} returned HTTP ${res.status()} unauthenticated. Expected 401/403 BEFORE payload ` +
          `validation; a 4xx validation error means the handler ran first.`
      ).toContain(res.status());
    }

    expect(exercised, 'No payment endpoint produced an auth decision; nothing was tested.').toBeGreaterThan(0);
  });

  test('PAY-02: a forged payment verification must be rejected', async ({ request }) => {
    const liveness = await verifySessionIsLive(request, session);
    test.skip(!liveness.live, `Needs a live session: ${liveness.reason}`);

    const url = TARGETS.resolveUrl(HERCULES_ENDPOINTS.BILLING.VERIFY_PAYMENT);

    // Shapes a gateway callback normally carries, all with invented ids and a
    // bogus signature. A correct server verifies the signature against the
    // gateway and rejects every one of these.
    const forgeries = [
      { label: 'invented ids + fake signature', data: { order_id: 'order_forged_probe_1', payment_id: 'pay_forged_probe_1', signature: 'f'.repeat(64), amount: 999999, status: 'success' } },
      { label: 'no signature at all', data: { order_id: 'order_forged_probe_2', payment_id: 'pay_forged_probe_2', amount: 999999, status: 'captured' } },
      { label: 'empty signature', data: { order_id: 'order_forged_probe_3', payment_id: 'pay_forged_probe_3', signature: '', amount: 1, status: 'success' } },
      { label: 'negative amount', data: { order_id: 'order_forged_probe_4', payment_id: 'pay_forged_probe_4', signature: 'a'.repeat(64), amount: -5000, status: 'success' } },
    ];

    let exercised = 0;
    for (const forgery of forgeries) {
      const res = await request.post(url, {
        data: forgery.data,
        headers: { ...authHeaders(session), 'Content-Type': 'application/json', Accept: 'application/json' },
        failOnStatusCode: false,
      });
      const state = classifyProbe({ status: res.status(), headers: res.headers() });
      if (state === 'UNREACHABLE_ROUTE') continue;
      exercised++;

      const body = await res.text();
      expect(
        res.status(),
        `FORGED PAYMENT ACCEPTED: verification with ${forgery.label} returned HTTP 200 at ${url}. ` +
          `Anyone with an account could self-credit. Body: ${body.slice(0, 300)}`
      ).not.toBe(200);

      expect(
        body,
        `Payment verification with ${forgery.label} reported success in its body despite a bogus signature. ` +
          `Body: ${body.slice(0, 300)}`
      ).not.toMatch(/"(?:success|status|verified)"\s*:\s*true/i);
    }

    test.skip(exercised === 0, 'Payment verification route produced no decision; nothing exercised.');
  });

  test('PAY-03: credit balance must not be mutable by client-supplied values', async ({ request }) => {
    const liveness = await verifySessionIsLive(request, session);
    test.skip(!liveness.live, `Needs a live session: ${liveness.reason}`);

    const balanceUrl = TARGETS.resolveUrl(HERCULES_ENDPOINTS.BILLING.CHECK_BALANCE);
    const headers = { ...authHeaders(session), Accept: 'application/json' };

    const before = await request.get(balanceUrl, { headers, failOnStatusCode: false });
    const beforeState = classifyProbe({ status: before.status(), headers: before.headers() });
    test.skip(
      beforeState !== 'EXERCISED',
      `Balance endpoint returned HTTP ${before.status()} (${PROBE_STATE_LABEL[beforeState]}); no baseline.`
    );
    const beforeBody = await before.text();

    // Attempt to set the balance through the query string, then read it back.
    await request.get(`${balanceUrl}?credits=999999&balance=999999&amount=999999`, { headers, failOnStatusCode: false });
    const after = await request.get(balanceUrl, { headers, failOnStatusCode: false });
    const afterBody = await after.text();

    expect(
      afterBody,
      `Credit balance changed after sending client-supplied credit values.\n` +
        `Before: ${beforeBody.slice(0, 200)}\nAfter:  ${afterBody.slice(0, 200)}`
    ).toBe(beforeBody);
  });

  test('PAY-04: refund and reversal must reject transactions the caller does not own', async ({ request }) => {
    const liveness = await verifySessionIsLive(request, session);
    test.skip(!liveness.live, `Needs a live session: ${liveness.reason}`);

    // Non-existent transaction ids only: never a real one.
    const targets = [
      { label: 'Apply refund', path: HERCULES_ENDPOINTS.BILLING.APPLY_REFUND },
      { label: 'Reverse transaction', path: HERCULES_ENDPOINTS.BILLING.REVERSE_TRANSACTION },
    ];

    let exercised = 0;
    for (const t of targets) {
      const url = TARGETS.resolveUrl(t.path);
      const res = await request.post(url, {
        data: { transaction_id: 'txn_not_mine_probe_0001', order_id: 'order_not_mine_probe_0001', amount: 999999 },
        headers: { ...authHeaders(session), 'Content-Type': 'application/json', Accept: 'application/json' },
        failOnStatusCode: false,
      });
      const state = classifyProbe({ status: res.status(), headers: res.headers() });
      if (state === 'UNREACHABLE_ROUTE') continue;
      exercised++;

      const body = await res.text();
      expect(
        res.status(),
        `${t.label} returned HTTP 200 for a transaction id the caller does not own (${url}). ` +
          `Body: ${body.slice(0, 250)}`
      ).not.toBe(200);
    }

    test.skip(exercised === 0, 'Refund/reversal routes produced no decision; nothing exercised.');
  });
});
