const { test, expect } = require('@playwright/test');
const HerculesHomePage = require('../pages/hercules/HerculesHomePage');
const HerculesLoginPage = require('../pages/hercules/HerculesLoginPage');

// Configure Playwright to use the real Chrome browser to bypass Google Bot Detection
test.use({ 
  channel: 'chrome',
  launchOptions: {
    args: ['--disable-blink-features=AutomationControlled', '--disable-infobars']
  }
});

test.describe('Hercules Google OAuth Authentication', () => {

  test('Sign-In with Google', async ({ context, page }) => {
    test.setTimeout(120000); // 2 minutes
    
    // Hide webdriver flag to further prevent bot detection
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const homePage = new HerculesHomePage(page);
    const loginPage = new HerculesLoginPage(page);

    console.log('Navigating to Hercules Homepage...');
    await homePage.navigate();
    
    console.log('Clicking Sign Up...');
    await homePage.clickSignUp();
    
    console.log('Initiating Google SSO...');
    
    // Wait for the popup event before clicking
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      loginPage.clickContinueWithGoogle()
    ]);
    
    await popup.waitForLoadState('domcontentloaded');
    console.log(`OAuth Popup URL: ${popup.url()}`);
    
    const GOOGLE_EMAIL = process.env.GOOGLE_EMAIL || 'jupiterkarthik132@gmail.com';
    const GOOGLE_PASSWORD = process.env.GOOGLE_PASSWORD || 'Karthik@8342';
    
    console.log(`Filling Google Email: ${GOOGLE_EMAIL}...`);
    const emailInput = popup.getByRole('textbox', { name: 'Email or phone' });
    await emailInput.waitFor({ state: 'visible', timeout: 15000 });
    await emailInput.click();
    await emailInput.fill(GOOGLE_EMAIL);
    await popup.keyboard.press('Enter');
    
    console.log('Filling Google Password...');
    // The password field appears on the next screen after a short delay
    const passwordInput = popup.getByRole('textbox', { name: 'Enter your password' });
    try {
        await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
    } catch (e) {
        console.log('Could not find password textbox by role, falling back to input[type="password"]');
        await popup.locator('input[type="password"]').waitFor({ state: 'visible', timeout: 5000 });
    }
    await popup.waitForTimeout(1500); // Wait for transition animation
    const pwField = popup.locator('input[type="password"]');
    await pwField.click();
    await pwField.fill(GOOGLE_PASSWORD);
    await popup.keyboard.press('Enter');
    
    console.log('Checking for Google Consent/Continue screen...');
    try {
        const continueBtn = popup.getByRole('button', { name: 'Continue' }).first();
        await continueBtn.waitFor({ state: 'visible', timeout: 8000 });
        console.log('Clicking Continue on Google Consent screen...');
        await continueBtn.click();
    } catch (e) {
        console.log('No Continue button appeared, proceeding...');
    }
    
    console.log('\n======================================================');
    console.log('--- ACTION MAY BE REQUIRED ---');
    console.log('Google might ask for 2FA or device verification here.');
    console.log('Waiting for Google OAuth popup to close...');
    console.log('======================================================\n');
    
    // Wait for the popup to close itself after successful authentication
    while (!popup.isClosed()) {
        await page.waitForTimeout(1000);
    }
    
    console.log('Popup closed. Checking main page for successful login...');
    
    // Check if we reached the dashboard or onboarding
    await page.waitForTimeout(5000); 
    
    const dashboardElement = page.locator("[class='capitalize']").first();
    await dashboardElement.waitFor({ state: 'visible', timeout: 60000 });
    
    const displayedName = await dashboardElement.innerText();
    console.log(`Successfully logged in via Google! Dashboard name: ${displayedName}`);
    
    console.log('Saving authentication state to .auth/google-user.json...');
    await context.storageState({ path: '.auth/google-user.json' });
    
    expect(displayedName).toBeTruthy();
  });
});
