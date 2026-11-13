const { test } = require('@playwright/test');
const path = require('path');
const H = require('./lib/hercules');
const { createHarness } = require('./lib/harness');
const { loginAndBrief, createSurvey, cleanup } = require('./lib/create');
const E = require('../../config/hourlyMonitorExpectations');

/**
 * LOGIC group — prompting quality + logic correctness.
 *   1. Ask Hercules which logic types it supports for THIS survey (read-only question).
 *   2. For each type it names (skip, display, terminate, piping, loop, randomisation, …) ask it to
 *      add ONE rule only where it genuinely makes sense. A reasoned "doesn't make sense here" is
 *      accepted; "added" with no change in the Logics panel is a DEFECT.
 *   3. A nonsensical request (circular skip) must be refused / clarified, not applied.
 *   4. Logic Version must go up after a rule is added.
 *   5. Preview follows the logic: a terminate rule ends the survey; a non-terminating answer moves on.
 */
const BASE_URL = process.env.HERCULES_URL || 'https://hercules.works';
const OUT = path.join(process.env.MONITOR_OUT_DIR || 'reports/monitor/local', 'logic');
const REPLY_MS = E.chat.replyTimeoutMinutes * 60_000;

const LOGIC_TYPES = [
    { id: 'skip', re: /skip|jump/i },
    { id: 'display', re: /display|show\s*\/?\s*hide|conditional display/i },
    { id: 'terminate', re: /terminat|screen[- ]?out|disqualif/i },
    { id: 'piping', re: /pip(e|ing)|carry[- ]?forward/i },
    { id: 'loop', re: /loop|repeat/i },
    { id: 'randomisation', re: /randomi[sz]/i },
    { id: 'branching', re: /branch/i },
];

