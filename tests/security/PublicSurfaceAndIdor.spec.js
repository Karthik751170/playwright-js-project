const { test, expect } = require('@playwright/test');
const HERCULES_ENDPOINTS = require('../../config/herculesEndpoints');
const TARGETS = require('../../config/securityTargets');
const ScopeGuard = require('../../utils/security/ScopeGuard');
const { findPrivateData, isJson, classifyProbe, PROBE_STATE_LABEL } = require('../../utils/security/probeHelpers');

/**
 * The deliberately-public surface.
 *
 * Endpoints under /V2/public/* are unauthenticated by design AND take a raw
 * object id, which makes them the most likely place in the whole catalog for a
 * real data leak. Nothing tested them before.
 *
 * Two distinct risks are covered:
 *   1. A public endpoint returning another tenant's private data (IDOR).
 *   2. Ids harvested from a public endpoint unlocking non-public endpoints.
 */

const PUBLIC_ENDPOINTS = [
  { label: 'Public audience report', build: (id) => HERCULES_ENDPOINTS.ANALYTICS.PUBLIC_AUDIENCE_INSIGHTS(id) },
  { label: 'Public bulk question report', build: (id) => HERCULES_ENDPOINTS.ANALYTICS.PUBLIC_BULK_QUESTION_REPORTS(id) },
];

/** Ids that no caller should be able to resolve. */
const FORGED_IDS = [
  'srv_nonexistent_probe_99812',
  '00000000-0000-0000-0000-000000000000',
  '../../../etc/passwd',
  "1' OR '1'='1",
];

test.describe('Public Surface & IDOR', () => {
  test.beforeAll(() => {
    for (const origin of TARGETS.ALL_ORIGINS) ScopeGuard.validateScope(origin);
  });

  test('PUB-01: public endpoints must not leak private data for arbitrary ids', async ({ request }) => {
    let exercised = 0;

    for (const ep of PUBLIC_ENDPOINTS) {
      for (const id of FORGED_IDS) {
        const url = TARGETS.resolveUrl(ep.build(encodeURIComponent(id)));
        const res = await request.get(url, { headers: { Accept: 'application/json' }, failOnStatusCode: false });
        const body = await res.text();
        const state = classifyProbe({ status: res.status(), headers: res.headers() });

        if (state === 'UNREACHABLE_ROUTE' || state === 'UNREACHABLE_SHELL') continue;
        exercised++;

        const leaks = findPrivateData(body, isJson(res.headers()));
        expect(
          leaks,
          `${ep.label} leaked ${leaks.join(', ')} for id "${id}" at ${url}. ` +
            `This endpoint is unauthenticated by design, so anything it returns is world-readable. ` +
            `Body: ${body.slice(0, 300)}`
        ).toEqual([]);
      }
    }

    expect(
      exercised,
      'No public endpoint produced a response, so this test proved nothing. Verify the catalog and origins.'
    ).toBeGreaterThan(0);
  });

  test('PUB-02: public endpoints must validate input instead of returning 5xx', async ({ request }) => {
    const failures = [];

    for (const ep of PUBLIC_ENDPOINTS) {
      const url = TARGETS.resolveUrl(ep.build('srv_nonexistent_probe_99812'));
      const res = await request.get(url, { headers: { Accept: 'application/json' }, failOnStatusCode: false });
      const body = await res.text();

      if (res.status() >= 500) {
        failures.push(`${ep.label} (${url}) -> HTTP ${res.status()}: ${body.slice(0, 150)}`);
      }
    }

    // An unauthenticated 5xx means the handler ran before validating input: it is
    // both an availability risk (cheap to trigger) and a sign that error paths
    // are unhardened.
    expect(
      failures,
      `Public endpoint(s) returned a server error for an unknown id instead of 404/400:\n${failures.join('\n')}\n` +
        `Any anonymous caller can trigger this, so it is a cheap availability and error-disclosure vector.`
    ).toEqual([]);
  });

  test('PUB-03: ids harvested from public endpoints must not unlock protected endpoints', async ({ request }) => {
    // The public default-templates endpoint hands out real chat_id values.
    const templatesRes = await request.get(TARGETS.resolveUrl(HERCULES_ENDPOINTS.AUDIENCE.GET_PUBLIC_DEFAULT), {
      headers: { Accept: 'application/json' },
      failOnStatusCode: false,
    });
    test.skip(templatesRes.status() !== 200, `Public templates endpoint returned HTTP ${templatesRes.status()}`);

    const templatesBody = await templatesRes.text();
    const harvested = [...new Set((templatesBody.match(/"chat_id"\s*:\s*"([0-9a-f-]{36})"/g) || [])
      .map((m) => m.split('"')[3]))];

    test.skip(harvested.length === 0, 'No ids were exposed by the public templates endpoint; nothing to pivot with.');
    console.log(`[PUB-03] Harvested ${harvested.length} real id(s) from the public endpoint; attempting pivot.`);

    // Those ids must not grant unauthenticated access to protected endpoints.
    const protectedEndpoints = [
      { label: 'Chat by id', build: (id) => HERCULES_ENDPOINTS.CAMPAIGNS.GET_CHAT_BY_ID(id) },
      { label: 'Survey audience', build: (id) => HERCULES_ENDPOINTS.AUDIENCE.GET_SURVEY_AUDIENCE(id) },
      { label: 'Survey details', build: (id) => `${HERCULES_ENDPOINTS.SURVEY.GET_SURVEY_DETAILS}?surveyId=${id}` },
    ];

    const id = harvested[0];
    for (const ep of protectedEndpoints) {
      const url = TARGETS.resolveUrl(ep.build(id));
      const res = await request.get(url, { headers: { Accept: 'application/json' }, failOnStatusCode: false });
      const body = await res.text();

      expect(
        res.status(),
        `${ep.label} served HTTP 200 unauthenticated for id "${id}" harvested from a public endpoint. ` +
          `Publishing ids plus unauthenticated reads is a complete IDOR. Body: ${body.slice(0, 250)}`
      ).not.toBe(200);

      expect(
        findPrivateData(body, isJson(res.headers())),
        `${ep.label} leaked private data for a publicly-harvested id`
      ).toEqual([]);
    }
  });

  test('PUB-04: share-turn endpoint must validate ids rather than erroring', async ({ request }) => {
    const url = TARGETS.resolveUrl(HERCULES_ENDPOINTS.CAMPAIGNS.GET_SHARE_TURN('cid_probe_x', 'tid_probe_y'));
    const res = await request.get(url, { headers: { Accept: 'application/json' }, failOnStatusCode: false });
    const body = await res.text();
    const state = classifyProbe({ status: res.status(), headers: res.headers() });

    test.skip(state === 'UNREACHABLE_ROUTE', `Endpoint absent (HTTP ${res.status()}): ${PROBE_STATE_LABEL[state]}`);

    expect(
      res.status(),
      `Share-turn endpoint returned HTTP ${res.status()} for unknown ids instead of 400/404. ` +
        `Body: ${body.slice(0, 200)}`
    ).toBeLessThan(500);

    expect(
      findPrivateData(body, isJson(res.headers())),
      'Share-turn endpoint leaked private data for unknown ids'
    ).toEqual([]);
  });
});
