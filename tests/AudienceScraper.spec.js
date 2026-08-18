const { test, expect } = require('@playwright/test');
const fs = require('fs');
const config = require('../config/hercules.config.js');

test('Scrape Edit Audience Modal Locators', async ({ page }) => {
  console.log(`Navigating to ${config.baseUrl}...`);
  await page.goto(config.baseUrl);
  await page.waitForTimeout(3000); // Wait for dashboard to load
  
  console.log('Looking for a survey card on the dashboard...');
  // Find any survey card and click it. (assuming there are surveys)
  // Since we don't know the exact class, we will click any div that looks like a survey card, or look for text like "Edit" or "View"
  const surveyCards = page.locator('text="Edit Audience"').first();
  
  if (await surveyCards.isVisible()) {
      console.log('Found "Edit Audience" directly on dashboard. Clicking...');
      await surveyCards.click();
  } else {
      console.log('Trying to click a survey card to open details...');
      // Click the first element that looks like a survey title or card
      const possibleCard = page.locator('div.cursor-pointer').first();
      if (await possibleCard.isVisible()) {
          await possibleCard.click();
      } else {
          console.log('Could not easily find a survey to click. Taking screenshot for analysis.');
          await page.screenshot({ path: 'dashboard_for_scraper.png', fullPage: true });
      }
      
      await page.waitForTimeout(2000);
      
      console.log('Looking for "Edit Audience" button inside survey details...');
      const editBtn = page.getByText('Edit Audience').first();
      if (await editBtn.isVisible()) {
          await editBtn.click();
      } else {
          console.log('Could not find Edit Audience button. Saving screenshot.');
          await page.screenshot({ path: 'survey_details_for_scraper.png', fullPage: true });
      }
  }

  await page.waitForTimeout(2000);
  
  console.log('--- Scraping Edit Audience Modal Locators ---');
  const modalLocators = await page.evaluate(() => {
    const modal = document.querySelector('div[role="dialog"]') || document.body;
    const interactables = Array.from(modal.querySelectorAll('button, input, textarea, a, select, [role="button"], img, span'));
    
    return interactables.map(el => {
      return {
        tag: el.tagName.toLowerCase(),
        text: (el.innerText || el.value || '').trim().substring(0, 50),
        className: el.className,
        placeholder: el.placeholder || '',
        alt: el.alt || ''
      };
    }).filter(e => e.text || e.placeholder || e.alt); // keep ones with identifying info
  });
  
  fs.writeFileSync('edit_audience_locators_fast.json', JSON.stringify(modalLocators, null, 2));
  console.log('Successfully saved locators to edit_audience_locators_fast.json!');
  await page.screenshot({ path: 'scraped_audience_modal.png', fullPage: true });
});
