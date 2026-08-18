const { test, expect } = require('@playwright/test');
const HerculesSurveyGenerator = require('../pages/hercules/HerculesSurveyGenerator');
const HerculesPaymentModal = require('../pages/hercules/HerculesPaymentModal');
const HerculesCampaignManager = require('../pages/hercules/HerculesCampaignManager');

const { setupMailosaurAccount } = require('./utils/MailosaurSetup');

// Use empty storage state since we create a fresh Mailosaur account every time
test.use({ storageState: { cookies: [], origins: [] } });

test('Deploy survey without editing audience', async ({ browser }) => {
    test.setTimeout(1800000); // 30 mins

    console.log('\n--- MAILOSAUR ACCOUNT SETUP ---');
    const { page } = await setupMailosaurAccount(browser);

    // Handle Onboarding
    const textarea = page.locator("textarea[aria-label='Ask Hercules a question'], [class='w-full pb-[36.821px] pl-[24px] pr-[24.547px] pt-[24px] sm:h-[93px]'] textarea, [class='w-full pb-[36.821px] pl-[24px] pr-[24.547px] pt-[24px] sm:h-[93px]'] input").or(page.getByRole('textbox', { name: 'Describe the research you' })).first();
    try {
        await textarea.waitFor({ state: 'visible', timeout: 10000 });
        console.log('Dashboard loaded directly.');
    } catch (e) {
        console.log('Dashboard chat box not found. Attempting to clear onboarding screens...');
        for (let i = 0; i < 5; i++) {
            if (await textarea.isVisible()) {
                console.log('Dashboard appeared! Onboarding complete.');
                break;
            }
            await page.waitForTimeout(2000);
            const optionBtns = page.locator('button:not([aria-label]):not(:has-text("Continue")):not(:has-text("Next")):not(:has-text("Submit"))');
            if (await optionBtns.count() > 0) {
                try { await optionBtns.first().click(); } catch(e) {}
            }
            const nextBtn = page.locator('button:has-text("Continue"), button:has-text("Next"), button:has-text("Submit"), button:has-text("Finish")').first();
            if (await nextBtn.isVisible()) {
                await nextBtn.click();
            }
            await page.waitForTimeout(2000);
        }
        await textarea.waitFor({ state: 'visible', timeout: 30000 });
    }

    // Enter Prompt
    console.log('\nEntering prompt...');
    await textarea.fill('Create a comprehensive market research survey for a new line of eco-friendly athletic wear. Target audience: fitness enthusiasts aged 18-35.');
    await page.locator('button[aria-label="submit button"]').or(page.getByRole('button', { name: 'Send' })).first().click();

    // Answer AI Questionnaire
    console.log('\nNavigating through AI questionnaire (if it appears)...');
    const surveyGenerator = new HerculesSurveyGenerator(page);
    const finalGenerateSurveyBtn = page.locator('button', { hasText: /create.*survey|generate.*survey/i }).first();
    
    let loopCount = 0;
    while (loopCount < 120) {
        await page.waitForTimeout(5000);
        loopCount++;

        if (await finalGenerateSurveyBtn.isVisible() && await finalGenerateSurveyBtn.isEnabled()) {
            console.log('Create Survey button is already visible!');
            break;
        }
        if (await surveyGenerator.clickGenerateBrief()) {
            console.log('Clicked Generate Brief!');
            break;
        }
        if (await surveyGenerator.selectAllThatApplyHeader.count() > 0 && await surveyGenerator.selectAllThatApplyHeader.first().isVisible()) {
            if (await surveyGenerator.handleSelectAllThatApply()) continue;
        }
        if (await surveyGenerator.handleSingleSelect()) continue;
        if (await surveyGenerator.handleTextInputFallback()) continue;
        if (await surveyGenerator.clickSkip()) continue;
    }
    
    if (loopCount >= 120) {
        console.log('WARNING: Loop timed out after 10 minutes without finding Generate Brief or Create Survey.');
        await page.screenshot({ path: 'scratch/timeout_state.png' });
    }

    console.log('Waiting for Create Survey button...');

    // Wait for Brief & Create Survey
    await finalGenerateSurveyBtn.waitFor({ state: 'visible', timeout: 720000 });
    await finalGenerateSurveyBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    await finalGenerateSurveyBtn.click({ force: true });

    // Handle sign-in block if it appears
    const closeBtn = page.locator("button[aria-label='close']");
    if (await closeBtn.isVisible({ timeout: 5000 })) {
        await closeBtn.click({ force: true });
    }

    // Payment & Deployment Flow
    console.log('\n--- DEPLOYMENT PHASE ---');
    const paymentModal = new HerculesPaymentModal(page);
    const campaignManager = new HerculesCampaignManager(page);
    
    // Fetch survey name
    await campaignManager.getSurveyName();

    // Click Deploy Deploy (initial)
    console.log('Clicking "Deploy Deploy" button...');
    await paymentModal.deployDeployBtn.waitFor({ state: 'visible', timeout: 30000 });
    await paymentModal.deployDeployBtn.click();
    
    await paymentModal.handlePremiumModal();
    
    // No Deploy Campaign button exists here, Deploy Deploy goes straight to the modal!
    
    // Extract Total Credits
    await paymentModal.getTotalCreditsText();

    // Click Pay and Deploy & Handle Razorpay
    await paymentModal.clickPayAndDeploy();
    await paymentModal.handleRazorpaySuccess();

    // Wait for Review page
    console.log('Waiting for redirection to survey-review page...');
    await page.waitForURL(/.*\/survey-review\/.*/, { timeout: 60000 });
    console.log('Successfully reached survey-review page!');
    
    console.log('Test complete. Pausing...');
    await page.pause();
});
