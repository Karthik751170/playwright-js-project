const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const HerculesSurveyGenerator = require('../../pages/hercules/HerculesSurveyGenerator');
const { parseTargetAudience, audienceConsistencyIssues } = require('../../utils/HerculesBriefParser');
const { generateTopic } = require('../../utils/HerculesTopicGenerator');
const { ensureSignedIn } = require('../../utils/HerculesEmailAuth');
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
const OUT_DIR = process.env.MONITOR_OUT_DIR || path.resolve('reports/monitor', new Date().toISOString().replace(/[:.]/g, '-'));
const RUN_BUDGET = EXPECT.run.maxMinutes * 60_000;

test('Hourly monitor: create survey and validate', async ({ page }) => {
    test.setTimeout(RUN_BUDGET + 5 * 60_000);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const t0 = Date.now();
    const deadline = t0 + RUN_BUDGET;
    const remaining = () => Math.max(0, deadline - Date.now());
    const mins = ms => Math.round(ms / 600) / 100;

    const result = { startedAt: new Date(t0).toISOString(), baseUrl: BASE_URL, checks: [], facts: {}, screenshots: [] };
    const check = (name, ok, detail, severity = 'fail') => {
        const status = ok ? 'PASS' : severity === 'warn' ? 'WARN' : 'FAIL';
        result.checks.push({ name, status, detail });
        console.log(`[Monitor] ${status} ${name}${detail ? ` — ${detail}` : ''}`);
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
            check('login', true, `${auth.method}`);
        } catch (e) {
            check('login', false, e.message);
            await shot('login-failed');
            return;
        }

        // 2. Prompt
        const topic = generateTopic({ seed: Date.now() });
        const prompt = `QA-MONITOR-${Date.now()} ${topic.prompt}`;
        const wizardContext = [topic.product && `We are launching ${topic.product}`, topic.geography && `across ${topic.geography}`]
            .filter(Boolean).join(' ') || 'We are launching across all tier 1, tier 2 and metro cities in India.';
        result.facts.prompt = prompt;

        await page.getByRole('textbox', { name: /Describe the research you/i })
            .or(page.locator("textarea[aria-label='Ask Hercules a question']")).first().fill(prompt);
        await page.getByRole('button', { name: 'Send' }).click();
        const chatOk = await page.waitForURL(/\/ai\/chat\/[^/]+/, { timeout: 120_000 }).then(() => true).catch(() => false);
        result.facts.chatUrl = page.url();
        if (!check('chat opened', chatOk, page.url())) { await shot('no-chat'); return; }

        // 3. Wizard + brief, until "create the survey" appears
        const gen = new HerculesSurveyGenerator(page);
        const createBtn = page.getByRole('button', { name: /create the survey/i }).last();
        const runVersionBtn = page.getByRole('button', { name: /^Run (your version|it this way)$/i }).last();
        const versionCard = page.locator('.bg-white.rounded-\\[12px\\].border').last();
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
        if (!check('brief offers "create the survey"', briefOk, `${steps} steps, ${mins(briefMs)} min (limit ${EXPECT.brief.maxMinutes})`)) {
            await shot('brief-not-ready');
            return;
        }
        check('wizard step count', steps <= EXPECT.brief.maxWizardSteps, `${steps} (max ${EXPECT.brief.maxWizardSteps})`);
        await shot('research-brief');

        const briefText = await page.locator('body').innerText();
        fs.writeFileSync(path.join(OUT_DIR, 'brief.txt'), briefText);
        const audience = parseTargetAudience(briefText);
        result.facts.targetAudience = audience && { ...audience, raw: undefined };
        result.facts.briefQuestionCount = Number(briefText.match(/(\d+)[-\s]question/i)?.[1]) || null;
        if (EXPECT.brief.requireTargetAudience) check('brief has Target Audience', !!audience, audience ? `sample ${audience.totalSampleSize}` : 'section not found');
        for (const issue of audience ? audienceConsistencyIssues(audience) : []) {
            check('Target Audience consistency', false, issue, EXPECT.brief.failOnAudienceInconsistency ? 'fail' : 'warn');
        }

        // 4. Create the survey
        await createBtn.scrollIntoViewIfNeeded();
        await createBtn.click();
        const tCreate = Date.now();
        const createWait = Math.max(1000, Math.min(remaining(), EXPECT.survey.maxMinutesAfterCreate * 60_000));
        const surveyCard = page.getByText(/Survey is In-drafts/i).or(page.getByText(/^Survey Version \(\d+\)$/)).first();
        let created = await Promise.race([
            surveyCard.waitFor({ state: 'visible', timeout: createWait }),
            page.waitForURL(/\/editor\//, { timeout: createWait }),
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
        if (!check('survey created', created || !EXPECT.survey.requireCreated,
            created ? `${result.facts.createMinutes} min` : `no survey within ${EXPECT.survey.maxMinutesAfterCreate} min + reload (known "no response" bug?)`)) return;
        if (afterReload) check('survey visible without reload', false, 'only appeared after a reload (known bug)', EXPECT.survey.failIfOnlyVisibleAfterReload ? 'fail' : 'warn');

        // 5. Validate the created survey
        if (EXPECT.survey.requireDeployButton) {
            const deploy = await page.getByRole('button', { name: /Deploy/ }).first().waitFor({ state: 'visible', timeout: 60_000 }).then(() => true).catch(() => false);
            check('Deploy button visible', deploy);
        }
        await page.waitForTimeout(5000);
        const surveyText = await page.locator('body').innerText();
        fs.writeFileSync(path.join(OUT_DIR, 'survey.txt'), surveyText);
        // Questions panel lists Q1, Q2, …; fall back to the brief's "N-question" count.
        const qNums = [...surveyText.matchAll(/(?:^|\n)\s*Q(\d{1,3})\b/g)].map(m => Number(m[1]));
        const qCount = qNums.length ? Math.max(...qNums) : result.facts.briefQuestionCount;
        result.facts.questionCount = qCount;
        result.facts.questionCountSource = qNums.length ? 'questions panel' : 'brief';
        check('question count in range', qCount != null && qCount >= EXPECT.survey.minQuestions && qCount <= EXPECT.survey.maxQuestions,
            `${qCount ?? 'not found'} (${result.facts.questionCountSource}; expected ${EXPECT.survey.minQuestions}-${EXPECT.survey.maxQuestions})`);
        check('whole run within budget', Date.now() - t0 <= RUN_BUDGET, `${mins(Date.now() - t0)} min (max ${EXPECT.run.maxMinutes})`);
    } catch (e) {
        check('unexpected error', false, e.stack?.split('\n').slice(0, 3).join(' | ') || String(e));
        await shot('unexpected-error');
    } finally {
        result.finishedAt = new Date().toISOString();
        result.durationMinutes = mins(Date.now() - t0);
        result.status = result.checks.some(c => c.status === 'FAIL') ? 'FAIL' : result.checks.some(c => c.status === 'WARN') ? 'WARN' : 'PASS';
        fs.writeFileSync(path.join(OUT_DIR, 'result.json'), JSON.stringify(result, null, 2));
        console.log(`[Monitor] ${result.status} — ${OUT_DIR}/result.json`);
    }
});
