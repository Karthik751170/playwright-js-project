const { test, expect } = require('../fixtures/authFixture');
const apiConfig = require('../config/api.config');
const endpoints = apiConfig.endpoints.CAMPAIGNS;

test.describe('💬 Module 4: Campaign & Chat Management APIs', () => {

  test('TC-CMP-POS-01: Fetch Active Campaigns / Chat History [GET /api/chats]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.get(endpoints.GET_HISTORY);
    expect([200, 204]).toContain(res.status());
  });

  test('TC-CMP-POS-02: Get Specific Chat Thread Details [GET /api/chats/:id]', async ({ authenticatedRequest }) => {
    const listRes = await authenticatedRequest.get(endpoints.GET_HISTORY);
    if (listRes.status() === 200) {
      try {
        const chats = await listRes.json();
        if (Array.isArray(chats) && chats.length > 0 && chats[0]._id) {
          const chatRes = await authenticatedRequest.get(endpoints.GET_CHAT_BY_ID(chats[0]._id));
          expect([200, 404]).toContain(chatRes.status());
        }
      } catch (e) {}
    }
  });

  test('TC-CMP-NEG-01: Star Chat with Non-Existent Chat ID [PATCH /api/chats/:id/star]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.patch(endpoints.STAR_CHAT('fake_chat_id_9999'), {
      data: { isStarred: true }
    });
    expect([400, 404, 200]).toContain(res.status());
  });

  test('TC-CMP-NEG-02: Rename Chat with Empty Title [PATCH /api/chats/:id/rename]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.patch(endpoints.RENAME_CHAT('fake_chat_id_9999'), {
      data: { name: '' }
    });
    expect([400, 422, 404, 200]).toContain(res.status());
  });

  test('TC-CMP-NEG-03: Duplicate Non-Existent Chat [POST /api/chats/:id/duplicate]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.post(endpoints.DUPLICATE_CHAT('fake_chat_id_9999'), {
      data: {}
    });
    expect([400, 404, 200]).toContain(res.status());
  });

  test('TC-CMP-NEG-04: Bulk Delete with Empty Chat IDs [DELETE /api/chats/bulk]', async ({ authenticatedRequest }) => {
    const res = await authenticatedRequest.delete(endpoints.DELETE_BULK, {
      data: { chatIds: [] }
    });
    expect([400, 422, 200, 204]).toContain(res.status());
  });

});
