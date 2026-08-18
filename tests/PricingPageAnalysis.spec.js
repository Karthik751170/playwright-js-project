const { test, expect } = require('@playwright/test');
const { setupMailosaurAccount } = require('./utils/MailosaurSetup');
const fs = require('fs');

test.use({ storageState: { cookies: [], origins: [] } });

test('Analyze Pricing Page', async ({ browser }) => {
    test.setTimeout(180000); // 3 mins

    console.log('Setting up a fresh Mailosaur/Hercules account...');
    const { page } = await setupMailosaurAccount(browser);

    console.log('Finding and clicking Pricing link on the home dashboard...');
    const pricingLink = page.locator('a:has-text("Pricing"), button:has-text("Pricing"), a[href*="pricing"], div:has-text("Credit Pricing")').first();
    await pricingLink.waitFor({ state: 'visible', timeout: 15000 });
    await pricingLink.click();

    console.log('Waiting for Pricing page to load...');
    await page.waitForTimeout(5000); // Wait for the page/modal to render

    console.log('Capturing Pricing Page screenshot and text...');
    await page.screenshot({ path: 'scratch/pricing_page.png', fullPage: true });
    const pageText = await page.innerText('body');
    fs.writeFileSync('scratch/pricing_page_dump.txt', pageText);

    console.log('Pricing page analysis complete. Saved to scratch/pricing_page.png and scratch/pricing_page_dump.txt');
});
