const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const HerculesSurveyGenerator = require('../../pages/hercules/HerculesSurveyGenerator');
const { parseTargetAudience, audienceConsistencyIssues } = require('../../utils/HerculesBriefParser');
const { generateTopic } = require('../../utils/HerculesTopicGenerator');
const { ensureSignedIn } = require('../../utils/HerculesEmailAuth');
const { installTracker, highlightShot } = require('./lib/evidence');
const { describeCheck } = require('./lib/expectations');
const { checkCreatedAudience } = require('./lib/create');
const { checkBrief, checkSurvey, parseSurveyQuestions } = require('./lib/contentChecks');
const EXPECT = require('../../config/hourlyMonitorExpectations');

/**
 * Hourly headless monitor: sign in (Mailosaur email account) → AI prompt → wizard → brief →
 * "Run your version" → "create the survey" → validate against config/hourlyMonitorExpectations.js.
 *
 * It never throws on a failed check; every check is recorded in result.json and the runner
 * (scripts/hourlySurveyMonitor.js) alerts on any FAIL. Unexpected crashes are caught and reported
 * as a FAIL too, so the runner always has a result to read.
 */

const BASE_URL = process.env.HERCULES_URL || 'https://hercules.works';
// "basic" group of scripts/hourlySurveyMonitor.js (results go to <MONITOR_OUT_DIR>/basic).
const OUT_DIR = path.join(process.env.MONITOR_OUT_DIR || path.resolve('reports/monitor', new Date().toISOString().replace(/[:.]/g, '-')), 'basic');
const RUN_BUDGET = EXPECT.run.maxMinutes * 60_000;

