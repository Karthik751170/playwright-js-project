const { test, expect } = require('@playwright/test');
const AnswerEngine = require('../utils/AnswerEngine');
const ActiveQuestionFinder = require('../utils/ActiveQuestionFinder');
const LoginPage = require('../pages/LoginPage');
const OnboardingUtil = require('../utils/OnboardingUtil');
const LandingPage = require('../pages/LandingPage');
const DataGeneratorUtil = require('../utils/DataGeneratorUtil');

test('Run and validate specific survey 6a8d3a99c024016ec9ae8f2a', async ({ page }) => {
    test.setTimeout(300000); // 5 minutes

    const targetUrl = 'https://dev.superj.app/survey/6a8d3a99c024016ec9ae8f2a';
    console.log(`\n========================================`);
    console.log(`[Survey Runner] Navigating to: ${targetUrl}`);
    console.log(`========================================\n`);

    await page.goto(targetUrl);
    await page.waitForTimeout(3000);

    // 1. Handle Login if present
    const loginInput = page.locator('input[type="tel"], input[placeholder*="phone" i], input[placeholder*="mobile" i]');
    if (await loginInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log('[Survey Runner] Login screen detected. Logging in...');
        const loginPage = new LoginPage(page);
        const randomPhone = DataGeneratorUtil.generateRandomPhoneNumber();
        console.log(`[Survey Runner] Generated random phone number: ${randomPhone}`);
        await loginPage.login(randomPhone, '777777');
        await page.waitForTimeout(10000);
    }

    // 2. Handle Onboarding if present
    try {
        const onboardingUtil = new OnboardingUtil(page);
        const isOnboarding = await page.locator("text=/select your birth year|where do you live|select your gender/i").isVisible({ timeout: 4000 }).catch(() => false);
        if (isOnboarding) {
            console.log('[Survey Runner] Onboarding screen detected. Completing onboarding...');
            await onboardingUtil.completeOnboarding('1997', 'Pune', 'Male');
            await page.waitForTimeout(5000);
            
            console.log(`[Survey Runner] Redirecting back to survey URL: ${targetUrl}`);
            await page.goto(targetUrl);
            await page.waitForTimeout(5000);
        }
    } catch (e) {
        console.log('[Survey Runner] Onboarding skipped or not needed:', e.message);
    }

    // 3. Click Start Survey if landing page is shown
    try {
        const landingPage = new LandingPage(page);
        const startBtn = page.locator("button:has-text('Start Survey'), button:has-text('Take Survey'), button:has-text('Start')").first();
        if (await startBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            console.log('[Survey Runner] Clicking Start Survey button...');
            await startBtn.click({ force: true });
            await page.waitForTimeout(3000);
        }
    } catch (e) {}

    // 4. Autonomous Question Answering Loop
    console.log('\n[Survey Runner] Initializing AnswerEngine and ActiveQuestionFinder...');
    const answerEngine = new AnswerEngine(page);
    const questionFinder = new ActiveQuestionFinder(page);

    let answeredCount = 0;
    let lastSlideNumber = null;
    let sameSlideRepeats = 0;
    const slidesLog = [];

    for (let i = 1; i <= 50; i++) {
        const activeData = await questionFinder.getActiveQuestion(10000);
        if (!activeData || !activeData.container) {
            console.log('[Survey Runner] No more active questions found. Checking for completion...');
            break;
        }

        const { container, slideNumber, totalSlides } = activeData;

        // Stuck slide guard
        if (slideNumber === lastSlideNumber) {
            sameSlideRepeats++;
            if (sameSlideRepeats >= 4) {
                console.log(`[Survey Runner] Stuck on slide ${slideNumber} for ${sameSlideRepeats} attempts. Breaking loop.`);
                break;
            }
        } else {
            sameSlideRepeats = 0;
            lastSlideNumber = slideNumber;
        }

        const isLastQuestion = Number.isInteger(totalSlides) && slideNumber >= totalSlides;
        const questionText = ((await container.innerText().catch(() => "")) || "").replace(/\s+/g, ' ').trim();
        console.log(`\n========================================`);
        console.log(`[Survey Runner] Slide ${slideNumber}/${totalSlides}${isLastQuestion ? ' (FINAL SLIDE)' : ''}`);
        console.log(`[Question Text]: "${questionText.substring(0, 120)}..."`);
        console.log(`========================================`);

        // Screenshot current slide
        await page.screenshot({ path: `scratch/survey_run_slide_${slideNumber}.png`, fullPage: true }).catch(() => {});

        // Check for Disqualification / Screen-out / Completion modal
        const modalBtn = page.locator("button:has-text('Okay!'), button:has-text('Okay'), button:has-text('Earn More Rewards'), button:has-text('Finish')").first();
        if (await modalBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            console.log('[Survey Runner] Completion / Notification modal detected! Clicking button...');
            await modalBtn.click({ force: true });
            await page.waitForTimeout(3000);
            break;
        }

        // Answer question
        const elements = { activeQuestion: container, nextButton: null };
        const answered = await answerEngine.answer(elements, isLastQuestion);
        
        if (answered) {
            answeredCount++;
            slidesLog.push({ slide: slideNumber, text: questionText.substring(0, 80), status: 'ANSWERED' });
        } else {
            console.log(`[Survey Runner] Warning: Could not answer slide ${slideNumber}. Attempting next...`);
            slidesLog.push({ slide: slideNumber, text: questionText.substring(0, 80), status: 'SKIPPED' });
        }

        await page.waitForTimeout(1000);
        await answerEngine.clickNext(elements).catch(() => {});
        await page.waitForTimeout(2000);

        if (isLastQuestion) {
            console.log('[Survey Runner] Last question (20/20) reached and answered! Waiting for final submission...');
            await page.waitForTimeout(5000);
            const finishModal = page.locator("button:has-text('Earn More Rewards'), button:has-text('Claim'), button:has-text('Finish'), button:has-text('Okay!'), button:has-text('Okay')").first();
            if (await finishModal.isVisible({ timeout: 8000 }).catch(() => false)) {
                console.log('[Survey Runner] Survey completion screen reached successfully!');
                await finishModal.click({ force: true }).catch(() => {});
                await page.waitForTimeout(3000);
            }
            break;
        }
    }

    console.log(`\n========================================`);
    console.log(`[Survey Runner] Survey Answering Finished! Total Answered: ${answeredCount}`);
    console.log(`[Slide Logs]:\n`, JSON.stringify(slidesLog, null, 2));
    console.log(`========================================\n`);

    // Final screenshot
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'scratch/survey_run_completion.png', fullPage: true }).catch(() => {});

    expect(answeredCount, 'Expected at least 1 question to be answered').toBeGreaterThan(0);
});
