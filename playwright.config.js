const { defineConfig } = require('@playwright/test');
const fs = require('fs');

const storageState = fs.existsSync('.auth/apple-user.json') ? '.auth/apple-user.json' : undefined;

module.exports = defineConfig({
  globalSetup: require.resolve('./utils/security/globalSetup.js'),
  testDir: './tests',
  // The ZAP specs require the OWASP ZAP proxy configured in
  // playwright.zap.config.js. Under the default config they have no proxy and
  // fail in beforeAll, so a plain `npx playwright test` must not pick them up.
  // Run them with: npm run test:security
  testIgnore: ['**/tests/security/Zap*.spec.js'],
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
    headless: false,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    storageState: storageState,
    video: 'on',
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
  retries: 0,
});
