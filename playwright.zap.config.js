const { defineConfig } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const herculesConfig = require('./config/hercules.config');

const ZAP_PROXY_URL = process.env.ZAP_PROXY_URL || process.env.ZAP_URL || 'http://127.0.0.1:8080';
const authPath = path.resolve(__dirname, '.auth/apple-user.json');

module.exports = defineConfig({
  testDir: './tests/security',
  timeout: 180 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report/security', open: 'never' }],
    ['monocart-reporter', {
      name: 'Hercules OWASP ZAP Security Test Report',
      outputFile: './test-results/security/report.html',
    }],
  ],
  use: {
    baseURL: process.env.TARGET_URL || herculesConfig.baseUrl || 'https://dev.hercules.works',
    headless: true,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    storageState: fs.existsSync(authPath) ? authPath : undefined,
    video: 'off',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    proxy: {
      server: ZAP_PROXY_URL,
    },
  },
  retries: 0,
});
