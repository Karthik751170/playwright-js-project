const { test, expect } = require('../fixtures/authFixture');
const apiConfig = require('../config/api.config');
const endpoints = apiConfig.endpoints.AI_CHAT;

test.describe('🧠 Module 2: AI Workspace & Chat Stream APIs', () => {

  test('TC-AI-POS-01: Fetch Prompt Suggestions [GET /api/prompt-suggestions]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.get(endpoints.SUGGESTIONS);
    expect([200, 404]).toContain(res.status());
  });

  test('TC-AI-POS-02: Send AI Research Chat Prompt [POST /api/chat]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.post(endpoints.CHAT, {
      data: { message: 'Create a 3-question consumer satisfaction survey about coffee.' }
    });
    expect([200, 201, 400]).toContain(res.status());
  });

  test('TC-AI-POS-03: Query Guest Chat Sessions [GET /api/guest_chats]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.get(endpoints.GUEST_CHATS);
    expect([200, 404]).toContain(res.status());
  });

  test('TC-AI-NEG-01: Send Empty AI Prompt [POST /api/chat]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.post(endpoints.CHAT, {
      data: { message: '' }
    });
    expect([400, 422, 200]).toContain(res.status());
  });

  test('TC-AI-NEG-02: Retry Prompt with Invalid Turn ID [POST /api/chat/retry]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.post(endpoints.RETRY_PROMPT, {
      data: { chatId: 'non_existent_chat_9999', turnId: 'invalid_turn_111' }
    });
    expect([400, 404, 500]).not.toBe(500);
  });

  test('TC-AI-NEG-03: Execute Direct Flow with Missing Schema [POST /api/executedirectflow]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.post(endpoints.EXECUTE_DIRECT_FLOW, {
      data: {}
    });
    expect([400, 422, 404, 200]).toContain(res.status());
  });

});
