const { test } = require('@playwright/test');
const HerculesHomePage = require('../pages/hercules/HerculesHomePage');
const HerculesLoginPage = require('../pages/hercules/HerculesLoginPage');
const fs = require('fs');

test.use({ 
  channel: 'chrome',
  launchOptions: {
    args: ['--disable-blink-features=AutomationControlled', '--disable-infobars']
  }
});

async function savePopupScreenshot(popup, name) {
    try {
        if (popup && !popup.isClosed()) {
            const scratchDir = '/Users/karthiku/playwright-js-project/scratch';
            if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
            await popup.screenshot({ path: `scratch/popup_${name}.png` });
            console.log(`[Screenshot] Saved popup screenshot to scratch/popup_${name}.png`);
        }
    } catch (e) {
        console.log(`[Screenshot] Failed to capture popup screenshot: ${e.message}`);
    }
}

test('Sign-In with Google and Save Session', async ({ context, page }) => {
    test.setTimeout(180000); // 3 minutes
    
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const homePage = new HerculesHomePage(page);
    const loginPage = new HerculesLoginPage(page);

    console.log('Navigating to Hercules Homepage...');
    await homePage.navigate();
    
    console.log('Clicking Sign Up...');
    await homePage.clickSignUp();
    await page.waitForTimeout(3000);
    
    console.log('Initiating Google SSO popup...');
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      loginPage.clickContinueWithGoogle()
    ]);
    
    await popup.waitForLoadState('domcontentloaded');
    console.log(`OAuth Popup URL: ${popup.url()}`);
    await savePopupScreenshot(popup, '1_opened');
    
    const GOOGLE_EMAIL = 'karthik@jupitermeta.io';
    const GOOGLE_PASSWORD = 'Karthik@8342';
    
    console.log(`Filling Google Email: ${GOOGLE_EMAIL}...`);
    const emailInput = popup.getByRole('textbox', { name: 'Email or phone' });
    await emailInput.waitFor({ state: 'visible', timeout: 15000 });
    await emailInput.click();
    await emailInput.fill(GOOGLE_EMAIL);
    await savePopupScreenshot(popup, '2_email_filled');
    await popup.keyboard.press('Enter');
    await popup.waitForTimeout(3000);
    await savePopupScreenshot(popup, '3_post_email_submit');
    
    console.log('Checking for password input (handling possible passkey prompt)...');
    try {
        const passwordInput = popup.locator('input[type="password"]');
        
        // Check if password field is directly visible
        if (await passwordInput.isVisible().catch(() => false)) {
            console.log('Password field visible directly.');
            await passwordInput.click();
            await passwordInput.fill(GOOGLE_PASSWORD);
            await savePopupScreenshot(popup, '4_password_filled');
            await popup.keyboard.press('Enter');
            console.log('Password submitted.');
        } else {
            console.log('Password field not visible. Checking for "Try another way" (passkey bypass)...');
            const tryAnotherWay = popup.getByText('Try another way').first();
            if (await tryAnotherWay.isVisible({ timeout: 5000 }).catch(() => false)) {
                console.log('Clicking "Try another way"...');
                await tryAnotherWay.click();
                await popup.waitForTimeout(2000);
                await savePopupScreenshot(popup, '3a_try_another_way');
                
                const enterPasswordOption = popup.getByText('Enter your password').first();
                if (await enterPasswordOption.isVisible({ timeout: 5000 }).catch(() => false)) {
                    console.log('Clicking "Enter your password" option...');
                    await enterPasswordOption.click();
                    await popup.waitForTimeout(2000);
                    await savePopupScreenshot(popup, '3b_enter_password_form');
                }
            }
            
            // Now wait for password input and fill it
            await passwordInput.waitFor({ state: 'visible', timeout: 15000 });
            await passwordInput.click();
            await passwordInput.fill(GOOGLE_PASSWORD);
            await savePopupScreenshot(popup, '4_password_filled');
            await popup.keyboard.press('Enter');
            console.log('Password submitted.');
        }
        await popup.waitForTimeout(5000);
        await savePopupScreenshot(popup, '5_post_password_submit');
    } catch (e) {
        console.log(`Failed to handle password/passkey screens automatically: ${e.message}`);
        await savePopupScreenshot(popup, '4_password_error');
    }

    console.log('\n======================================================');
    console.log('--- ACTION MAY BE REQUIRED ---');
    console.log('Please check the opened Google Login window.');
    console.log('If Google is asking for a CAPTCHA, 2FA, or verification,');
    console.log('please complete it manually now.');
    console.log('======================================================\n');

    // Wait for the popup to close itself after successful authentication (up to 2 minutes)
    const popupCloseTimeout = Date.now() + 120000;
    let screenshotCounter = 1;
    while (!popup.isClosed() && Date.now() < popupCloseTimeout) {
        // Take a screenshot every 10 seconds to monitor progress
        if (screenshotCounter % 10 === 0) {
            await savePopupScreenshot(popup, `consent_loop_${screenshotCounter}`);
        }
        
        // Automatically click "Continue" on Google consent screen if visible
        if (popup.isClosed()) break;
        const continueBtn = popup.getByRole('button', { name: 'Continue' }).first();
        if (await continueBtn.isVisible().catch(() => false)) {
            console.log('Clicking Continue on Google Consent Screen...');
            await savePopupScreenshot(popup, `consent_before_click_${screenshotCounter}`);
            await continueBtn.click().catch(() => {});
            
            // Check if closed
            if (popup.isClosed()) {
                console.log('Popup closed immediately after clicking Continue.');
                break;
            }
            await page.waitForTimeout(2000);
            await savePopupScreenshot(popup, `consent_after_click_${screenshotCounter}`);
        }
        await page.waitForTimeout(1000);
        screenshotCounter++;
    }

    if (!popup.isClosed()) {
        await savePopupScreenshot(popup, 'final_before_close_check');
    }

    if (!popup.isClosed()) {
        console.log('WARNING: Google popup did not close within timeout.');
    } else {
        console.log('Google SSO popup closed successfully.');
    }

    console.log('Waiting 10 seconds for main dashboard to settle...');
    await page.waitForTimeout(10000);
    await page.screenshot({ path: 'scratch/dashboard_settled.png', fullPage: true });

    // Assert dashboard element to verify login was successful
    const dashboardElement = page.locator("[class='capitalize'], textarea[aria-label*='Hercules' i], [class*='sidebar' i]").first();
    await dashboardElement.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {
        console.log('Dashboard indicator not found. Checking URL: ' + page.url());
    });

    console.log('Saving authenticated session state to .auth/google-karthik.json...');
    if (!fs.existsSync('.auth')) fs.mkdirSync('.auth', { recursive: true });
    await context.storageState({ path: '.auth/google-karthik.json' });
    console.log('Session saved successfully!');
});
