const { test, expect } = require('@playwright/test');
const LoginPage = require('../pages/LoginPage');
const OnboardingUtil = require('../utils/OnboardingUtil');
const LandingPage = require('../pages/LandingPage');
const SurveyEngine = require('../utils/SurveyEngine');
const DataGeneratorUtil = require('../utils/DataGeneratorUtil');

test.use({ storageState: { cookies: [], origins: [] } });

test('Execute SuperJ Live Survey End-to-End & Validate Logics', async ({ browser }) => {
    test.setTimeout(600000); // 10 minutes timeout

    const liveSurveyUrl = 'https://dev.superj.app/survey/6a81cfcea6ec26968a54f300';
    console.log(`\n======================================================`);
    console.log(` Executing Live Survey on SuperJ: ${liveSurveyUrl}`);
    console.log(`======================================================\n`);

    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(300000);

    console.log('[Step 1] Navigating to Live Survey URL...');
    await page.goto(liveSurveyUrl);

    console.log('[Step 2] Logging in consumer...');
    const loginPage = new LoginPage(page);
    const randomPhone = process.env.TEST_PHONE || DataGeneratorUtil.generateRandomPhoneNumber();
    await loginPage.login(randomPhone, '777777');
    await page.waitForTimeout(10000);

    console.log('[Step 3] Handling Consumer Onboarding (if required)...');
    const onboardingUtil = new OnboardingUtil(page);
    await onboardingUtil.completeOnboarding('1997', 'Pune', 'Male').catch(() => {});
    await page.waitForTimeout(3000);

    console.log('[Step 4] Ensuring page is at survey URL...');
    await page.goto(liveSurveyUrl);
    await page.waitForTimeout(3000);

    console.log('[Step 5] Clicking Start Survey (Screen 1 & Screen 2)...');
    const landingPage = new LandingPage(page);
    await landingPage.clickFirstStartSurvey().catch(() => {});
    await landingPage.clickSecondStartSurvey().catch(() => {});

    console.log('[Step 6] Running SurveyEngine with full Logic Assertions...');
    const surveyEngine = new SurveyEngine(page, {});
    const result = await surveyEngine.run();
    console.log(`\nSurvey Engine finished with result: ${JSON.stringify(result)}`);

    expect(result.completed).toBe(true);
    await page.waitForTimeout(5000);
    await context.close().catch(() => {});
});
