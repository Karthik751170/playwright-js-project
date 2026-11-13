/**
 * Shared "login → prompt → wizard → research brief → create the survey" flow for every monitor
 * group. Adapted from tests/Hercules_AiSurveyCreate_Recorded.spec.js + HerculesSurveyGenerator.
 */
const fs = require('fs');
const path = require('path');
const HerculesSurveyGenerator = require('../../../pages/hercules/HerculesSurveyGenerator');
const { parseTargetAudience, audienceConsistencyIssues } = require('../../../utils/HerculesBriefParser');
const { generateTopic } = require('../../../utils/HerculesTopicGenerator');
const { ensureSignedIn } = require('../../../utils/HerculesEmailAuth');
const H = require('./hercules');

/** Polls fn() until truthy or timeout; returns the final boolean. */
async function expectPoll(fn, timeoutMs) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) { if (await fn()) return true; await new Promise(r => setTimeout(r, 1000)); }
    return !!(await fn());
}

function wizardDriver(page) {
    const gen = new HerculesSurveyGenerator(page);
    const createBtn = page.getByRole('button', { name: /create the survey/i });
    const runVersionBtn = page.getByRole('button', { name: /^Run (your version|it this way|the self-serve version)$/i }).last();
    const versionCard = page.locator('.bg-white.rounded-\\[12px\\].border').last();
    // Option cards ("Hard-to-find audience"): "Run the self-serve version … Select" vs "Book a consult".
    // "Select" is a <span>; prefer the self-serve row and never click "Book a consult".
    const selectOption = page.locator('div, li').filter({ hasText: /self-serve/i }).getByText('Select', { exact: true }).last()
        .or(page.getByText('Select', { exact: true }).last());

    /** Drive the wizard until a NEW "create the survey" button appears (count > minCount). */
    async function driveToCreate(minCount, limitMs, context) {
        const until = Date.now() + limitMs;
        let steps = 0;
        const seen = [];
        while (Date.now() < until) {
            if ((await createBtn.count()) > minCount && await createBtn.last().isVisible().catch(() => false)) return { ok: true, steps, seen };
            let acted = null;
            if (await runVersionBtn.isVisible().catch(() => false)) {
                if (!(await runVersionBtn.isEnabled().catch(() => false))) await versionCard.click().catch(() => {});
                await runVersionBtn.click().catch(() => {});
                acted = 'run-version';
            } else if (await gen.clickGenerateBrief()) acted = 'generate-brief';
            else if (await selectOption.first().isVisible().catch(() => false)) {
                await selectOption.first().click({ force: true }).catch(() => {});
                acted = 'select-self-serve';
            } else if (await gen.handleSelectAllThatApply(context).catch(() => false)) acted = 'multi-select';
            else if (await gen.handleSingleSelect(context).catch(() => false)) acted = 'single-select';
            else if (await gen.handleTextInputFallback(context).catch(() => false)) acted = 'text';
            if (acted) { steps++; seen.push(acted); }
            await page.waitForTimeout(acted ? 2500 : 10_000);
        }
        return { ok: false, steps, seen };
    }
    return { createBtn, driveToCreate };
}

/**
 * Logs in, sends a random-topic prompt, drives the wizard to the brief and (unless
 * `stopAtBrief`) creates the survey. Records checks through the harness `h`.
 * Returns { chatUrl, audience, topic, created, wizard }.
 */
