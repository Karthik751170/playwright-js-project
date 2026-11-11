/**
 * dev.hercules.works → dev.superj.app flow for the Doc 1 design-payload test.
 * Reuses the monitor's wizard driver (tests/monitor/lib/create.js) and survey-panel readers
 * (tests/monitor/lib/hercules.js); adds uploads, network capture and payload key search.
 */
const fs = require('fs');
const path = require('path');
const { wizardDriver } = require('../../monitor/lib/create');
const H = require('../../monitor/lib/hercules');

const FIXTURES = path.resolve(__dirname, '../../../fixtures/devdesigns');

/** Records every JSON / event-stream response from Hercules and Super J hosts. */
function captureNetwork(page, sink) {
    page.on('response', async r => {
        const u = r.url();
        if (!/hercules|superj/i.test(u) || /\.(js|css|png|svg|woff2?|jpe?g|webp|mp4|ico)(\?|$)/i.test(u)) return;
        const ct = r.headers()['content-type'] || '';
        if (!/json|event-stream|text\/plain/.test(ct)) return;
        const body = await r.text().catch(() => '');
        sink.push({ at: new Date().toISOString(), method: r.request().method(), url: u, status: r.status(), body: body.slice(0, 2_000_000) });
    });
}

/** Every JSON object key found in the captured bodies (event streams parsed line by line). */
function keysIn(entries) {
    const keys = new Map(); // key -> first url it was seen in
    const walk = (v, url, depth = 0) => {
        if (!v || typeof v !== 'object' || depth > 40) return;
        if (Array.isArray(v)) { for (const x of v) walk(x, url, depth + 1); return; }
        for (const [k, x] of Object.entries(v)) {
            if (!keys.has(k)) keys.set(k, url);
            if (typeof x === 'string' && /^[[{]/.test(x.trim())) { try { walk(JSON.parse(x), url, depth + 1); } catch { /* not JSON */ } }
            walk(x, url, depth + 1);
        }
    };
    for (const e of entries) {
        const tryParse = s => { try { return JSON.parse(s); } catch { return null; } };
        const whole = tryParse(e.body);
        if (whole) { walk(whole, e.url); continue; }
        for (const line of e.body.split('\n')) {
            const j = tryParse(line.replace(/^data:\s*/, '').trim());
            if (j) walk(j, e.url);
        }
    }
    return keys;
}

/** Sends the design prompt from /ai, attaching its stimulus files first. Returns the chat URL. */
async function sendPrompt(page, baseUrl, prompt, uploads, log) {
    await page.goto(`${baseUrl}/ai`, { waitUntil: 'domcontentloaded' });
    const box = H.promptBox(page);
    await box.waitFor({ state: 'visible', timeout: 60_000 });
    await page.waitForTimeout(3000);
    if (uploads.length) {
        await page.locator('input[type=file]').first().setInputFiles(uploads.map(f => path.join(FIXTURES, f)));
        log(`attached ${uploads.join(', ')}`);
        // Wait for the uploads to finish (send button enabled / thumbnails rendered).
        await page.waitForTimeout(8000 + uploads.length * 3000);
    }
    for (let i = 0; i < 3 && (await box.inputValue()) !== prompt; i++) { await box.click(); await box.fill(prompt); await page.waitForTimeout(800); }
    const send = page.getByRole('button', { name: 'Send' }).or(page.locator('button[aria-label="submit button"]')).first();
    for (let i = 0; i < 20 && !(await send.isEnabled().catch(() => false)); i++) await page.waitForTimeout(3000);
    await send.click();
    const opened = await page.waitForURL(/\/chat\/[^/?]+/, { timeout: 180_000 }).then(() => true).catch(() => false);
    if (!opened) { await box.press('Enter').catch(() => {}); await page.waitForURL(/\/chat\/[^/?]+/, { timeout: 120_000 }); }
    return page.url();
}

/** Drives clarifications → brief → "create the survey" → In-drafts card. */
async function briefAndCreate(page, context, { briefMinutes = 25, createMinutes = 20 } = {}) {
    const w = wizardDriver(page);
    const r = await w.driveToCreate(0, briefMinutes * 60_000, context);
    const brief = await page.locator('body').innerText();
    if (!r.ok) return { briefOk: false, created: false, wizard: r, brief };
    await w.createBtn.last().scrollIntoViewIfNeeded().catch(() => {});
    await w.createBtn.last().click();
    const t0 = Date.now();
    const card = page.getByText(/Survey is In-drafts/i).last();
    let created = await card.waitFor({ state: 'visible', timeout: createMinutes * 60_000 }).then(() => true).catch(() => false);
    if (!created) { await page.reload().catch(() => {}); created = await card.waitFor({ state: 'visible', timeout: 90_000 }).then(() => true).catch(() => false); }
    await page.waitForTimeout(6000);
    return { briefOk: true, created, wizard: r, brief, createMinutes: Math.round((Date.now() - t0) / 6000) / 10 };
}

/**
 * Deploy with the account's free balance only ("Deploy to N", never "Pay and Deploy" / "Buy"),
 * then Launch Survey, and return the Super J survey link shown after launch.
 */
async function deployFree(page, log) {
    await page.getByRole('button', { name: 'Deploy', exact: true }).last().click();
    await page.waitForTimeout(5000);
    const modal = await page.evaluate(() => [...document.querySelectorAll('div.fixed,[role=dialog]')].filter(e => e.offsetParent && e.innerText.trim()).map(e => e.innerText.replace(/\s+/g, ' ')).join(' ').slice(0, 600));
    const free = page.getByRole('button', { name: /^Deploy to \d+$/ }).first();
    if (await free.isVisible().catch(() => false)) {
        log(`deploy dialog: ${modal.slice(0, 160)} → "${await free.innerText()}"`);
        await free.click();
    } else {
        const paid = await page.getByRole('button', { name: /Pay|Buy/i }).first().isVisible().catch(() => false);
        if (paid) throw new Error(`only a paid deploy is offered (${modal.slice(0, 200)}); not pressing it`);
    }
    await page.waitForTimeout(8000);
    const launch = page.getByRole('button', { name: /^Launch Survey$/ }).last();
    await launch.waitFor({ state: 'visible', timeout: 60_000 });
    await launch.click();
    await page.waitForTimeout(8000);
    const text = await page.locator('body').innerText();
    const links = [...new Set(text.match(/https?:\/\/[\w.-]*superj\.app\/survey\/[A-Za-z0-9]+/g) || [])];
    const hrefs = await page.locator('a[href*="superj.app"]').evaluateAll(es => es.map(e => e.href)).catch(() => []);
    return { modal, link: links.pop() || hrefs.find(h => /\/survey\//.test(h)) || null };
}

/** Latest Super J payload preview Hercules fetched for this chat (GET …/versions/N/preview). */
function latestPreview(net) {
    const hits = net.filter(e => /\/api\/chats\/[^/]+\/versions\/\d+\/preview/.test(e.url) && e.status === 200);
    for (const e of hits.reverse()) { try { const j = JSON.parse(e.body); if (j && j.data && j.data.preview_payloads) return { url: e.url, data: j.data }; } catch { /* next */ } }
    return null;
}

/** All keys and all string values found anywhere in an object. */
function keysAndValues(obj) {
    const keys = new Set(), values = new Set();
    const walk = (v, d = 0) => {
        if (d > 40 || v == null) return;
        if (typeof v === 'string') { values.add(v); return; }
        if (typeof v !== 'object') return;
        if (Array.isArray(v)) { v.forEach(x => walk(x, d + 1)); return; }
        for (const [k, x] of Object.entries(v)) { keys.add(k); walk(x, d + 1); }
    };
    walk(obj);
    return { keys, values };
}

module.exports = { captureNetwork, keysIn, sendPrompt, briefAndCreate, deployFree, latestPreview, keysAndValues, FIXTURES, H };
