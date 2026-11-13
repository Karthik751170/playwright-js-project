const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./lib/hercules');
const { createHarness } = require('./lib/harness');
const { ensureSignedIn } = require('../../utils/HerculesEmailAuth');
const E = require('../../config/hourlyMonitorExpectations');

/**
 * QUICK QUESTION group — /quick-question, every path, never launched.
 *
 * Step 1 "What do you want to ask?": empty / whitespace / 180-char limit; Yes-No, Multiple choice
 * (2–7 options, remove, 500-char option limit, duplicates), Rating 1-5; Hercules' wording check
 * (POST /api/survey/validate-quick-question → can_proceed + reason) for leading, double-barrelled,
 * gibberish, script-tag and Hindi questions — and whether the page SHOWS the reason to the user.
 * Step 2 "Who should we ask?": question + type carried over, audience sizes, Custom size,
 * Everyone in India, filters, Back, Use chat instead. "Launch to N Consumers" is NEVER pressed
 * (it sends to real consumers and spends credits).
 * Each Continue creates a draft quick question (a chat with a 1-question survey): it is checked,
 * then renamed, duplicated and deleted from the H icon, the sidebar and All campaigns.
 */
const BASE_URL = process.env.HERCULES_URL || 'https://hercules.works';
const OUT = path.join(process.env.MONITOR_OUT_DIR || 'reports/monitor/local', 'quickq');
const QQ = `${BASE_URL}/quick-question`;