async function loginAndBrief(page, h, { baseUrl, expect: E, outDir }) {
    // baseUrl is used for the fresh dashboard load before sending the prompt.
    const out = { chatUrl: null, audience: null, topic: null };
    const auth = await h.scenario('login', async () => {
        const a = await ensureSignedIn(page, { baseUrl });
        h.expectTest('login', true, a.method);
        return a;
    });
    if (!auth) return out;

    const topic = generateTopic({ seed: Date.now() + Math.floor(Math.random() * 1e6) });
    out.topic = topic;
    const prompt = `QA-MONITOR-${h.result.group}-${Date.now()} ${topic.prompt}`;
    const context = [topic.product && `We are launching ${topic.product}`, topic.geography && `across ${topic.geography}`]
        .filter(Boolean).join(' ') || 'We are launching across all tier 1, tier 2 and metro cities in India.';
    h.result.facts.prompt = prompt;
    out.wizard = wizardDriver(page);
    out.context = context;

    // Groups run in parallel on the same account; stagger their prompts so they don't collide.
    const stagger = { core: 0, logic: 90, manage: 180 }[h.result.group] || 0;
    if (stagger && !process.env.MONITOR_NO_STAGGER) await page.waitForTimeout(stagger * 1000);

    const ok = await h.scenario('research brief', async () => {
        // Fresh dashboard right before sending (after the stagger wait it may have re-rendered),
        // type the prompt, and make sure it is really in the box before sending.
        await page.goto(`${baseUrl}/ai`, { waitUntil: 'domcontentloaded' });
        const box = H.promptBox(page);
        await box.waitFor({ state: 'visible', timeout: 60_000 });
        await page.waitForTimeout(3000);
        // Playwright fill() fires real input events, which the page's state picks up. (Setting the
        // value directly only changes what's displayed: Send then does nothing.)
        for (let i = 0; i < 3 && (await box.inputValue()) !== prompt; i++) {
            await box.click();
            await box.fill(prompt);
            await page.waitForTimeout(800);
        }
        if (!h.expectTest('prompt entered', (await box.inputValue()) === prompt, 'prompt box value')) { await h.shot('prompt-not-entered'); return false; }

        // Capture the network call(s) that carry the prompt, as evidence for "chat didn't open".
        const marker = prompt.slice(0, 30);
        const sent = [];
        const onRequest = req => {
            const body = req.postData() || '';
            if (req.method() !== 'GET' && body.includes(marker)) sent.push({ req, at: new Date().toISOString(), url: req.url(), method: req.method(), body: body.slice(0, 1500) });
        };
        page.on('request', onRequest);
        const send = page.getByRole('button', { name: 'Send' }).or(page.locator('button[aria-label="submit button"]')).first();
        await send.click();
        // Confirm the send registered: the box clears or the page moves. Retry once with Enter.
        const left = async () => (await box.inputValue().catch(() => '')) !== prompt || !/\/ai\/?$/.test(new URL(page.url()).pathname);
        let sentOk = await expectPoll(left, 15_000);
        if (!sentOk) { await box.press('Enter').catch(() => {}); sentOk = await expectPoll(left, 15_000); }
        h.result.facts.sendRegistered = sentOk;
        const opened = await page.waitForURL(/\/(ai\/)?chat\/[^/?]+/, { timeout: 120_000 }).then(() => true).catch(() => false);
        out.chatUrl = page.url();
        h.result.facts.chatUrl = out.chatUrl;
        page.off('request', onRequest);
        const calls = [];
        for (const c of sent) {
            const res = await c.req.response().catch(() => null);
            calls.push({ at: c.at, method: c.method, url: c.url, requestBody: c.body, status: res ? res.status() : 'no response', responseStart: res ? (await res.text().catch(() => '')).slice(0, 800) : null });
        }
        h.result.facts.promptNetwork = calls;
        fs.writeFileSync(path.join(outDir, 'prompt-network.json'), JSON.stringify(calls, null, 2));
        // Hercules answers over an event stream; a "final" event with exhausted:true means the
        // account's daily AI token limit is used up (seen 2026-11-06 on the monitor account).
        const limit = calls.map(c => (String(c.responseStart).match(/"message":"([^"]*limit[^"]*)"[^}]*"exhausted":true/i) || [])[1]).find(Boolean);
        if (limit) {
            h.result.facts.dailyLimit = limit;
            await h.shot('daily-limit');
            h.expectTest('account has AI quota left', false, `Hercules: "${limit}" — the monitor account's daily token limit is used up, so no survey can be created until it resets`);
            const shown = await page.getByText(/token limit|upgrade your plan|wait till tomorrow/i).first().isVisible().catch(() => false);
            h.expectProduct('daily limit message shown to the user', shown, shown ? 'shown' : 'the page shows only the prompt bubble: no reply, no limit message (user waits with no explanation)');
            return false;
        }
        if (!opened) {
            await h.shot('chat-did-not-open');
            const why = !calls.length ? 'prompt was never sent (no request carried it)'
                : calls.some(c => typeof c.status === 'number' && c.status >= 400) ? `Hercules rejected it: ${calls.map(c => `${c.method} ${c.url} → ${c.status}`).join('; ')}`
                : `sent and accepted (${calls.map(c => c.status).join(', ')}) but no chat opened`;
            h.result.facts.chatOpenDiagnosis = why;
        }
        if (!opened) {
            // The prompt may have reached Hercules even though this page never opened the chat
            // (seen 2026-11-06: campaign 60fff276 was created and worked on). Look it up by its
            // prompt marker in All campaigns — Hercules' own record, not a screenshot.
            const found = await H.findCampaignByText(page, baseUrl, prompt.slice(0, 40));
            h.result.facts.chatCreatedServerSide = found;
            if (found) {
                h.expectProduct('chat opens after prompt', false, `prompt reached Hercules (campaign ${found.url}, created at ${found.created || '?'}) but the page stayed on ${out.chatUrl} and never opened it; network: ${h.result.facts.chatOpenDiagnosis}`);
                out.chatUrl = found.url;
                h.result.facts.chatUrl = found.url;
                await page.goto(found.url, { waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(8000);
            } else if (!calls.length) {
                h.expectTest('chat opens after prompt', false, `${out.chatUrl} — prompt not found in All campaigns and no request carried it: never sent`);
                return false;
            } else {
                h.expectProduct('chat opens after prompt', false, `${out.chatUrl} — ${h.result.facts.chatOpenDiagnosis}; no campaign found (payload in prompt-network.json)`);
                return false;
            }
        } else h.expectProduct('chat opens after prompt', true, out.chatUrl);

        const tB = Date.now();
        const r = await out.wizard.driveToCreate(0, E.brief.maxMinutes * 60_000, context);
        h.result.facts.wizard = { steps: r.steps, actions: r.seen, minutes: h.mins(Date.now() - tB) };
        await h.shot('research-brief');
        if (!h.expectProduct('brief leads to "create the survey"', r.ok,
            r.ok ? `${r.steps} steps (${r.seen.join(', ')}), ${h.mins(Date.now() - tB)} min`
                : `no "create the survey" within ${E.brief.maxMinutes} min after ${r.steps} steps (${r.seen.join(', ')})`)) return false;
        h.expectProduct('wizard step count', r.steps <= E.brief.maxWizardSteps, `${r.steps} (max ${E.brief.maxWizardSteps})`, 'warn');

        const briefText = await page.locator('body').innerText();
        fs.writeFileSync(path.join(outDir, 'brief.txt'), briefText);
        out.audience = parseTargetAudience(briefText);
        h.result.facts.briefAudience = out.audience && { ...out.audience, raw: undefined };
        h.expectProduct('brief has Target Audience', !!out.audience, out.audience ? `sample ${out.audience.totalSampleSize}, geo ${out.audience.geographicFocus.join(' / ')}` : 'section not found');
        for (const issue of out.audience ? audienceConsistencyIssues(out.audience) : []) {
            h.expectProduct('Target Audience consistency', false, issue, E.brief.failOnAudienceInconsistency ? 'fail' : 'warn');
        }
        return true;
    }, { needsMinutes: 10 });
    out.briefOk = !!ok;
    return out;
}

/** Click the latest "create the survey" and wait for the In-drafts card. */
async function createSurvey(page, h, { expect: E, outDir }) {
    return h.scenario('survey created', async () => {
        const btn = page.getByRole('button', { name: /create the survey/i }).last();
        await btn.scrollIntoViewIfNeeded();
        await btn.click();
        const tC = Date.now();
        const wait = Math.max(1000, Math.min(h.left(), E.survey.maxMinutesAfterCreate * 60_000));
        const card = page.getByText(/Survey is In-drafts/i).last();
        let ok = await Promise.race([
            card.waitFor({ state: 'visible', timeout: wait }),
            page.waitForURL(/\/editor\//, { timeout: wait }),
        ]).then(() => true).catch(() => false);
        let afterReload = false;
        if (!ok) {
            await page.reload().catch(() => {});
            ok = afterReload = await card.waitFor({ state: 'visible', timeout: 60_000 }).then(() => true).catch(() => false);
        }
        h.result.facts.createMinutes = h.mins(Date.now() - tC);
        await h.shot(ok ? 'survey-created' : 'no-response-after-create');
        if (!h.expectProduct('survey created after brief', ok, ok ? `${h.result.facts.createMinutes} min` : `nothing within ${E.survey.maxMinutesAfterCreate} min + reload`)) return false;
        if (afterReload) h.expectProduct('survey shows without reload', false, 'only appeared after a page reload', E.survey.failIfOnlyVisibleAfterReload ? 'fail' : 'warn');
        if (E.survey.requireDeployButton) h.expectProduct('Deploy button on survey card', await page.getByRole('button', { name: /^Deploy/ }).last().isVisible().catch(() => false));
        await page.waitForTimeout(5000);
        fs.writeFileSync(path.join(outDir, 'survey.txt'), await page.locator('body').innerText());
        return true;
    }, { needsMinutes: 6 });
}

/** Delete the campaign when everything passed; keep it (and say so) otherwise. */
async function cleanup(page, h, chatUrl, E) {
    const failed = h.result.checks.some(c => c.status === 'FAIL');
    if (!chatUrl) return;
    if (!E.campaign.deleteOriginalIfAllPassed || failed) { h.result.facts.keptForDebugging = chatUrl; return; }
    try {
        await page.goto(chatUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(8000);
        await H.deleteCampaign(page);
        h.expectTest('cleanup: campaign deleted', true, chatUrl);
    } catch (e) {
        h.expectTest('cleanup: campaign deleted', false, e.message.split('\n')[0], 'warn');
    }
}

module.exports = { loginAndBrief, createSurvey, cleanup, wizardDriver };
