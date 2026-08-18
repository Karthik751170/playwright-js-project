const { test } = require('@playwright/test');
const { setupMailosaurAccount } = require('./utils/MailosaurSetup');
const HerculesCampaignManager = require('../pages/hercules/HerculesCampaignManager');
const HerculesPaymentModal = require('../pages/hercules/HerculesPaymentModal');

test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(120000);

test('Quick Verify Locators', async ({ page }) => {
    // 1. Log in with the account we just created
    const email = 'excited-tears@kzdzyaot.mailosaur.net'; // from the logs
    await page.goto('https://dev.hercules.works/login');
    
    console.log('Entering login details...');
    await page.locator('input[type="email"], input[placeholder="Email"], input[name="email"]').first().waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('input[type="email"], input[placeholder="Email"], input[name="email"]').first().fill(email);
    
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    if (await passwordInput.isVisible()) {
        await passwordInput.fill('TestPassword@2026!');
    }
    
    await page.locator('button:has-text("Continue"), button:has-text("Log in"), button[type="submit"]').first().click();
    
    console.log('Waiting for password if it is a two-step flow...');
    try {
        const pass2 = page.locator('input[type="password"], input[placeholder="Password"]').first();
        await pass2.waitFor({ state: 'visible', timeout: 5000 });
        await pass2.fill('TestPassword@2026!');
        await page.locator('button:has-text("Log in"), button[type="submit"], button:has-text("Continue")').first().click();
    } catch (e) {}

    console.log('Waiting for dashboard...');
    const textarea = page.locator('textarea[aria-label="Ask Hercules a question"]');
    await textarea.waitFor({ state: 'visible', timeout: 30000 });
    const campaignManager = new HerculesCampaignManager(page);
    await campaignManager.navigateToDrafts();
    
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
    
    const paymentModal = new HerculesPaymentModal(page);
    console.log('Clicking "Deploy Deploy" button...');
    await paymentModal.deployDeployBtn.waitFor({ state: 'visible', timeout: 30000 });
    await paymentModal.deployDeployBtn.click();
    
    await paymentModal.handlePremiumModal();
    
    console.log('Extracting credit allocation from the summary...');
    const audienceCredits = await paymentModal.getTotalCreditsText();
    
    console.log(`Success! Extracted Credits: ${audienceCredits}`);
});
