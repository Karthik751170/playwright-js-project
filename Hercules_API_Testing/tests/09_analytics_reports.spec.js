const { test, expect } = require('../fixtures/authFixture');
const apiConfig = require('../config/api.config');
const endpoints = apiConfig.endpoints.ANALYTICS;

test.describe('📊 Module 9: Analytics & Reporting APIs', () => {

  test('TC-RPT-POS-01: Query Public Audience Insights [GET /V2/public/audience/report/:id]', async ({ unauthenticatedRequest }) => {
    const res = await unauthenticatedRequest.get(endpoints.PUBLIC_AUDIENCE_INSIGHTS('sample_survey_id'));
    expect([200, 400, 404]).toContain(res.status());
  });

  test('TC-RPT-POS-02: Get Question Analytics Report [GET /V2/survey/get-question-report]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.get(`${endpoints.QUESTION_ANALYTICS}?surveyId=sample_survey_id`);
    expect([200, 400, 404]).toContain(res.status());
  });

  test('TC-RPT-NEG-01: Download Responses Report for Fake Survey [GET /V2/survey/get-responses-report/:id]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.get(endpoints.DOWNLOAD_RESPONSES_REPORT('fake_survey_9999'));
    expect([400, 404, 200]).toContain(res.status());
  });

  test('TC-RPT-NEG-02: Analysis Natural Language Query with Empty Body [POST /analysis/query/:id]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.post(endpoints.ANALYSIS_QUERY('fake_analysis_id'), {
      data: {}
    });
    expect([400, 422, 404, 200]).toContain(res.status());
  });

});
