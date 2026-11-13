/**
 * HerculesEmailAuth.js
 * Headless sign-in to Hercules with ONE fixed email + password account on Mailosaur, so
 * unattended runs (GitHub Actions, hourly) never depend on a Google session.
 *
 *   email    = HERCULES_MONITOR_EMAIL || hercules-monitor@<MAILOSAUR_SERVER_ID>.mailosaur.net
 *   password = HERCULES_MONITOR_PASSWORD (required; a GitHub secret in CI)
 *
 * The account must already exist: the monitor only logs in and never signs up (if Hercules
 * offers "Create your account" it fails with a clear error). Only MONITOR_FRESH_ACCOUNT=true
 * (the dev design-payload test) creates accounts, verified through Mailosaur.
 *
 * Locally the signed-in session is cached in .auth/monitor-state.json (gitignored).
 */
const fs = require('fs');
const path = require('path');
const MailosaurApi = require('./MailosaurApi');
const { loginUrl } = require('./automationTag');

const STATE_FILE = path.resolve(__dirname, '..', '.auth', 'monitor-state.json');

const promptBoxOf = page => page.getByRole('textbox', { name: /Describe the research you/i })
    .or(page.locator("textarea[aria-label='Ask Hercules a question']")).first();

/**
 * MONITOR_FRESH_ACCOUNT=true → a brand-new account every run (new Mailosaur address, random
 * password), so each run starts with a full daily AI token limit. Each run then also covers
 * sign-up → email confirmation → onboarding. Otherwise one fixed account is reused.
 */
const FRESH = /^(1|true|yes)$/i.test(process.env.MONITOR_FRESH_ACCOUNT || '');
let freshAccount = null;

function monitorAccount() {
    const server = process.env.MAILOSAUR_SERVER_ID;
    if (FRESH) {
        if (!server) throw new Error('MONITOR_FRESH_ACCOUNT needs MAILOSAUR_SERVER_ID (and MAILOSAUR_API_KEY) to sign up.');
        freshAccount = freshAccount || {
            email: `hm-${(process.env.MONITOR_GROUP || 'run').replace(/\W/g, '')}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@${server}.mailosaur.net`,
            password: `Mon${Math.random().toString(36).slice(2, 10)}${Math.floor(Math.random() * 90 + 10)}!`,
        };
        return freshAccount;
    }
    const email = process.env.HERCULES_MONITOR_EMAIL || (server && `hercules-monitor@${server}.mailosaur.net`);
    const password = process.env.HERCULES_MONITOR_PASSWORD;
    if (!email) throw new Error('Set HERCULES_MONITOR_EMAIL or MAILOSAUR_SERVER_ID for the monitor account.');
    if (!password) throw new Error('Set HERCULES_MONITOR_PASSWORD (GitHub secret) for the monitor account.');
    return { email, password };
}

async function isSignedIn(page, baseUrl) {
    await page.goto(`${baseUrl}/ai`, { waitUntil: 'domcontentloaded' });
    const logIn = page.getByRole('button', { name: 'Log In' }).first();
    await promptBoxOf(page).or(logIn).first().waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {});
    return !(await logIn.isVisible().catch(() => false)) && (await promptBoxOf(page).isVisible().catch(() => false));
}

async function verifyViaMailosaur(page, email, receivedAfter) {
    if (!MailosaurApi.isConfigured()) throw new Error('Account needs email verification but MAILOSAUR_API_KEY/MAILOSAUR_SERVER_ID are not set.');
    const message = await new MailosaurApi().waitForMessage(email, { receivedAfter, timeoutMs: 180_000 });
    const { link, code } = MailosaurApi.extractVerification(message);
    if (link) await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    else if (code) {
        await page.locator('input[autocomplete="one-time-code"], input[inputmode="numeric"], input[type="text"]').first().click();
        await page.keyboard.type(code, { delay: 80 });
    } else throw new Error(`Verification email "${message.subject}" had neither a link nor a code`);
}

/**
 * "Complete Your Hercules Profile" (/details?step=N) after signup: a name field, then card
 * questions (role, purpose) that advance as soon as a card is clicked. Also runs after a password
 * login, because an account can be left half-way through it.
 */
