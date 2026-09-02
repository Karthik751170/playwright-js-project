const { defineConfig } = require('@playwright/test');
const fs = require('fs');

const storageState = fs.existsSync('.auth/apple-user.json') ? '.auth/apple-user.json' : undefined;

module.exports = defineConfig({
  globalSetup: require.resolve('./utils/security/globalSetup.js'),
  testDir: './tests',
  timeout: 3600 * 1000,
  expect: {
    timeout: 5 * 1000,
  },
  reporter: [
    ['html', { open: 'never' }],
    ['monocart-reporter', {
        name: "Test Report",
        outputFile: './test-results/report.html'
    }]
  ],
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    storageState: storageState,
    video: 'on',
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
  retries: 0,
});
