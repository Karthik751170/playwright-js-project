// Headless run of the Doc 1 design-payload test on dev.hercules.works + dev.superj.app.
const { defineConfig } = require('@playwright/test');
require('dotenv').config({ quiet: true });

module.exports = defineConfig({
  testDir: './tests/devdesigns',
  timeout: 330 * 60 * 1000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results/devdesigns',
  use: {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 900 },
    video: 'off',
    trace: 'off',
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    permissions: ['clipboard-read', 'clipboard-write'],
  },
});
