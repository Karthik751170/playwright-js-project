const { test: base, expect } = require('@playwright/test');
const ZapClient = require('../utils/ZapClient');

const ZAP_PROXY_URL = process.env.ZAP_PROXY_URL || process.env.ZAP_URL || 'http://127.0.0.1:8080';
const ZAP_API_KEY = process.env.ZAP_API_KEY || '';

/**
 * Extended Playwright test with OWASP ZAP fixture
 */
const test = base.extend({
  // Provide configured ZapClient
  zap: async ({}, use) => {
    const client = new ZapClient({
      zapUrl: ZAP_PROXY_URL,
      apiKey: ZAP_API_KEY,
    });
    await use(client);
  },

  // Custom browser context with ZAP proxy configuration
  context: async ({ playwright, browser }, use) => {
    const proxyConfig = {
      server: ZAP_PROXY_URL,
    };

    const context = await browser.newContext({
      proxy: proxyConfig,
      ignoreHTTPSErrors: true, // ZAP uses dynamic self-signed certificate for HTTPS inspection
    });

    await use(context);
    await context.close();
  },
});

module.exports = { test, expect, ZapClient };
