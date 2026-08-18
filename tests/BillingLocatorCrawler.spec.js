const { test, expect } = require('@playwright/test');
const fs = require('fs');
const HerculesHomePage = require('../pages/hercules/HerculesHomePage');
const HerculesSignupPage = require('../pages/hercules/HerculesSignupPage');
const MailosaurUtility = require('../pages/utils/MailosaurUtility');

const results = {};

async function extractLocators(page, screenName) {
    console.log(`Extracting locators for screen: ${screenName}`);
    await page.waitForTimeout(2000); // Wait for UI to settle

    const data = await page.evaluate(() => {
        const getLocator = (el) => {
            if (el.getAttribute('data-testid')) return `[data-testid="${el.getAttribute('data-testid')}"]`;
            if (el.getAttribute('aria-label')) return `${el.tagName.toLowerCase()}[aria-label="${el.getAttribute('aria-label')}"]`;
            if (el.getAttribute('placeholder')) return `[placeholder="${el.getAttribute('placeholder')}"]`;
            
            const text = (el.innerText || '').trim();
            // Clean up text for locator to prevent newlines breaking the selector
            const cleanText = text.replace(/\n/g, ' ').substring(0, 30).trim();
            
            if (cleanText && el.tagName !== 'DIV' && el.tagName !== 'SPAN') {
                return `${el.tagName.toLowerCase()}:has-text("${cleanText}")`;
            }
            
            if (el.className && typeof el.className === 'string') {
                const classes = el.className.split(' ').filter(c => c && !c.includes(':')).slice(0, 2).join('.');
                if (classes) return `${el.tagName.toLowerCase()}.${classes}`;
            }
            
            return el.tagName.toLowerCase();
        };

        const elements = Array.from(document.querySelectorAll('button, a, input, textarea, select, h1, h2, h3, [role="dialog"], [role="tab"]'));
        
        return elements.map(el => {
            const textContent = (el.innerText || el.getAttribute('placeholder') || el.getAttribute('aria-label') || '').trim().replace(/\n/g, ' ').substring(0, 50);
            return {
                type: el.tagName.toLowerCase(),
                text: textContent,
                suggestedLocator: getLocator(el)
            };
        }).filter(item => item.suggestedLocator && item.suggestedLocator !== item.type); // filter out empty/generic ones
    });

    // Deduplicate
    const unique = [...new Set(data.map(d => JSON.stringify(d)))].map(s => JSON.parse(s));
    results[screenName] = unique;
    
    // Save incrementally
    fs.writeFileSync('/Users/karthiku/.gemini/antigravity/brain/96bf4951-2c59-4b13-b581-1bddbd78665c/scratch/billing_locators.json', JSON.stringify(results, null, 2));
    console.log(`Saved ${unique.length} locators for ${screenName}`);
}