test('quick question: validation, types, wording checks, step 2, rename / duplicate / delete', async ({ page }) => {
    test.setTimeout((E.run.maxMinutes + 6) * 60_000);
    const h = createHarness(page, { group: 'quickq', outDir: OUT, budgetMin: E.run.maxMinutes });
    const drafts = []; // chat URLs of drafts created by Continue, deleted at the end
    let dialogFired = null;
    page.on('dialog', async d => { dialogFired = d.message(); await d.dismiss().catch(() => {}); });

    // Every Continue calls the wording check; keep the latest verdict.
    let lastValidation = null;
    page.on('response', async r => {
        if (r.url().includes('/validate-quick-question') && r.request().method() === 'POST') {
            try { lastValidation = { request: JSON.parse(r.request().postData() || '{}'), ...(await r.json()).data }; } catch { lastValidation = { error: 'unreadable' }; }
        }
        if (r.url().includes('/workspace/quick-survey') && r.request().method() === 'POST') {
            try { const d = (await r.json()).data; if (d?.chat_id) drafts.push(`${BASE_URL}/chat/${d.chat_id}`); } catch { /* ignore */ }
        }
    });

    const box = () => page.locator('textarea').first();
    const cont = () => page.getByRole('button', { name: 'Continue' });
    const type = name => page.getByText(name, { exact: true }).first();
    const onStep2 = async () => /Step 2 of 2|Who should we ask\?/.test(await page.locator('body').innerText());
    const fresh = async () => { await page.goto(QQ, { waitUntil: 'domcontentloaded' }); await box().waitFor({ state: 'visible', timeout: 60_000 }); await page.waitForTimeout(2000); };
    /** Press Continue and wait for step 2 or the wording verdict. */
    const submit = async (waitMs = 45_000) => {
        lastValidation = null;
        await cont().click({ force: true });
        const until = Date.now() + waitMs;
        while (Date.now() < until) {
            if (await onStep2()) return { moved: true, validation: lastValidation };
            if (lastValidation && lastValidation.can_proceed === false) { await page.waitForTimeout(4000); return { moved: await onStep2(), validation: lastValidation }; }
            await page.waitForTimeout(1500);
        }
        return { moved: await onStep2(), validation: lastValidation };
    };
    /** Is the server's reason (or any flag message) visible on the page? */
    // Only Hercules' own words count (step 1's fixed help text already says "leading" and
    // "double-barrelled", so generic keywords would always match).
    const reasonShown = async v => {
        const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
        const head = (v?.reason || '').replace(/\s+/g, ' ').slice(0, 40);
        return (!!head && text.includes(head)) || text.includes('Question needs changes');
    };
    /** A wording case: expect the server to flag it AND the page to tell the user why. */
    // Plain-language verdict for the report (never raw field names).
    const verdict = v => v.can_proceed === false
        ? `Hercules flagged it: "${v.reason || 'no reason given'}"`
        : `Hercules accepted it without a flag${v.reason ? `: "${v.reason}"` : ''}`;
    const wordingCase = async (name, question, { expectFlag = true, severity = 'fail', responseType = 'Yes / No' } = {}) => h.scenario(name, async () => {
        await fresh();
        // Pick the response type the question is written for (step 1 opens on Yes / No).
        if (responseType !== 'Yes / No') await type(responseType).click({ force: true });
        await box().fill(question);
        const r = await submit();
        h.result.facts[`validation_${name}`] = r.validation;
        if (!r.validation) return await h.expectTest(name, false, 'no wording-check response captured');
        if (expectFlag) {
            await h.expectProduct(`${name}: flagged by Hercules`, r.validation.can_proceed === false, `${responseType}, "${question}" → ${verdict(r.validation)}`, severity);
            if (r.validation.can_proceed === false) {
                await h.expectProduct(`${name}: stays on step 1`, !r.moved, r.moved ? 'moved to step 2 despite the flag' : 'stayed');
                const shown = await reasonShown(r.validation);
                await h.shot(`${name}-${shown ? 'reason-shown' : 'reason-not-shown'}`);
                await h.expectProduct(`${name}: reason shown to the user`, shown, shown ? 'shown' : `server reason "${r.validation.reason}" is not on the page; Continue just stays busy`);
            }
        } else {
            await h.expectProduct(`${name}: accepted`, r.validation.can_proceed === true && r.moved, `${responseType}, "${question}" → ${verdict(r.validation)}; ${r.moved ? 'moved to step 2' : 'did not reach step 2'}`, severity);
        }
    });

    try {
        // ── Login ──
        const auth = await h.scenario('login', async () => { const a = await ensureSignedIn(page, { baseUrl: BASE_URL }); await h.expectTest('login', true, a.method); return a; });
        if (!auth) return;

        // ── Step 1: basic validation ──
        await h.scenario('step 1 loads', async () => {
            await fresh();
            const t = await page.locator('body').innerText();
            await h.expectProduct('step 1 shows "What do you want to ask?" and 3 response types', /What do you want to ask\?/.test(t) && ['Yes / No', 'Multiple choice', 'Rating 1-5'].every(x => t.includes(x)), '');
            await h.expectProduct('Continue disabled for an empty question', await cont().isDisabled(), '');
            await box().fill('     ');
            await h.expectProduct('Continue disabled for a whitespace-only question', await cont().isDisabled(), '', 'warn');
            await box().fill('x'.repeat(200));
            const len = (await box().inputValue()).length;
            await h.expectProduct('question capped at 180 characters', len === 180, `${len} kept of 200 typed; counter "${(t.match(/\d+ \/ 180/) || [''])[0]}"`);
            await h.shot('step1-limits');
        });

        // ── Step 1: response types ──
        await h.scenario('multiple choice options', async () => {
            await fresh();
            await box().fill('Which payment app do you use most often for daily purchases?');
            await type('Multiple choice').click({ force: true });
            const opts = () => page.locator('textarea[placeholder^="Option"]');
            await opts().first().waitFor({ state: 'visible', timeout: 10_000 });
            await h.expectProduct('multiple choice starts with 2 options', (await opts().count()) === 2, `${await opts().count()}`);
            await h.expectProduct('Continue disabled until options are filled', await cont().isDisabled(), '');
            await h.expectProduct('cannot remove below 2 options', await page.getByRole('button', { name: 'Remove option 1' }).isDisabled(), '');
            const add = page.getByRole('button', { name: /\+ Add option/ });
            for (let i = 0; i < 8 && await add.isVisible().catch(() => false) && await add.isEnabled().catch(() => false); i++) { await add.click(); await page.waitForTimeout(300); }
            const n = await opts().count();
            await h.expectProduct('maximum 7 options', n === 7, `${n} options after pressing "+ Add option" repeatedly`);
            await opts().nth(0).fill('y'.repeat(520));
            const olen = (await opts().nth(0).inputValue()).length;
            await h.expectProduct('option capped at 500 characters', olen === 500, `${olen} kept of 520`);
            await h.expectProduct('can remove options above 2', await page.getByRole('button', { name: `Remove option ${n}` }).isEnabled(), '');
            for (let i = n; i > 3; i--) { await page.getByRole('button', { name: `Remove option ${i}` }).click(); await page.waitForTimeout(250); }
            await opts().nth(0).fill('UPI app'); await opts().nth(1).fill('UPI app'); await opts().nth(2).fill('Card');
            await h.shot('mc-duplicate-options');
            const dup = await submit();
            h.result.facts.validation_mcDuplicate = dup.validation;
            await h.expectProduct('duplicate options are blocked or flagged', !dup.moved || dup.validation?.can_proceed === false, dup.moved ? 'accepted "UPI app" twice' : 'blocked', 'warn');
            if (dup.moved) { await page.getByText('Back', { exact: true }).first().click().catch(() => {}); await page.waitForTimeout(2000); }
            await fresh();
            await box().fill('Which payment app do you use most often for daily purchases?');
            await type('Multiple choice').click({ force: true });
            await opts().nth(0).fill('Google Pay'); await opts().nth(1).fill('PhonePe');
            await page.getByRole('button', { name: /\+ Add option/ }).click(); await opts().nth(2).fill('Paytm');
            const ok = await submit();
            await h.expectProduct('valid multiple-choice question reaches step 2', ok.moved, ok.validation?.reason || '');
            if (ok.moved) await h.expectProduct('step 2 shows MULTIPLE CHOICE', /MULTIPLE CHOICE/i.test(await page.locator('body').innerText()), '');
        });

        await h.scenario('rating question', async () => {
            await fresh();
            await box().fill('How satisfied are you with your current payment app, where 1 is very unsatisfied and 5 is very satisfied?');
            await type('Rating 1-5').click({ force: true });
            await h.expectProduct('rating explains 1 = lowest, 5 = highest', /1 \(lowest\) to 5 \(highest\)/.test(await page.locator('body').innerText()), '');
            const r = await submit();
            await h.expectProduct('valid rating question reaches step 2', r.moved, r.validation?.reason || '');
            if (r.moved) await h.expectProduct('step 2 shows RATING', /RATING/i.test(await page.locator('body').innerText()), '');
        });
        // With Rating 1-5 selected the page itself explains the scale, so a short rating question is fine.
        await wordingCase('rating question with Rating 1-5', 'Rate our app.', { expectFlag: false, severity: 'warn', responseType: 'Rating 1-5' });

        // ── Step 1: Hercules' wording check ──
        await wordingCase('leading question', "Don't you agree that our amazing new app is better and cheaper than others?");
        await wordingCase('double-barrelled question', 'Do you like the price and the design of our payment app?');
        await wordingCase('gibberish', 'asdf qwerty zxcv lorem?', { severity: 'warn' });
        await h.scenario('script tag in question', async () => {
            dialogFired = null;
            await fresh();
            await box().fill('<script>alert("xss")</script> Do you use UPI daily?');
            const r = await submit();
            h.result.facts.validation_script = r.validation;
            await h.expectProduct('script tag never runs', !dialogFired, dialogFired ? `dialog fired: ${dialogFired}` : 'no dialog');
            if (r.moved) await h.expectProduct('script tag not rendered as HTML on step 2', !(await page.locator('script:text("alert")').count()), '');
        });
        await wordingCase('Hindi question', 'क्या आप रोज़ की खरीदारी के लिए UPI ऐप का इस्तेमाल करते हैं?', { expectFlag: false, severity: 'warn' });

        // ── Happy path Yes / No → step 2 (never launched) ──
        let yesNoDraft = null;
        // Plain wording, no numbers or run stamps: Hercules's wording check rejects those, and a
        // draft only exists once step 1 is accepted. A random natural question keeps runs apart.
        const QUESTIONS = [
            'Do you currently use a payment app for your daily grocery purchases?',
            'Do you usually check online reviews before buying a new phone?',
            'Have you ordered a meal through a food delivery app this week?',
            'Do you prefer paying for small purchases with a payment app over cash?',
            'Do you usually compare prices online before buying household items?',
            'Have you watched a cricket match on a streaming app this month?',
        ];
        const question = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
        const reached = await h.scenario('yes/no to step 2', async () => {
            await fresh();
            await box().fill(question);
            const r = await submit();
            await page.waitForTimeout(2000);
            yesNoDraft = drafts[drafts.length - 1] || null;
            await h.expectProduct('neutral yes/no question accepted', r.validation?.can_proceed === true, r.validation?.reason || 'no verdict');
            if (!await h.expectProduct('reaches step 2 "Who should we ask?"', r.moved, '')) return false;
            const t = await page.locator('body').innerText();
            await h.expectProduct('step 2 shows the question', t.includes(question.slice(0, 40)), '');
            await h.expectProduct('step 2 shows YES / NO', /YES \/ NO/i.test(t), '');
            await h.expectProduct('step 2 offers sizes 50 / 100 / 500 / 1,000 / Custom', ['50', '100', '500', '1,000', 'Custom'].every(x => t.includes(x)), '');
            await h.expectProduct('step 2 offers Geography, NCCS, Age group, Gender', ['Geography', 'NCCS', 'Age group', 'Gender'].every(x => t.includes(x)), '');
            await h.shot('step2');
            return true;
        });

        if (reached) await h.scenario('step 2 controls (no launch)', async () => {
            const launch = page.getByRole('button', { name: /^Launch to/ });
            for (const [size, label] of [['50', '50'], ['100', '100'], ['1,000', '1,000'], ['500', '500']]) {
                await page.getByText(size, { exact: true }).first().click({ force: true });
                await page.waitForTimeout(600);
                const txt = (await launch.innerText().catch(() => '')).trim();
                await h.expectProduct(`audience ${size} → launch button says ${label}`, txt.includes(label), `"${txt}"`);
            }
            // Custom size: invalid then valid values
            await page.getByText('Custom', { exact: true }).first().click({ force: true });
            await page.waitForTimeout(800);
            const custom = page.locator('input[type="number"], input[inputmode="numeric"], input[type="text"]').filter({ hasNot: page.locator('[placeholder*="Search"]') }).last();
            if (await custom.isVisible().catch(() => false)) {
                for (const [v, valid] of [['0', false], ['-5', false], ['1000000', false], ['250', true]]) {
                    await custom.fill(v); await page.waitForTimeout(700);
                    const enabled = await launch.isEnabled().catch(() => false);
                    const txt = (await launch.innerText().catch(() => '')).trim();
                    await h.expectProduct(`custom size ${v} ${valid ? 'accepted' : 'rejected'}`, valid ? txt.includes('250') : (!enabled || !txt.includes(v)), `launch "${txt}", enabled=${enabled}`, 'warn');
                }
            } else h.skip('custom size values', 'no input appeared after choosing Custom');
            // Everyone in India + filters
            const everyone = page.getByText('Everyone in India', { exact: true });
            await everyone.click({ force: true }); await page.waitForTimeout(800);
            await h.shot('step2-everyone');
            await everyone.click({ force: true }); await page.waitForTimeout(500);
            for (const chip of ['Metro only', 'NCCS A', '25–34', 'Female']) {
                const c = page.getByText(chip, { exact: true }).first();
                if (await c.isVisible().catch(() => false)) { await c.click({ force: true }); await page.waitForTimeout(300); }
            }
            await h.expectProduct('launch button present (not pressed)', await launch.isVisible().catch(() => false), `"${(await launch.innerText().catch(() => '')).trim()}" — never pressed: it sends to real consumers and spends credits`);
            await h.shot('step2-filters');
            // Back keeps the question
            await page.getByText('Back', { exact: true }).first().click({ force: true });
            await page.waitForTimeout(2500);
            await h.expectProduct('Back returns to step 1 with the question kept', !(await onStep2()) && (await box().inputValue()).includes(question.slice(0, 30)), '');
        });

        await h.scenario('use chat instead', async () => {
            await fresh();
            await box().fill('Do you prefer cash or UPI for small purchases?');
            const before = drafts.length;
            await page.getByText('Use chat instead', { exact: true }).click();
            await page.waitForTimeout(8000);
            h.result.facts.useChatInsteadUrl = page.url();
            const inChat = /\/chat\/[0-9a-f-]{20,}/.test(page.url()) && (await page.locator('body').innerText()).includes('cash or UPI');
            await h.expectProduct('"Use chat instead" opens a chat with the question', inChat, inChat ? page.url() : `landed on ${page.url()}${drafts.length > before ? ' and created a Yes/No quick-question draft without the wording check' : ''}`, 'warn');
        });

        // ── The draft quick question ──
        // Each Continue saves a draft. The user manages it from the dashboard's Quick Question tab:
        // clicking a card opens /quick-question?surveyId=… whose H-icon menu has Edit /
        // Duplicate Question / Delete Question. (The /chat/<id> page behind it is internal; actions
        // there act on that chat, not on the quick question, so they are not used.)
        const draft = yesNoDraft;
        h.result.facts.drafts = drafts;
        const qKey = question.slice(0, 24);
        const qqTab = async () => {
            await page.goto(`${BASE_URL}/chat/campaign-history`, { waitUntil: 'domcontentloaded' });
            await page.getByRole('tab', { name: 'Quick Question', exact: true }).click();
            await page.waitForTimeout(4500);
        };
        // Card name = the line after the avatar initials on each card ("QM" for this account).
        const cardNames = async () => {
            await qqTab();
            const lines = (await page.locator('body').innerText()).split('\n').map(x => x.trim()).filter(Boolean);
            const out = [];
            lines.forEach((l, i) => { if (/^[A-Z]{1,3}$/.test(l) && /^Last viewed/.test(lines[i + 2] || '')) out.push(lines[i + 1]); });
            return out;
        };
        const countCards = async text => (await cardNames()).filter(n => n.includes(text)).length;
        const cardFor = text => page.locator('div').filter({ hasText: text }).filter({ has: page.getByRole('button', { name: 'Open menu' }) }).last();
        const openQuickQuestion = async text => {
            await qqTab();
            await cardFor(text).getByText(text).first().click();
            await page.waitForURL(/quick-question\?(surveyId|chatId)=/, { timeout: 30_000 });
            await page.waitForTimeout(5000);
            return page.url();
        };
        const hMenu = async () => {
            await page.locator("img[alt='hercules-logo']").first().click({ force: true });
            await page.getByText(/^Delete Question$/).first().waitFor({ state: 'visible', timeout: 15_000 });
        };
        const confirmIfAsked = async re => {
            const b = page.getByRole('button', { name: re }).filter({ visible: true }).last();
            await b.waitFor({ state: 'visible', timeout: 4000 }).then(() => b.click()).catch(() => {});
        };
        // Rename labels stay letters-only as well.
        const WORDS = ['Amber', 'Cobalt', 'Maple', 'Saffron', 'Teal', 'Indigo', 'Coral', 'Olive', 'Pearl', 'Jade'];
        const stamp = `${WORDS[Math.floor(Math.random() * WORDS.length)]} ${WORDS[Math.floor(Math.random() * WORDS.length)]}`;
        let current = qKey; // what the card is currently called

        await h.scenario('draft on Quick Question tab', async () => {
            const names = await cardNames();
            h.result.facts.qqCardNames = names.slice(0, 10);
            await h.expectProduct('draft listed on the Quick Question tab', names.some(n => n.includes(qKey)), `${names.filter(n => n.includes(qKey)).length} card(s) named "${qKey}…"`);
            const url = await openQuickQuestion(qKey);
            const t = await page.locator('body').innerText();
            await h.expectProduct('card opens the quick question with its text', /quick-question\?(surveyId|chatId)=/.test(url) && (await page.locator('body').innerText()).includes(qKey), url);
            await h.shot('quick-question-page');
        });

        await h.scenario('rename via H icon', async () => {
            const n = `QA QuickQ ${stamp} H`;
            await openQuickQuestion(current);
            await hMenu();
            await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
            const input = page.locator("input[placeholder='Question name']").or(page.locator('input').filter({ visible: true })).first();
            await input.waitFor({ state: 'visible', timeout: 10_000 });
            await input.fill(n);
            await page.getByRole('button', { name: /^(Save|Rename|Done)$/ }).filter({ visible: true }).last().click();
            await page.waitForTimeout(3000);
            const names = await cardNames();
            if (await h.expectProduct('rename via H icon shows on the card', names.includes(n), names.includes(n) ? `card shows "${n}"` : `not found; names: ${names.slice(0, 5).join(' | ')}`, 'fail', { el: cardFor(n) })) current = n;
        });

        await h.scenario('rename via Quick Question tab', async () => {
            const n = `QA QuickQ ${stamp} Tab`;
            await qqTab();
            const r = await H.menuAction(page, cardFor(current).getByRole('button', { name: 'Open menu' }).first(), 'Rename', { newName: n });
            if (!r.available) return h.skip('rename via Quick Question tab', 'Rename not offered');
            const names = await cardNames();
            if (await h.expectProduct('rename via Quick Question tab shows on the card', names.includes(n), names.includes(n) ? `card shows "${n}"` : `not found; names: ${names.slice(0, 5).join(' | ')}`, 'fail', { el: cardFor(n) })) current = n;
        });
        h.skip('rename via sidebar', 'quick questions have no sidebar row menu');

        await h.scenario('duplicate via H icon', async () => {
            const before = await countCards(current);
            await openQuickQuestion(current);
            const calls = [];
            const onResp = r => { if (r.request().method() !== 'GET' && /hercules\.works/.test(r.url())) calls.push(`${r.request().method()} ${r.url().replace(/\?.*/, '')} → ${r.status()}`); };
            page.on('response', onResp);
            await hMenu();
            await page.getByText('Duplicate Question', { exact: true }).first().click();
            await confirmIfAsked(/^(Duplicate( Question)?|Confirm|Yes)$/);
            await page.waitForTimeout(12_000);
            page.off('response', onResp);
            h.result.facts.duplicateNetwork = calls;
            const after = await countCards(current);
            await h.shot('after-duplicate');
            await h.expectProduct('Duplicate Question creates a copy', after > before, `cards named "${current}" ${before}→${after}; requests sent: ${calls.length ? calls.join('; ') : 'none'}`, 'fail', { el: cardFor(current) });
        });
        await h.scenario('duplicate via Quick Question tab', async () => {
            await qqTab();
            const r = await H.menuAction(page, cardFor(current).getByRole('button', { name: 'Open menu' }).first(), 'Duplicate');
            if (!r.available) return h.skip('duplicate via Quick Question tab', 'the card menu offers only Rename / Settings / Delete');
            await h.expectProduct('duplicate via Quick Question tab', true, 'offered');
        });

        await h.scenario('delete via Quick Question tab', async () => {
            const before = await countCards(current);
            if (before < 2) return h.skip('delete via Quick Question tab', `only ${before} card; deleting it is covered by "delete via H icon"`);
            await qqTab();
            const r = await H.menuAction(page, cardFor(current).getByRole('button', { name: 'Open menu' }).first(), 'Delete');
            if (!r.available) return h.skip('delete via Quick Question tab', 'Delete not offered');
            const after = await countCards(current);
            await h.expectProduct('delete via Quick Question tab removes one card', after === before - 1, `"${current}": ${before} card(s) before Delete, ${after} after${after === before - 1 ? " (the deleted one is gone)" : ""}`, 'fail', { el: cardFor(current) });
        });
        await h.scenario('delete via H icon', async () => {
            const before = await countCards(current);
            if (before < 1) return h.skip('delete via H icon', 'no card left');
            await openQuickQuestion(current);
            await hMenu();
            await page.getByText('Delete Question', { exact: true }).first().click();
            await confirmIfAsked(/^(Delete( Question| Campaign)?|Confirm|Yes)$/);
            await page.waitForTimeout(4000);
            const after = await countCards(current);
            await h.expectProduct('Delete Question removes the quick question', after === before - 1, `"${current}": ${before} card(s) before Delete, ${after} after${after === before - 1 ? " (the deleted one is gone)" : ""}`, 'fail', { el: cardFor(current) });
        });
    } finally {
        // Clean-up: ALWAYS delete the quick questions this group creates (every Continue saves a
        // draft; one run makes ~5). Evidence stays in the screenshots and result.json. Deleted with
        // the real "Delete Question" from each card's quick-question page.
        h.result.facts.draftsCreated = [...new Set(drafts)];
        fs.writeFileSync(path.join(OUT, 'drafts.json'), JSON.stringify(h.result.facts.draftsCreated, null, 2));
        const testCard = /^(QA-QQ |QA QuickQ |Which payment app do you use most often|How satisfied are you with your current payment app|क्या आप रोज़ की खरीदारी|Do you prefer cash or UPI)/;
        let deleted = 0;
        try {
            for (let i = 0; i < 20 && h.left() > -8 * 60_000; i++) {
                await page.goto(`${BASE_URL}/chat/campaign-history`, { waitUntil: 'domcontentloaded' });
                await page.getByRole('tab', { name: 'Quick Question', exact: true }).click();
                await page.waitForTimeout(4500);
                const lines = (await page.locator('body').innerText()).split('\n').map(x => x.trim()).filter(Boolean);
                const name = lines.find((l, j) => /^[A-Z]{1,3}$/.test(lines[j - 1] || '') && /^Last viewed/.test(lines[j + 1] || '') && testCard.test(l));
                if (!name) break;
                const card = page.locator('div').filter({ hasText: name }).filter({ has: page.getByRole('button', { name: 'Open menu' }) }).last();
                await card.getByText(name).first().click();
                await page.waitForURL(/quick-question\?(surveyId|chatId)=/, { timeout: 30_000 });
                await page.waitForTimeout(4000);
                await page.locator("img[alt='hercules-logo']").first().click({ force: true });
                await page.getByText('Delete Question', { exact: true }).first().click();
                const ok = page.getByRole('button', { name: /^(Delete( Question| Campaign)?|Confirm|Yes)$/ }).filter({ visible: true }).last();
                await ok.waitFor({ state: 'visible', timeout: 4000 }).then(() => ok.click()).catch(() => {});
                await page.waitForTimeout(3000);
                deleted++;
            }
            await h.expectTest('cleanup: test quick questions deleted', true, `${deleted} deleted`);
        } catch (e) {
            await h.expectTest('cleanup: test quick questions deleted', false, `${deleted} deleted, then: ${e.message.split('\n')[0]}`, 'warn');
        }
        h.finish();
    }
});
