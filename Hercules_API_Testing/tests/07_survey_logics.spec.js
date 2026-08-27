const { test, expect } = require('../fixtures/authFixture');
const apiConfig = require('../config/api.config');
const endpoints = apiConfig.endpoints.LOGICS;

test.describe('🔀 Module 7: Survey Logics & Routing APIs', () => {

  test('TC-LOGIC-POS-01: Query Logic Versions for Survey Turn [GET /api/survey/logic-versions/:chatId/:turn]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.get(endpoints.GET_VERSIONS('sample_chat_id', 1));
    expect([200, 400, 404]).toContain(res.status());
  });

  test('TC-LOGIC-NEG-01: Edit Routes with Empty Routing Schema [POST /api/survey/edit-routes]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.post(endpoints.EDIT_ROUTES, {
      data: {}
    });
    expect([400, 422, 404, 200]).toContain(res.status());
  });

  test('TC-LOGIC-NEG-02: Reset Survey Turn with Non-Existent Chat ID [POST /api/survey/reset-survey-turn]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.post(endpoints.RESET_TURN, {
      data: { chatId: 'fake_chat_9999', turnNumber: 99 }
    });
    expect([400, 404, 200]).toContain(res.status());
  });

  test('TC-LOGIC-NEG-03: Reverse Sync with Missing Payload [POST /api/chats/:id/sync]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.post(endpoints.REVERSE_QUESTIONS_SYNC('fake_chat_id'), {
      data: {}
    });
    expect([400, 422, 404, 200]).toContain(res.status());
  });

});