test('logic: prompting, all logic types, preview follows logic', async ({ page }) => {
    test.setTimeout((E.run.maxMinutes + 6) * 60_000);
    const h = createHarness(page, { group: 'logic', outDir: OUT, budgetMin: E.run.maxMinutes });
    let chatUrl = null;
    const converse = async (id, text, opts) => {
        const r = await H.askAndResolve(page, text, { timeoutMs: REPLY_MS, ...opts });
        h.result.conversations.push({ id, prompt: text, turns: r.turns.map(t => ({ prompt: t.prompt, reply: (t.reply || '').slice(0, 2500), seconds: t.seconds })) });
        await h.shot(`chat-${id}`);
        return r;
    };
    try {
        const b = await loginAndBrief(page, h, { baseUrl: BASE_URL, expect: E, outDir: OUT });
        chatUrl = b.chatUrl;
        if (!b.briefOk || !(await createSurvey(page, h, { expect: E, outDir: OUT }))) return;
        const start = await H.surveyState(page);
        h.result.facts.logicStart = { rules: start.logicRules, version: start.logicVersion };

        // 1. Which logic types?
        let supported = [];
        await h.scenario('ask: which logic types', async () => {
            const r = await converse('logic-types', 'Which kinds of survey logic can you add to this survey (for example skip, display, terminate, piping, loop)? List each type you support with a one-line example that would make sense for THIS survey. Do not change the survey yet.',
                { maxFollowUps: 0 });
            supported = LOGIC_TYPES.filter(t => t.re.test(r.finalReply)).map(t => t.id);
            h.result.facts.logicTypesSupported = supported;
            h.expectProduct('Hercules explains its logic types', supported.length >= 2, supported.join(', ') || r.finalReply.slice(0, 200));
            const after = await H.surveyState(page);
            h.expectProduct('read-only question leaves survey unchanged', after.logicRules === start.logicRules && after.questions.length === start.questions.length,
                `rules ${start.logicRules}→${after.logicRules}, questions ${start.questions.length}→${after.questions.length}`);
        }, { needsMinutes: E.chat.replyTimeoutMinutes + 2 });

        // 2. Add each supported type, only where it makes sense.
        const types = (supported.length ? supported : ['skip', 'display', 'terminate']).slice(0, E.logic.maxTypes);
        for (const type of types) {
            await h.scenario(`ask: add ${type} logic`, async () => {
                const before = await H.surveyState(page);
                const r = await converse(`add-${type}`,
                    `Add ONE ${type} logic rule to this survey, but only where it genuinely makes sense for the research goal. Choose the questions yourself, tell me exactly which rule you added (question numbers and the condition), and apply it. If ${type} logic does not make sense anywhere in this survey, say so and change nothing.`,
                    { followUp: 'Yes, apply that rule now.' });
                const after = await H.surveyState(page);
                const changed = after.logicRules > before.logicRules || (after.logicVersion ?? 0) > (before.logicVersion ?? 0);
                const declined = /does(n't| not) make sense|not (needed|necessary|appropriate|applicable)|no (suitable|sensible)|already (has|have|exists)|change nothing|won't add|not add/i.test(r.finalReply);
                const claimsAdded = /\b(added|applied|created|set up|now (skips|shows|ends|terminates))\b/i.test(r.finalReply) && !declined;
                h.result.facts[`logic_${type}`] = { before: before.logicRules, after: after.logicRules, vBefore: before.logicVersion, vAfter: after.logicVersion, declined, claimsAdded };
                if (changed) h.expectProduct(`${type} logic added`, true, `rules ${before.logicRules}→${after.logicRules}, logic v${before.logicVersion}→v${after.logicVersion}`);
                else if (declined) h.expectProduct(`${type} logic: declined with a reason`, true, r.finalReply.slice(0, 200));
                else h.expectProduct(`${type} logic added`, false, claimsAdded ? `reply says it was added but the Logics panel is unchanged (${before.logicRules} rules, v${before.logicVersion})` : `no change and no clear reason: ${r.finalReply.slice(0, 160)}`);
                h.expectProduct(`${type}: questions unchanged`, after.questions.length === before.questions.length, `${before.questions.length}→${after.questions.length}`, 'warn');
            }, { needsMinutes: E.chat.replyTimeoutMinutes + 2 });
        }

        // 3. Nonsense must not be applied.
        await h.scenario('ask: circular logic (should refuse)', async () => {
            const before = await H.surveyState(page);
            const r = await converse('circular', 'Add logic so the last question skips back to question 1, and question 1 skips straight to the last question.', { maxFollowUps: 0 });
            const after = await H.surveyState(page);
            h.expectProduct('circular logic not applied', after.logicRules === before.logicRules, `rules ${before.logicRules}→${after.logicRules}; reply: ${r.finalReply.slice(0, 160)}`);
        }, { needsMinutes: E.chat.replyTimeoutMinutes + 2 });

        // 4. Logic Version moved?
        await h.scenario('logic version', async () => {
            const end = await H.surveyState(page);
            h.result.facts.logicEnd = { rules: end.logicRules, version: end.logicVersion };
            if (end.logicRules > start.logicRules) h.expectProduct('Logic Version increments when rules change', (end.logicVersion ?? 0) > (start.logicVersion ?? 0), `v${start.logicVersion} → v${end.logicVersion} (rules ${start.logicRules}→${end.logicRules})`);
            else h.skip('Logic Version increments when rules change', 'no rule was added this run');
        });

        // 5. Preview follows the logic.
        await h.scenario('preview follows terminate rule', async () => {
            await page.goto(chatUrl, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(8000);
            const rules = await H.readLogicRules(page);
            h.result.facts.logicRules = rules;
            const term = rules.map(r => H.parseTerminate(r.rules)).find(t => t && t.q === 1);
            if (!term) return h.skip('preview follows terminate rule', 'no terminate rule on Q1 to test');

            // a) Answers must be tappable. By design, when the "More options" hint shows, the user taps
            //    it first (it unlocks the answers), so the monitor does the same.
            let pv = await H.openPreview(page);
            h.result.facts.previewTotal = pv.total;
            await h.shot('preview-q1');
            if (!(await pv.answersClickable()).clickable) await pv.dismissHint();
            const click = await pv.answersClickable();
            if (!h.expectProduct('preview: answers tappable', click.clickable, click.clickable ? `${click.count} options` : `still covered by ${click.blocker} after tapping "More options"`)) return;

            // b) Required: Next without an answer should not advance.
            const s0 = await pv.state(); await pv.next(); const s1 = await pv.state();
            h.result.facts.previewSkipUnanswered = `${s0.counter} → ${s1.counter}`;
            h.expectProduct('preview: Q1 cannot be skipped unanswered', s1.n === s0.n, `${s0.counter} → ${s1.counter}`, 'warn');

            // c) Terminating answer ends the survey ("Sorry, you're not Eligible for this Survey!").
            await page.goto(chatUrl, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(8000);
            pv = await H.openPreview(page);
            await pv.pick(term.options[0]);
            await pv.next();
            const sT = await pv.state();
            await h.shot('preview-terminated');
            h.expectProduct(`preview: "${term.options[0]}" at Q1 terminates`, sT.notEligible, sT.notEligible ? '"not Eligible" screen shown' : `moved to ${sT.counter}`);

            // d) A non-terminating answer moves on to Q2.
            await page.goto(chatUrl, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(8000);
            pv = await H.openPreview(page);
            await pv.dismissHint();
            const opts = await pv.options();
            const ok = opts.find(o => !/^More options$/i.test(o) && !term.options.some(t => t.toLowerCase() === o.toLowerCase()));
            if (!ok) return h.skip('preview: non-terminating answer continues', 'every option terminates');
            await pv.pick(ok);
            await pv.next();
            const sC = await pv.state();
            await h.shot('preview-continued');
            h.expectProduct(`preview: "${ok}" at Q1 continues to Q2`, sC.n === 2 && !sC.notEligible, sC.notEligible ? 'wrongly terminated' : `now at ${sC.counter}`);
        }, { needsMinutes: 5 });
    } finally {
        await cleanup(page, h, chatUrl, E);
        h.finish();
    }
});
