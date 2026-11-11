const { test } = require('@playwright/test');
const path = require('path');
const H = require('./lib/hercules');
const { createHarness } = require('./lib/harness');
const { loginAndBrief, createSurvey, cleanup } = require('./lib/create');
const E = require('../../config/hourlyMonitorExpectations');

/**
 * CORE group — create a survey, edit its audience, check versions and the wallet.
 *   brief → Edit Audience modal (user count, +city, −city, gender, age, attribute) → updated brief
 *   → create → audience page matches the edits → ask Hercules: add a question (Survey Version must
 *   go up), pan-India, change cities, change sample size → wallet unchanged (no deploy yet).
 */
const BASE_URL = process.env.HERCULES_URL || 'https://hercules.works';
const OUT = path.join(process.env.MONITOR_OUT_DIR || 'reports/monitor/local', 'core');
const REPLY_MS = E.chat.replyTimeoutMinutes * 60_000;

test('core: create, edit audience, versions, wallet', async ({ page }) => {
    test.setTimeout((E.run.maxMinutes + 6) * 60_000);
    const h = createHarness(page, { group: 'core', outDir: OUT, budgetMin: E.run.maxMinutes });
    let chatUrl = null;
    try {
        const b = await loginAndBrief(page, h, { baseUrl: BASE_URL, expect: E, outDir: OUT });
        chatUrl = b.chatUrl;
        if (!b.briefOk) return;

        const walletStart = await h.scenario('wallet before', async () => {
            const back = page.url();
            const w = await H.readWallet(page, BASE_URL);
            h.result.facts.walletStart = w;
            h.expectTest('wallet balance readable', w != null, w);
            await page.goto(back, { waitUntil: 'domcontentloaded' });
            await H.promptBox(page).waitFor({ state: 'visible', timeout: 60_000 });
            await page.waitForTimeout(8000);
            return w;
        });

        // ── Edit Audience on the brief ──
        let applied = null;
        if (E.editAudienceOnBrief.enabled) {
            await h.scenario('edit audience on brief', async () => {
                const btn = page.getByRole('button', { name: 'Edit Audience' }).last();
                if (!h.expectProduct('"Edit Audience" offered on the brief', await btn.isVisible().catch(() => false), '', 'warn')) return;
                const before = await b.wizard.createBtn.count();
                await btn.scrollIntoViewIfNeeded().catch(() => {});
                await btn.click({ force: true });
                const r = await H.editAudienceModal(page, { addCity: E.editAudienceOnBrief.addCity });
                applied = r.applied;
                h.result.facts.audienceEdits = applied;
                await h.shot('edit-audience-done');
                h.expectProduct('Edit Audience: Confirm enabled after edits', r.confirmEnabled, JSON.stringify(applied));
                if (!r.confirmEnabled) { await page.getByRole('button', { name: 'Cancel' }).last().click().catch(() => {}); return; }
                const w = await b.wizard.driveToCreate(before, E.editAudienceOnBrief.maxMinutesForUpdatedBrief * 60_000, b.context);
                await h.shot('brief-after-audience-edit');
                if (!h.expectProduct('updated brief after Edit Audience', w.ok, w.ok ? `${w.steps} steps` : `no new "create the survey" in ${E.editAudienceOnBrief.maxMinutesForUpdatedBrief} min`)) return;
                const t = await page.locator('body').innerText();
                const latest = t.slice(t.lastIndexOf('Research Brief'));
                const fmt = n => [String(n), Number(n).toLocaleString('en-IN'), Number(n).toLocaleString('en-US')];
                h.expectProduct('updated brief shows new user count', fmt(applied.userCount).some(s => latest.includes(s)), applied.userCount);
                if (applied.cityAdded) h.expectProduct('updated brief includes added city', latest.includes(applied.cityAdded), applied.cityAdded, 'warn');
                if (applied.cityRemoved) h.expectProduct('updated brief drops removed city', !latest.includes(applied.cityRemoved), applied.cityRemoved, 'warn');
            }, { needsMinutes: 15 });
        }

        if (!(await createSurvey(page, h, { expect: E, outDir: OUT }))) return;

        // ── Audience page vs edits / brief ──
        await h.scenario('audience page', async () => {
            const a = await H.readAudience(page);
            h.result.facts.audiencePage = a;
            if (!h.expectProduct('View Audience opens the audience page', a.found, a.url || 'button missing')) return;
            const expected = applied?.userCount || b.audience?.totalSampleSize;
            if (expected) h.expectProduct('audience count matches brief/edit', a.count === expected, `page ${a.count}, expected ${expected}${applied ? ' (edited)' : ''}`);
            // "Send it to anyone on SuperJ" is a toggle for deploying pan-India (by design), so it is
            // recorded for reference, not judged.
            h.result.facts.sendToAnyoneToggleShown = a.sendToAnyone;
            if (applied?.cityAdded) h.expectProduct('audience page shows added city', a.text.includes(applied.cityAdded), applied.cityAdded, 'warn');
        });

        // ── Survey versions: a real survey change must bump the version ──
        const converse = async (id, text, opts) => {
            const r = await H.askAndResolve(page, text, { timeoutMs: REPLY_MS, ...opts });
            h.result.conversations.push({ id, prompt: text, turns: r.turns.map(t => ({ prompt: t.prompt, reply: (t.reply || '').slice(0, 2500), seconds: t.seconds })) });
            await h.shot(`chat-${id}`);
            h.expectProduct(`reply received (${id})`, !!r.finalReply && !r.timedOut, r.timedOut ? `no complete reply in ${E.chat.replyTimeoutMinutes} min` : `${r.turns.length} turn(s)`);
            return r;
        };

        await h.scenario('survey version after adding a question', async () => {
            const before = await H.surveyState(page);
            const pv0 = await H.openPreview(page).then(p => p.total).catch(() => null);
            await page.keyboard.press('Escape').catch(() => {});
            await page.goto(chatUrl, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(8000);
            await converse('add-question', 'Add one final question: "How likely are you to recommend this to a friend?" on a 0-10 scale. Keep every other question and rule unchanged.');
            const after = await H.surveyState(page);
            const pv1 = await H.openPreview(page).then(p => p.total).catch(() => null);
            await page.goto(chatUrl, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(8000);
            h.result.facts.versions = { surveyBefore: before.surveyVersion, surveyAfter: after.surveyVersion, previewTotalBefore: pv0, previewTotalAfter: pv1 };
            h.expectProduct('Survey Version increments after edit', (after.surveyVersion ?? 0) > (before.surveyVersion ?? 0), `v${before.surveyVersion} → v${after.surveyVersion}`);
            if (pv0 && pv1) h.expectProduct('question added (preview total +1)', pv1 === pv0 + 1, `${pv0} → ${pv1}`);
        }, { needsMinutes: E.chat.replyTimeoutMinutes + 3 });

        if (E.chat.panIndia) await h.scenario('ask: pan-India', async () => {
            const r = await converse('pan-india', 'Make this survey pan-India: target respondents across all states and cities of India instead of only the current locations. Update the audience and anything in the survey that mentions specific cities.');
            h.expectProduct('pan-India confirmed in reply', /pan[- ]?india|all (states|of india)|across india|nationwide/i.test(r.reply), r.finalReply.slice(0, 200));
            const a = await H.readAudience(page);
            h.result.facts.audienceAfterPanIndia = a;
            h.result.facts.audienceTextAfterPanIndia = a.text.slice(0, 300);
        }, { needsMinutes: E.chat.replyTimeoutMinutes + 3 });

        if (E.chat.changeLocations) await h.scenario('ask: change locations', async () => {
            const cities = E.chat.newCities;
            const r = await converse('locations', `Change the target locations to only ${cities.join(' and ')}. Remove every other city or state from the audience.`);
            const named = cities.filter(c => new RegExp(c, 'i').test(r.reply));
            h.expectProduct('new locations confirmed in reply', named.length === cities.length, `reply names ${named.join(', ') || 'none'}`);
            const a = await H.readAudience(page);
            h.result.facts.audienceAfterLocations = a;
            const onPage = cities.filter(c => a.text?.includes(c));
            h.expectProduct('audience page shows the new locations', onPage.length === cities.length, `${onPage.join(', ') || 'none'} shown`, 'warn');
        }, { needsMinutes: E.chat.replyTimeoutMinutes + 3 });

        if (E.chat.changeSampleSize) await h.scenario('ask: change sample size', async () => {
            const n = E.chat.newSampleSize;
            await converse('sample-size', `Change the sample size to ${n} respondents and the age range to 25-45. Keep everything else the same.`);
            const a = await H.readAudience(page);
            h.result.facts.audienceAfterSampleSize = a;
            h.expectProduct('audience count updated by chat', a.count === n, `page ${a.count}, asked ${n}`);
        }, { needsMinutes: E.chat.replyTimeoutMinutes + 3 });

        // ── Wallet: no deploy yet, so creating/editing a draft must not change the balance ──
        await h.scenario('wallet after', async () => {
            const w = await H.readWallet(page, BASE_URL);
            h.result.facts.walletEnd = w;
            if (walletStart != null && w != null) h.expectProduct('wallet unchanged by draft work (no deploy)', w === walletStart, `${walletStart} → ${w}`, 'warn');
            if (E.deploy.enabled) h.skip('deploy + wallet deduction', 'deploy step not implemented yet');
            else h.skip('deploy + wallet deduction', 'deploy disabled until confirmed (config deploy.enabled=false)');
        });
    } finally {
        await cleanup(page, h, chatUrl, E);
        h.finish();
    }
});
