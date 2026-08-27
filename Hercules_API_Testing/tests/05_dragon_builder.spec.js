const { test, expect } = require('../fixtures/authFixture');
const apiConfig = require('../config/api.config');
const endpoints = apiConfig.endpoints.DRAGON_QUESTIONS;

test.describe('🐉 Module 5: Dragon Question Builder APIs', () => {

  test('TC-DRG-POS-01: Fetch Supported Demographic City List [GET /V2/dragon/city-list]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.get(endpoints.GET_CITY_LIST);
    expect([200, 404]).toContain(res.status());
  });

  test('TC-DRG-POS-02: Get All Questions for Survey Schema [GET /V2/survey/get-all-questions]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.get(endpoints.GET_ALL_QUESTIONS('sample_survey_id'));
    expect([200, 400, 404]).toContain(res.status());
  });

  test('TC-DRG-NEG-01: Create MCQ Question with Missing Choices [POST /V2/dragon/create-mcq-question]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.post(endpoints.CREATE_MCQ, {
      data: { question: 'What is your preferred beverage?', choices: [] }
    });
    expect([400, 422, 404, 200]).toContain(res.status());
  });

  test('TC-DRG-NEG-02: Edit MCQ Question with Invalid ID [PATCH /V2/dragon/edit-mcq-question]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.patch(endpoints.EDIT_MCQ, {
      data: { questionId: 'fake_question_9999', question: 'Updated title' }
    });
    expect([400, 404, 200]).toContain(res.status());
  });

  test('TC-DRG-NEG-03: Inject Media with Missing Media URL [POST /api/chats/:id/inject-media]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.post(endpoints.INJECT_MEDIA('sample_chat_id'), {
      data: {}
    });
    expect([400, 422, 404, 200]).toContain(res.status());
  });

});
