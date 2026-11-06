// Config for the hourly headless survey monitor. Run via scripts/hourlySurveyMonitor.js.
const { defineConfig } = require('@playwright/test');
const fs = require('fs');
require('dotenv').config();

const STATE = '.auth/monitor-state.json';

module.exports = defineConfig({
  testDir: './tests/monitor',
  timeout: 40 * 60 * 1000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results/monitor',
  use: {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 900 },
    storageState: fs.existsSync(STATE) ? STATE : undefined,
    video: 'retain-on-failure',
    trace: 'off',
  },
});
