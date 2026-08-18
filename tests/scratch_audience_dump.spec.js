const { test } = require('@playwright/test');
const { setupMailosaurAccount } = require('./utils/MailosaurSetup');
const HerculesCampaignManager = require('../pages/hercules/HerculesCampaignManager');

test.use({ storageState: { cookies: [], origins: [] } });

test('Navigate past Premium Audience Modal', async ({ browser }) => {
    test.setTimeout(120000);
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Login with the previous account
    await page.goto('https://dev.hercules.works/login');
    await page.locator('input[type="email"]').fill('middle-happily@kzdzyaot.mailosaur.net');
    await page.locator('input[type="password"]').fill('TestPassword@2026!');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    
    await page.waitForTimeout(5000);
    
    // Go to All Campaigns -> Drafts
    const allCampaignsLink = page.getByRole('link', { name: /All campaigns/i }).first();
    if (await allCampaignsLink.isVisible()) {
        await allCampaignsLink.click();
        await page.waitForTimeout(3000);
    }
    
    const viewBtn = page.getByRole('button', { name: 'View' }).first();
    if (await viewBtn.isVisible()) {
        await viewBtn.click();
        await page.waitForTimeout(5000);
    }
    
    // Click Deploy Deploy
    const deployBtn = page.getByRole('button', { name: 'Deploy Deploy' });
    if (await deployBtn.isVisible()) {
        await deployBtn.click();
        await page.waitForTimeout(3000);
        
        // Handle Premium Audience Modal
        const premiumBtn = page.getByRole('button', { name: /Deploy with Premium Audience/i });
        if (await premiumBtn.isVisible()) {
            await premiumBtn.click();
            await page.waitForTimeout(5000);
            
            const fs = require('fs');
            const html = await page.content();
            fs.writeFileSync('scratch/audience_page_dump.html', html);
            await page.screenshot({ path: 'scratch/audience_page_dump.png', fullPage: true });
            console.log('Dumped audience page!');
        } else {
            console.log('Premium button not found!');
        }
    }
});