async function completeOnboarding(page, log = console.log) {
    for (let i = 0; i < 10 && !(await promptBoxOf(page).isVisible().catch(() => false)); i++) {
        // Logged out (public home page with "Log In"): nothing to onboard; let the caller log in.
        if (!/\/details|\/signup|\/verify/.test(page.url())
            && await page.getByRole('button', { name: 'Log In' }).first().isVisible().catch(() => false)) {
            log('[Auth] onboarding: page is logged out — stopping onboarding');
            return;
        }
        const fullName = page.locator("[placeholder='Full name']");
        const cards = page.locator('button.h-\\[95px\\]');
        if (await fullName.isVisible().catch(() => false)) {
            await fullName.fill('QA Monitor');
            await page.keyboard.press('Enter');
            log('[Auth] onboarding: name');
        } else if (await cards.first().isVisible().catch(() => false)) {
            const others = cards.filter({ hasText: /^\s*Others?\s*$/ });
            const pick = (await others.count()) ? others.first() : cards.first();
            log(`[Auth] onboarding: ${(await pick.innerText()).trim()}`);
            await pick.click();
        } else {
            const next = page.getByRole('button', { name: /^(continue|next|submit|finish|get started|done)$/i }).first();
            if (await next.isVisible().catch(() => false)) await next.click().catch(() => {});
            // 2026-11-11/12 on GitHub: this goto waited for the full "load" event with no limit and
            // froze the monitor for 35 min. Wait for the DOM only, and never longer than 60 s.
            else if (!/\/details|\/signup|\/verify/.test(page.url())) {
                await page.goto(new URL('/ai', page.url()).href, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
            }
        }
        await page.waitForTimeout(3000);
    }
}

/**
 * Opens the tagged login page (https://<host>/login?automation_test=1&test_agent=claude), which
 * shows the email form directly. Falls back to the "Log In" button if the form isn't there.
 */
async function openLoginForm(page, baseUrl) {
    await page.goto(loginUrl(baseUrl), { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const emailBox = page.locator('input#guest-email, input[type="email"]').first();
    const logIn = page.getByRole('button', { name: /^log in$/i }).first();
    await emailBox.or(logIn).first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
    if (!(await emailBox.isVisible().catch(() => false))) await logIn.click();
    return emailBox;
}

/**
 * Makes sure `page` is signed in. Returns { email, method }:
 * 'cached-session' | 'password-login' | 'new-signup'. Throws with a clear message otherwise.
 */
async function ensureSignedIn(page, { baseUrl = 'https://hercules.works', log = console.log } = {}) {
    // Every run lands on the tagged login page first (/login?automation_test=1&test_agent=claude).
    await page.goto(loginUrl(baseUrl), { waitUntil: 'domcontentloaded', timeout: 60_000 });
    // A fresh-account run must never reuse a saved session.
    if (!FRESH && await isSignedIn(page, baseUrl)) return { email: '(cached session)', method: 'cached-session' };
    const { email, password } = monitorAccount();

    await page.context().clearCookies();
    await (await openLoginForm(page, baseUrl)).fill(email);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    // Existing accounts get "Continue with password" first; new ones go straight to the password box.
    const pw = page.locator('input[type="password"]').first();
    const withPassword = page.getByRole('button', { name: 'Continue with password' });
    await pw.or(withPassword).first().waitFor({ state: 'visible', timeout: 30_000 });
    if (await withPassword.isVisible().catch(() => false)) await withPassword.click();
    await pw.waitFor({ state: 'visible', timeout: 30_000 });
    await pw.fill(password);

    const signupBtn = page.getByRole('button', { name: 'Create your account' });
    const isSignup = await signupBtn.isVisible().catch(() => false);
    const submittedAt = new Date(Date.now() - 5_000);
    let method = 'password-login';
    if (FRESH && !isSignup) throw new Error(`Fresh account ${email} unexpectedly already exists.`);
    // The fixed monitor account must already exist: never sign up a new one by accident.
    if (isSignup && !FRESH) {
        throw new Error(`${email} has no Hercules account and sign-up is disabled for the monitor. `
            + 'Check HERCULES_MONITOR_EMAIL / HERCULES_MONITOR_PASSWORD.');
    }
    if (isSignup) {
        method = 'new-signup';
        log(`[Auth] ${email} has no Hercules account yet — creating it once.`);
        await signupBtn.click();
        await verifyViaMailosaur(page, email, submittedAt);
    } else {
        await page.getByRole('button', { name: /^(log ?in|sign ?in)$/i }).last().click();
        await page.waitForTimeout(5000);
    }
    await completeOnboarding(page, log);

    // Seen on dev 2026-11-11: after sign-up + email verification the site can land logged out.
    // The account exists by then, so log in with the same email + password once.
    if (method === 'new-signup' && !(await isSignedIn(page, baseUrl))) {
        log(`[Auth] ${email} landed logged out after sign-up — logging in with the new password.`);
        await page.context().clearCookies();
        await (await openLoginForm(page, baseUrl)).fill(email);
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
        const pw2 = page.locator('input[type="password"]').first();
        const withPw = page.getByRole('button', { name: 'Continue with password' });
        await pw2.or(withPw).first().waitFor({ state: 'visible', timeout: 30_000 });
        if (await withPw.isVisible().catch(() => false)) await withPw.click();
        await pw2.fill(password);
        await page.getByRole('button', { name: /^(log ?in|sign ?in)$/i }).last().click();
        await page.waitForTimeout(5000);
        await completeOnboarding(page, log);
        method = 'new-signup+login';
    }

    if (!(await isSignedIn(page, baseUrl))) {
        throw new Error(`Login with ${email} failed (${method}): dashboard prompt box not visible. Wrong HERCULES_MONITOR_PASSWORD?`);
    }
    if (!FRESH) {
        fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
        await page.context().storageState({ path: STATE_FILE });
        fs.chmodSync(STATE_FILE, 0o600);
    }
    return { email, method };
}

module.exports = { ensureSignedIn, STATE_FILE };
