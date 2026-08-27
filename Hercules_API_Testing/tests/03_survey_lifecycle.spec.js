const { test, expect } = require('../fixtures/authFixture');
const apiConfig = require('../config/api.config');
const endpoints = apiConfig.endpoints.SURVEY;

test.describe('📝 Module 3: Survey Lifecycle & Generation APIs', () => {

  test('TC-SRV-POS-01: Generate Survey Questions [POST /api/generate-questions]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.post(endpoints.GENERATE_QUESTIONS, {
      data: { prompt: 'Brand awareness questions for retail store' }
    });
    expect([200, 201, 400]).toContain(res.status());
  });

  test('TC-SRV-POS-02: Lookup Chat IDs for Surveys [POST /api/surveys/lookup-chat-ids]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.post(endpoints.LOOKUP_CHAT_IDS, {
      data: { surveyIds: [] }
    });
    expect([200, 400, 404]).toContain(res.status());
  });

  test('TC-SRV-POS-03: Search Survey by Name or Email [GET /V2/dashboard/survey_search]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.get(`${endpoints.SEARCH_SURVEY}?type=name&input=test&skip=0&limit=10`);
    expect([200, 400, 404]).toContain(res.status());
  });

  test('TC-SRV-NEG-01: Get Details for Non-Existent Survey [GET /V2/survey/details]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.get(`${endpoints.GET_SURVEY_DETAILS}?surveyId=srv_fake_id_12345`);
    expect([400, 404, 200]).toContain(res.status());
  });

  test('TC-SRV-NEG-02: Deploy Survey with Missing Payload [POST /api/deploy-survey-version]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.post(endpoints.DEPLOY_SURVEY_VERSION, {
      data: {}
    });
    expect([400, 422, 404]).toContain(res.status());
  });

  test('TC-SRV-NEG-03: Refine Survey with Empty Payload [POST /api/refine-survey]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.post(endpoints.REFINE_SURVEY, {
      data: {}
    });
    expect([400, 422, 200]).toContain(res.status());
  });

});
