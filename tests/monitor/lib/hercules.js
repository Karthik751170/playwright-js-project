/**
 * Helpers for the hourly Hercules monitor, adapted from the repo's existing scripts:
 *   - chat prompt + slow-reply wait  ← tests/Hercules_ChatPromptPerspectives.spec.js
 *   - survey state from the side panel (Questions/Logics) ← same spec, updated for the 2026-11 UI
 *   - H-icon Rename / Duplicate / Delete ← tests/Hercules_HIconChatActions.spec.js
 *   - audience page read-back ← tests/DeploySurvey_EditAudience_Validation.spec.js
 *
 * Survey content is AI-generated and different every run: questions are referenced by the text
 * read from the panel, and checks compare before/after deltas, never fixed values.
 */

const STABLE_FOR = 30_000; // a reply is complete once its text hasn't changed for this long
const POLL = 5_000;

const promptBox = page => page.locator("textarea[aria-label='Ask Hercules a question']")
    .or(page.getByRole('textbox', { name: /Describe the research you/i })).first();

/** Element holding the chat transcript: the nearest ancestor of the prompt box that holds the text. */
async function chatText(page) {
    return page.evaluate(() => {
        const box = document.querySelector("textarea[aria-label='Ask Hercules a question']");
        let el = box;
        while (el && el.parentElement && el.innerText.length < 400) el = el.parentElement;
        // Climb to the column that holds the messages, not the whole page (the side panel is a sibling).
        while (el && el.parentElement && !el.parentElement.querySelector('[aria-label="Share Survey"], [aria-label="Close"]')) el = el.parentElement;
        return (el || document.body).innerText;
    });
}

/**
 * Types a prompt (value setter + input event: real typing dropped characters, see memory
 * "prompt entry"), sends it and returns once the reply text has been stable for STABLE_FOR.
 */
async function ask(page, text, { timeoutMs = 6 * 60_000 } = {}) {
    const box = promptBox(page);
    await box.waitFor({ state: 'visible', timeout: 30_000 });
    await box.click();
    await box.evaluate((el, v) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }, text);
    if ((await box.inputValue()) !== text) await box.fill(text);
    await page.locator('button[aria-label="submit button"]').or(page.getByRole('button', { name: 'Send' })).first().click();

    const marker = text.slice(0, 60);
    const t0 = Date.now();
    let last = '', stableSince = Date.now();
    while (Date.now() - t0 < timeoutMs) {
        await page.waitForTimeout(POLL);
        const all = await chatText(page).catch(() => '');
        const at = all.lastIndexOf(marker);
        const reply = at >= 0 ? all.slice(at + text.length).trim() : '';
        if (reply !== last) { last = reply; stableSince = Date.now(); continue; }
        const thinking = !reply || /^(Thinking|Working|Analy[sz]ing|Updating)[\s.…]*$/i.test(reply);
        if (!thinking && Date.now() - stableSince >= STABLE_FOR) break;
    }
    return { reply: last.slice(0, 6000), seconds: Math.round((Date.now() - t0) / 1000), timedOut: Date.now() - t0 >= timeoutMs };
}

/** True when Hercules answered with a question/confirmation instead of doing the work. */
function isClarification(reply) {
    const tail = reply.slice(-600);
    return /\?\s*$/.test(tail.trim()) && /(would you like|do you want|should i|shall i|confirm|which|can you|could you|let me know|go ahead|proceed)/i.test(tail);
}

/**
 * Ask, and answer up to `maxFollowUps` clarifying questions with `followUp` before grading
 * (memory: "answer Hercules clarifications first" — an unanswered clarification is not a bug).
 * Also clicks any new primary action card Hercules shows (e.g. "Yes, update the survey").
 */
async function askAndResolve(page, text, { followUp = 'Yes, go ahead and apply exactly that change to the survey now.', maxFollowUps = 2, timeoutMs } = {}) {
    const actionBtn = page.getByRole('button', { name: /^(Yes[,.]? (update|apply|create|go ahead)[^]*|Looks good[^]*|Apply( changes)?|Update (the )?survey|Run your version|Confirm)$/i });
    const before = await actionBtn.count();
    const turns = [];
    let r = await ask(page, text, { timeoutMs });
    turns.push({ prompt: text, ...r });
    for (let i = 0; i < maxFollowUps; i++) {
        const nowBtns = await actionBtn.count();
        if (nowBtns > before && await actionBtn.last().isVisible().catch(() => false)) {
            const label = (await actionBtn.last().innerText()).trim();
            await actionBtn.last().click().catch(() => {});
            turns.push({ prompt: `[clicked "${label}"]`, reply: '', seconds: 0 });
            await page.waitForTimeout(30_000);
            continue;
        }
        if (!isClarification(r.reply)) break;
        r = await ask(page, followUp, { timeoutMs });
        turns.push({ prompt: followUp, ...r });
    }
    return { reply: turns.map(t => t.reply).join('\n---\n'), finalReply: r.reply, turns, timedOut: r.timedOut };
}

