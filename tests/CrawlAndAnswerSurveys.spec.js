const { test, expect } = require('@playwright/test');
const LoginPage = require('../pages/LoginPage');
const OnboardingUtil = require('../utils/OnboardingUtil');
const DataGeneratorUtil = require('../utils/DataGeneratorUtil');
const SurveyEngine = require('../utils/SurveyEngine');

test('Crawl and answer all available surveys on Super J', async ({ page }) => {
    test.setTimeout(600000); // 10 minutes timeout

    const loginPage = new LoginPage(page);
    const onboardingUtil = new OnboardingUtil(page);
    
    // 1. Login with dynamic phone number
    const randomPhone = DataGeneratorUtil.generateRandomPhoneNumber();
    console.log(`[Test] Using random phone number: ${randomPhone}`);
    await loginPage.login(randomPhone, '777777');

    console.log('[Test] Waiting 15 seconds for post-OTP redirect...');
    await page.waitForTimeout(15000); 
    
    // Check if we need to onboard
    let bodyText = await page.innerText('body');
    let isOnDashboard = bodyText.includes('Wallet') && bodyText.includes('Copy DID');
    
    if (isOnDashboard) {
        console.log('[Test] Forcing navigation back to /OnBoarding...');
        await page.goto('https://dev.superj.app/OnBoarding');
        await page.waitForTimeout(3000);
    }
    
    // 2. Onboarding with Pune
    console.log('[Test] Attempting Onboarding with location: Pune...');
    await onboardingUtil.completeOnboarding('1997', 'Pune', 'Male');
    
    console.log('[Test] Wait 5s post onboarding...');
    await page.waitForTimeout(5000);
    
    // Force goto dashboard just in case
    await page.goto('https://dev.superj.app/');
    await page.waitForTimeout(5000);

    // 3. Answer 3-4 surveys
    let completedSurveys = 0;
    const maxSurveysToAnswer = 4;
    
    const surveyEngine = new SurveyEngine(page);

    while (completedSurveys < maxSurveysToAnswer) {
        console.log(`\n--- Starting Survey Iteration #${completedSurveys + 1} ---`);
        
        // Find 1st survey button on dashboard
        const dashboardSurveyBtns = page.locator('button:has-text("Start Survey"), a:has-text("Start Survey"), div[class*="SurveyCard"] button');
        await dashboardSurveyBtns.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
        
        const count = await dashboardSurveyBtns.count();
        if (count === 0) {
            console.log('[Test] No surveys left on dashboard! We are done.');
            break;
        }

        // Click the first one
        console.log('[Test] Clicking 1st Start Survey button on Dashboard...');
        
        let surveyPage = page;
        
        // Helper to check for new pages
        const checkNewPage = async () => {
            const pages = page.context().pages();
            if (pages.length > 1) {
                surveyPage = pages[pages.length - 1];
            }
        };

        await dashboardSurveyBtns.first().click();
        await page.waitForTimeout(3000);
        await checkNewPage();
        
        // Click 2nd survey button on whichever page is active
        const detailsSurveyBtn = surveyPage.locator('button:has-text("Start Survey"), a:has-text("Start Survey")').first();
        if (await detailsSurveyBtn.isVisible({ timeout: 5000 }).catch(()=>false)) {
            console.log('[Test] Clicking 2nd Start Survey button on Survey Details screen...');
            await detailsSurveyBtn.click();
        } else {
            console.log('[Test] 2nd Start Survey button not found. Maybe it auto-started?');
        }

        await page.waitForTimeout(5000); // Give it plenty of time to load the survey
        await checkNewPage(); // Check again in case the 2nd click opened a new tab!

        // Run Survey Engine on the correct page!
        console.log('[Test] Starting SurveyEngine to answer survey...');
        const surveyEngine = new SurveyEngine(surveyPage);
        const result = await surveyEngine.run();
        
        console.log(`[Test] SurveyEngine finished with result: ${JSON.stringify(result)}`);
        
        completedSurveys++;
        
        // If we are in a new tab, close it
        if (surveyPage !== page) {
            console.log('[Test] Closing survey tab...');
            await surveyPage.close();
        }
        
        // Go back to dashboard to pick the next one
        console.log('[Test] Forcing navigation back to dashboard for next survey...');
        await page.goto('https://dev.superj.app/');
        await page.waitForTimeout(5000);
    }
    
    console.log(`[Test] Finished answering ${completedSurveys} surveys!`);
});
