const { test, chromium } = require('playwright');
const HerculesHomePage = require('./pages/hercules/HerculesHomePage');
const HerculesLoginPage = require('./pages/hercules/HerculesLoginPage');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const homePage = new HerculesHomePage(page);
  const loginPage = new HerculesLoginPage(page);

  console.log('Navigating to Hercules Homepage...');
  await homePage.navigate();
  
  console.log('Clicking Log In...');
  const loginBtn = page.locator("//button[text()='Log In']");
  await loginBtn.waitFor({ state: 'visible' });
  await loginBtn.click();
  
  console.log('Logging in with provided credentials...');
  await loginPage.loginWithEmail('kayimoh434@bejum.com');
  
  console.log('Entering password...');
  const passwordInput = page.locator("input[type='password'], input[placeholder='Password']");
  await passwordInput.waitFor({ state: 'visible' });
  await passwordInput.fill('Karthik@8342');
  
  console.log('Clicking final Log In button...');
  const submitLoginBtn = page.locator("button:has-text('Log In'), button:has-text('Submit'), button[type='submit']").last();
  await submitLoginBtn.click();
  
  console.log('Waiting 15 seconds for Dashboard / Audience section to load...');
  await page.waitForTimeout(15000);
  
  // Try to find the audience section or edit buttons
  console.log('Scraping the DOM...');
  const html = await page.content();
  fs.writeFileSync('audience_dom.html', html);
  
  console.log('Saving screenshot of the dashboard/audience view...');
  await page.screenshot({ path: '/Users/karthiku/.gemini/antigravity/brain/96bf4951-2c59-4b13-b581-1bddbd78665c/audience_dashboard.png', fullPage: true });

  await browser.close();
})();
