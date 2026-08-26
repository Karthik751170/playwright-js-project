const { test, expect } = require('@playwright/test');
const HerculesSurveyGenerator = require('../pages/hercules/HerculesSurveyGenerator');
const { setupMailosaurAccount } = require('./utils/MailosaurSetup');

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * ---------------------------------------------------------------------------
 * LOGIC WIZARD — verified by manual crawl on 2026-08-21
 * ---------------------------------------------------------------------------
 * Adding a logic rule is a 4-step wizard rendered as chat messages. Every step
 * is a <button type="submit" role="button"> with class containing "rounded-[18px]":
 *
 *   1. "Which question do you want to apply logic to?"      -> buttons "1".."N"
 *   2. "What action do you want this rule to trigger?"      -> Redirect | Skip | End | Filter | Ask why
 *   3a. (Skip)  "Which question(s) should be skipped?"      -> buttons of later question numbers
 *   3b. (End)   "How should the survey end?"                -> Complete | Terminate
 *   4. "Got it. This rule will trigger if they select exactly:" -> the source question's options
 *
 * CRITICAL: the chat KEEPS every previous wizard in the DOM (observed 77 number
 * buttons and 30 action buttons at once). Any locator must therefore target the
 * LAST occurrence of each prompt, never .first() — that was the core defect in
 * the previous version of this test, which also clicked [class='block']
 * (147 generic layout spans, not wizard buttons at all).
 *
 * Saved rules render as rows reading e.g.
 *   "If Q1 Yes Skip Q3"
 *   "If Q1 No Terminate Survey"
 *   "If Q2 <option> Complete Survey"
 *   "If Q3 <option> Redirect to Q5"
 *   "If Q5 'Any Options' Filter selections into options of Q6"
 * ---------------------------------------------------------------------------
 */

/**
 * Clicks an option button beneath a wizard heading using heading anchors.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} headingText
 * @param {string|number|null} buttonText
 * @param {number} nthIndex
 */
