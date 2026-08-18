const { test, expect } = require('@playwright/test');
const HerculesHomePage = require('../pages/hercules/HerculesHomePage');
const HerculesLoginPage = require('../pages/hercules/HerculesLoginPage');

// Configure Playwright to use the real Chrome browser to bypass Bot Detection
test.use({ 
  channel: 'chrome',
  launchOptions: {
    args: ['--disable-blink-features=AutomationControlled', '--disable-infobars']
  }
});

test.describe('Hercules Apple SSO Authentication', () => {

  test('Sign-In with Apple', async ({ context, page }) => {
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
    
    console.log('Initiating Apple SSO...');
    
    // Apple SSO usually redirects the current page instead of opening a popup
    await Promise.all([
      page.waitForNavigation({ url: /appleid\.apple\.com/, timeout: 15000 }),
      loginPage.clickContinueWithApple()
    ]);
    
    await page.waitForLoadState('domcontentloaded');
    console.log(`OAuth Page URL: ${page.url()}`);
    
    const APPLE_EMAIL = process.env.APPLE_EMAIL || 'vanishree408@gmail.com';
    const APPLE_PASSWORD = process.env.APPLE_PASSWORD || 'Kkill@17';
    
    console.log(`Filling Apple ID: ${APPLE_EMAIL}...`);
    // Apple ID input
    const emailInput = page.locator('input[id="account_name_text_field"]');
    try {
        await emailInput.waitFor({ state: 'visible', timeout: 15000 });
    } catch (e) {
        console.log('Could not find specific Apple ID field, trying fallback...');
        await page.locator('input[type="text"]').first().waitFor({ state: 'visible', timeout: 5000 });
    }
    
    const idField = page.locator('input[id="account_name_text_field"]');
    await idField.click();
    await idField.fill(APPLE_EMAIL);
    
    console.log('Clicking continue arrow for Apple ID...');
    const idArrowBtn = page.locator('button[id="sign-in"], button[aria-label="Continue"]');
    await idArrowBtn.first().click();
    
    console.log('Filling Apple Password...');
    // The password field appears on the next screen after a short delay
    const passwordInput = page.locator('input[id="password_text_field"]');
    try {
        await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
    } catch (e) {
        console.log('Could not find specific Apple password field, trying fallback...');
        await page.locator('input[type="password"]').first().waitFor({ state: 'visible', timeout: 5000 });
    }
    
    await page.waitForTimeout(1500); // Wait for transition animation
    const pwField = page.locator('input[id="password_text_field"]');
    await pwField.click();
    await pwField.fill(APPLE_PASSWORD);
    
    console.log('Clicking continue arrow for Password...');
    const pwArrowBtn = page.locator('button[id="sign-in"], button[aria-label="Continue"]');
    await pwArrowBtn.first().click();
    
    console.log('Checking for 2FA or Trust Browser screen...');
    // If there is a 2FA prompt, the script will wait here until the user handles it
    
    // Check if Trust browser appears
    try {
        const trustBtn = page.locator('button:has-text("Trust")').first();
        await trustBtn.waitFor({ state: 'visible', timeout: 5000 });
        console.log('Clicking Trust Browser...');
        await trustBtn.click();
    } catch (e) {
        console.log('No Trust button appeared, proceeding...');
    }

    // Check for "Continue" button on final consent screen
    try {
        const continueBtn = page.locator('button:has-text("Continue")').first();
        await continueBtn.waitFor({ state: 'visible', timeout: 8000 });
        console.log('Clicking Continue on Apple Consent screen...');
        await continueBtn.click();
    } catch (e) {
        console.log('No Continue button appeared, proceeding...');
    }
    
    console.log('Waiting for redirect back to Hercules...');
    
    // Wait for the URL to change back to hercules
    await page.waitForURL(/dev\.hercules\.works/, { timeout: 120000 });
    
    console.log('Redirected! Checking main page for successful login...');
    
    // Check if we reached the dashboard or onboarding
    await page.waitForTimeout(5000); 
    
    const dashboardElement = page.locator("[class='capitalize']").first();
    await dashboardElement.waitFor({ state: 'visible', timeout: 30000 });
    
    const displayedName = await dashboardElement.innerText();
    console.log(`Successfully logged in via Apple! Dashboard name: ${displayedName}`);
    
    expect(displayedName).toBeTruthy();
  });
});
