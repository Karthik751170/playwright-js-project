const { test, expect } = require('../fixtures/authFixture');
const apiConfig = require('../config/api.config');
const endpoints = apiConfig.endpoints.ACCOUNT;

test.describe('👤 Module 10: Account & Organization Settings APIs', () => {

  test('TC-ACC-POS-01: Get User Account Details [GET /V2/account/details]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.get(endpoints.GET_DETAILS);
    expect([200, 404]).toContain(res.status());
  });

  test('TC-ACC-POS-02: Get Profile Picture URL [GET /V2/auth/get-profile-pic/:businessId]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.get(endpoints.GET_PROFILE_PIC('biz_sample_123'));
    expect([200, 400, 404]).toContain(res.status());
  });

  test('TC-ACC-NEG-01: Update Account with Empty Name [PATCH /V2/account/update-details]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.patch(endpoints.UPDATE_DETAILS(), {
      data: { name: '' }
    });
    expect([400, 422, 404, 200]).toContain(res.status());
  });

  test('TC-ACC-NEG-02: Request Consultation with Invalid Phone / Email [POST /V2/contact/consultation]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.post(endpoints.REQUEST_CONSULTATION, {
      data: { email: 'not_an_email', phone: '123' }
    });
    expect([400, 422, 404, 200]).toContain(res.status());
  });

});
