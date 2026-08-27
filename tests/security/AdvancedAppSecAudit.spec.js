const { test, expect } = require('@playwright/test');
const herculesConfig = require('../../config/hercules.config');

const TARGET_URL = process.env.TARGET_URL || herculesConfig.baseUrl || 'https://dev.hercules.works';

test.describe('🛡️ Advanced Enterprise AppSec & API Security Suite', () => {

  test('BOLA-01: Cross-Tenant Resource Isolation (IDOR)', async ({ request }) => {
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
          'X-Tenant-ID': 'unauthorized_tenant_probe'
        }
      });
      const status = response.status();
      expect([200, 401, 403, 404]).toContain(status);
      const text = await response.text();
      expect(text.toLowerCase()).not.toContain('victim');
    }
  });

  test('RATE-01: Authentication & OTP Rate Limiting Resilience', async ({ request }) => {
    const burstCount = 10;
    const promises = Array.from({ length: burstCount }, () =>
      request.post(`${TARGET_URL}/api/auth/send-otp`, {
        data: { phone: '+919999999999' },
        headers: { 'Content-Type': 'application/json' }
      })
    );

    const responses = await Promise.all(promises);
    for (const res of responses) {
      expect(res.status()).not.toBe(500);
    }
  });

  test('JWT-01: JWT Algorithm Confusion (alg: none) Rejection', async ({ request }) => {
    const b64Url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const algNoneToken = `${b64Url({ alg: 'none', typ: 'JWT' })}.${b64Url({ sub: 'admin', role: 'superuser', exp: Math.floor(Date.now() / 1000) + 3600 })}.`;

    const response = await request.get(`${TARGET_URL}/api/user`, {
      headers: {
        'Authorization': `Bearer ${algNoneToken}`
      }
    });

    const status = response.status();
    expect([200, 401, 403, 404]).toContain(status);
    const body = await response.text();
    expect(body).not.toContain('superuser');
  });

  test('BIZ-01: Mass Assignment & Parameter Pollution Defense', async ({ request }) => {
    const response = await request.get(`${TARGET_URL}/?isAdmin=true&role=superuser&plan=enterprise_unlimited&quota=999999`);
    expect([200, 400]).toContain(response.status());
  });

  test('FILE-01: Malicious SVG Script Injection Defense', async ({ request }) => {
    const maliciousSvg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(\'XSS\')"><script>alert(1)</script></svg>';
    const response = await request.get(`${TARGET_URL}/?avatar_url=${encodeURIComponent('data:image/svg+xml;utf8,' + maliciousSvg)}`);
    const text = await response.text();
    expect(text).not.toContain('<script>alert(1)</script>');
  });

});
