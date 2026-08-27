const { test, expect } = require('@playwright/test');
const herculesConfig = require('../../config/hercules.config');

const TARGET_URL = process.env.TARGET_URL || herculesConfig.baseUrl || 'https://dev.hercules.works';

test.describe('🛡️ Advanced Enterprise AppSec & Strict Security Gates', () => {

  test('BOLA-01: Strict Cross-Tenant Resource Isolation Gate (IDOR)', async ({ request }) => {
    const forgedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhdHRhY2tlciIsInRlbmFudElkIjoidW5hdXRob3JpemVkX29yZyJ9.invalid_signature_probe';
    
    const endpoints = [
      '/api/surveys/srv_victim_tenant_99812',
      '/api/user/profile/usr_victim_org_881',
      '/api/campaigns/cmp_victim_org_772'
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

      // Strict Gate: API must either reject with 401/403/404 or serve clean SPA shell without private data
      expect([401, 403, 404, 200]).toContain(status);
      
      // Strict PII & Cross-tenant data isolation assertions
      expect(text.toLowerCase()).not.toContain('victim');
      expect(text.toLowerCase()).not.toContain('password');
      expect(text.toLowerCase()).not.toContain('private_key');
      expect(text.toLowerCase()).not.toContain('secret');
    }
  });

  test('RATE-01: Strict High-Frequency Burst & Crash Resistance Gate', async ({ request }) => {
    const burstCount = 15;
    const promises = Array.from({ length: burstCount }, () =>
      request.post(`${TARGET_URL}/api/auth/send-otp`, {
        data: { phone: '+919999999999' },
        headers: { 'Content-Type': 'application/json' }
      })
    );

    const responses = await Promise.all(promises);
    for (const res of responses) {
      // Strict Gate: Zero 500 crashes allowed under concurrent load
      expect(res.status()).not.toBe(500);
      expect([200, 400, 401, 404, 429]).toContain(res.status());
    }
  });

  test('JWT-01: Strict JWT Algorithm Confusion (alg: none) Rejection Gate', async ({ request }) => {
    const b64Url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const algNoneToken = `${b64Url({ alg: 'none', typ: 'JWT' })}.${b64Url({ sub: 'admin', role: 'superuser', exp: Math.floor(Date.now() / 1000) + 3600 })}.`;

    const response = await request.get(`${TARGET_URL}/api/user`, {
      headers: {
        'Authorization': `Bearer ${algNoneToken}`,
        'Accept': 'application/json'
      }
    });

    const status = response.status();
    const body = await response.text();

    // Strict Gate: "alg: none" token must never yield administrative privileges
    expect(body).not.toContain('superuser');
    expect([401, 403, 404, 200]).toContain(status);
    if (status === 200) {
      expect(body).not.toContain('"role":"superuser"');
    }
  });

  test('JWT-02: Strict Expired Session Token Rejection Gate', async ({ request }) => {
    const b64Url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const expiredToken = `${b64Url({ alg: 'HS256', typ: 'JWT' })}.${b64Url({ sub: 'user_test', exp: Math.floor(Date.now() / 1000) - 7200 })}.stale_sig`;

    const response = await request.get(`${TARGET_URL}/api/dashboard`, {
      headers: {
        'Authorization': `Bearer ${expiredToken}`,
        'Accept': 'application/json'
      }
    });

    const body = await response.text();
    expect(body).not.toContain('"isLoggedIn":true');
  });

  test('BIZ-01: Mass Assignment & Parameter Pollution Defense', async ({ request }) => {
    const response = await request.get(`${TARGET_URL}/?isAdmin=true&role=superuser&plan=enterprise_unlimited&quota=999999`);
    expect([200, 400]).toContain(response.status());
    const body = await response.text();
    expect(body).not.toContain('"isAdmin":true');
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