test.describe('Wallet and Billing Locator Crawler', () => {

  test.use({ storageState: { cookies: [], origins: [] } });
  
  test('Create Account via Mailosaur and Scrape Wallet Locators', async ({ browser }) => {
    test.setTimeout(300000); // 5 minutes
    
    const mailContext = await browser.newContext();
    const mailPage = await mailContext.newPage();
    
    const herculesContext = await browser.newContext();
    let page = await herculesContext.newPage();
    
    // Hardcode Server ID provided by the user
    const serverId = 'kzdzyaot';
    const domain = `${serverId}.mailosaur.net`;
    
    const randomString = Math.random().toString(36).substring(2, 10);
    const tempEmail = `test_billing_${randomString}@${domain}`;
    console.log(`Prepared Temp Email: ${tempEmail}`);
    
    // 1. Sign Up on Hercules
    const homePage = new HerculesHomePage(page);
    const signupPage = new HerculesSignupPage(page);

    console.log('Navigating to Hercules Homepage...');
    await homePage.navigate();
    await homePage.clickSignUp();
    
    console.log(`Signing up with email: ${tempEmail}`);
    await signupPage.signUpWithEmail(tempEmail);
    await signupPage.createPassword('TestPassword@2026!');

    // 2. Wait for Verification Email on Mailosaur UI
    console.log('Opening Mailosaur to check for verification email...');
    await mailPage.bringToFront();
    
    const mailosaurUtility = new MailosaurUtility(mailPage, mailContext);
    await mailosaurUtility.login('kayimoh434@bejum.com', 'Karthik@8342', serverId);
    let newPage = await mailosaurUtility.fetchVerificationLink();
    
    // Replace the main page variable
    page = newPage; 
    
    console.log('Handling onboarding flow...');
    
    // Step 1: Full name
    const fullNameInput = page.locator("[placeholder='Full name']");
    await fullNameInput.waitFor({ state: 'visible', timeout: 15000 });
    const randomName = 'User' + Math.random().toString(36).substring(2, 6);
    await fullNameInput.fill(randomName);
    await page.keyboard.press('Enter');
    
    // Step 2: Role selection (click random)
    const optionLocatorStr = "[class='text-[#E4E4E4] text-[13px] font-semibold font-inter leading-[130%] tracking-[-2%] break-words text-center']";
    const roleOptions = page.locator(optionLocatorStr);
    await roleOptions.first().waitFor({ state: 'visible', timeout: 15000 });
    const roleCount = await roleOptions.count();
    await roleOptions.nth(Math.floor(Math.random() * roleCount)).click();
    
    // Step 3: Any options randomly (use-cases, etc)
    await page.waitForTimeout(2000); 
    const useCaseOptions = page.locator(optionLocatorStr);
    await useCaseOptions.first().waitFor({ state: 'visible', timeout: 15000 });
    const useCaseCount = await useCaseOptions.count();
    await useCaseOptions.nth(Math.floor(Math.random() * useCaseCount)).click();
    
    // Step 4: Verify Dashboard
    console.log('Waiting for Dashboard to load...');
    await page.waitForTimeout(10000);
    
    // 3. Navigate to Wallet / Billing
    console.log('Searching for Wallet / Billing / Plans...');
    
    // Try to find the Wallet or Settings button
    const walletBtn = page.locator('button:has-text("Wallet"), a:has-text("Wallet")');
    const billingBtn = page.locator('button:has-text("Billing"), a:has-text("Billing")');
    const plansBtn = page.locator('button:has-text("Plans"), a:has-text("Plans"), button:has-text("Upgrade"), a:has-text("Upgrade")');
    const profileBtn = page.locator('button[aria-label="Profile"], .capitalize');
    
    if (await walletBtn.count() > 0 && await walletBtn.first().isVisible()) {
        await walletBtn.first().click();
        await extractLocators(page, 'Wallet_Screen');
    } else if (await billingBtn.count() > 0 && await billingBtn.first().isVisible()) {
        await billingBtn.first().click();
        await extractLocators(page, 'Billing_Screen');
    } else if (await plansBtn.count() > 0 && await plansBtn.first().isVisible()) {
        await plansBtn.first().click();
        await extractLocators(page, 'Plans_Screen');
    } else {
        console.log('Direct buttons not found. Trying to click Profile first...');
        if (await profileBtn.count() > 0) {
            await profileBtn.first().click();
            await page.waitForTimeout(2000);
            
            // Check dropdown for wallet/billing
            if (await walletBtn.count() > 0 && await walletBtn.first().isVisible()) {
                await walletBtn.first().click();
                await extractLocators(page, 'Wallet_Screen');
            } else if (await billingBtn.count() > 0 && await billingBtn.first().isVisible()) {
                await billingBtn.first().click();
                await extractLocators(page, 'Billing_Screen');
            } else if (await plansBtn.count() > 0 && await plansBtn.first().isVisible()) {
                await plansBtn.first().click();
                await extractLocators(page, 'Plans_Screen');
            } else {
                console.log('Could not find Wallet/Billing in dropdown either.');
                // Just extract the dropdown locators in case it's named something else
                await extractLocators(page, 'Profile_Dropdown');
            }
        } else {
            console.log('Could not find Profile button either.');
        }
    }
    
    console.log('Extraction complete. Closing browser.');
  });
});
