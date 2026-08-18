const { chromium } = require('@playwright/test');
const fs = require('fs');

(async () => {
  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('BROWSER: ', msg.text()));

  try {
    console.log("Navigating to dev.hercules.works...");
    await page.goto('https://dev.hercules.works/');
    await page.waitForTimeout(3000);

    console.log("Clicking 'Write a prompt'...");
    await page.locator('button:has-text("Write a prompt")').first().click();

    const promptInput = page.locator('textarea#prompt');
    await promptInput.waitFor({ state: 'visible', timeout: 5000 });
    await promptInput.fill('Create a comprehensive employee engagement survey for a remote tech company.');

    await page.locator("//button[@aria-label='submit button']").first().click();

    console.log("Entering dynamic AI questionnaire loop...");
    let loopCount = 0;
    let briefGenerated = false;
    let consecutiveNoAction = 0;

    while (loopCount < 36 && !briefGenerated) {
      await page.waitForTimeout(5000);
      loopCount++;

      const generateBtn = page.locator("button").filter({ hasText: /generate/i });
      if (await generateBtn.count() > 0 && await generateBtn.first().isVisible()) {
        await generateBtn.first().click();
        briefGenerated = true;
        break;
      }

      const selectAllHeader = page.locator("//h2[contains(text(),'Select all that apply.')]");
      if (await selectAllHeader.count() > 0 && await selectAllHeader.first().isVisible()) {
        const options = page.locator("[class='group relative flex items-center justify-between w-full text-left px-[16px] py-[9px] min-h-[44px] rounded-[12px] transition-colors duration-[120ms] focus:outline-none focus-visible:outline-none hover:bg-[#FAFAFB]']");
        if (await options.count() > 0) {
          await options.first().click();
          await page.waitForTimeout(500);
          const confirmBtn = page.locator("//span[text()='Confirm']");
          if (await confirmBtn.count() > 0 && await confirmBtn.first().isVisible()) {
            await confirmBtn.first().click();
            consecutiveNoAction = 0;
            continue;
          }
        }
      }

      const textInput = page.locator('input[placeholder="Add your own…"]');
      if (await textInput.count() > 0 && await textInput.first().isVisible()) {
        await textInput.first().fill("Generic answer for context.");
        await page.waitForTimeout(500);
        
        const nextBtn = page.locator('button[aria-label="Next question"]');
        if (await nextBtn.count() > 0 && await nextBtn.first().isEnabled()) {
          await nextBtn.first().click();
        } else {
          await textInput.first().press('Enter');
        }
        consecutiveNoAction = 0;
        continue;
      }

      const skipBtn = page.locator("button:has-text('Skip')");
      if (await skipBtn.count() > 0 && await skipBtn.first().isVisible()) {
        await skipBtn.first().click();
        consecutiveNoAction = 0;
        continue;
      }

      consecutiveNoAction++;
    }

    if (!briefGenerated) {
      console.log("Failed to reach 'Yes, generate the brief' within the timeout.");
      await browser.close();
      return;
    }

    console.log("Waiting 120 seconds for research brief completion...");
    await page.waitForTimeout(120000);

    // Scroll to bottom just in case
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);

    // 1. Verify buttons appear
    console.log("\n--- Checking Buttons ---");
    const editAudienceBtn = page.locator('button:has-text("Edit Audience")');
    const createSurveyBtn = page.locator('button:has-text("create the survey")');
    
    console.log(`Edit Audience Button Visible? ${await editAudienceBtn.first().isVisible()}`);
    console.log(`Create Survey Button Visible? ${await createSurveyBtn.first().isVisible()}`);

    // 2. Click 'Yes, create the survey' and verify sign-in popup
    console.log("\n--- Checking Sign-In Popup ---");
    if (await createSurveyBtn.first().isVisible()) {
      await createSurveyBtn.first().click();
      await page.waitForTimeout(2000); // Wait for modal
      
      const closeBtn = page.locator("button[aria-label='close']");
      const isSignInVisible = await closeBtn.isVisible();
      console.log(`Sign-In Popup (close button) Visible? ${isSignInVisible}`);
      
      if (isSignInVisible) {
        await closeBtn.first().click();
        console.log("Closed Sign-In Popup.");
        await page.waitForTimeout(1000); // Wait for modal to disappear
      }
    } else {
      console.log("Create Survey Button not visible, skipping sign-in check.");
    }

    // 3. Click 'Edit Audience' and fetch locators
    console.log("\n--- Fetching Edit Audience Locators ---");
    if (await editAudienceBtn.first().isVisible()) {
      await editAudienceBtn.first().click();
      await page.waitForTimeout(3000); // Wait for modal to populate
    } else {
      console.log("Edit Audience Button not visible, fetching locators from main page instead.");
    }

    const modalElements = await page.evaluate(() => {
      // Assuming modal is a role="dialog" or has absolute/fixed positioning, but let's grab all inputs, selects, and buttons
      // that are typically inside modals.
      const interactables = Array.from(document.querySelectorAll('div[role="dialog"] input, div[role="dialog"] button, div[role="dialog"] select, div[role="dialog"] h2, div[role="dialog"] label, div[role="dialog"] [role="button"]'));
      
      // If modal role="dialog" isn't found, fallback to scraping everything visible
      const targetEls = interactables.length > 0 ? interactables : Array.from(document.querySelectorAll('input, select, label, h2, button, [role="button"]'));
      
      return targetEls.map(el => {
        return {
          tag: el.tagName,
          type: el.type,
          text: (el.innerText || el.value || '').substring(0, 50).replace(/\n/g, ' '),
          placeholder: el.placeholder || '',
          id: el.id,
          name: el.name,
          role: el.getAttribute('role'),
          ariaLabel: el.getAttribute('aria-label')
        };
      }).filter(e => e.text.trim() !== '' || e.placeholder !== '' || e.ariaLabel !== null);
    });

    console.log(JSON.stringify(modalElements, null, 2));

  } catch (error) {
    console.error("An error occurred:", error);
  } finally {
    await browser.close();
  }
})();
