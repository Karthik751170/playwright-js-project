const { test, expect } = require('@playwright/test');
const LoginPage = require('../pages/LoginPage');
const OnboardingUtil = require('../utils/OnboardingUtil');
const LandingPage = require('../pages/LandingPage');
const DataGeneratorUtil = require('../utils/DataGeneratorUtil');
const SurveyEngine = require('../utils/SurveyEngine');

test('Run B2C Survey Answering End-to-End', async ({ browser }) => {
    test.setTimeout(600000); // 10 minutes max

    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(300000);

    const surveyUrl = 'https://dev.superj.app/survey-screen/6a7dbfcff1a31dedebf215ac';
    console.log(`Navigating to survey URL: ${surveyUrl}`);
    await page.goto(surveyUrl);
    await page.waitForTimeout(5000);

    // 1. Perform Login with a new random number
    const randomPhone = DataGeneratorUtil.generateRandomPhoneNumber();
    console.log(`[Test] Performing login with new number: ${randomPhone} and OTP 777777...`);
    const loginPage = new LoginPage(page);
    await loginPage.login(randomPhone, '777777');
    await page.waitForTimeout(15000);

    // 2. Perform Onboarding
    try {
        console.log('Attempting onboarding...');
        const onboardingUtil = new OnboardingUtil(page);
        await onboardingUtil.completeOnboarding('1997', 'Pune', 'Male');
        await page.waitForTimeout(5000);
        
        console.log(`Redirecting back to survey: ${surveyUrl}`);
        await page.goto(surveyUrl);
        await page.waitForTimeout(5000);
    } catch (e) {
        console.log('Onboarding failed or skipped:', e.message);
    }

    // 3. Start Survey
    try {
        console.log('Clicking Start Survey...');
        const landingPage = new LandingPage(page);
        await landingPage.clickStartSurvey(2);
        await page.waitForTimeout(5000);
    } catch (e) {
        console.log('Start Survey click failed:', e.message);
    }

    // 4. Answer Survey using automated SurveyEngine
    console.log('Answering survey using SurveyEngine...');
    const surveyEngine = new SurveyEngine(page, null);
    const result = await surveyEngine.run();
    console.log(`[Test] Survey finished with result: ${JSON.stringify(result)}`);
});
