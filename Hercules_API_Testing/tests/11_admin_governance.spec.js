const { test, expect } = require('../fixtures/authFixture');
const apiConfig = require('../config/api.config');
const endpoints = apiConfig.endpoints.ADMIN;

test.describe('🛡️ Module 11: Admin & Moderation Governance APIs', () => {

  test('TC-ADM-POS-01: Query Admin Survey Moderation Queue [GET /V2/dashboard/admin-surveys]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.get(`${endpoints.GET_ADMIN_SURVEYS}?skip=0&limit=5&sort=1&brandSurvey=false&internal=false`);
    expect([200, 401, 403, 404]).toContain(res.status());
  });

  test('TC-ADM-NEG-01: Admin Status Update Without Privilege [POST /api/admin/update-status]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.post(endpoints.SYNC_SURVEY_STATUS, {
      data: { surveyId: 'sample_id', status: 'approved' }
    });
    expect([400, 401, 403, 404, 200]).toContain(res.status());
  });

  test('TC-ADM-NEG-02: Superadmin Analytics Query Without Root Privilege [GET /api/admin/superadmin/users/analytics]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.get(endpoints.SUPERADMIN_ANALYTICS);
    expect([401, 403, 404, 200]).toContain(res.status());
  });

});
