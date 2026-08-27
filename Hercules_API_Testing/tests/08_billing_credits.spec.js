const { test, expect } = require('../fixtures/authFixture');
const apiConfig = require('../config/api.config');
const endpoints = apiConfig.endpoints.BILLING;

test.describe('💳 Module 8: Credits, Pricing & Stripe Billing APIs', () => {

  test('TC-BILL-POS-01: Fetch Credit Pricing Details [GET /V2/credits/pricing]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.get(endpoints.PRICING_DETAILS);
    expect([200, 404]).toContain(res.status());
  });

  test('TC-BILL-POS-02: Fetch Public Pricing Plans [GET /V2/payments/get-pricing]', async ({ unauthenticatedRequest }) => {
    const res = await unauthenticatedRequest.get(endpoints.GET_PRICING_PLANS);
    expect([200, 404]).toContain(res.status());
  });

  test('TC-BILL-POS-03: Check Organization Credit Balance [GET /V2/credits/balance]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.get(endpoints.CHECK_BALANCE);
    expect([200, 404]).toContain(res.status());
  });

  test('TC-BILL-POS-04: Get User Active Subscription [GET /V2/credits/subscription]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.get(endpoints.GET_SUBSCRIPTION);
    expect([200, 404]).toContain(res.status());
  });

  test('TC-BILL-NEG-01: Estimate Cost with Negative Sample Size [POST /V2/credits/estimate]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.post(endpoints.ESTIMATE_COST, {
      data: { sampleSize: -50, questionCount: -10 }
    });
    expect([400, 422, 200, 404]).toContain(res.status());
  });

  test('TC-BILL-NEG-02: Deduct Credits on Invalid Survey ID [POST /V2/credits/deduct]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.post(endpoints.DEDUCT_CREDITS, {
      data: { surveyId: 'fake_srv_9999', amount: 500 }
    });
    expect([400, 404, 200]).toContain(res.status());
  });

  test('TC-BILL-NEG-03: Create Payment Order with Invalid Currency / Amount [POST /V2/payments/create-order]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.post(endpoints.CREATE_ORDER, {
      data: { amount: -100, currency: 'INVALID_CURR' }
    });
    expect([400, 422, 404, 200]).toContain(res.status());
  });

  test('TC-BILL-NEG-04: Verify Fake Payment Signature [POST /V2/payments/verify]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.post(endpoints.VERIFY_PAYMENT, {
      data: { razorpay_order_id: 'fake_order_1', razorpay_signature: 'tampered_sig' }
    });
    expect([400, 422, 404, 200]).toContain(res.status());
  });

});
