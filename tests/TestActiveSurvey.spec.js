const { test, expect } = require('@playwright/test');
const AnswerEngine = require('../utils/AnswerEngine');
const ActiveQuestionFinder = require('../utils/ActiveQuestionFinder');
const LoginPage = require('../pages/LoginPage');
const OnboardingUtil = require('../utils/OnboardingUtil');
const DataGeneratorUtil = require('../utils/DataGeneratorUtil');
const fs = require('fs');

test('Test Active Live Survey to Completion', async ({ browser }) => {
    test.setTimeout(3600000); // 1 hour max

    const surveyUrl = 'https://dev.superj.app/survey/6a8da824c4ca7531fc9cd803';
    console.log('Testing survey URL: ' + surveyUrl);

    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        recordVideo: { dir: 'test-results/videos/' }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(300000);

    page.on('response', async (response) => {
        try {
            const url = response.url();
            const contentType = response.headers()['content-type'] || '';
            if (url.includes('.mp3') || url.includes('.wav') || contentType.includes('audio')) {
                const buffer = await response.body().catch(() => null);
                if (buffer && buffer.length > 0) {
                    if (!fs.existsSync('scratch')) fs.mkdirSync('scratch', { recursive: true });
                    fs.writeFileSync('scratch/live_survey_audio.mp3', buffer);
                    console.log('[AudioCapture] Captured audio (' + buffer.length + ' bytes) from: ' + url);
                }
            }
        } catch (e) {}
    });

    console.log('[Test] Logging in with fresh consumer account...');
    const loginPage = new LoginPage(page);
    const onboardingUtil = new OnboardingUtil(page);
    const randomPhone = DataGeneratorUtil.generateRandomPhoneNumber();
    console.log(`[Test] Generated Phone: ${randomPhone}`);

    await loginPage.login(randomPhone, '777777');
    console.log('[Test] Waiting for post-login redirect...');
    await page.waitForTimeout(5000);

    const welcomeLocator = page.locator("//h2[text()='Welcome to SuperJ'] | h2");
    if (await welcomeLocator.first().isVisible({ timeout: 10000 }).catch(() => false)) {
        console.log('[Test] Running onboarding utility...');
        await onboardingUtil.completeOnboarding('1997', 'Pune', 'Male');
        await page.waitForTimeout(3000);
    }

    console.log(`[Test] Navigating to active survey: ${surveyUrl}`);
    await page.goto(surveyUrl);
    await page.waitForTimeout(3000);

    const startBtn = page.locator("button:has-text('Start Survey'), button:has-text('Take Survey'), button:has-text('Start')").first();
    if (await startBtn.isVisible({ timeout: 15000 }).catch(() => false)) {
        console.log('Clicking Start Survey button...');
        await startBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(3000);
    }

    const startBtn2 = page.locator("button:has-text('Start Survey'), button:has-text('Take Survey'), button:has-text('Start')").first();
    if (await startBtn2.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log('Clicking second Start Survey button...');
        await startBtn2.click({ force: true }).catch(() => {});
        await page.waitForTimeout(3000);
    }

    console.log('Starting AnswerEngine on active survey...');
    const answerEngine = new AnswerEngine(page);
    answerEngine.getAiContext = function() {
        return `I am an active, enthusiastic, and highly qualified participant taking this market research survey.
IMPORTANT INSTRUCTIONS FOR THIS SURVEY:
1. Always qualify for the survey: If asked about profession, habits, product usage, or behaviors (e.g. being a parent, caregiver, living in India, etc.), ALWAYS choose the positive active option (e.g. "I am a parent or primary caregiver", "I currently live in India", "Yes", "Daily user").
2. Answer positively and constructively to ensure the survey does NOT screen out or terminate early.
3. Complete all slides until the very end.`;
    };

    const questionFinder = new ActiveQuestionFinder(page);
    let answeredCount = 0;
    let lastSlideNumber = null;
    let sameSlideRepeats = 0;

    for (let i = 0; i < 80; i++) {
        const activeData = await questionFinder.getActiveQuestion(10000);
        if (!activeData || !activeData.container) {
            console.log('[AnswerEngine] No active question found — checking for completion modal...');
            break;
        }

        const { container, slideNumber, totalSlides } = activeData;

        if (slideNumber === lastSlideNumber) {
            sameSlideRepeats++;
            if (sameSlideRepeats >= 4) {
                console.log(`[AnswerEngine] Stuck on slide ${slideNumber} for ${sameSlideRepeats} attempts. Stopping.`);
                break;
            }
        } else {
            sameSlideRepeats = 0;
            lastSlideNumber = slideNumber;
        }

        const isLastQuestion = Number.isInteger(totalSlides) && slideNumber >= totalSlides;
        console.log(`\n[AnswerEngine] --- Answering slide ${slideNumber}/${totalSlides}${isLastQuestion ? ' (last)' : ''} ---`);

        const elements = { activeQuestion: container, nextButton: null };
        const answered = await answerEngine
            .answer(elements, isLastQuestion)
            .catch((e) => {
                console.log(`[AnswerEngine] answer() threw: ${e.message}`);
                return false;
            });

        if (answered) answeredCount++;
        else console.log(`[AnswerEngine] Could not answer slide ${slideNumber}; attempting to advance anyway.`);

        await page.waitForTimeout(1000);
        await answerEngine.clickNext(elements).catch(() => {});
        await page.waitForTimeout(1500);

        if (isLastQuestion) {
            console.log('[AnswerEngine] Final slide answered! Waiting for submission modal...');
            await page.waitForTimeout(5000);
            const finishModal = page.locator("button:has-text('Earn More Rewards'), button:has-text('Claim'), button:has-text('Finish'), button:has-text('Okay!'), button:has-text('Okay')").first();
            if (await finishModal.isVisible({ timeout: 8000 }).catch(() => false)) {
                console.log('[AnswerEngine] Survey completed and submitted!');
                await finishModal.click({ force: true }).catch(() => {});
                await page.waitForTimeout(3000);
            }
            break;
        }
    }

    console.log(`Survey answering completed! Total questions answered: ${answeredCount}`);
    await page.waitForTimeout(10000);
});
