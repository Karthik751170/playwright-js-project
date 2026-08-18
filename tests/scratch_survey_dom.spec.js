const { test, expect } = require('@playwright/test');
const LoginPage = require('../pages/LoginPage');
const OnboardingUtil = require('../utils/OnboardingUtil');
const DataGeneratorUtil = require('../utils/DataGeneratorUtil');
const SurveyEngine = require('../utils/SurveyEngine');

test('SuperJ - Run Specific Survey', async ({ page }) => {
    test.setTimeout(600000); 

    const loginPage = new LoginPage(page);
    const onboardingUtil = new OnboardingUtil(page);
    
    // Login
    const randomPhone = DataGeneratorUtil.generateRandomPhoneNumber();
    await loginPage.login(randomPhone, '777777');
    await page.waitForTimeout(15000); 
    
    // Check if we need to onboard
    let bodyText = await page.innerText('body');
    if (bodyText.includes('Wallet') && bodyText.includes('Copy DID')) {
        await page.goto('https://dev.superj.app/OnBoarding');
        await page.waitForTimeout(3000);
    }
    
    // Onboard
    await onboardingUtil.completeOnboarding('1997', 'Pune', 'Male');
    await page.waitForTimeout(5000);
    
    // Go directly to the specified survey URL
    const surveyUrl = 'https://dev.superj.app/survey-screen/6a7edd0215203e92a622fda8';
    console.log(`Navigating directly to: ${surveyUrl}`);
    await page.goto(surveyUrl);
    await page.waitForTimeout(5000);

    // Initialize the Survey Engine
    const surveyEngine = new SurveyEngine(page, { surveyLogics: [] });
    
    console.log('Running SurveyEngine on specific URL...');
    const result = await surveyEngine.run();
    console.log(`Survey Engine finished with result: ${JSON.stringify(result)}`);
});
