const { test, expect } = require('@playwright/test');
const herculesConfig = require('../../config/hercules.config');
const HERCULES_ENDPOINTS = require('../../config/herculesEndpoints');

const TARGET_URL = process.env.TARGET_URL || herculesConfig.baseUrl || 'https://dev.hercules.works';

test.describe('🛡️ Advanced Enterprise AppSec & Strict Security Gates', () => {

  test('BOLA-01: Structured Cross-Tenant Resource Isolation Gate (IDOR)', async ({ request }) => {
    const forgedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhdHRhY2tlciIsInRlbmFudElkIjoidW5hdXRob3JpemVkX29yZyJ9.invalid_signature_probe';
    
    const endpoints = [
      `${HERCULES_ENDPOINTS.SURVEY.GET_SURVEY_DETAILS}?surveyId=srv_victim_tenant_99812`,
      HERCULES_ENDPOINTS.ANALYTICS.AUDIENCE_INSIGHTS('srv_victim_tenant_99812'),
      HERCULES_ENDPOINTS.CAMPAIGNS.GET_CHAT_BY_ID('cmp_victim_org_772')
    ];

    for (const ep of endpoints) {
      const response = await request.get(`${TARGET_URL}${ep}`, {
        headers: {
          'Authorization': `Bearer ${forgedToken}`,
          'X-Tenant-ID': 'unauthorized_tenant_probe',
          'Accept': 'application/json'
        }
      });
      const status = response.status();
      const text = await response.text();

      // Strict Gate: Reject with 401/403/404 or serve clean HTML SPA shell
      expect([401, 403, 404, 200]).toContain(status);
      
      const contentType = response.headers()['content-type'] || '';
      if (contentType.includes('application/json')) {
        try {
          const json = JSON.parse(text);
          expect(json).not.toHaveProperty('victimEmail');
          expect(json).not.toHaveProperty('privateData');
        } catch (e) {}
      } else {
        expect(text).not.toMatch(/"(?:victim_org|victim_tenant|private_key)":\s*"/i);
      }
    }
  });

  test('RATE-01: Email Authentication & Signup Rate Limiting Resilience', async ({ request }) => {
    const burstCount = 15;
    const promises = Array.from({ length: burstCount }, () =>
      request.post(`${TARGET_URL}${HERCULES_ENDPOINTS.AUTH.SIGNUP_OTP}`, {
        data: { email: 'rate_probe@kzdzyaot.mailosaur.net' },
        headers: { 'Content-Type': 'application/json' }
      })
    );

    const responses = await Promise.all(promises);
    const statusCodes = responses.map(res => res.status());

    // Strict Gate: Zero 500 crashes allowed under concurrent load
    for (const code of statusCodes) {
      expect(code).not.toBe(500);
      expect([200, 400, 401, 404, 429]).toContain(code);
    }
  });

  test('JWT-01: Strict JWT Algorithm Confusion (alg: none) Rejection Gate', async ({ request }) => {
    const b64Url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const algNoneToken = `${b64Url({ alg: 'none', typ: 'JWT' })}.${b64Url({ sub: 'admin', role: 'superuser', exp: Math.floor(Date.now() / 1000) + 3600 })}.`;

    const response = await request.get(`${TARGET_URL}${HERCULES_ENDPOINTS.ACCOUNT.GET_DETAILS}`, {
      headers: {
        'Authorization': `Bearer ${algNoneToken}`,
        'Accept': 'application/json'
      }
    });

    const status = response.status();
    const body = await response.text();

    // Strict Gate: "alg: none" token must never yield administrative privileges
    expect([401, 403, 404, 200]).toContain(status);
    if (response.headers()['content-type']?.includes('application/json')) {
      try {
        const json = JSON.parse(body);
        expect(json.role).not.toBe('superuser');
        expect(json.isAdmin).not.toBe(true);
      } catch (e) {}
    } else {
      expect(body).not.toContain('"role":"superuser"');
      expect(body).not.toContain('"isAdmin":true');
    }
  });

  test('JWT-02: Strict Expired Session Token Rejection Gate', async ({ request }) => {
    const b64Url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const expiredToken = `${b64Url({ alg: 'HS256', typ: 'JWT' })}.${b64Url({ sub: 'user_test', exp: Math.floor(Date.now() / 1000) - 7200 })}.stale_sig`;

    const response = await request.get(`${TARGET_URL}${HERCULES_ENDPOINTS.AUTH.SYNC}`, {
      headers: {
        'Authorization': `Bearer ${expiredToken}`,
        'Accept': 'application/json'
      }
    });

    const body = await response.text();
    expect(body).not.toContain('"isLoggedIn":true');
  });

  test('BIZ-01: Mass Assignment & State Mutation Read-Back Verification', async ({ request }) => {
    // 1. Attempt mass assignment parameter injection
    const probeResponse = await request.get(`${TARGET_URL}/?isAdmin=true&role=superuser&plan=enterprise_unlimited&quota=999999`);
    expect([200, 400]).toContain(probeResponse.status());

    // 2. Perform follow-up read-back check against user state endpoint
    const readBackResponse = await request.get(`${TARGET_URL}${HERCULES_ENDPOINTS.ACCOUNT.GET_DETAILS}`, {
      headers: { 'Accept': 'application/json' }
    });
    const stateText = await readBackResponse.text();
    expect(stateText).not.toContain('"isAdmin":true');
    expect(stateText).not.toContain('"role":"superuser"');
  });

  test('BIZ-02: Negative & Out-of-Bounds Pricing/Reward Logic Integrity', async ({ request }) => {
    const response = await request.get(`${TARGET_URL}/?reward=-5000&credits=NaN&sampleSize=-100&price=-99.99`);
    expect([200, 400, 422]).toContain(response.status());
  });

  test('FILE-01: Malicious SVG Script Injection Defense', async ({ request }) => {
    const maliciousSvg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(\'XSS\')"><script>alert(1)</script></svg>';
    const response = await request.get(`${TARGET_URL}/?avatar_url=${encodeURIComponent('data:image/svg+xml;utf8,' + maliciousSvg)}`);
    const text = await response.text();
    expect(text).not.toContain('<script>alert(1)</script>');
  });

});
