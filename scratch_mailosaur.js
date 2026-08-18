const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  console.log('Launching headless browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log('Navigating to Mailosaur Login...');
  await page.goto('https://mailosaur.com/app/login', { waitUntil: 'domcontentloaded' });
  
  console.log('Filling in credentials...');
  // Find email and password inputs. Mailosaur usually uses name="email" and name="password"
  await page.fill('input[type="email"]', 'kayimoh434@bejum.com');
  await page.fill('input[type="password"]', 'Karthik@8342');
  
  console.log('Submitting login form...');
  await page.click('button[type="submit"]');
  
  console.log('Waiting for login to complete (10s)...');
  await page.waitForTimeout(10000);
  
  console.log('Scraping Mailosaur dashboard DOM...');
  const html = await page.content();
  fs.writeFileSync('mailosaur_dashboard.html', html);
  
  await page.screenshot({ path: '/Users/karthiku/.gemini/antigravity/brain/96bf4951-2c59-4b13-b581-1bddbd78665c/mailosaur_dash.png', fullPage: true });

  await browser.close();
})();
