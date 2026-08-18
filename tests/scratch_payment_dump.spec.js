const { test } = require('@playwright/test');
const { setupMailosaurAccount } = require('./utils/MailosaurSetup');
const HerculesSurveyGenerator = require('../pages/hercules/HerculesSurveyGenerator');
const HerculesCampaignManager = require('../pages/hercules/HerculesCampaignManager');
const HerculesPaymentModal = require('../pages/hercules/HerculesPaymentModal');

test.use({ storageState: { cookies: [], origins: [] } });

test('Dump Real Payment Modal HTML', async ({ browser }) => {
    test.setTimeout(1800000); // 30 mins
    const { page } = await setupMailosaurAccount(browser);

    const textarea = page.locator('textarea[aria-label="Ask Hercules a question"]');
    await textarea.fill('Create a basic survey about apples.');
    await page.locator('button[aria-label="submit button"]').click();

    const surveyGenerator = new HerculesSurveyGenerator(page);
    const finalGenerateSurveyBtn = page.locator('button', { hasText: /create.*survey|generate.*survey/i }).first();
    
    let loopCount = 0;
    while (loopCount < 120) {
        await page.waitForTimeout(5000);
        loopCount++;

        if (await finalGenerateSurveyBtn.isVisible() && await finalGenerateSurveyBtn.isEnabled()) break;
        if (await surveyGenerator.clickGenerateBrief()) break;
        if (await surveyGenerator.selectAllThatApplyHeader.count() > 0 && await surveyGenerator.selectAllThatApplyHeader.first().isVisible()) {
            if (await surveyGenerator.handleSelectAllThatApply()) continue;
        }
        if (await surveyGenerator.handleSingleSelect()) continue;
        if (await surveyGenerator.handleTextInputFallback()) continue;
        if (await surveyGenerator.clickSkip()) continue;
    }

    await finalGenerateSurveyBtn.waitFor({ state: 'visible', timeout: 720000 });
    await finalGenerateSurveyBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    await finalGenerateSurveyBtn.click({ force: true });

    const closeBtn = page.locator("button[aria-label='close']");
    if (await closeBtn.isVisible({ timeout: 5000 })) {
        await closeBtn.click({ force: true });
    }

    const campaignManager = new HerculesCampaignManager(page);
    await campaignManager.getSurveyName();

    const paymentModal = new HerculesPaymentModal(page);
    await paymentModal.deployDeployBtn.waitFor({ state: 'visible', timeout: 30000 });
    await paymentModal.deployDeployBtn.click();
    
    await paymentModal.handlePremiumModal();
    
    // WAIT 15 SECONDS FOR MODAL TO LOAD
    console.log('Clicked past Premium. Waiting 15 seconds for audience page to settle...');
    await page.waitForTimeout(15000);
    
    const fs = require('fs');
    const html = await page.content();
    fs.writeFileSync('scratch/real_audience_page_dump.html', html);
    await page.screenshot({ path: 'scratch/real_audience_page_dump.png', fullPage: true });
    console.log('Dumped HTML and screenshot to scratch directory.');
});
