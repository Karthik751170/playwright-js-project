#!/usr/bin/env node
/**
 * Logs the fixed monitor account in once on HERCULES_URL; with MONITOR_ALLOW_SIGNUP=true it signs
 * the same email up first if the site has no account for it (verified through Mailosaur).
 * Run before the parallel monitor groups so they never race to create the account.
 */
const { chromium } = require('@playwright/test');
const { ensureSignedIn } = require('../utils/HerculesEmailAuth');

(async () => {
    const baseUrl = process.env.HERCULES_URL || 'https://hercules.works';
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    try {
        const { method } = await ensureSignedIn(page, { baseUrl });
        console.log(`Monitor account ready on ${baseUrl}: ${method}`);
    } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exit(1); });