test('Hourly monitor: create survey and validate', async ({ page }) => {
    test.setTimeout(RUN_BUDGET + 5 * 60_000);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const t0 = Date.now();
    const deadline = t0 + RUN_BUDGET;
    const remaining = () => Math.max(0, deadline - Date.now());
    const mins = ms => Math.round(ms / 600) / 100;

    const result = { group: 'basic', startedAt: new Date(t0).toISOString(), baseUrl: BASE_URL, checks: [], defects: [], facts: {}, screenshots: [] };
    installTracker(page).catch(() => {});
    /** Records a check with feature, expected and actual result, plus a highlighted screenshot. */
    const check = async (name, ok, detail, severity = 'fail', opts = {}) => {
        const status = ok ? 'PASS' : severity === 'warn' ? 'WARN' : 'FAIL';
        const d = describeCheck(name);
        const entry = { name, status, detail, feature: d.feature, expected: opts.expected || d.expected,
            actual: opts.actual || detail || (ok ? 'Matches the expected result' : 'Did not match the expected result') };
        result.checks.push(entry);
        console.log(`[Monitor] ${status} ${name}${detail ? ` — ${detail}` : ''}`);
        fs.mkdirSync(path.join(OUT_DIR, 'evidence'), { recursive: true });
        const file = path.join(OUT_DIR, 'evidence', `${String(result.checks.length).padStart(3, '0')}-${name.replace(/\W+/g, '-').slice(0, 60)}.jpg`);
        if (await highlightShot(page, file, { el: opts.el, name, status, expected: entry.expected, actual: entry.actual })) entry.screenshot = file;
        return ok;
    };
    const shot = async name => {
        const p = path.join(OUT_DIR, `${name}.png`);
        await page.screenshot({ path: p, fullPage: true }).catch(() => {});
        result.screenshots.push(p);
    };

    try {
        // 1. Login
        let auth;
        try {
            auth = await ensureSignedIn(page, { baseUrl: BASE_URL });
            await check('login', true, `${auth.method}`);
        } catch (e) {
            await check('login', false, e.message);
            await shot('login-failed');
            return;
        }

        // 2. Prompt
        const topic = generateTopic({ seed: Date.now() });
        const prompt = `QA-MONITOR-${Date.now()} ${topic.prompt}`;
        const wizardContext = [topic.product && `We are launching ${topic.product}`, topic.geography && `across ${topic.geography}`]
            .filter(Boolean).join(' ') || 'We are launching across all tier 1, tier 2 and metro cities in India.';
        result.facts.prompt = prompt;

        // Prompt box validation, checked before anything is sent. An empty prompt must not be sendable. A whitespace-only
        // prompt should not be either (the Quick Question box blocks it); on 2026-11-17 Send was still enabled for
        // 5 spaces, so that one is a WARN until the app fixes it. Nothing is sent here.
        const promptBox = page.getByRole('textbox', { name: /Describe the research you/i }).or(page.locator("textarea[aria-label='Ask Hercules a question']")).first();
        const sendBtn = page.getByRole('button', { name: 'Send' });
        await promptBox.fill('');
        const emptyBlocked = await sendBtn.isDisabled().catch(() => false);
        await check('prompt box: empty prompt cannot be sent', emptyBlocked, emptyBlocked ? 'Send is disabled' : 'Send is enabled with an empty prompt', 'fail', { el: sendBtn.first(), expected: 'Send is disabled while the prompt box is empty' });
        await promptBox.fill('     ');
        const blankBlocked = await sendBtn.isDisabled().catch(() => false);
        await check('prompt box: whitespace-only prompt cannot be sent', blankBlocked, blankBlocked ? 'Send is disabled' : 'Send is enabled for a prompt of only spaces', 'warn', { el: sendBtn.first(), expected: 'Send stays disabled for a prompt that has only spaces' });
        await promptBox.fill('');

        await page.getByRole('textbox', { name: /Describe the research you/i })
            .or(page.locator("textarea[aria-label='Ask Hercules a question']")).first().fill(prompt);
        await page.getByRole('button', { name: 'Send' }).click();
        // The chat works when Hercules shows the prompt as a message and starts answering. The URL is not used
        // (run #54: chat was working but the URL stayed /chat, which failed the old URL check).
        const promptMarker = prompt.slice(0, 30);
        const chatOk = await page.waitForFunction(m => document.body.innerText.includes(m), promptMarker, { timeout: 120_000 }).then(() => true).catch(() => false);
        result.facts.chatUrl = page.url();
        if (!await check('chat opened', chatOk, chatOk ? 'prompt shown as a chat message' : 'prompt never appeared as a chat message')) { await shot('no-chat'); return; }

        // 3. Wizard + brief, until "create the survey" appears
        const gen = new HerculesSurveyGenerator(page);
        const createBtn = page.getByRole('button', { name: /create the survey/i }).last();
        const runVersionBtn = page.getByRole('button', { name: /^Run (your version|it this way|the self-serve version)$/i }).last();
        const versionCard = page.locator('.bg-white.rounded-\\[12px\\].border').last();
        // Option cards ("Hard-to-find audience"): "Run the self-serve version … Select" vs "Book a consult".
        // "Select" isn't always a <button>; prefer the self-serve row and never click "Book a consult".
        const selectOption = page.locator('div, li').filter({ hasText: /self-serve/i }).getByText('Select', { exact: true }).last()
            .or(page.getByText('Select', { exact: true }).last());
        const briefDeadline = Math.min(deadline, Date.now() + EXPECT.brief.maxMinutes * 60_000);
        let steps = 0;
        while (Date.now() < briefDeadline) {
            if (await createBtn.isVisible().catch(() => false)) break;
            let acted = false;
            if (await runVersionBtn.isVisible().catch(() => false)) {
                if (!(await runVersionBtn.isEnabled().catch(() => false))) await versionCard.click().catch(() => {});
                await runVersionBtn.click().catch(() => {});
                acted = true;
            } else if (await gen.clickGenerateBrief()) acted = true;
            else if (await gen.handleSelectAndRunItThisWay().catch(() => false)) acted = true;
            else if (await selectOption.first().isVisible().catch(() => false)) {
                await selectOption.first().click({ force: true }).catch(() => {});
                console.log('[Monitor] Clicked "Select" on the option card (self-serve)');
                acted = true;
            }
            else if (await gen.handleSelectAllThatApply(wizardContext).catch(() => false)) acted = true;
            else if (await gen.handleSingleSelect(wizardContext).catch(() => false)) acted = true;
            else if (await gen.handleTextInputFallback(wizardContext).catch(() => false)) acted = true;
            if (acted) steps++;
            await page.waitForTimeout(acted ? 2500 : 10_000);
        }
        const briefMs = Date.now() - t0;
        result.facts.wizardSteps = steps;
        result.facts.briefMinutes = mins(briefMs);
        const briefOk = await createBtn.isVisible().catch(() => false);
        if (!await check('brief offers "create the survey"', briefOk, `${steps} steps, ${mins(briefMs)} min (limit ${EXPECT.brief.maxMinutes})`)) {
            await shot('brief-not-ready');
            return;
        }
        // How many clarifying steps the AI asks varies a lot by prompt (7 in run #56, 39 in run #57), so this is a WARN.
        // A wizard that is really stuck is still caught by 'brief offers "create the survey"' (FAIL after the brief time limit).
        await check('wizard step count', steps <= EXPECT.brief.maxWizardSteps, `${steps} (max ${EXPECT.brief.maxWizardSteps})`, 'warn');
        await shot('research-brief');

        const briefText = await page.locator('body').innerText();
        fs.writeFileSync(path.join(OUT_DIR, 'brief.txt'), briefText);
        const audience = parseTargetAudience(briefText);
        result.facts.targetAudience = audience && { ...audience, raw: undefined };
        result.facts.briefQuestionCount = Number(briefText.match(/(\d+)[-\s]question/i)?.[1]) || null;
        if (EXPECT.brief.requireTargetAudience) await check('brief has Target Audience', !!audience, audience ? `sample ${audience.totalSampleSize}` : 'section not found');
        // Brief content: sections, client, product, cities, counts that must add up. Derived from the prompt and the
        // brief's own structure, never exact wording (see lib/contentChecks.js).
        const runChecks = async list => { for (const c of list) await check(c.name, c.ok, c.detail, c.severity, { expected: c.expected }); };
        await runChecks(checkBrief(briefText, topic, audience, EXPECT.brief));
        // The audience is checked after the survey is created (View Audience), not on the brief.

        // 4. Create the survey
        await createBtn.scrollIntoViewIfNeeded();
        await createBtn.click();
        const tCreate = Date.now();
        const createWait = Math.max(1000, Math.min(remaining(), EXPECT.survey.maxMinutesAfterCreate * 60_000));
        const surveyCard = page.getByText(/Survey is In-drafts/i).or(page.getByText(/^Survey Version \(\d+\)$/)).first();
        let created = await Promise.race([
            surveyCard.waitFor({ state: 'visible', timeout: createWait }),
            page.getByRole('button', { name: /^Deploy/ }).first().waitFor({ state: 'visible', timeout: createWait }),
        ]).then(() => true).catch(() => false);
        let afterReload = false;
        if (!created) {
            await page.reload().catch(() => {});
            afterReload = await surveyCard.waitFor({ state: 'visible', timeout: 60_000 }).then(() => true).catch(() => false);
            created = afterReload;
        }
        result.facts.createMinutes = mins(Date.now() - tCreate);
        result.facts.surveyUrl = page.url();
        await shot(created ? 'survey-created' : 'no-response-after-create');
        if (!await check('survey created', created || !EXPECT.survey.requireCreated,
            created ? `${result.facts.createMinutes} min` : `no survey within ${EXPECT.survey.maxMinutesAfterCreate} min + reload (known "no response" bug?)`)) return;
        if (afterReload) await check('survey visible without reload', false, 'only appeared after a reload (known bug)', EXPECT.survey.failIfOnlyVisibleAfterReload ? 'fail' : 'warn');

        // 5. Validate the created survey
        if (EXPECT.survey.requireDeployButton) {
            const deploy = await page.getByRole('button', { name: /Deploy/ }).first().waitFor({ state: 'visible', timeout: 60_000 }).then(() => true).catch(() => false);
            await check('Deploy button visible', deploy);
        }
        // Audience as actually set on the created survey (View Audience) vs the brief.
        await checkCreatedAudience(page, { expectProduct: check, result }, audience && { ...audience, raw: undefined }, EXPECT);
        await page.waitForTimeout(5000);
        const surveyText = await page.locator('body').innerText();
        fs.writeFileSync(path.join(OUT_DIR, 'survey.txt'), surveyText);
        // Questions panel lists Q1, Q2, …; fall back to the brief's "N-question" count.
        // Count the numbered questions themselves ("1.", "2.", …). The old count took the highest "Qn" mentioned
        // in a logic note, which under-counted (run #56: 18 reported, 21 questions).
        const parsedQs = parseSurveyQuestions(surveyText);
        fs.writeFileSync(path.join(OUT_DIR, 'survey-questions.json'), JSON.stringify(parsedQs, null, 2));
        const qNums = [...surveyText.matchAll(/(?:^|\n)\s*Q(\d{1,3})\b/g)].map(m => Number(m[1]));
        const qCount = parsedQs.length || (qNums.length ? Math.max(...qNums) : result.facts.briefQuestionCount);
        result.facts.questionCount = qCount;
        result.facts.questionCountSource = parsedQs.length ? 'numbered questions' : qNums.length ? 'questions panel' : 'brief';
        await check('question count in range', qCount != null && qCount >= EXPECT.survey.minQuestions && qCount <= EXPECT.survey.maxQuestions,
            `${qCount ?? 'not found'} (${result.facts.questionCountSource}; expected ${EXPECT.survey.minQuestions}-${EXPECT.survey.maxQuestions})`);
        // Survey data: numbering, options, wording, product relevance, logic references, length vs the brief.
        await runChecks(checkSurvey(surveyText, topic, briefText, { questionCountTolerance: EXPECT.survey.questionCountTolerance }));
        await check('whole run within budget', Date.now() - t0 <= RUN_BUDGET, `${mins(Date.now() - t0)} min (max ${EXPECT.run.maxMinutes})`);
    } catch (e) {
        await check('unexpected error', false, e.stack?.split('\n').slice(0, 3).join(' | ') || String(e));
        await shot('unexpected-error');
    } finally {
        result.finishedAt = new Date().toISOString();
        result.durationMinutes = mins(Date.now() - t0);
        result.status = result.checks.some(c => c.status === 'FAIL') ? 'FAIL' : result.checks.some(c => c.status === 'WARN') ? 'WARN' : 'PASS';
        fs.writeFileSync(path.join(OUT_DIR, 'result.json'), JSON.stringify(result, null, 2));
        console.log(`[Monitor] ${result.status} — ${OUT_DIR}/result.json`);
    }
});
