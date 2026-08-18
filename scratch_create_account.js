const { test, chromium } = require('playwright');
const HerculesHomePage = require('./pages/hercules/HerculesHomePage');
const HerculesSignupPage = require('./pages/hercules/HerculesSignupPage');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const homePage = new HerculesHomePage(page);
  const signupPage = new HerculesSignupPage(page);

  console.log('Navigating to Hercules Homepage...');
  await homePage.navigate();
  
  const randomString = Math.random().toString(36).substring(2, 10);
  const tempEmail = `testuser_${randomString}@guerrillamail.com`;
  
  console.log('Clicking Sign Up...');
  const signUpBtn = page.locator("//button[text()='Sign Up']");
  await signUpBtn.waitFor({ state: 'visible' });
  await signUpBtn.click();
  
  console.log(`Signing up with email: ${tempEmail}`);
  await signupPage.signUpWithEmail(tempEmail);

  console.log('Waiting 15 seconds to observe what happens next (verification, password, etc)...');
  await page.waitForTimeout(15000);

  console.log('Scraping the resulting page DOM...');
  const html = await page.content();
  fs.writeFileSync('post_signup_dom.html', html);
  
  console.log('Done! Saving screenshot...');
  await page.screenshot({ path: '/Users/karthiku/.gemini/antigravity/brain/96bf4951-2c59-4b13-b581-1bddbd78665c/post_signup.png' });

  await browser.close();
})();
