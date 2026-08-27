const { defineConfig } = require('@playwright/test');
const path = require('path');
const apiConfig = require('./config/api.config');

module.exports = defineConfig({
  globalSetup: require.resolve('../utils/security/globalSetup.js'),
  testDir: './tests',
  timeout: 45000,
  expect: {
    timeout: 10000,
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(__dirname, 'reports', 'html-report'), open: 'never' }],
    ['monocart-reporter', {
      name: 'Hercules API Testing - Master Execution Report',
      outputFile: path.join(__dirname, 'reports', 'hercules-api-report.html'),
    }],
  ],
  use: {
    baseURL: apiConfig.baseUrl,
    extraHTTPHeaders: apiConfig.defaultHeaders,
    ignoreHTTPSErrors: true,
  },
  workers: 1, // Sequential execution for deterministic single-account state tracking
  retries: 0,
});