/** Side panel state: question texts (Logics tab rows), logic-rule total and logic version. */
async function surveyState(page) {
    const logicsTab = page.getByRole('button', { name: 'Logics', exact: true });
    if (!(await logicsTab.isVisible().catch(() => false))) return { questions: [], logicRules: null, logicVersion: null, panel: false };
    await logicsTab.click().catch(() => {});
    await page.waitForTimeout(2000);
    const state = await page.evaluate(() => {
        const visible = e => e.offsetParent !== null;
        const labels = [...document.querySelectorAll('div,span')].filter(e => visible(e) && e.children.length === 0 && /^\s*Q\d+\s*$/.test(e.textContent));
        const seen = new Map();
        for (const l of labels) {
            let row = l;
            for (let i = 0; i < 6 && row.parentElement && row.parentElement.innerText.length < 400; i++) row = row.parentElement;
            const q = l.textContent.trim();
            if (!seen.has(q)) seen.set(q, row.innerText.replace(/\s+/g, ' ').replace(/^Q\d+\s*/, '').replace(/\s*\d+ Logics?$/, '').trim().slice(0, 200));
        }
        const badges = [...document.querySelectorAll('div,span')].filter(e => visible(e) && e.children.length === 0 && /^\d+ Logics?$/.test(e.textContent.trim()));
        const expandedRules = [...document.querySelectorAll('div,span')].filter(e => visible(e) && e.children.length === 0 && /^(End|Skip|Show|Hide|Jump|Terminate Survey)$/.test(e.textContent.trim())).length;
        const ver = [...document.querySelectorAll('div,button,span')].map(e => e.textContent.trim()).find(t => /^Logic Version \(\d+\)$/.test(t));
        const svBtn = [...document.querySelectorAll('div,button,span')].map(e => e.textContent.trim()).find(t => /^Survey Version \(\d+\)$/.test(t));
        const surveyVer = svBtn || (document.body.innerText.match(/Survey\s*[·•∙.]?\s*Version\s*(\d+)/g) || []).pop();
        return {
            questions: [...seen.entries()].sort((a, b) => Number(a[0].slice(1)) - Number(b[0].slice(1))).map(([, t]) => t),
            logicBadgeTotal: [...new Set(badges)].reduce((n, b) => n + Number(b.textContent.match(/\d+/)[0]), 0),
            expandedRules,
            logicVersion: ver ? Number(ver.match(/\d+/)[0]) : null,
            surveyVersion: surveyVer ? Number(surveyVer.match(/\d+/)[0]) : null,
        };
    });
    // Badges are hidden on an expanded row (its rule is shown instead); count both.
    return { ...state, logicRules: state.logicBadgeTotal + state.expandedRules, panel: true };
}

/** Opens "View Audience" (→ /audience), reads it, and returns to the chat. */
async function readAudience(page) {
    const chatUrl = page.url();
    const btn = page.getByRole('button', { name: 'View Audience' }).last();
    if (!(await btn.isVisible().catch(() => false))) return { found: false };
    await btn.click();
    await page.waitForURL(/\/audience/, { timeout: 30_000 }).catch(() => {});
    await page.getByText('Audience Count').first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const text = await page.locator('body').innerText();
    const count = await page.locator('input[type="text"]').first().inputValue().catch(() => null);
    const main = text.slice(text.indexOf('Build your Audience'), text.indexOf('Home\nPricing') > 0 ? text.indexOf('Home\nPricing') : undefined);
    const result = {
        found: true,
        url: page.url(),
        count: count ? Number(count.replace(/,/g, '')) : null,
        sendToAnyone: /Send it to anyone on SuperJ/i.test(main),
        text: main.replace(/\n+/g, ' | ').slice(0, 1500),
    };
    await page.goto(chatUrl, { waitUntil: 'domcontentloaded' });
    await promptBox(page).waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(5000);
    return result;
}