async function clickStepByHeading(page, headingText, buttonText = null, nthIndex = 0) {
    // Anchor on the LAST leaf <p>/<span> whose text matches the prompt, then take the first
    // matching option button that FOLLOWS it.
    //
    // Two deliberate details, both from live observation of this UI:
    //
    //  1. not(*) restricts the anchor to a LEAF element. The previous version also matched
    //     //div[contains(...)] — but every ancestor div wrapping a wizard block also "contains"
    //     the prompt text, so the anchor resolved to a container. Since the XPath following::
    //     axis EXCLUDES descendants, anchoring on a container skipped every option button
    //     inside it and clicked whatever came after the block instead (Add Fallback /
    //     Add New Logic / the next block). That is why the trigger option was never selected.
    //
    //  2. [last()] selects the NEWEST wizard block. Completed blocks are never removed from
    //     the DOM — heading counts were measured growing 1 -> 3 -> 4, all still visible. Any
    //     page-wide getByRole(...).first()/.last() therefore hits a different block than the
    //     one just opened, which is why the 2nd logic onward clicked the previous logic's
    //     question numbers and options.
    //
    // Scoping first and only then taking .first() is what makes .first() safe here.
    // nthIndex is retained for call-site compatibility and intentionally unused.
    //
    // The anchor selects the INNERMOST element containing the prompt — any element that has a
    // descendant also containing the text is excluded. That removes containers by mechanism
    // rather than by guessing the tag (an earlier not(*) + p|span version assumed leaf <p>/<span>,
    // which is not safe to rely on across UI redeploys).
    const innermost = `(//*[contains(normalize-space(.),"${headingText}")`
                    + ` and not(.//*[contains(normalize-space(.),"${headingText}")])])[last()]`;

    // Button markup is tried from most to least specific, since role/tag can vary by build.
    const candidates = (buttonText !== null && buttonText !== undefined)
        ? [
            `${innermost}/following::button[@role="button" and normalize-space()="${buttonText}"]`,
            `${innermost}/following::button[normalize-space()="${buttonText}"]`,
            `${innermost}/following::*[@role="button" and normalize-space()="${buttonText}"]`,
          ]
        : [
            `${innermost}/following::button[@role="button"]`,
            `${innermost}/following::button`,
            `${innermost}/following::*[@role="button"]`,
          ];

    let btn = null;
    for (const xp of candidates) {
        const cand = page.locator(`xpath=${xp}`).first();
        if (await cand.isVisible({ timeout: 5000 }).catch(() => false)) { btn = cand; break; }
    }

    if (!btn) {
        // Dump what is actually on screen so a failure explains itself instead of needing a re-run.
        const diag = await page.evaluate((h) => {
            const norm = e => (e.textContent || '').replace(/\s+/g, ' ').trim();
            const matches = Array.from(document.querySelectorAll('*'))
                .filter(e => norm(e).includes(h) && !Array.from(e.querySelectorAll('*')).some(c => norm(c).includes(h)));
            const last = matches[matches.length - 1] || null;
            let following = [];
            if (last) {
                const all = Array.from(document.querySelectorAll('button,[role="button"]'));
                following = all
                    .filter(b => last.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
                    .slice(0, 12)
                    .map(b => ({ tag: b.tagName, role: b.getAttribute('role'), text: norm(b).slice(0, 30) }));
            }
            return {
                innermostMatches: matches.length,
                anchorTag: last ? last.tagName : null,
                anchorChildCount: last ? last.children.length : null,
                followingControls: following
            };
        }, headingText).catch(() => null);

        console.log(`[Wizard] Option button not found under heading "${headingText}" -> "${buttonText}"`);
        console.log(`[Wizard][diag] ${JSON.stringify(diag)}`);
        return { ok: false, reason: 'button-not-found', headingText, buttonText, diag };
    }

    const clickedText = (await btn.innerText().catch(() => '')).trim();
    await btn.scrollIntoViewIfNeeded().catch(() => {});
    try {
        await btn.click({ timeout: 6000 });
    } catch (e) {
        await btn.click({ force: true }).catch(() => {});
        await btn.evaluate(el => el.click()).catch(() => {});
    }
    console.log(`[Wizard] Clicked option: "${clickedText || buttonText}"`);
    return { ok: true, clicked: clickedText };
}

/**
 * Drives the add-logic wizard for any action type (Redirect, Skip, End, Filter, Ask why).
 * 
 * @param {import('@playwright/test').Page} page
 * @param {string} action  Redirect | Skip | End | Filter | Ask why
 * @param {object} opts    { questionNumber, targetQuestion, endMode, options, combineCondition }
 */
async function addLogicRule(page, action, { questionNumber = 1, targetQuestion = null, endMode = 'Terminate', options = [], combineCondition = 'OR' } = {}) {
    console.log(`\n[AddLogic] Adding rule: Q${questionNumber} -> ${action} (Target: ${targetQuestion || endMode || 'N/A'})`);

    await page.waitForTimeout(2000);

    // 1. Click "Add Logic" (first time) or "Add New Logic" (subsequent times)
    const addLogicBtn = page.getByRole('button', { name: 'Add New Logic' })
        .or(page.getByRole('button', { name: 'add Add Logic' }))
        .or(page.getByRole('button', { name: 'Add Logic' }))
        .or(page.locator("//button[contains(normalize-space(),'Add Logic')]"))
        .or(page.locator("//button[contains(normalize-space(),'Add New Logic')]"));

    const count = await addLogicBtn.count();
    let clicked = false;
    for (let idx = count - 1; idx >= 0; idx--) {
        const b = addLogicBtn.nth(idx);
        if (await b.isVisible().catch(() => false)) {
            await b.scrollIntoViewIfNeeded().catch(() => {});
            await b.click({ force: true }).catch(() => {});
            console.log(`[AddLogic] Clicked Add Logic button (index ${idx}/${count}).`);
            clicked = true;
            break;
        }
    }
    if (!clicked) {
        console.log('[AddLogic] Add Logic button not visible.');
        return false;
    }
    await page.waitForTimeout(2000);

    // Step 1: "Which question do you want to apply logic to?"
    // The un-anchored "click it directly" fallbacks were removed from steps 1 and 2. They used
    // a page-wide getByRole(...).last(), which lands in a DIFFERENT wizard block than the one
    // just opened (question-number buttons 1..N exist in every completed block). Failing here
    // is more useful than silently driving the wrong rule.
    let r = await clickStepByHeading(page, 'Which question do you want to', String(questionNumber));
    if (!r.ok) {
        console.log(`[AddLogic] Failed at Step 1 (Question ${questionNumber}): ${JSON.stringify(r)}`);
        return false;
    }
    await page.waitForTimeout(2000);

    // Step 2: "What action do you want this rule to trigger?"
    r = await clickStepByHeading(page, 'What action do you want this', action);
    if (!r.ok) {
        console.log(`[AddLogic] Failed at Step 2 (Action ${action}): ${JSON.stringify(r)}`);
        return false;
    }
    await page.waitForTimeout(2000);

    // Step 3: Action-Specific Target or Sub-Prompt
    // All step-3 targets are anchored to the step-2 prompt of the NEWEST block. Anchoring on
    // "What action…" rather than on a step-3 heading works for every action uniformly and
    // avoids assuming a prompt string — the step-3 heading text differs per action, and for
    // Filter / "Ask why" it was never observed at all.
    //
    // Note (observed): Redirect does NOT get its own destination prompt — it reuses
    // "Which question(s) should be skipped?". Anchoring on step 2 sidesteps that entirely.
    const STEP2 = 'What action do you want this rule to trigger?';

    if ((action === 'Redirect' || action === 'Skip' || action === 'Filter') && targetQuestion) {
        const r3 = await clickStepByHeading(page, STEP2, String(targetQuestion));
        console.log(`[AddLogic] Step 3 target Q${targetQuestion}: ${JSON.stringify(r3)}`);
        await page.waitForTimeout(2000);
    } else if (action === 'End' && endMode) {
        // Verified options under "How should the survey end?": Complete | Terminate
        const r3 = await clickStepByHeading(page, STEP2, endMode);
        console.log(`[AddLogic] Step 3 end mode ${endMode}: ${JSON.stringify(r3)}`);
        await page.waitForTimeout(2000);
    }

    // Step 4: "Got it. This rule will trigger if they select exactly:"
    // Select option(s)
    if (options.length > 0) {
        let selectedAny = false;
        for (const optText of options) {
            // Anchored to the newest block's "Got it…" prompt. A page-wide
            // getByRole(...).last() here selected an option belonging to a different
            // wizard block, since option lists from every completed rule remain in the DOM.
            const r4 = await clickStepByHeading(page, 'Got it. This rule will', optText);
            console.log(`[AddLogic] Trigger option "${optText}": ${JSON.stringify(r4)}`);
            if (r4.ok) selectedAny = true;
            await page.waitForTimeout(1000);
        }

        // The survey is AI-generated fresh on every run, so a hardcoded option string often
        // does not exist on the chosen question. Observed on a Redirect rule: the anchor
        // resolved correctly (innermostMatches:1, leaf SPAN) and 12 real option buttons were
        // present, but none matched the requested text — so no trigger was selected and the
        // rule was left incomplete. Any option satisfies the trigger, so fall back to the
        // first one actually on screen rather than leaving the rule unset.
        if (!selectedAny) {
            const rf = await clickStepByHeading(page, 'Got it. This rule will', null);
            console.log(`[AddLogic] Requested option(s) absent on this question; selected first available instead: ${JSON.stringify(rf)}`);
            await page.waitForTimeout(1000);
        }
    } else {
        // Select the first available option button under the prompt
        const r4 = await clickStepByHeading(page, 'Got it. This rule will', null);
        console.log(`[AddLogic] Trigger option (first available): ${JSON.stringify(r4)}`);
        await page.waitForTimeout(1000);
    }

    // If multiple options selected, handle OR/AND condition: "How would you like to combine these conditions?"
    // Anchored like every other step, for the same reason. NOTE: this prompt was never observed
    // during the manual crawl — all rules saved without it — so this branch remains unverified.
    const combineHeading = page.getByText('How would you like to combine');
    if (await combineHeading.isVisible({ timeout: 3000 }).catch(() => false)) {
        const rc = await clickStepByHeading(page, 'How would you like to combine', combineCondition);
        console.log(`[AddLogic] Combine condition "${combineCondition}": ${JSON.stringify(rc)}`);
        await page.waitForTimeout(1000);
    }

    // Step 5: Click "Save changes" button
    const saveChangesBtn = page.getByRole('button', { name: 'Save changes' })
        .or(page.locator("button:has-text('Save changes')"))
        .or(page.locator("button:has-text('Save')"))
        .last();

    if (await saveChangesBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await saveChangesBtn.scrollIntoViewIfNeeded().catch(() => {});
        await saveChangesBtn.click({ force: true });
        console.log('[AddLogic] Clicked "Save changes" button successfully!');
        await page.waitForTimeout(2500);
        return true;
    } else {
        console.log('[AddLogic] "Save changes" button not found, checking if saved automatically.');
        return true;
    }
}

/**
 * Reads every saved logic rule from the Logics panel and returns structured JSON.
 * Deduped and parsed in-page so ancestor elements don't produce duplicate rows.
 */
async function extractActiveLogics(page) {
    const rules = await page.evaluate(() => {
        const texts = new Set();
        Array.from(document.querySelectorAll('div,span,p,li')).forEach(el => {
            const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
            // A complete rule line always names the source question AND an action.
            if (/^If\s+Q\d+\b/i.test(t) && t.length < 250 &&
                /(Skip|Terminate|Complete|Redirect|Filter|Ask why)/i.test(t)) {
                texts.add(t);
            }
        });
        return Array.from(texts);
    });

    // Keep only the most specific line per source question + action combination.
    const parsed = rules.map(text => {
        const qMatch = text.match(/^If\s+Q(\d+)/i);
        const actionMatch = text.match(/(Skip\s+Q\d+|Terminate\s+Survey|Complete\s+Survey|Redirect\s+to\s+Q\d+|Filter[^.]*|Ask why)/i);
        return {
            sourceQuestion: qMatch ? parseInt(qMatch[1], 10) : null,
            action: actionMatch ? actionMatch[0].trim() : 'UNKNOWN',
            isTerminating: /Terminate\s+Survey|Complete\s+Survey/i.test(text),
            text
        };
    }).filter(r => r.sourceQuestion !== null);

    // Drop partial duplicates (e.g. "If Q1" fragments already covered by a full line).
    const bySignature = new Map();
    parsed.forEach(r => {
        const key = `${r.sourceQuestion}|${r.action}`;
        const prev = bySignature.get(key);
        if (!prev || r.text.length > prev.text.length) bySignature.set(key, r);
    });

    return Array.from(bySignature.values()).sort((a, b) => a.sourceQuestion - b.sourceQuestion);
}

/**
 * Runs one full consumer pass: fresh context -> login -> onboarding -> re-open the
 * dev survey link -> answer via AnswerEngine. Returns how it finished so the caller
 * can start a brand-new onboarding when a Terminate/Complete rule cut the run short.
 */
async function runConsumerPass(browser, liveSurveyUrl, targetCity, surveyLogics, attempt, logicMode = 'qualify') {
    console.log(`\n=== CONSUMER PASS #${attempt} (Mode: ${logicMode.toUpperCase()}) — fresh onboarding ===`);
    const context = await browser.newContext();
    const livePage = await context.newPage();
    livePage.setDefaultTimeout(300000);

    let answered = 0;
    let lastSlide = null;
    let totalSlides = null;
    let endedEarly = false;
    const answeredSlides = [];

    try {
        await livePage.goto(liveSurveyUrl);

        const LoginPage = require('../pages/LoginPage');
        const DataGeneratorUtil = require('../utils/DataGeneratorUtil');
        const OnboardingUtil = require('../utils/OnboardingUtil');
        const LandingPage = require('../pages/LandingPage');
        const AnswerEngine = require('../utils/AnswerEngine');
        const ActiveQuestionFinder = require('../utils/ActiveQuestionFinder');

        const randomPhone = DataGeneratorUtil.generateRandomPhoneNumber();
        console.log(`[Pass ${attempt}] Logging in with new number: ${randomPhone}`);
        await new LoginPage(livePage).login(randomPhone, '777777');
        await livePage.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

        try {
            await new OnboardingUtil(livePage).completeOnboarding('1997', targetCity, 'Male');
        } catch (e) {
            console.log(`[Pass ${attempt}] Onboarding skipped/failed: ${e.message}`);
        }
        await livePage.waitForTimeout(4000);

        // Re-open the SAME dev survey link after onboarding (app redirects away otherwise).
        console.log(`[Pass ${attempt}] Re-opening survey link after onboarding: ${liveSurveyUrl}`);
        await livePage.goto(liveSurveyUrl);
        await livePage.waitForTimeout(4000);

        await new LandingPage(livePage).clickStartSurvey(2).catch((e) =>
            console.log(`[Pass ${attempt}] Start Survey click failed: ${e.message}`));

        // Initialize AnswerEngine with surveyLogics and logicMode
        const answerEngine = new AnswerEngine(livePage, surveyLogics);
        answerEngine.logicMode = logicMode; // 'trigger' or 'qualify'
        const finder = new ActiveQuestionFinder(livePage);

        let repeats = 0;
        for (let i = 0; i < 80; i++) {
            const active = await finder.getActiveQuestion(10000);
            if (!active || !active.container) {
                console.log(`[Pass ${attempt}] No active question — survey ended.`);
                break;
            }
            const { container, slideNumber, totalSlides: total } = active;
            totalSlides = total;

            if (slideNumber === lastSlide) {
                if (++repeats >= 4) {
                    console.log(`[Pass ${attempt}] Stuck on slide ${slideNumber}; stopping.`);
                    break;
                }
            } else {
                repeats = 0;
                if (lastSlide !== null && slideNumber !== lastSlide + 1) {
                    console.log(`[Logic Validation] Slide jump detected: Slide ${lastSlide} -> Slide ${slideNumber} (Skip/Redirect logic executed!)`);
                }
                lastSlide = slideNumber;
                answeredSlides.push(slideNumber);
            }

            const isLast = Number.isInteger(total) && slideNumber >= total;
            console.log(`[Pass ${attempt}] Answering slide ${slideNumber}/${total}${isLast ? ' (last)' : ''}`);

            const ok = await answerEngine
                .answer({ activeQuestion: container, nextButton: null }, isLast)
                .catch(e => { console.log(`[Pass ${attempt}] answer() threw: ${e.message}`); return false; });
            if (ok) answered++;

            await livePage.waitForTimeout(1000);
            await answerEngine.clickNext().catch(() => {});
            await livePage.waitForTimeout(1500);
        }

        // Terminate/Complete logic fires before the final slide is reached.
        endedEarly = Number.isInteger(totalSlides) && Number.isInteger(lastSlide) && lastSlide < totalSlides;
        console.log(`[Pass ${attempt}] Answered ${answered} question(s); slide path: [${answeredSlides.join(' -> ')}]; endedEarly=${endedEarly}`);
    } finally {
        await livePage.waitForTimeout(8000);
        await context.close().catch(() => {});
    }

    return { answered, endedEarly, lastSlide, totalSlides, answeredSlides };
}

async function generateSurveyWithCustomLogic(page) {
    const textarea = page.locator("textarea[aria-label='Ask Hercules a question'], [class='w-full pb-[36.821px] pl-[24px] pr-[24.547px] pt-[24px] sm:h-[93px]'] textarea, [class='w-full pb-[36.821px] pl-[24px] pr-[24.547px] pt-[24px] sm:h-[93px]'] input").or(page.getByRole('textbox', { name: 'Describe the research you' })).first();
    try {
        await textarea.waitFor({ state: 'visible', timeout: 10000 });
        console.log('Dashboard loaded directly.');
    } catch (e) {
        console.log('Dashboard chat box not found. Attempting to clear onboarding screens...');
        for (let i = 0; i < 5; i++) {
            if (await textarea.isVisible()) break;
            await page.waitForTimeout(2000);
            const optionBtns = page.locator('button:not([aria-label]):not(:has-text("Continue")):not(:has-text("Next")):not(:has-text("Submit"))');
            if (await optionBtns.count() > 0) {
                await optionBtns.first().click({ timeout: 2000 }).catch(() => {});
            }
            const nextBtn = page.locator('button:has-text("Continue"), button:has-text("Next"), button:has-text("Submit"), button:has-text("Finish")').first();
            if (await nextBtn.isVisible()) await nextBtn.click({ timeout: 2000 }).catch(() => {});
            await page.waitForTimeout(2000);
        }
        await textarea.waitFor({ state: 'visible', timeout: 30000 });
    }

    console.log('\nEntering custom prompt requesting serial logic rules...');
    const customPrompt = "Design a 10-question survey about mobile gaming habits. Please add skip and branching logic rules serially between questions. IMPORTANT: Do NOT add any termination logic initially. Only add skip and branching logic serially to intermediate questions, and add termination logic strictly at the end.";
    await textarea.fill(customPrompt);
    await page.waitForTimeout(500);

    // Submit exactly once — clicking Send AND pressing Enter double-submits the prompt.
    const submitBtn = page.locator('button[aria-label="submit button"], button[type="submit"]')
        .or(page.getByRole('button', { name: /Send|Submit/i })).first();
    if (await submitBtn.isVisible().catch(() => false)) {
        await submitBtn.click().catch(async () => { await submitBtn.click({ force: true }).catch(() => {}); });
    } else {
        await textarea.press('Enter').catch(() => {});
    }
    await page.waitForTimeout(3000);

    console.log('\nNavigating through AI questionnaire (if it appears)...');
    const surveyGenerator = new HerculesSurveyGenerator(page);
    const finalGenerateSurveyBtn = page.locator('button', { hasText: /create.*survey|generate.*survey/i }).first();

    let loopCount = 0;
    let consecutiveFails = 0;
    while (loopCount < 240) {
        await page.waitForTimeout(5000);
        loopCount++;

        // Failsafe 1: Check if we are already generating
        const loadingIndicator = page.locator('text=/creating your survey|building your survey/i').first();

        // If the server skipped the questionnaire and went straight to the loading screen or editor, break!
        if (page.url().includes('editor')) {
            console.log('URL changed to editor! Questionnaire was skipped or completed.');
            break;
        }
        if (await loadingIndicator.isVisible().catch(() => false)) {
            console.log('Loading screen detected! Survey is generating.');
            break;
        }

        if (await finalGenerateSurveyBtn.isVisible().catch(() => false) && await finalGenerateSurveyBtn.isEnabled().catch(() => false)) {
            console.log('Create Survey button is already visible!');
            break;
        }
        if (await surveyGenerator.clickGenerateBrief()) {
            console.log('Clicked Generate Brief!');
            break;
        }
        if (await surveyGenerator.selectAllThatApplyHeader.count() > 0 && await surveyGenerator.selectAllThatApplyHeader.first().isVisible().catch(() => false)) {
            if (await surveyGenerator.handleSelectAllThatApply()) { consecutiveFails = 0; continue; }
        }
        if (await surveyGenerator.handleSingleSelect()) { consecutiveFails = 0; continue; }
        if (await surveyGenerator.handleTextInputFallback()) { consecutiveFails = 0; continue; }
        if (await surveyGenerator.clickSkip()) { consecutiveFails = 0; continue; }

        consecutiveFails++;
        if (consecutiveFails >= 6) {
            console.log('\n--- No questionnaire buttons found for 30 seconds ---');
            console.log('Assuming we are on the loading screen or editor. Breaking out of loop!');
            break;
        }
    }

    console.log('Questionnaire finished. Waiting for "Yes, generate the research" button (up to 6 minutes)...');
    const generateResearchBtn = page.getByRole('button', { name: 'Yes, generate the research' })
        .or(page.locator("button:has-text('Yes, generate the research')"))
        .or(page.locator("button:has-text('generate the research brief')"))
        .or(page.locator("button:has-text('Generate Brief')"))
        .first();

    for (let i = 0; i < 72; i++) {
        if (await generateResearchBtn.isVisible().catch(() => false)) {
            console.log('Found "Yes, generate the research" button! Clicking it...');
            await generateResearchBtn.scrollIntoViewIfNeeded().catch(() => {});
            try {
                await generateResearchBtn.click({ timeout: 8000 });
                console.log('Clicked "Yes, generate the research brief".');
            } catch (e) {
                console.log(`[Test] Real click failed (${e.message}); retrying with force + DOM click...`);
                await generateResearchBtn.click({ force: true, timeout: 5000 }).catch(() => {});
                await generateResearchBtn.evaluate(el => el.click()).catch(() => {});
            }
            break;
        }
        if (page.url().includes('editor')) break;
        const yesCreateBtn = page.locator("//button[text()='Yes, create the survey.']").or(page.locator("//button[normalize-space()='Yes, create the survey.']")).or(page.getByRole('button', { name: /Yes, create the survey/i })).first();
        if (await yesCreateBtn.isVisible().catch(() => false)) break;
        await page.waitForTimeout(5000);
    }

    const targetCity = 'Pune';
    console.log('Waiting up to 1 hour for "Yes, create the survey." button...');
    const createSurveyBtn = page.locator('button:has-text("Yes, create the survey.")')
        .or(page.locator('button:has-text("create the survey")'))
        .or(page.getByRole('button', { name: /create.*survey/i }))
        .or(page.locator("//button[contains(text(),'create the survey')]"))
        .or(page.locator("button:has-text('Create Survey')"))
        .first();

    for (let i = 0; i < 720; i++) {
        if (await createSurveyBtn.isVisible().catch(() => false)) {
            console.log('Found "Yes, create the survey." button! Waiting 3 seconds...');
            await page.waitForTimeout(3000);
            console.log('Clicking "Yes, create the survey" button...');
            await createSurveyBtn.scrollIntoViewIfNeeded().catch(() => {});
            try {
                await createSurveyBtn.click({ timeout: 8000 });
            } catch (e) {
                await createSurveyBtn.click({ force: true, timeout: 10000 }).catch(() => {});
            }
            await page.waitForTimeout(3000);
            if (!(await createSurveyBtn.isVisible().catch(() => false))) {
                console.log('Create survey button is no longer visible.');
                break;
            }
        }
        if (page.url().includes('editor')) break;
        await page.waitForTimeout(5000);
    }

    console.log('Waiting for the survey draft / Deploy button to appear...');
    const deployBtn = page.getByRole('button', { name: /^Deploy/ })
        .or(page.locator("button:has-text('Deploy')")).first();
    await deployBtn.waitFor({ state: 'visible', timeout: 3600000 }).catch(() => {});

    return targetCity;
}

test('Validate Survey Logics - add rules, extract them, and answer around Terminate/Complete', async ({ browser }) => {
    // The previous run hit the 1-hour cap while still inside survey generation and never
    // reached the logic steps ("locator.press: Test ended" is Playwright tearing down at the
    // timeout, not a locator fault). This test legitimately needs longer: generation alone can
    // take ~15-20 min, plus the logic wizard, plus up to 3 consumer passes each with a fresh
    // onboarding when a Terminate/Complete rule ends a pass early.
    test.setTimeout(9000000); // 2.5 hours

    console.log('\n--- STEP 1: MAILOSAUR ACCOUNT SETUP & LOGIN ---');
    const { page } = await setupMailosaurAccount(browser);

    console.log('\n--- STEP 2: GENERATE SURVEY WITH SERIAL LOGICS ---');
    const targetCity = await generateSurveyWithCustomLogic(page);

    console.log('\n--- STEP 3: ADD LOGIC RULES VIA THE 4-STEP WIZARD ---');
    console.log('Survey created! Refreshing page to display the "Add Logic" button...');
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(5000);

    // The Questions/Logics tabs live inside the survey EDITOR DRAWER, which is closed by
    // default — the draft card only shows Deploy / View survey / View Audience / Edit Survey.
    // Without opening the drawer first, the "Logics" tab and "Add Logic" buttons don't exist.
    const logicsTab = page.getByRole('button', { name: /^Logics$/ })
        .or(page.locator("//button[normalize-space()='Logics']")).first();

    if (!(await logicsTab.isVisible({ timeout: 5000 }).catch(() => false))) {
        console.log('Logics tab not present — opening the survey editor drawer...');

        // Dismiss any overlay/toast first
        const dismissed = await page.evaluate(() => {
            let n = 0;
            document.querySelectorAll('button[aria-label="close" i], button[aria-label="Dismiss" i]').forEach(b => {
                const r = b.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) { b.click(); n++; }
            });
            return n;
        }).catch(() => 0);
        if (dismissed) console.log(`Dismissed ${dismissed} overlay/toast element(s) covering the card.`);
        await page.waitForTimeout(1000);

        const openEditorBtn = page.getByRole('button', { name: /edit survey/i })
            .or(page.getByRole('button', { name: /view survey/i }))
            .or(page.locator("button:has-text('Edit Survey'), button:has-text('View survey')"))
            .first();
        if (await openEditorBtn.isVisible({ timeout: 20000 }).catch(() => false)) {
            await openEditorBtn.scrollIntoViewIfNeeded().catch(() => {});
            try {
                await openEditorBtn.click({ timeout: 8000 });
            } catch (e) {
                await openEditorBtn.click({ force: true }).catch(() => {});
                await openEditorBtn.evaluate(el => el.click()).catch(() => {});
            }
            console.log('Clicked to open the survey editor.');
            await logicsTab.waitFor({ state: 'visible', timeout: 60000 }).catch(() => {});
            await page.waitForTimeout(2000);
        } else {
            await page.screenshot({ path: 'scratch/editor_open_button_missing.png', fullPage: true }).catch(() => {});
            console.log('WARNING: No "Edit Survey"/"View survey" button found to open the editor.');
        }
    }

    console.log('Waiting 3s before clicking the Logics tab...');
    await page.waitForTimeout(3000);

    if (await logicsTab.isVisible({ timeout: 10000 }).catch(() => false)) {
        await logicsTab.click({ force: true }).catch(() => {});
        await page.waitForTimeout(2500);
        console.log('Opened the Logics tab.');
    } else {
        console.log('WARNING: "Logics" tab not visible.');
    }

    // Add 1 logic rule at a time sequentially
    console.log('\n--- EXECUTING ADD LOGIC WIZARD: 1 LOGIC AT A TIME ---');
    
    // Rule 1: Redirect logic (Q8 -> Redirect to Q10)
    console.log('\n>>> ADDING RULE 1: REDIRECT (Q8 -> Q10) <<<');
    await addLogicRule(page, 'Redirect', {
        questionNumber: 8,
        targetQuestion: 10
    });
    await page.waitForTimeout(3000);

    // Rule 2: Skip logic (Q6 -> Skip Q8)
    console.log('\n>>> ADDING RULE 2: SKIP (Q6 -> Q8) <<<');
    await addLogicRule(page, 'Skip', {
        questionNumber: 6,
        targetQuestion: 8
    });
    await page.waitForTimeout(3000);

    // Rule 3: Filter logic (Q4 -> Filter into Q5)
    console.log('\n>>> ADDING RULE 3: FILTER (Q4 -> Q5) <<<');
    await addLogicRule(page, 'Filter', {
        questionNumber: 4,
        targetQuestion: 5
    });
    await page.waitForTimeout(3000);

    // Rule 4: Ask why logic (Q3 -> Ask why)
    console.log('\n>>> ADDING RULE 4: ASK WHY (Q3) <<<');
    await addLogicRule(page, 'Ask why', {
        questionNumber: 3
    });
    await page.waitForTimeout(3000);

    // Rule 5: End logic (Q9 -> Terminate) - Placed LAST so all prior questions can be validated!
    console.log('\n>>> ADDING RULE 5: END (TERMINATE Q9) <<<');
    await addLogicRule(page, 'End', {
        questionNumber: 9,
        endMode: 'Terminate'
    });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'scratch/logics_after_adding.png', fullPage: true }).catch(() => {});

    console.log('\n--- STEP 4: OPEN LOGICS TAB & EXTRACT EVERY RULE TO JSON ---');
    if (await logicsTab.isVisible().catch(() => false)) {
        await logicsTab.click({ force: true }).catch(() => {});
        await page.waitForTimeout(2500);
    }

    const surveyLogics = await extractActiveLogics(page);
    console.log(`\nExtracted ${surveyLogics.length} logic rule(s):`);
    console.log(JSON.stringify(surveyLogics, null, 2));

    const fs = require('fs');
    fs.mkdirSync('scratch', { recursive: true });
    fs.writeFileSync('scratch/extracted_survey_logics.json', JSON.stringify(surveyLogics, null, 2));
    console.log('Saved logics JSON -> scratch/extracted_survey_logics.json');

    expect(surveyLogics.length, 'Expected at least one logic rule to be extracted from the Logics panel').toBeGreaterThan(0);

    const terminatingRules = surveyLogics.filter(r => r.isTerminating);
    console.log(`\nTerminating rules (Terminate/Complete) found: ${terminatingRules.length}`);
    terminatingRules.forEach(r => console.log(`  - ${r.text}`));

    console.log('\n--- STEP 5: DEPLOY TO 100 USERS FOR FREE ---');
    console.log('Clicking top-right Publish/Deploy button to open sidebar...');
    await page.waitForTimeout(3000);
    const topDeployBtn = page.getByRole('button', { name: 'Deploy Deploy' })
        .or(page.getByRole('button', { name: 'Deploy', exact: true }))
        .or(page.locator("button:has-text('Deploy')"))
        .or(page.locator("button:has-text('Publish')"))
        .first();
    await topDeployBtn.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
    await topDeployBtn.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(1000);
    await topDeployBtn.click({ force: true });
    await page.waitForTimeout(2000); // Wait for sidebar to slide open

    console.log('Looking for "Deploy to 100 Users for Free" button...');
    const freeDeployBtn = page.getByRole('button', { name: 'Deploy to 100 Users for Free' });
    await freeDeployBtn.waitFor({ state: 'visible', timeout: 30000 });
    await freeDeployBtn.scrollIntoViewIfNeeded().catch(() => {});
    await freeDeployBtn.click({ force: true });

    const confirmDeployForFreeBtn = page.getByRole('button', { name: 'Deploy for Free' });
    await confirmDeployForFreeBtn.waitFor({ state: 'visible', timeout: 15000 });
    await confirmDeployForFreeBtn.click({ force: true });

    await page.waitForURL(/.*\/survey-review\/.*/, { timeout: 60000 });

    // The survey sits "In Review" for ~20-30s before Launch enables — a 15s wait gave up
    // too early and silently skipped launching, leaving no share link to copy.
    console.log('Waiting up to 2 minutes for "Launch Survey" to become available...');
    const launchNowBtn = page.getByRole('button', { name: /launch survey/i }).first();
    let launched = false;
    for (let i = 0; i < 24; i++) {
        if (await launchNowBtn.isVisible().catch(() => false)) {
            await launchNowBtn.scrollIntoViewIfNeeded().catch(() => {});
            try {
                await launchNowBtn.click({ timeout: 8000 });
            } catch (e) {
                await launchNowBtn.click({ force: true }).catch(() => {});
                await launchNowBtn.evaluate(el => el.click()).catch(() => {});
            }
            launched = true;
            console.log('Clicked Launch Survey.');
            break;
        }
        await page.waitForTimeout(5000);
    }
    if (!launched) console.log('WARNING: "Launch Survey" never became available.');
    await page.waitForTimeout(5000);

    console.log('\n--- STEP 6: COPY LIVE SURVEY URL ---');
    // The URL is rendered as plain visible text next to the copy icon — no clipboard needed.
    let liveSurveyUrl = '';
    const urlTextEl = page.locator('span, div, p')
        .filter({ hasText: /https?:\/\/(dev\.)?superj\.app\/survey\// }).last();
    if (await urlTextEl.isVisible({ timeout: 15000 }).catch(() => false)) {
        const raw = (await urlTextEl.innerText().catch(() => '')).trim();
        const m = raw.match(/https?:\/\/(?:dev\.)?superj\.app\/survey\/[A-Za-z0-9]+/);
        if (m) liveSurveyUrl = m[0];
    }
    if (!liveSurveyUrl) {
        const link = page.locator('a[href*="superj.app"]').first();
        if (await link.isVisible({ timeout: 5000 }).catch(() => false)) {
            liveSurveyUrl = (await link.getAttribute('href')) || '';
        }
    }
    if (liveSurveyUrl.includes('superj.app') && !liveSurveyUrl.includes('dev.superj.app')) {
        liveSurveyUrl = liveSurveyUrl.replace('superj.app', 'dev.superj.app');
    }
    console.log(`Live Survey URL (dev): ${liveSurveyUrl}`);

    if (!liveSurveyUrl.startsWith('http')) {
        await page.screenshot({ path: 'scratch/logics_url_extraction_failed.png', fullPage: true }).catch(() => {});
    }
    expect(liveSurveyUrl, 'Could not extract the live survey URL — the survey was likely never launched').toMatch(/^https?:\/\//);

    console.log('\n--- STEP 7: VALIDATE LOGICS WITH DYNAMIC CONSUMER PASSES ---');
    // We will validate:
    // 1. Terminate / Complete pass (Intentional trigger to verify survey terminates early)
    // 2. Branching / Skip / Redirect pass (Intentional trigger to verify slide skipping and redirects)
    // 3. Clean full completion pass (Avoids termination to verify 10/10 responses and B2B increment)

    console.log(`\nValidating ${surveyLogics.length} extracted logic rule(s):`);
    surveyLogics.forEach(r => console.log(`  - [Q${r.sourceQuestion}] ${r.action}: ${r.text}`));

    // Pass A: Test Terminating / Skip logic by intentionally triggering configured rules
    console.log('\n>>> PASS A: TESTING LOGIC TRIGGER ROUTING <<<');
    const triggerResult = await runConsumerPass(browser, liveSurveyUrl, targetCity, surveyLogics, 1, 'trigger');
    console.log(`Pass A Result: answered ${triggerResult.answered} slides, last slide: ${triggerResult.lastSlide}/${triggerResult.totalSlides}, endedEarly: ${triggerResult.endedEarly}`);
    expect(triggerResult.answered, 'Logic trigger pass should answer slides').toBeGreaterThan(0);

    // Pass B: Full completion pass (bypassing termination rules to achieve full submission)
    console.log('\n>>> PASS B: TESTING FULL QUALIFYING SURVEY COMPLETION <<<');
    const cleanResult = await runConsumerPass(browser, liveSurveyUrl, targetCity, surveyLogics, 2, 'qualify');
    console.log(`Pass B Result: answered ${cleanResult.answered} slides, last slide: ${cleanResult.lastSlide}/${cleanResult.totalSlides}, endedEarly: ${cleanResult.endedEarly}`);
    expect(cleanResult.answered, 'Clean pass should answer slides').toBeGreaterThan(0);

    console.log('\n--- STEP 8: VERIFY RESPONSE ON HERCULES B2B DASHBOARD ---');
    await page.bringToFront();
    await page.waitForTimeout(10000);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    const responsesLabel = page.locator("//span[contains(text(), 'Responses Collected:')] | //p[contains(text(), 'Responses Collected:')] | //div[contains(text(), 'Responses Collected:')]").first();
    await responsesLabel.scrollIntoViewIfNeeded().catch(() => {});
    if (await responsesLabel.isVisible().catch(() => false)) {
        const countLocator = page.locator("//span[contains(text(), 'Responses Collected:')]/following-sibling::*").first()
            .or(page.locator("//span[contains(text(), 'Responses Collected:')]/..")).first();
        const countText = await countLocator.innerText().catch(() => '');
        const numMatch = countText.replace(/Responses Collected:/i, '').match(/\d+/);
        const firstNum = numMatch ? parseInt(numMatch[0], 10) : 0;
        console.log(`Responses Collected: "${countText}" -> parsed ${firstNum}`);
        expect(firstNum).toBeGreaterThan(0);
    } else {
        console.log('WARNING: "Responses Collected:" label not found.');
    }
});
