/**
 * HerculesEmailAuth.js
 * Headless sign-in to Hercules with ONE fixed email + password account on Mailosaur, so
 * unattended runs (GitHub Actions, hourly) never depend on a Google session.
 *
 *   email    = HERCULES_MONITOR_EMAIL || hercules-monitor@<MAILOSAUR_SERVER_ID>.mailosaur.net
 *   password = HERCULES_MONITOR_PASSWORD (required; a GitHub secret in CI)
 *
 * If Hercules says the account doesn't exist yet ("Create your account"), it is created once
 * with that same email/password and verified through the Mailosaur API (MAILOSAUR_API_KEY).
 * Every later run just logs in, so no new accounts pile up.
 *
 * Locally the signed-in session is cached in .auth/monitor-state.json (gitignored).
 */
const fs = require('fs');
const path = require('path');
const MailosaurApi = require('./MailosaurApi');

const STATE_FILE = path.resolve(__dirname, '..', '.auth', 'monitor-state.json');

const promptBoxOf = page => page.getByRole('textbox', { name: /Describe the research you/i })
    .or(page.locator("textarea[aria-label='Ask Hercules a question']")).first();

function monitorAccount() {
    const server = process.env.MAILOSAUR_SERVER_ID;
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

/** Name + onboarding questions after a fresh signup. */
async function completeOnboarding(page) {
    for (let i = 0; i < 8 && !(await promptBoxOf(page).isVisible().catch(() => false)); i++) {
        const fullName = page.locator("[placeholder='Full name']");
        if (await fullName.isVisible().catch(() => false)) {
            await fullName.fill('QA Monitor');
            await page.keyboard.press('Enter');
        } else {
            const option = page.locator("[class*='text-[13px]'][class*='text-center']").first();
            if (await option.isVisible().catch(() => false)) await option.click().catch(() => {});
            const next = page.getByRole('button', { name: /^(continue|next|submit|finish|get started)$/i }).first();
            if (await next.isVisible().catch(() => false)) await next.click().catch(() => {});
        }
        await page.waitForTimeout(3000);
    }
}

/**
 * Makes sure `page` is signed in. Returns { email, method }:
 * 'cached-session' | 'password-login' | 'new-signup'. Throws with a clear message otherwise.
 */
async function ensureSignedIn(page, { baseUrl = 'https://hercules.works', log = console.log } = {}) {
    if (await isSignedIn(page, baseUrl)) return { email: '(cached session)', method: 'cached-session' };
    const { email, password } = monitorAccount();

    await page.context().clearCookies();
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^log in$/i }).first().click();
    await page.locator('input#guest-email, input[type="email"]').first().fill(email);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const pw = page.locator('input[type="password"]').first();
    await pw.waitFor({ state: 'visible', timeout: 30_000 });
    await pw.fill(password);

    const signupBtn = page.getByRole('button', { name: 'Create your account' });
    const isSignup = await signupBtn.isVisible().catch(() => false);
    const submittedAt = new Date(Date.now() - 5_000);
    let method = 'password-login';
    if (isSignup) {
        method = 'new-signup';
        log(`[Auth] ${email} has no Hercules account yet — creating it once.`);
        await signupBtn.click();
        await verifyViaMailosaur(page, email, submittedAt);
        await completeOnboarding(page);
    } else {
        await page.getByRole('button', { name: /^(log ?in|sign ?in|continue)$/i }).last().click();
        await page.waitForTimeout(5000);
    }

    if (!(await isSignedIn(page, baseUrl))) {
        throw new Error(`Login with ${email} failed (${method}): dashboard prompt box not visible. Wrong HERCULES_MONITOR_PASSWORD?`);
    }
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    await page.context().storageState({ path: STATE_FILE });
    fs.chmodSync(STATE_FILE, 0o600);
    return { email, method };
}

module.exports = { ensureSignedIn, STATE_FILE };
