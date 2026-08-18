const { test, expect } = require('@playwright/test');
const HerculesHomePage = require('../pages/hercules/HerculesHomePage');
const HerculesLoginPage = require('../pages/hercules/HerculesLoginPage');

const authFile = '.auth/apple-user.json';

test('authenticate', async ({}) => {
  test.setTimeout(180000); // Give user 3 minutes to handle 2FA
  
  // Use real Chrome to bypass bot detection
  const { chromium } = require('@playwright/test');
  
  const customBrowser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled', '--disable-infobars']
  });
  
  const context = await customBrowser.newContext();
  await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  
  const authPage = await context.newPage();
  
  const homePage = new HerculesHomePage(authPage);
  const loginPage = new HerculesLoginPage(authPage);

  console.log('Navigating to Hercules Homepage...');
  await homePage.navigate();
  
  console.log('Clicking Sign Up...');
  await homePage.clickSignUp();
  
  console.log('Initiating Apple SSO...');
  
  await Promise.all([
    authPage.waitForNavigation({ url: /appleid\.apple\.com/, timeout: 15000 }),
    loginPage.clickContinueWithApple()
  ]);
  
  await authPage.waitForLoadState('domcontentloaded');
  
  const APPLE_EMAIL = process.env.APPLE_EMAIL || 'vanishree408@gmail.com';
  const APPLE_PASSWORD = process.env.APPLE_PASSWORD || 'Kkill@17';
  
  console.log(`Filling Apple ID: ${APPLE_EMAIL}...`);
  const emailInput = authPage.locator('input[id="account_name_text_field"]');
  await emailInput.waitFor({ state: 'visible', timeout: 15000 });
  
  await authPage.locator('input[id="account_name_text_field"]').click();
  await authPage.locator('input[id="account_name_text_field"]').fill(APPLE_EMAIL);
  await authPage.locator('button[id="sign-in"], button[aria-label="Continue"]').first().click();
  
  console.log('Filling Apple Password...');
  const passwordInput = authPage.locator('input[id="password_text_field"]');
  await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
  
  await authPage.waitForTimeout(1500); 
  await authPage.locator('input[id="password_text_field"]').click();
  await authPage.locator('input[id="password_text_field"]').fill(APPLE_PASSWORD);
  await authPage.locator('button[id="sign-in"], button[aria-label="Continue"]').first().click();
  
  console.log('\n======================================================');
  console.log('--- 2FA REQUIRED ---');
  console.log('Please enter the 6-digit Apple 2FA code manually in the browser window.');
  console.log('Click "Trust" on the trust browser screen, and "Continue" on the consent screen.');
  console.log('The script is waiting for you to reach the Dashboard... (Timeout: 2 minutes)');
  console.log('======================================================\n');
  
  // Verify Dashboard is loaded before saving
  const dashboardElement = authPage.locator("[class='capitalize']").first();
  await dashboardElement.waitFor({ state: 'visible', timeout: 120000 });
  
  console.log('Dashboard detected! Saving authentication state...');
  await context.storageState({ path: authFile });
  
  await customBrowser.close();
});
