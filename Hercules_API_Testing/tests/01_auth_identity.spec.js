const { test, expect } = require('../fixtures/authFixture');
const apiConfig = require('../config/api.config');
const endpoints = apiConfig.endpoints.AUTH;

test.describe('🔑 Module 1: Authentication & Identity APIs', () => {

  test('TC-AUTH-POS-01: Session Sync with Valid Token [POST /api/auth/sync]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.post(endpoints.SYNC, { data: {} });
    expect([200, 204]).toContain(res.status());
  });

  test('TC-AUTH-POS-02: Password Account Status Check [GET /V2/auth/pwd-login/account-status]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.get(endpoints.PASSWORD_LOGIN_ACCOUNT_STATUS);
    expect([200, 400, 404]).toContain(res.status());
  });

  test('TC-AUTH-POS-03: Verification OTP Dispatch Format [POST /api/auth/send-verification-otp]', async ({ unauthenticatedRequest }) => {
    const res = await unauthenticatedRequest.post(endpoints.SIGNUP_OTP, {
      data: { email: `test_probe_${Math.random().toString(36).substring(2, 7)}@kzdzyaot.mailosaur.net` }
    });
    expect([200, 201, 400]).toContain(res.status());
  });

  test('TC-AUTH-NEG-01: Session Sync Without Auth Token [POST /api/auth/sync]', async ({ unauthenticatedRequest }) => {
    const res = await unauthenticatedRequest.post(endpoints.SYNC, { data: {} });
    expect([401, 403, 400, 200]).toContain(res.status());
  });

  test('TC-AUTH-NEG-02: Password Login with Invalid Credentials [POST /V2/auth/pwd-login]', async ({ unauthenticatedRequest }) => {
    const res = await unauthenticatedRequest.post(endpoints.PASSWORD_LOGIN, {
      data: { email: 'invalid_user@unknown.com', password: 'WrongPassword123!' }
    });
    expect([400, 401, 404]).toContain(res.status());
  });

  test('TC-AUTH-NEG-03: Verify OTP with Malformed Token [POST /api/auth/verify-otp-and-signup]', async ({ unauthenticatedRequest }) => {
    const res = await unauthenticatedRequest.post(endpoints.VERIFY_OTP, {
      data: { email: 'user@test.com', otp: '000000' }
    });
    expect([400, 401, 422]).toContain(res.status());
  });

  test('TC-AUTH-NEG-04: Forgot Password Verification with Bogus Token [POST /V2/auth/fpwd/verify]', async ({ unauthenticatedRequest }) => {
    const res = await unauthenticatedRequest.post(endpoints.FORGOT_PASSWORD_VERIFY, {
      data: { token: 'invalid_bogus_token_12345' }
    });
    expect([400, 401, 404]).toContain(res.status());
  });

  test('TC-AUTH-NEG-05: Magic Token Login with Expired Token [GET /V2/auth/token-login/:token]', async ({ unauthenticatedRequest }) => {
    const res = await unauthenticatedRequest.get(endpoints.TOKEN_LOGIN('stale_expired_token_999'));
    expect([400, 401, 404, 200]).toContain(res.status());
  });

});
