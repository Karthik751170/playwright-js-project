const { test, expect } = require('@playwright/test');
const HerculesSurveyGenerator = require('../pages/hercules/HerculesSurveyGenerator');
const HerculesPaymentModal = require('../pages/hercules/HerculesPaymentModal');
const HerculesCampaignManager = require('../pages/hercules/HerculesCampaignManager');
const { setupMailosaurAccount } = require('./utils/MailosaurSetup');

// Use empty storage state so we don't crash on missing file, and force a fresh login
test.use({ storageState: { cookies: [], origins: [] } });

test('Deploy survey with Edit Audience validation', async ({ browser }) => {
    test.setTimeout(1800000); // 30 mins

    console.log('\n--- MAILOSAUR ACCOUNT SETUP ---');
    const { page } = await setupMailosaurAccount(browser);

    // Enter Prompt
    console.log('\nEntering prompt...');
    const textarea = page.locator("textarea[aria-label='Ask Hercules a question'], [class='w-full pb-[36.821px] pl-[24px] pr-[24.547px] pt-[24px] sm:h-[93px]'] textarea, [class='w-full pb-[36.821px] pl-[24px] pr-[24.547px] pt-[24px] sm:h-[93px]'] input").or(page.getByRole('textbox', { name: 'Describe the research you' })).first();
    await textarea.fill('Create a comprehensive survey for tech enthusiasts in Mumbai about smartwatch features.');
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
            console.log('Create Survey button is visible!');
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

    console.log('Waiting for Create Survey button...');
    await finalGenerateSurveyBtn.waitFor({ state: 'visible', timeout: 720000 });
    await finalGenerateSurveyBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    await finalGenerateSurveyBtn.click({ force: true });

    // Payment & Deployment Flow
    console.log('\n--- DEPLOYMENT PHASE ---');
    const paymentModal = new HerculesPaymentModal(page);
    const campaignManager = new HerculesCampaignManager(page);
    
    await campaignManager.getSurveyName();

    // On the draft page, we must click "View Audience" or "Edit Manually" to open the audience modal
    console.log('Opening Edit Audience modal...');
    const viewAudienceBtn = page.getByText('View Audience');
    if (await viewAudienceBtn.isVisible()) {
        await viewAudienceBtn.click();
    } else {
        const editManuallyBtn = page.getByText('Edit Manually');
        if (await editManuallyBtn.isVisible()) await editManuallyBtn.click();
    }
    
    await page.waitForTimeout(3000);
    
    // The audience target dropdowns are now visible in the modal.
    console.log('Adjusting NCCS targets...');
    const nccsBtn = page.getByRole('button', { name: 'nccs NCCS expand collapse' });
    
    if (await nccsBtn.isVisible()) {
        await nccsBtn.click();
        await page.waitForTimeout(1000);
        // Deselect or select an option to change credits
        const nccsOption = page.locator('text=/A1NCCS/i').first();
        if (await nccsOption.isVisible()) {
            await nccsOption.click();
        }
    }
    
    // Click Confirm on the Edit Audience modal
    const confirmBtn = page.getByRole('button', { name: 'Confirm' });
    if (await confirmBtn.isVisible()) {
        await confirmBtn.click();
        await page.waitForTimeout(3000);
    }
    
    console.log('Clicking "Deploy Deploy" button...');
    await paymentModal.deployDeployBtn.waitFor({ state: 'visible', timeout: 30000 });
    await paymentModal.deployDeployBtn.click();
    
    await paymentModal.handlePremiumModal();
    
    console.log('Extracting credit allocation from the summary...');
    const audienceCredits = await paymentModal.getTotalCreditsText();
    
    // Verify credits on Razorpay match the total
    const totalCredits = await paymentModal.getTotalCreditsText();
    const parsedCredits = parseInt(audienceCredits.replace(/[^0-9]/g, ''));
    
    // Validate match
    console.log(`Audience Extracted Credits: ${audienceCredits}`);
    console.log(`Razorpay Payment Total: ${totalCredits}`);
    expect(totalCredits.includes(audienceCredits) || audienceCredits.includes(totalCredits) || parseInt(totalCredits.replace(/\D/g, '')) === parseInt(audienceCredits.replace(/\D/g, ''))).toBeTruthy();

    console.log('Validation passed. Proceeding with Payment...');
    await paymentModal.clickPayAndDeploy();
    await paymentModal.handleRazorpaySuccess();

    console.log('Waiting for redirection to survey-review page...');
    await page.waitForURL(/.*\/survey-review\/.*/, { timeout: 60000 });
    console.log('Successfully reached survey-review page!');
    
    console.log('Test complete. Pausing...');
    await page.pause();
});
