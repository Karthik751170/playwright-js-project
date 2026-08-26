const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
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
    storageState: '.auth/apple-user.json',
    video: 'on',
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
  retries: 0,
});
