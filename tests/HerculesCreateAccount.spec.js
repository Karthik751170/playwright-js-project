const { test, expect } = require('@playwright/test');
const HerculesHomePage = require('../pages/hercules/HerculesHomePage');
const HerculesSignupPage = require('../pages/hercules/HerculesSignupPage');
const MailosaurUtility = require('../pages/utils/MailosaurUtility');

test.describe('Hercules Authentication Flow', () => {

  // We want to test the signup flow from scratch, so we override the global setup
  // and start with a completely clear authentication state (logged out).
  test.use({ storageState: { cookies: [], origins: [] } });
  
  test('Create Account via Mailosaur UI Scrape', async ({ browser }) => {
    test.setTimeout(300000); // 5 minutes for full E2E flow
    
    const mailContext = await browser.newContext();
    const mailPage = await mailContext.newPage();
    
    const herculesContext = await browser.newContext();
    let page = await herculesContext.newPage();
    
    // Hardcode Server ID provided by the user
    const serverId = 'kzdzyaot';
    const domain = `${serverId}.mailosaur.net`;
    
    const randomString = Math.random().toString(36).substring(2, 10);
    const tempEmail = `test_hercules_${randomString}@${domain}`;
    console.log(`Prepared Temp Email: ${tempEmail}`);
    
    // 2. Sign Up on Hercules
    const homePage = new HerculesHomePage(page);
    const signupPage = new HerculesSignupPage(page);

    console.log('Navigating to Hercules Homepage...');
    await homePage.navigate();
    
    console.log('Clicking Sign Up...');
    await homePage.clickSignUp();
    
    console.log(`Signing up with email: ${tempEmail}`);
    await signupPage.signUpWithEmail(tempEmail);
    
    console.log('Entering password on the post-signup screen...');
    await signupPage.createPassword('TestPassword@2026!');

    // 3. Wait for Verification Email on Mailosaur UI
    console.log('Opening Mailosaur to check for verification email...');
    await mailPage.bringToFront();
    
    const mailosaurUtility = new MailosaurUtility(mailPage, mailContext);
    await mailosaurUtility.login('kayimoh434@bejum.com', 'Karthik@8342', serverId);
    let newPage = await mailosaurUtility.fetchVerificationLink();
    
    
    // Replace the main page variable with this new page so the onboarding script uses it
    const originalPage = page;
    page = newPage; 
    
    // PAUSE removed
    console.log('Handling onboarding flow...');
    
    // Step 1: Full name
    const fullNameInput = page.locator("[placeholder='Full name']");
    await fullNameInput.waitFor({ state: 'visible', timeout: 15000 });
    const randomName = 'User' + Math.random().toString(36).substring(2, 6);
    console.log(`Entering Full Name: ${randomName}`);
    await fullNameInput.fill(randomName);
    await page.keyboard.press('Enter');
    
    // Step 2: Role selection (click random)
    console.log('Selecting role...');
    const optionLocatorStr = "[class='text-[#E4E4E4] text-[13px] font-semibold font-inter leading-[130%] tracking-[-2%] break-words text-center']";
    const roleOptions = page.locator(optionLocatorStr);
    await roleOptions.first().waitFor({ state: 'visible', timeout: 15000 });
    const roleCount = await roleOptions.count();
    const randomRoleIndex = Math.floor(Math.random() * roleCount);
    await roleOptions.nth(randomRoleIndex).click();
    
    // Step 3: Any options randomly (use-cases, etc)
    console.log('Selecting next option...');
    await page.waitForTimeout(2000); // wait for screen transition
    const useCaseOptions = page.locator(optionLocatorStr);
    await useCaseOptions.first().waitFor({ state: 'visible', timeout: 15000 });
    const useCaseCount = await useCaseOptions.count();
    const randomUseCaseIndex = Math.floor(Math.random() * useCaseCount);
    await useCaseOptions.nth(randomUseCaseIndex).click();
    
    // Step 4: Verify Dashboard
    console.log('Waiting for Dashboard to load and adding 10 sec wait...');
    await page.waitForTimeout(10000);
    
    const userNameElement = page.locator("[class='capitalize']");
    await userNameElement.first().waitFor({ state: 'visible', timeout: 20000 });
    
    const displayedName = await userNameElement.first().innerText();
    
    console.log(`\n=== NAME VERIFICATION ===`);
    console.log(`Generated name: ${randomName}`);
    console.log(`Displayed name on dashboard: ${displayedName}`);
    console.log(`=========================\n`);
    
    expect(displayedName.toLowerCase()).toContain(randomName.toLowerCase());
  });

});
