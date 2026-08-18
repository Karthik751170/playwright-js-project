const { test } = require('@playwright/test');
const fs = require('fs');
const LoginPage = require('../pages/LoginPage');
const OnboardingUtil = require('../utils/OnboardingUtil');
const LandingPage = require('../pages/LandingPage');
const DataGeneratorUtil = require('../utils/DataGeneratorUtil');
const SurveyEngine = require('../utils/SurveyEngine');
const ActiveQuestionFinder = require('../utils/ActiveQuestionFinder');
const AnswerEngine = require('../utils/AnswerEngine');
const NextButtonHandler = require('../utils/NextButtonHandler');

const TARGET_SLIDE = 19;
const SURVEY_URL = 'https://dev.superj.app/survey/6a7ddad6d60747ced10adb82';

test('Inspect Slide 19 Dropdown HTML', async ({ browser }) => {
    test.setTimeout(600000);

    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(300000);

    // Step 1: Navigate to survey URL
    console.log(`\nNavigating to survey URL: ${SURVEY_URL}`);
    await page.goto(SURVEY_URL);
    await page.waitForTimeout(5000);

    // Step 2: Login with a fresh number
    const randomPhone = DataGeneratorUtil.generateRandomPhoneNumber();
    console.log(`[Test] Login with new number: ${randomPhone}, OTP: 777777`);
    const loginPage = new LoginPage(page);
    await loginPage.login(randomPhone, '777777');
    await page.waitForTimeout(15000);

    // Step 3: Complete onboarding
    try {
        console.log('Attempting onboarding...');
        const onboardingUtil = new OnboardingUtil(page);
        await onboardingUtil.completeOnboarding('1997', 'Pune', 'Male');
        await page.waitForTimeout(5000);
    } catch (e) {
        console.log('Onboarding failed or skipped:', e.message);
    }

    // Step 4: Return to survey
    console.log(`Redirecting back to survey: ${SURVEY_URL}`);
    await page.goto(SURVEY_URL);
    await page.waitForTimeout(5000);

    // Step 5: Click Start Survey
    try {
        const landingPage = new LandingPage(page);
        await landingPage.clickStartSurvey(2);
        await page.waitForTimeout(3000);
    } catch (e) {
        console.log('Start Survey click failed:', e.message);
    }

    // Step 6: Auto-answer slides up to slide 18, then stop at slide 19
    const activeQuestionFinder = new ActiveQuestionFinder(page);
    const answerEngine = new AnswerEngine(page);
    const nextButtonHandler = new NextButtonHandler(page);
    let lastAnsweredSlide = null;

    while (true) {
        const activeData = await activeQuestionFinder.getActiveQuestion(10000);

        if (!activeData || !activeData.container) {
            console.log('No active question found. Survey may have ended or not started yet.');
            break;
        }

        const currentSlide = activeData.slideNumber;
        const totalSlides = activeData.totalSlides;

        console.log(`\n============================`);
        console.log(`Active Slide: ${currentSlide} / ${totalSlides}`);
        console.log(`============================`);

        if (currentSlide >= TARGET_SLIDE) {
            console.log(`\n🎯 Reached target Slide ${TARGET_SLIDE}! Stopping auto-answer.`);
            break;
        }

        if (lastAnsweredSlide === currentSlide) {
            await page.waitForTimeout(500);
            continue;
        }

        // Answer the slide
        const answered = await answerEngine.answer({ activeQuestion: activeData.container, nextButton: null });
        if (!answered) {
            console.log(`Could not answer slide ${currentSlide}. Skipping...`);
            break;
        }

        lastAnsweredSlide = currentSlide;
        console.log(`Slide ${currentSlide}/${totalSlides} answered.`);
        await page.waitForTimeout(1000);

        // Click Next
        await nextButtonHandler.clickNext({ activeQuestion: activeData.container, nextButton: null });

        // Wait for slide transition
        const transitionStart = Date.now();
        while (Date.now() - transitionStart < 5000) {
            const nextCheck = await activeQuestionFinder.getActiveQuestion(1000);
            if (nextCheck && nextCheck.slideNumber !== currentSlide) {
                console.log(`Transitioned to Slide ${nextCheck.slideNumber}`);
                break;
            }
            await page.waitForTimeout(400);
        }

        if (currentSlide >= totalSlides) break;
    }

    // --- NOW ON SLIDE 19 ---
    console.log(`\n📸 === SLIDE ${TARGET_SLIDE}: Capturing HTML BEFORE dropdown click ===`);
    const htmlBefore = await page.content();
    fs.writeFileSync('scratch/slide19_before_dropdown.html', htmlBefore);
    console.log(`✅ Saved: scratch/slide19_before_dropdown.html`);

    await page.screenshot({ path: 'scratch/slide19_before_dropdown.png', fullPage: true });
    console.log(`✅ Saved screenshot: scratch/slide19_before_dropdown.png`);

    // Click first dropdown trigger
    const dropdown = page.locator("img[alt='Dropdown']").first();
    const dropdownVisible = await dropdown.isVisible({ timeout: 5000 }).catch(() => false);

    if (dropdownVisible) {
        console.log(`\n🖱️  Clicking dropdown trigger (img[alt='Dropdown'])...`);
        await dropdown.scrollIntoViewIfNeeded().catch(() => {});
        await dropdown.click({ force: true }).catch(async () => {
            await dropdown.evaluate(el => el.click()).catch(() => {});
        });
        console.log('✅ Dropdown clicked! Waiting 2 seconds...');
        await page.waitForTimeout(2000);

        // Capture HTML AFTER clicking dropdown
        console.log(`\n📸 === Capturing HTML AFTER dropdown click ===`);
        const htmlAfter = await page.content();
        fs.writeFileSync('scratch/slide19_after_dropdown.html', htmlAfter);
        console.log(`✅ Saved: scratch/slide19_after_dropdown.html`);

        await page.screenshot({ path: 'scratch/slide19_after_dropdown.png', fullPage: true });
        console.log(`✅ Saved screenshot: scratch/slide19_after_dropdown.png`);

        console.log('\n⏸️  PAUSING for manual inspection in Playwright Inspector...');
        await page.pause();

    } else {
        console.log(`⚠️  No img[alt="Dropdown"] found on Slide ${TARGET_SLIDE}!`);
        const html = await page.content();
        fs.writeFileSync('scratch/slide19_no_dropdown.html', html);
        await page.screenshot({ path: 'scratch/slide19_no_dropdown.png', fullPage: true });
        console.log('Saved: scratch/slide19_no_dropdown.html, scratch/slide19_no_dropdown.png');
    }
});
