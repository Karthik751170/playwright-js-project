const { test } = require('@playwright/test');
const path = require('path');
const { createHarness } = require('./lib/harness');
const { ensureSignedIn } = require('../../utils/HerculesEmailAuth');
const { loginUrl } = require('../../utils/automationTag');

/**
 * AUTH group — sign-up and login, without ever creating an account.
 *   1. The tagged /login page opens on the email form.
 *   2. Sign-up: a never-used email gets the "Create your account" form. It is NOT submitted.
 *   3. Login: a wrong password for the monitor account is rejected (one attempt per run).
 *   4. Login: the monitor account logs in from a clean browser (no saved session).
 * Each step uses its own clean browser context so no saved session hides a problem.
 */
const BASE_URL = process.env.HERCULES_URL || 'https://hercules.works';
const OUT = path.join(process.env.MONITOR_OUT_DIR || 'reports/monitor/local', 'auth');
const SERVER = process.env.MAILOSAUR_SERVER_ID;
const MONITOR_EMAIL = process.env.HERCULES_MONITOR_EMAIL || (SERVER && `hercules-monitor@${SERVER}.mailosaur.net`);
const emailBox = p => p.locator('input#guest-email, input[type="email"]').first();
const ERROR_TEXT = /incorrect|invalid|wrong|does ?n.t match|try again|not valid/i;

test('auth: sign-up form and login', async ({ browser }) => {
    test.setTimeout(10 * 60_000);
    const fresh = async () => {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: undefined });
        return { ctx, page: await ctx.newPage() };
    };
    let { ctx, page } = await fresh();
    const h = createHarness(page, { group: 'auth', outDir: OUT, budgetMin: 9 });
    const usePage = async () => { await ctx.close().catch(() => {}); ({ ctx, page } = await fresh()); h.setPage(page); };
    try {
        await h.scenario('login page', async () => {
            await page.goto(loginUrl(BASE_URL), { waitUntil: 'domcontentloaded' });
            const ok = await emailBox(page).waitFor({ state: 'visible', timeout: 30_000 }).then(() => true).catch(() => false);
            await h.expectProduct('login page opens on the email form', ok,
                ok ? `${page.url()} shows the email box` : `${page.url()}: no email box`, 'fail', { el: emailBox(page) });
        });

        await h.scenario('sign-up form', async () => {
            await usePage();
            if (!SERVER) return h.skip('sign-up form for a new email', 'MAILOSAUR_SERVER_ID not set');
            const unused = `hm-never-${Date.now().toString(36)}@${SERVER}.mailosaur.net`;
            await page.goto(loginUrl(BASE_URL), { waitUntil: 'domcontentloaded' });
            await emailBox(page).fill(unused);
            await page.getByRole('button', { name: 'Continue', exact: true }).click();
            const create = page.getByRole('button', { name: 'Create your account' });
            const ok = await create.waitFor({ state: 'visible', timeout: 30_000 }).then(() => true).catch(() => false);
            const pw = await page.locator('input[type="password"]').first().isVisible().catch(() => false);
            await h.expectProduct('sign-up form for a new email', ok && pw,
                ok ? `"Create your account" and a password box shown for a new email (${pw ? 'password box visible' : 'NO password box'}); not submitted`
                    : `no "Create your account" for a new email; page: ${page.url()}`, 'fail', { el: create });
            // Never press "Create your account": the monitor must not sign up.
        });

        await h.scenario('wrong password', async () => {
            await usePage();
            if (!MONITOR_EMAIL) return h.skip('wrong password rejected', 'no monitor email configured');
            await page.goto(loginUrl(BASE_URL), { waitUntil: 'domcontentloaded' });
            await emailBox(page).fill(MONITOR_EMAIL);
            await page.getByRole('button', { name: 'Continue', exact: true }).click();
            const pw = page.locator('input[type="password"]').first();
            const withPw = page.getByRole('button', { name: 'Continue with password' });
            await pw.or(withPw).first().waitFor({ state: 'visible', timeout: 30_000 });
            if (await withPw.isVisible().catch(() => false)) await withPw.click();
            await pw.fill(`Wrong-${Date.now().toString(36)}!`);
            await page.getByRole('button', { name: /^(log ?in|sign ?in|continue)$/i }).last().click();
            const err = page.getByText(ERROR_TEXT).first();
            const shown = await err.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
            const errText = shown ? (await err.innerText().catch(() => '')).trim().slice(0, 160) : '';
            const stillOnLogin = await pw.isVisible().catch(() => false);
            await h.expectProduct('wrong password rejected', stillOnLogin, stillOnLogin
                ? `stayed on the login form${errText ? `; message: "${errText}"` : ''}` : `left the login form: ${page.url()}`, 'fail', { el: shown ? err : pw });
            if (stillOnLogin) await h.expectProduct('wrong password: error message shown', shown,
                shown ? `"${errText}"` : 'no error message within 15 s', 'warn', { el: shown ? err : pw });
        });

        await h.scenario('login', async () => {
            await usePage();
            const a = await ensureSignedIn(page, { baseUrl: BASE_URL, log: () => {} });
            const box = page.locator("textarea[aria-label='Ask Hercules a question']").or(page.getByRole('textbox', { name: /Describe the research you/i })).first();
            const ok = await box.isVisible().catch(() => false);
            await h.expectProduct('login with the monitor account (clean browser)', ok,
                ok ? `${a.method}: dashboard prompt box visible` : `${a.method}: prompt box not visible (${page.url()})`, 'fail', { el: box });
        });
    } finally {
        h.finish();
        await ctx.close().catch(() => {});
    }
});
