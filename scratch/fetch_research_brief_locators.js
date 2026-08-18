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

    console.log("Entering prompt...");
    const promptInput = page.locator('textarea#prompt');
    await promptInput.waitFor({ state: 'visible', timeout: 5000 });
    await promptInput.fill('Create a comprehensive employee engagement survey for a remote tech company.');

    console.log("Submitting prompt...");
    await page.locator("//button[@aria-label='submit button']").first().click();

    console.log("Entering dynamic AI questionnaire loop...");
    
    let loopCount = 0;
    let briefGenerated = false;
    let consecutiveNoAction = 0;

    // Loop for up to 3 minutes max
    while (loopCount < 36 && !briefGenerated) {
      await page.waitForTimeout(5000); // Check state every 5 seconds
      loopCount++;
      console.log(`\n--- Loop iteration ${loopCount} ---`);

      // 1. Check if 'Yes, generate the brief' is visible
      const generateBtn = page.locator("button").filter({ hasText: /generate/i });
      if (await generateBtn.count() > 0 && await generateBtn.first().isVisible()) {
        console.log("Found generate button! Clicking it.");
        await generateBtn.first().click();
        briefGenerated = true;
        break;
      }

      // 2. Check if there's a 'Select all that apply' question
      const selectAllHeader = page.locator("//h2[contains(text(),'Select all that apply.')]");
      if (await selectAllHeader.count() > 0 && await selectAllHeader.first().isVisible()) {
        console.log("Found 'Select all that apply' question.");
        const options = page.locator("[class='group relative flex items-center justify-between w-full text-left px-[16px] py-[9px] min-h-[44px] rounded-[12px] transition-colors duration-[120ms] focus:outline-none focus-visible:outline-none hover:bg-[#FAFAFB]']");
        const count = await options.count();
        if (count > 0) {
          // just click the first one and confirm
          await options.first().click();
          await page.waitForTimeout(500);
          const confirmBtn = page.locator("//span[text()='Confirm']");
          if (await confirmBtn.count() > 0 && await confirmBtn.first().isVisible()) {
            await confirmBtn.first().click();
            console.log("Clicked Confirm for multi-select.");
            consecutiveNoAction = 0;
            continue;
          }
        }
      }

      // 3. Check for a text input question
      const textInput = page.locator('input[placeholder="Add your own…"]');
      if (await textInput.count() > 0 && await textInput.first().isVisible()) {
        console.log("Found text input. Entering generic answer...");
        await textInput.first().fill("Generic answer for context.");
        await page.waitForTimeout(500);
        
        // Try to click the Next button with aria-label
        const nextBtn = page.locator('button[aria-label="Next question"]');
        if (await nextBtn.count() > 0 && await nextBtn.first().isEnabled()) {
          await nextBtn.first().click();
          console.log("Clicked 'Next question' button.");
        } else {
          await textInput.first().press('Enter');
          console.log("Pressed Enter on text input.");
        }
        consecutiveNoAction = 0;
        continue;
      }

      // 4. Check for a Skip button
      const skipBtn = page.locator("button:has-text('Skip')");
      if (await skipBtn.count() > 0 && await skipBtn.first().isVisible()) {
        console.log("Found Skip button. Clicking it...");
        await skipBtn.first().click();
        consecutiveNoAction = 0;
        continue;
      }

      console.log("No actionable elements found in this iteration. Waiting...");
      consecutiveNoAction++;

      // If we are stuck for 5 iterations, dump the HTML for debugging
      if (consecutiveNoAction === 5) {
        console.log("Stuck for 5 iterations. Dumping HTML to scratch/stuck_page.html...");
        const html = await page.content();
        fs.writeFileSync('scratch/stuck_page.html', html);
      }
    }

    if (!briefGenerated) {
      console.log("Failed to reach 'Yes, generate the brief' within the timeout.");
      await browser.close();
      return;
    }

    console.log("\n===========================================");
    console.log("Brief generated! Waiting 2 minutes for full completion...");
    console.log("===========================================\n");
    await page.waitForTimeout(120000); // Wait 2 minutes as requested

    console.log("Extracting locators and full text content from the generated research brief...");
    
    const sections = await page.evaluate(() => {
      // Find all the H3 headers in the research brief
      const headers = Array.from(document.querySelectorAll('h3'));
      return headers.map(h3 => {
        // Find the text content of the element immediately following the header
        let content = '';
        let sibling = h3.nextElementSibling;
        
        // Accumulate text until the next header or end of section
        while (sibling && sibling.tagName !== 'H3' && sibling.tagName !== 'H2' && sibling.tagName !== 'H1') {
          content += (sibling.textContent || '') + '\n\n';
          sibling = sibling.nextElementSibling;
        }

        return {
          locator: `//h3[text()='${h3.innerText}']`,
          heading: h3.innerText,
          generatedText: content.trim()
        };
      }).filter(s => s.heading.trim() !== '');
    });

    console.log(JSON.stringify(sections, null, 2));
    fs.writeFileSync('scratch/research_brief_sections.json', JSON.stringify(sections, null, 2));
    console.log("Saved to scratch/research_brief_sections.json");

  } catch (error) {
    console.error("An error occurred:", error);
  } finally {
    await browser.close();
  }
})();
