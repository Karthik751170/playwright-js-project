/**
 * dev.superj.app respondent flow, learned headless on 2026-11-11:
 *   /Login → phone → Continue → /OTP (6-digit box, dev OTP 777777) → /Home
 *   survey link → profile sheet "3 Questions. 1 Reward": Start Now → gender → year of birth →
 *   city search ("Search for your city", pick the suggestion) → "Slide to Claim" → Congratulations
 *   survey link again → /normal-survey-preview/<id> → Start Survey → (Cloudflare Turnstile check)
 * Most buttons sit under an invisible full-size checkbox, so clicks go to the element's centre.
 */
const SUPERJ = 'https://dev.superj.app';

const clickCentre = async (page, loc) => {
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    const r = await loc.boundingBox();
    if (!r) throw new Error('element not on screen');
    await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
};

/** Turns the copied superj.app survey link into its dev.superj.app equivalent. */
function devLink(link) {
    const u = new URL(link);
    if (!/^dev\./.test(u.hostname)) u.hostname = `dev.${u.hostname.replace(/^www\./, '')}`;
    return u.toString();
}

async function login(page, log) {
    const phone = String(6 + Math.floor(Math.random() * 4)) + String(Math.floor(1e8 + Math.random() * 9e8));
    await page.goto(`${SUPERJ}/Login`, { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('Phone number').fill(phone);
    await page.getByRole('button', { name: 'Continue' }).dispatchEvent('click');
    const otp = page.locator('input[maxlength="6"], input[autocomplete="one-time-code"]').first();
    await otp.waitFor({ state: 'visible', timeout: 30_000 });
    await otp.fill('777777');
    await page.waitForURL(/\/(Home|OnBoarding)/i, { timeout: 60_000 });
    log(`Super J login ok (test phone ${phone.slice(0, 2)}xxxxxx${phone.slice(-2)})`);
    return phone;
}

/** The 3-question profile sheet. Picks gender / birth year / city to match the survey's audience. */
async function completeProfile(page, { gender = 'Male', birthYear = 1998, city = 'Mumbai' }, log) {
    const sheet = page.getByText(/3 Questions\. 1 Reward|First answer 3 questions/).first();
    if (!(await sheet.isVisible().catch(() => false))) return { shown: false };
    const startNow = page.getByRole('button', { name: 'Start Now' }).last();
    if (await startNow.isVisible().catch(() => false)) { await startNow.dispatchEvent('click'); await page.waitForTimeout(2500); }
    await page.getByRole('button', { name: gender, exact: true }).click({ force: true });
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Continue' }).last().click({ force: true });
    await page.waitForTimeout(2500);
    const yr = page.getByText(String(birthYear), { exact: true }).last();
    await yr.scrollIntoViewIfNeeded().catch(() => {});
    await yr.click({ force: true });
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Continue' }).last().click({ force: true });
    await page.waitForTimeout(2500);
    const box = page.getByPlaceholder('Search for your city');
    await box.focus();
    await page.keyboard.type(city.slice(0, 4), { delay: 150 });
    await page.waitForTimeout(3000);
    const suggestion = page.locator('span', { hasText: new RegExp(`^${city}`, 'i') }).last();
    let picked = city;
    if (await suggestion.isVisible().catch(() => false)) { picked = (await suggestion.innerText()).trim(); await suggestion.click({ force: true }); }
    else log(`city "${city}" not in Super J suggestions; typed only`);
    await page.waitForTimeout(1200);
    const track = await page.evaluate(() => {
        const t = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && /Slide to Claim/.test(e.textContent));
        let el = t && t.parentElement;
        for (let i = 0; i < 4 && el && el.getBoundingClientRect().width < 250; i++) el = el.parentElement;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
    if (track) {
        const y = track.y + track.h / 2;
        await page.mouse.move(track.x + track.h / 2, y);
        await page.mouse.down();
        for (let i = 1; i <= 20; i++) { await page.mouse.move(track.x + track.h / 2 + (track.w - track.h) * i / 20, y); await page.waitForTimeout(30); }
        await page.mouse.up();
    }
    const done = await page.getByText(/Congratulations!/).first().waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false);
    log(`Super J profile: ${gender}, ${birthYear}, ${picked} → ${done ? 'claimed' : 'no Congratulations screen'}`);
    return { shown: true, gender, birthYear, city: picked, done };
}

/** Opens the survey, presses Start Survey and reports whether a Turnstile check blocks it. */
async function startSurvey(page, link) {
    await page.goto(link, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);
    const intro = (await page.innerText('body')).slice(0, 1500);
    const start = page.getByText('Start Survey').last();
    if (!(await start.isVisible().catch(() => false))) return { started: false, url: page.url(), intro, reason: 'no Start Survey button' };
    await clickCentre(page, start);
    await page.waitForTimeout(6000);
    const turnstile = await page.getByText(/Verify you are human|Quick security check|Cloudflare Turnstile/i).first().isVisible().catch(() => false);
    return { started: !turnstile, turnstile, url: page.url(), intro };
}

/** Visible text of the current question screen (what a respondent sees). */
async function screenText(page) {
    return page.evaluate(() => {
        const vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && s.visibility !== 'hidden' && s.opacity !== '0'; };
        return [...document.querySelectorAll('h1,h2,h3,h4,p,span,label,button,li,div')].filter(e => e.children.length === 0 && vis(e)).map(e => e.textContent.trim()).filter(Boolean).join(' | ').slice(0, 1500);
    });
}

/**
 * Answers the survey screen by screen with simple, valid answers and records every screen.
 * Best effort: this part could not be exercised on 2026-11-11 because Turnstile blocked it.
 */
async function answerSurvey(page, { maxScreens = 80, shot, log }) {
    const screens = [];
    let same = 0, last = '';
    for (let i = 0; i < maxScreens; i++) {
        await page.waitForTimeout(2500);
        const text = await screenText(page);
        if (/Congratulations|Thank you|Job well done|completed this survey|Survey Complete|not eligible|Disqualified|Sorry/i.test(text) && !/Start Survey/.test(text)) {
            screens.push({ i, text, end: true }); await shot(`sj-end`); log(`Super J end screen: ${text.slice(0, 150)}`); return { completed: true, screens };
        }
        if (text === last) { if (++same >= 3) { await shot(`sj-stuck`); return { completed: false, stuck: text.slice(0, 300), screens }; } } else same = 0;
        last = text;
        screens.push({ i, text });
        await shot(`sj-q${String(i + 1).padStart(2, '0')}`);
        const vp = page.viewportSize();
        // Text / number inputs
        const inputs = page.locator('textarea:visible, input:visible:not([type=checkbox]):not([type=radio]):not([type=hidden])');
        const n = await inputs.count();
        for (let k = 0; k < n; k++) {
            const el = inputs.nth(k);
            const type = await el.getAttribute('type').catch(() => '');
            if (await el.inputValue().catch(() => '')) continue;
            await el.fill(type === 'number' || /price|₹|rs\b|amount/i.test(text) ? String(40 + 20 * k) : 'It is good value and easy to use.').catch(() => {});
        }
        // Options: pick the first unselected option-like element in the middle of the screen.
        const option = await page.evaluate(({ h }) => {
            const vis = e => { const r = e.getBoundingClientRect(); return r.width > 40 && r.height > 20 && r.top > 80 && r.bottom < h - 70; };
            const cands = [...document.querySelectorAll('[role=radio],[role=checkbox],label,li,button,div[class*=option],div[class*=Option],div[class*=choice]')]
                .filter(e => vis(e) && e.innerText && e.innerText.trim().length < 120 && !/^(Next|Continue|Submit|Finish|Previous|Back|Start Survey|Skip)$/i.test(e.innerText.trim()));
            const e = cands[Math.floor(cands.length / 3)] || cands[0];
            if (!e) return null;
            const r = e.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2, t: e.innerText.trim().slice(0, 60) };
        }, { h: vp.height });
        if (option) await page.mouse.click(option.x, option.y);
        await page.waitForTimeout(800);
        const next = page.getByRole('button', { name: /^(Next|Continue|Submit|Finish|Done)\b/i }).last();
        if (await next.isVisible().catch(() => false)) await clickCentre(page, next).catch(() => {});
        screens[screens.length - 1].picked = option && option.t;
    }
    return { completed: false, screens, reason: `stopped after ${maxScreens} screens` };
}

module.exports = { SUPERJ, devLink, login, completeProfile, startSurvey, answerSurvey, clickCentre };
