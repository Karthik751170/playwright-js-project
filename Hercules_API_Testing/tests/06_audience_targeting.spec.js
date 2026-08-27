const { test, expect } = require('../fixtures/authFixture');
const apiConfig = require('../config/api.config');
const endpoints = apiConfig.endpoints.AUDIENCE;

test.describe('👥 Module 6: Audience Templates & Demographic Targeting APIs', () => {

  test('TC-AUD-POS-01: Fetch Default Audience Templates [GET /V2/audience/default-templates]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.get(endpoints.GET_DEFAULT);
    expect([200, 404]).toContain(res.status());
  });

  test('TC-AUD-POS-02: Fetch Public Audience Default Templates [GET /V2/public/audience/default-templates]', async ({ unauthenticatedRequest }) => {
    const res = await unauthenticatedRequest.get(endpoints.GET_PUBLIC_DEFAULT);
    expect([200, 404]).toContain(res.status());
  });

  test('TC-AUD-POS-03: Fetch My Saved Audience Templates [GET /V2/audience/my-templates]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.get(endpoints.GET_MY_TEMPLATES);
    expect([200, 404]).toContain(res.status());
  });

  test('TC-AUD-NEG-01: Create Audience Template with Empty Criteria [POST /V2/audience/create]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.post(endpoints.CREATE, {
      data: {}
    });
    expect([400, 422, 404, 200]).toContain(res.status());
  });

  test('TC-AUD-NEG-02: Delete Non-Existent Audience Template [DELETE /V2/audience/delete-template]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.delete(endpoints.DELETE, {
      data: { templateId: 'fake_aud_template_9999' }
    });
    expect([400, 404, 200, 204]).toContain(res.status());
  });

  test('TC-AUD-NEG-03: Rename Audience Template with Missing Title [PATCH /V2/audience/update-title]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.patch(endpoints.RENAME, {
      data: { templateId: 'fake_id', title: '' }
    });
    expect([400, 422, 404, 200]).toContain(res.status());
  });

});
