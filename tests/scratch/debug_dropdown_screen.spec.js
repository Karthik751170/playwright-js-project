const { test, expect } = require('@playwright/test');
const fs = require('fs');

test('Inspect survey-screen URL directly', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const url = 'https://dev.superj.app/survey-screen/6a7dbfcff1a31dedebf215ac';
    console.log(`Navigating directly to: ${url}`);
    await page.goto(url);
    await page.waitForTimeout(10000); // Wait for page to load fully
    
    // Take a screenshot
    await page.screenshot({ path: 'scratch/survey_screen_view.png', fullPage: true });
    
    // Dump HTML
    const html = await page.content();
    fs.writeFileSync('scratch/survey_screen_dom.html', html);
    console.log('Successfully saved screenshot to scratch/survey_screen_view.png and DOM to scratch/survey_screen_dom.html');
});