// ── H-icon campaign menu (Rename / Duplicate Campaign / Delete Campaign) ────────────────────

async function openHMenu(page) {
    await page.locator("img[alt='hercules-logo']").first().click({ force: true });
    await page.getByText('Delete Campaign', { exact: true }).first().waitFor({ state: 'visible', timeout: 15_000 });
}

async function renameCampaign(page, name) {
    await openHMenu(page);
    await page.getByRole('button', { name: /^(Edit|Rename)$/ }).first().click();
    const input = page.locator("input[placeholder='Chat name']").or(page.locator("input[placeholder*='name' i]")).first();
    await input.waitFor({ state: 'visible', timeout: 10_000 });
    await input.fill(name);
    await page.getByRole('button', { name: 'Save', exact: true }).first().click();
    await page.waitForTimeout(3000);
}

async function duplicateCampaign(page) {
    const before = page.url();
    await openHMenu(page);
    await page.getByText('Duplicate Campaign', { exact: true }).first().click();
    const confirm = page.getByRole('button', { name: 'Duplicate Campaign' }).last();
    await confirm.waitFor({ state: 'visible', timeout: 10_000 });
    await confirm.click();
    await page.waitForURL(u => u.toString() !== before, { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(5000);
    return page.url();
}

async function deleteCampaign(page) {
    await openHMenu(page);
    await page.getByText('Delete Campaign', { exact: true }).first().click();
    const confirm = page.getByRole('button', { name: /^(Delete|Delete Campaign|Confirm|Yes)$/ }).last();
    await confirm.waitFor({ state: 'visible', timeout: 10_000 });
    await confirm.click();
    await page.waitForTimeout(5000);
}

/** All campaigns page text (used to verify rename / duplicate / delete). */
async function campaignHistory(page, baseUrl) {
    await page.goto(`${baseUrl}/chat/campaign-history`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    return page.locator('body').innerText();
}

const occurrences = (hay, needle) => hay.split(needle).length - 1;

// ── Edit Audience modal (2026-11 design, #campagin-edit-audience) ──────────────────────────
// Adapted from pages/hercules/HerculesEditAudience.js: same aria labels ("Edit location filter",
// "Remove <x>", "Edit attributes filter"), but dropdowns are checkbox lists that must be closed
// (Confirm stays disabled while one is open) by clicking the modal title.

async function editAudienceModal(page, { addCity = 'Pune' } = {}) {
    // Found by content: the element id (#campagin-edit-audience) isn't always the visible dialog.
    const modal = page.locator('div').filter({ has: page.getByRole('button', { name: 'Confirm' }) })
        .filter({ hasText: 'User Count' }).filter({ hasText: 'Edit Audience' }).last();
    await modal.waitFor({ state: 'visible', timeout: 20_000 });
    const title = modal.locator('p').filter({ hasText: /^Edit Audience$/ }).first();
    const closeDropdown = async () => { await title.click().catch(() => {}); await page.waitForTimeout(800); };
    const applied = { userCount: null, cityRemoved: null, cityAdded: null, genderToggled: null, ageAdded: null, attributeAdded: null };

    // User count: random 150-950, different from the current value.
    const count = modal.locator('input[type="text"]').first();
    const current = Number((await count.inputValue()).replace(/,/g, '')) || 100;
    let n = 150 + Math.floor(Math.random() * 80) * 10;
    if (n === current) n += 10;
    await count.fill(String(n));
    applied.userCount = n;

    // Remove one location chip.
    const removeBtns = modal.getByRole('button', { name: /^Remove / });
    const cityChips = [];
    for (const b of await removeBtns.all()) cityChips.push((await b.getAttribute('aria-label')) || '');
    const locationEditBtn = modal.getByRole('button', { name: 'Edit location filter' });
    if (await locationEditBtn.isVisible().catch(() => false)) {
        // Add a city through the search box.
        await locationEditBtn.click();
        const search = modal.getByPlaceholder('Search cities...');
        await search.fill(addCity);
        await page.waitForTimeout(1500);
        const opt = modal.locator('label, li, div').filter({ hasText: new RegExp(`^${addCity}$`) }).last();
        if (await opt.isVisible().catch(() => false)) { await opt.click(); applied.cityAdded = addCity; }
        await closeDropdown();
        // Remove a different city (never the one just added).
        const removable = modal.getByRole('button', { name: /^Remove / }).filter({ hasNotText: addCity });
        const label = await removable.first().getAttribute('aria-label').catch(() => null);
        if (label && !label.includes(addCity) && cityChips.length > 1) {
            await removable.first().click();
            applied.cityRemoved = label.replace(/^Remove\s*/, '');
        }
    }

    // Gender: toggle Female (keeps Male so the audience never becomes empty).
    const female = modal.getByText('Female', { exact: true }).first();
    if (await female.isVisible().catch(() => false)) { await female.click(); applied.genderToggled = 'Female'; }

    // Age: tick the first unticked band.
    for (const band of ['45 - 55', '18 - 24', '24 - 35', '35 - 45', '56 - 90']) {
        const el = modal.locator('label, div, button').filter({ hasText: new RegExp(`^${band}$`) }).last();
        if (!(await el.isVisible().catch(() => false))) continue;
        const checked = await el.evaluate(e => !!e.querySelector('input:checked') || /checked|selected|bg-\[#(0|1)/.test(e.className)).catch(() => false);
        if (!checked) { await el.click(); applied.ageAdded = band; break; }
    }

    // Attributes: tick the first unticked option, then close the list.
    const attrBtn = modal.getByRole('button', { name: 'Edit attributes filter' });
    if (await attrBtn.isVisible().catch(() => false)) {
        await attrBtn.click();
        await page.waitForTimeout(1200);
        const options = modal.locator('label').filter({ has: page.locator('input[type="checkbox"]:not(:checked)') });
        if (await options.first().isVisible().catch(() => false)) {
            applied.attributeAdded = (await options.first().innerText()).trim();
            await options.first().click();
        }
        await closeDropdown();
    }

    const confirm = modal.getByRole('button', { name: 'Confirm' });
    const enabled = await confirm.isEnabled().catch(() => false);
    if (enabled) await confirm.click();
    return { applied, confirmEnabled: enabled };
}

// ── Wallet (header pill on the dashboard, e.g. 👥 30) ────────────────────────────────────────

async function readWallet(page, baseUrl) {
    await page.goto(`${baseUrl}/ai`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    return page.evaluate(() => {
        const els = [...document.querySelectorAll('button, div, span, a')].filter(e => {
            const r = e.getBoundingClientRect();
            return e.offsetParent && r.top < 90 && r.left > window.innerWidth * 0.6 && /^\s*[\d,]+(\.\d+)?\s*$/.test(e.innerText) && e.children.length <= 2;
        });
        const v = els.map(e => Number(e.innerText.replace(/[,\s]/g, ''))).find(n => !Number.isNaN(n));
        return v ?? null;
    });
}

// ── Share (bottom-left icon → Share Campaign Chat / Share Survey / Share Research Brief) ────

async function shareLink(page, option) {
    await page.getByRole('button', { name: 'Share', exact: true }).first().click();
    await page.getByText(option, { exact: true }).click();
    const dialog = page.locator('div.fixed').filter({ has: page.getByRole('button', { name: 'Copy link' }) }).last();
    await dialog.waitFor({ state: 'visible', timeout: 15_000 });
    const text = await dialog.innerText();
    const link = (text.match(/https?:\/\/\S+/) || [])[0]
        || await dialog.locator('input').first().inputValue().catch(() => null);
    const access = (text.match(/(Shared|Private|Restricted)[^\n]*/) || [])[0] || null;
    const title = (text.split('\n')[0] || '').trim();
    await dialog.getByRole('button', { name: 'Copy link' }).click().catch(() => {});
    await page.waitForTimeout(800);
    // The dialog may close on copy; otherwise cancel it.
    await dialog.getByRole('button', { name: 'Cancel' }).click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(800);
    return { option, title, link, access };
}

/** Open a shared link in a fresh, logged-out context and report what a visitor sees. */
async function openLoggedOut(browser, link, { videoDir } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...(videoDir ? { recordVideo: { dir: videoDir, size: { width: 1280, height: 800 } } } : {}) });
    const p = await ctx.newPage();
    const nav = [];
    p.on('framenavigated', f => { if (f === p.mainFrame()) nav.push(f.url()); });
    let result;
    try {
        await p.goto(link, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await p.waitForTimeout(10_000);
        const text = await p.locator('body').innerText();
        result = {
            url: p.url(),
            notFound: /404|couldn't find that page|not found/i.test(text.slice(0, 800)),
            loginWall: /\/login\b|\/signup\b/.test(new URL(p.url()).pathname) || (/^\s*Log in/i.test(text) && /Continue with Google/.test(text.slice(0, 400))),
            text: text.slice(0, 4000),
            navigations: nav,
            shotBuffer: await p.screenshot().catch(() => null),
        };
        return result;
    } finally {
        const video = p.video();
        await ctx.close();
        // Keep the screen recording only when something went wrong (redirect / 404).
        if (video) {
            const vp = await video.path().catch(() => null);
            if (vp && result && (result.loginWall || result.notFound)) result.video = vp;
            else if (vp) require('fs').rmSync(vp, { force: true });
        }
    }
}

// ── Campaign menus in the sidebar and on All campaigns ──────────────────────────────────────

async function menuAction(page, opener, action, { newName } = {}) {
    await opener.click({ force: true });
    const item = page.getByRole('menuitem', { name: new RegExp(`^${action}`, 'i') })
        .or(page.locator('button, li, p, span, div').filter({ hasText: new RegExp(`^\\s*${action}\\s*$`, 'i') }))
        .filter({ visible: true }).last();
    if (!(await item.isVisible({ timeout: 3000 }).catch(() => false))) {
        await page.keyboard.press('Escape').catch(() => {});
        return { available: false };
    }
    await item.click();
    if (action === 'Rename') {
        // Never the page's own Search box (hasNot only filters descendants, so exclude it in CSS).
        const input = page.locator('input:focus:not([placeholder^="Search"]), input[placeholder*="name" i]:not([placeholder^="Search"])').filter({ visible: true }).last();
        await input.waitFor({ state: 'visible', timeout: 8000 });
        await input.fill(newName);
        const save = page.getByRole('button', { name: /^(Save|Rename|Done)$/ }).last();
        if (await save.isVisible().catch(() => false)) await save.click(); else await input.press('Enter');
    } else {
        // Wait for the confirmation dialog to render (isVisible() does not wait).
        const confirm = page.getByRole('button', { name: new RegExp(`^(${action}( Campaign| Question)?|Confirm|Yes)$`, 'i') }).filter({ visible: true }).last();
        await confirm.waitFor({ state: 'visible', timeout: 6000 }).then(() => confirm.click()).catch(() => {});
    }
    await page.waitForTimeout(4000);
    return { available: true };
}

/** "..." menu of a campaign card on All campaigns, found by name via the search box. */
async function allCampaignsAction(page, baseUrl, name, action, opts) {
    await page.goto(`${baseUrl}/chat/campaign-history`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    const search = page.getByPlaceholder('Search...');
    if (await search.isVisible().catch(() => false)) { await search.fill(name); await page.waitForTimeout(2500); }
    const card = page.locator('div').filter({ hasText: name }).filter({ has: page.getByRole('button', { name: 'Open menu' }) }).last();
    if (!(await card.isVisible().catch(() => false))) return { available: false, reason: 'card not found' };
    return menuAction(page, card.getByRole('button', { name: 'Open menu' }).first(), action, opts);
}

/** Sidebar row menu ("Open chat menu") of the campaign currently open. */
async function sidebarAction(page, chatUrl, action, opts) {
    await page.goto(chatUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);
    const opener = page.getByRole('button', { name: 'Open chat menu' }).first();
    if (!(await opener.isVisible().catch(() => false))) {
        await page.getByRole('button', { name: 'Open sidebar' }).click().catch(() => {});
        await page.waitForTimeout(1500);
    }
    if (!(await opener.isVisible().catch(() => false))) return { available: false, reason: '"Open chat menu" not found' };
    return menuAction(page, opener, action, opts);
}

/** Finds a campaign on All campaigns whose card shows `text` (e.g. the prompt marker) and returns its chat URL. */
async function findCampaignByText(page, baseUrl, text) {
    await page.goto(`${baseUrl}/chat/campaign-history`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);
    const card = page.locator('div').filter({ hasText: text }).filter({ has: page.getByRole('button', { name: 'Open menu' }) }).last();
    if (!(await card.isVisible().catch(() => false))) return null;
    const created = ((await card.innerText()).match(/New Chat \(([^)]+)\)/) || [])[1] || null;
    await card.locator('p, div').filter({ hasText: text }).first().click();
    await page.waitForURL(/\/chat\/[0-9a-f-]{20,}/, { timeout: 30_000 }).catch(() => {});
    return /\/chat\/[0-9a-f-]{20,}/.test(page.url()) ? { url: page.url().split('?')[0], created } : null;
}

/** How often `name` is listed on All campaigns (search-filtered). */
async function countListed(page, baseUrl, name) {
    await page.goto(`${baseUrl}/chat/campaign-history`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    const search = page.getByPlaceholder('Search...');
    if (await search.isVisible().catch(() => false)) { await search.fill(name); await page.waitForTimeout(2500); }
    return page.getByRole('button', { name: 'Open menu' }).count();
}

// ── Logic rules (Logics tab) and preview walk-through ───────────────────────────────────────

/** Expands every row with a logic badge and returns { q: number, text, rules: string } per question. */
async function readLogicRules(page) {
    await page.getByRole('button', { name: 'Logics', exact: true }).click();
    await page.waitForTimeout(1500);
    const badges = page.locator('div, span').filter({ hasText: /^\d+ Logics?$/ });
    const n = await badges.count();
    for (let i = 0; i < n; i++) { await badges.nth(i).click({ force: true }).catch(() => {}); await page.waitForTimeout(300); }
    await page.waitForTimeout(1000);
    return page.evaluate(() => {
        const labels = [...document.querySelectorAll('div,span')].filter(e => e.offsetParent && e.children.length === 0 && /^\s*Q\d+\s*$/.test(e.textContent));
        const out = new Map();
        for (const l of labels) {
            let row = l;
            while (row.parentElement && !/border-b/.test(row.className)) row = row.parentElement;
            const q = Number(l.textContent.trim().slice(1));
            if (out.has(q) || !row) continue;
            const t = row.innerText.replace(/\s+/g, ' ').trim();
            const m = t.match(/^Q\d+\s+(.*?)(?:\s+\d+ Logics?)?(?:\s+(End|Skip|Show|Hide|If)\b.*)?$/);
            out.set(q, { q, text: (m && m[1]) || t, rules: (t.match(/\bIf Q\d+.*$/) || [''])[0] });
        }
        return [...out.values()].sort((a, b) => a.q - b.q);
    });
}

/** Terminate rule of a question as parsed from its Logics-tab text ("If Q1 = A<or>B then Terminate Survey"). */
function parseTerminate(rule) {
    const m = rule.match(/If Q(\d+)\s*(=|!=|is|contains)\s*(.*?)\s*then\s*Terminate Survey/i);
    return m ? { q: Number(m[1]), op: m[2], options: m[3].split(/<or>|<and>/i).map(s => s.trim()).filter(Boolean) } : null;
}

/**
 * Opens the in-panel phone preview and taps Start Survey. Returns a controller.
 * The preview renders every question slide at once (off-screen ones included), so everything here
 * works on what is actually ON SCREEN inside the phone frame: an element counts only if it is the
 * top-most element at its own centre (document.elementFromPoint), and clicks go to those coordinates.
 */
async function openPreview(page) {
    await page.getByRole('button', { name: 'Questions', exact: true }).click().catch(() => {});
    await page.getByRole('button', { name: 'Preview survey' }).click();
    await page.getByText('Start Survey').waitFor({ state: 'visible', timeout: 20_000 });
    const total = await page.getByText(/Answer \d+ questions/).first().innerText().then(t => Number(t.match(/\d+/)[0])).catch(() => null);
    await page.getByText('Start Survey').click();
    await page.waitForTimeout(2500);

    // Runs in the page: returns the on-screen leaves inside the phone frame.
    const scan = () => page.evaluate(() => {
        const onTop = e => { const r = e.getBoundingClientRect(); if (!r.width || !r.height) return false; const x = r.left + r.width / 2, y = r.top + r.height / 2; if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false; const hit = document.elementFromPoint(x, y); return !!hit && (hit === e || e.contains(hit) || hit.contains(e)); };
        const counter = [...document.querySelectorAll('div,span,p')].find(e => e.children.length === 0 && /^\d+\/\d+$/.test(e.textContent.trim()) && onTop(e));
        if (!counter) return { counter: null, phone: null, leaves: [] };
        let f = counter;
        while (f.parentElement && f.getBoundingClientRect().height < 480) f = f.parentElement;
        const ph = f.getBoundingClientRect();
        const inPhone = r => r.left >= ph.left - 2 && r.right <= ph.right + 2 && r.top >= ph.top - 2 && r.bottom <= ph.bottom + 2;
        // Off-screen slides are translated outside the phone frame, so "inside the frame" = current slide.
        // onTop records whether the element can actually receive a click (nothing layered over it).
        const leaves = [...f.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent.trim() && inPhone(e.getBoundingClientRect()) && e.getBoundingClientRect().width > 0)
            .map(e => { const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { text: e.textContent.trim(), x: r.left + r.width / 2, y: r.top + r.height / 2, onTop: !!top && (top === e || e.contains(top) || top.contains(e)), blocker: top && !(top === e || e.contains(top) || top.contains(e)) ? `${top.tagName}.${top.className.toString().slice(0, 40)}` : null }; });
        const arrows = [...f.querySelectorAll('button')].filter(b => onTop(b) && inPhone(b.getBoundingClientRect()))
            .map(b => { const r = b.getBoundingClientRect(); return { label: b.getAttribute('aria-label') || b.innerText.trim(), x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
        return { counter: counter.textContent.trim(), phone: { left: ph.left, right: ph.right, top: ph.top, bottom: ph.bottom }, leaves, arrows };
    });

    const META = /^(\d+\/\d+|Pick (one|all that apply|up to \d+)|Select (one|all that apply)|More options|\d{1,2}:\d{2})$/i;
    const state = async () => {
        const s = await scan();
        const text = s.leaves.map(l => l.text).join(' ');
        const notEligible = await page.getByText(/not Eligible for this Survey/i).filter({ visible: true }).count() > 0;
        return { counter: s.counter, n: s.counter ? Number(s.counter.split('/')[0]) : null, of: s.counter ? Number(s.counter.split('/')[1]) : null, notEligible, text: text.slice(0, 400) };
    };
    const options = async () => {
        const s = await scan();
        if (!s.counter) return [];
        // Options sit below the question text; the question title is the first long leaf.
        const titleIdx = s.leaves.findIndex(l => !META.test(l.text) && l.text.length > 12);
        return s.leaves.slice(titleIdx + 1).map(l => l.text).filter(t => !META.test(t));
    };
    /** Tap the "More options" hint if shown: while it is, a transparent layer blocks every answer. */
    const dismissHint = async () => {
        const s = await scan();
        const hint = s.leaves.find(l => /^More options$/i.test(l.text));
        if (!hint) return false;
        await page.mouse.click(hint.x, hint.y);
        await page.waitForTimeout(1200);
        return true;
    };
    const pick = async optionText => {
        let s = await scan();
        const first = s.leaves.find(l => l.text === optionText);
        if (first && !first.onTop && await dismissHint()) s = await scan();
        const hit = s.leaves.find(l => l.text === optionText) || s.leaves.find(l => l.text.toLowerCase() === optionText.toLowerCase());
        if (!hit) throw new Error(`preview option "${optionText}" not on screen (have: ${s.leaves.map(l => l.text).join(' | ').slice(0, 200)})`);
        await page.mouse.click(hit.x, hit.y);
        await page.waitForTimeout(600);
        return { clickable: hit.onTop, blocker: hit.blocker };
    };
    /** Whether the current slide's answers can receive clicks (nothing layered over them). */
    const answersClickable = async () => {
        const s = await scan();
        const titleIdx = s.leaves.findIndex(l => !META.test(l.text) && l.text.length > 12);
        const opts = s.leaves.slice(titleIdx + 1).filter(l => !META.test(l.text));
        return { clickable: opts.length > 0 && opts.every(o => o.onTop), blocker: (opts.find(o => !o.onTop) || {}).blocker || null, count: opts.length };
    };
    const next = async () => {
        const s = await scan();
        const btn = s.arrows.find(a => /next/i.test(a.label)) || s.arrows.sort((a, b) => b.x - a.x)[0];
        if (!btn) throw new Error('preview Next arrow not on screen');
        await page.mouse.click(btn.x, btn.y);
        await page.waitForTimeout(2500);
    };
    return { total, state, pick, options, next, answersClickable, dismissHint };
}

module.exports = {
    ask, askAndResolve, isClarification, surveyState, readAudience,
    renameCampaign, duplicateCampaign, deleteCampaign, campaignHistory, occurrences, promptBox,
    editAudienceModal, readWallet, shareLink, openLoggedOut, allCampaignsAction, sidebarAction, countListed,
    readLogicRules, parseTerminate, openPreview, findCampaignByText, menuAction,
};
