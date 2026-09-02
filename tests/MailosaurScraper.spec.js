const { test, expect } = require('@playwright/test');
const fs = require('fs');

test.describe('Mailosaur Login Scraper', () => {

  test('Login to Mailosaur and Scrape Dashboard', async ({ page }) => {
    test.setTimeout(120000); // 2 minutes

    console.log('Navigating to Mailosaur Login...');
    await page.goto('https://mailosaur.com/app/login', { waitUntil: 'domcontentloaded' });
    
    console.log('Waiting for email input...');
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]');
    await emailInput.waitFor({ state: 'visible' });
    await emailInput.fill('ferad73521@neowd.com');
    
    // Check if password input is on the same page or if we need to click Next first
    const passwordInput = page.locator('input[type="password"], input[name="password"]');
    if (await passwordInput.count() === 0 || !(await passwordInput.first().isVisible())) {
        console.log('Password input not immediately visible. Clicking Continue/Next...');
        const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Next"), input[type="submit"]');
        if (await continueBtn.count() > 0) {
            await continueBtn.first().click();
        } else {
            await page.keyboard.press('Enter');
        }
        console.log('Waiting for password input to appear...');
        await passwordInput.first().waitFor({ state: 'visible', timeout: 10000 });
    }
    
    console.log('Filling in password...');
    await passwordInput.first().fill('Karthik@8342');
    
    console.log('Submitting login form...');
    const submitBtn = page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")');
    if (await submitBtn.count() > 0) {
        await submitBtn.first().click();
    } else {
        await page.keyboard.press('Enter');
    }
    
    console.log('Waiting 15s for login to complete and dashboard to load...');
    await page.waitForTimeout(15000);
    
    console.log('Scraping Mailosaur dashboard DOM...');
    const html = await page.content();
    fs.writeFileSync('mailosaur_dashboard.html', html);
    
    console.log('Saving screenshot...');
    await page.screenshot({ path: '/Users/karthiku/.gemini/antigravity/brain/96bf4951-2c59-4b13-b581-1bddbd78665c/mailosaur_dash.png', fullPage: true });

  });

});
