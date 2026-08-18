const { test, chromium } = require('playwright');
const HerculesHomePage = require('./pages/hercules/HerculesHomePage');
const HerculesSignupPage = require('./pages/hercules/HerculesSignupPage');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  
  const page1 = await context.newPage();
  const page2 = await context.newPage();
  
  const randomString = Math.random().toString(36).substring(2, 10);
  const login = `testhercules${randomString}`;
  const domain = '1secmail.com';
  const tempEmail = `${login}@${domain}`;
  
  console.log(`Prepared Temp Email: ${tempEmail}`);

  // Now go to Hercules
  const homePage = new HerculesHomePage(page1);
  const signupPage = new HerculesSignupPage(page1);

  console.log('Navigating to Hercules Homepage...');
  await homePage.navigate();
  
  console.log('Clicking Sign Up...');
  const signUpBtn = page1.locator("//button[text()='Sign Up']");
  await signUpBtn.waitFor({ state: 'visible' });
  await signUpBtn.click();
  
  console.log(`Signing up with email: ${tempEmail}`);
  await signupPage.signUpWithEmail(tempEmail);
  
  console.log('Entering password on the post-signup screen...');
  await signupPage.createPassword('TestPassword@2026!');

  console.log('Opening 1secmail to check for verification email...');
  await page2.bringToFront();
  await page2.goto(`https://www.1secmail.com/?login=${login}&domain=${domain}`);
  
  let linkFound = false;
  // Poll for up to 60 seconds
  for(let i=0; i<12; i++) {
      console.log('Checking for Hercules email in 1secmail inbox...');
      // 1secmail shows emails in a table with id 'messagesTable'
      const emailRow = page2.locator('#messagesTable tbody tr:has-text("Hercules")').first();
      
      if (await emailRow.isVisible()) {
          console.log('Email arrived! Clicking it...');
          await emailRow.click();
          
          // Wait for message body to load
          await page2.waitForSelector('#messageBody', { state: 'visible' });
          
          // Extract verification link
          const verifyLinkNode = page2.locator('#messageBody a[href*="dev.hercules.works"]');
          if (await verifyLinkNode.count() > 0) {
              const verificationUrl = await verifyLinkNode.first().getAttribute('href');
              console.log(`Verification URL: ${verificationUrl}`);
              
              console.log('Navigating to Verification URL on Page 1...');
              await page1.bringToFront();
              await page1.goto(verificationUrl);
              linkFound = true;
              break;
          }
      } else {
          console.log('No email yet. Refreshing inbox...');
          await page2.reload();
          await page2.waitForTimeout(5000);
      }
  }
  
  if (linkFound) {
      console.log('Waiting 10 seconds for Onboarding screen to fully load...');
      await page1.waitForTimeout(10000);
      
      console.log('Scraping the Onboarding page DOM...');
      const html = await page1.content();
      fs.writeFileSync('post_verification_dom.html', html);
      
      console.log('Saving screenshot...');
      await page1.screenshot({ path: '/Users/karthiku/.gemini/antigravity/brain/96bf4951-2c59-4b13-b581-1bddbd78665c/onboarding.png' });
  } else {
      console.log('FAILED to find verification link in 1secmail.');
  }

  await browser.close();
})();
