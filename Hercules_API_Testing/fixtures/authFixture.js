/**
 * authFixture.js
 * Single-Account Mailosaur Session Manager for Hercules API Testing
 */

const { test: base, chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const apiConfig = require('../config/api.config');
const { setupMailosaurAccount } = require('../../tests/utils/MailosaurSetup');

const SESSION_CACHE_PATH = path.join(__dirname, '..', '.auth_session.json');

// Helper to load or provision single tracked account
async function getOrCreateAuthSession() {
  if (fs.existsSync(SESSION_CACHE_PATH)) {
    try {
      const cached = JSON.parse(fs.readFileSync(SESSION_CACHE_PATH, 'utf-8'));
      // If token is less than 2 hours old, reuse
      if (cached && cached.token && (Date.now() - cached.timestamp < 2 * 60 * 60 * 1000)) {
        return cached;
      }
    } catch (e) {}
  }

  console.log('\n======================================================');
  console.log('🔑 [AUTH FIXTURE] PROVISIONING SINGLE TRACKED ACCOUNT (HEADLESS)');
  console.log('======================================================');
  
  const browser = await chromium.launch({ headless: true });
  try {
    const { page, herculesContext } = await setupMailosaurAccount(browser);
    const storage = await herculesContext.storageState();
    
    // Extract token from cookies or localStorage
    let token = '';
    for (const cookie of storage.cookies) {
      if (cookie.name.toLowerCase().includes('token') || cookie.name.toLowerCase().includes('auth') || cookie.name.toLowerCase().includes('session')) {
        token = cookie.value;
        break;
      }
    }

    if (!token && storage.cookies.length > 0) {
      token = storage.cookies[0].value;
    }

    const sessionData = {
      email: page.url().includes('email=') ? decodeURIComponent(page.url().split('email=')[1].split('&')[0]) : 'single_tracked_user@kzdzyaot.mailosaur.net',
      token: token,
      cookies: storage.cookies,
      cookieHeader: storage.cookies.map(c => `${c.name}=${c.value}`).join('; '),
      timestamp: Date.now()
    };

    fs.writeFileSync(SESSION_CACHE_PATH, JSON.stringify(sessionData, null, 2), 'utf-8');
    console.log(`✅ Tracked Account Ready: ${sessionData.email}`);
    await herculesContext.close();
    return sessionData;
  } finally {
    await browser.close();
  }
}

const test = base.extend({
  authSession: async ({}, use) => {
    const session = await getOrCreateAuthSession();
    await use(session);
  },
  authenticatedRequest: async ({ request, authSession }, use) => {
    await use({
      get: (endpoint, options = {}) => request.get(`${apiConfig.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          ...apiConfig.defaultHeaders,
          'Authorization': `Bearer ${authSession.token}`,
          'Cookie': authSession.cookieHeader,
          ...(options.headers || {})
        }
      }),
      post: (endpoint, options = {}) => request.post(`${apiConfig.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          ...apiConfig.defaultHeaders,
          'Authorization': `Bearer ${authSession.token}`,
          'Cookie': authSession.cookieHeader,
          ...(options.headers || {})
        }
      }),
      patch: (endpoint, options = {}) => request.patch(`${apiConfig.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          ...apiConfig.defaultHeaders,
          'Authorization': `Bearer ${authSession.token}`,
          'Cookie': authSession.cookieHeader,
          ...(options.headers || {})
        }
      }),
      delete: (endpoint, options = {}) => request.delete(`${apiConfig.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          ...apiConfig.defaultHeaders,
          'Authorization': `Bearer ${authSession.token}`,
          'Cookie': authSession.cookieHeader,
          ...(options.headers || {})
        }
      }),
    });
  },
  unauthenticatedRequest: async ({ request }, use) => {
    await use({
      get: (endpoint, options = {}) => request.get(`${apiConfig.baseUrl}${endpoint}`, {
        ...options,
        headers: { ...apiConfig.defaultHeaders, ...(options.headers || {}) }
      }),
      post: (endpoint, options = {}) => request.post(`${apiConfig.baseUrl}${endpoint}`, {
        ...options,
        headers: { ...apiConfig.defaultHeaders, ...(options.headers || {}) }
      }),
      patch: (endpoint, options = {}) => request.patch(`${apiConfig.baseUrl}${endpoint}`, {
        ...options,
        headers: { ...apiConfig.defaultHeaders, ...(options.headers || {}) }
      }),
      delete: (endpoint, options = {}) => request.delete(`${apiConfig.baseUrl}${endpoint}`, {
        ...options,
        headers: { ...apiConfig.defaultHeaders, ...(options.headers || {}) }
      }),
    });
  }
});

module.exports = { test, expect: base.expect };
