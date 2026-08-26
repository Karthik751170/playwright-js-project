const { test, expect } = require('@playwright/test');
const HerculesHomePage = require('../pages/hercules/HerculesHomePage');
const HerculesSurveyGenerator = require('../pages/hercules/HerculesSurveyGenerator');
const HerculesEditAudience = require('../pages/hercules/HerculesEditAudience');
const AIPromptGenerator = require('../utils/AIPromptGenerator');

test.describe('Hercules Guest User - Survey Generation & Audience Validation', () => {
  // We want to test the guest flow, so we override the global setup
  // and start with a completely clear authentication state (logged out).
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Guest should generate a survey, validate sign-in prompt, and edit audience', async ({ page }) => {
    test.setTimeout(1200000); // 20 minutes total timeout

    const homePage = new HerculesHomePage(page);
    const surveyGenerator = new HerculesSurveyGenerator(page);
    const editAudience = new HerculesEditAudience(page);

    console.log('Navigating to Hercules Homepage...');
    await homePage.navigate();
    
    // Fetch a prompt from JSON
    const prompt = await AIPromptGenerator.generateSurveyPrompt();
    console.log(`Using Prompt: ${prompt.title}`);

    await homePage.clickWriteAPrompt();
    await homePage.generateSurvey(prompt.description);

    // Loop to navigate the AI flow
    let loopCount = 0;
    let briefGenerated = false;
    let consecutiveNoAction = 0;

    console.log('Navigating AI questionnaire loop...');
    while (loopCount < 240 && !briefGenerated) {
      await page.waitForTimeout(5000);
      loopCount++;

      // 1. Check if 'Yes, generate the brief' is visible
      if (await surveyGenerator.clickGenerateBrief()) {
        briefGenerated = true;
        break;
      }

      // 2. Check multi-select
      if (await surveyGenerator.selectAllThatApplyHeader.count() > 0 && await surveyGenerator.selectAllThatApplyHeader.first().isVisible()) {
        if (await surveyGenerator.handleSelectAllThatApply()) {
          consecutiveNoAction = 0;
          continue;
        }
      }

      // 2.5 Single select fallback
      if (await surveyGenerator.handleSingleSelect()) {
        consecutiveNoAction = 0;
        continue;
      }

      // 3. Check text input
      if (await surveyGenerator.handleTextInputFallback()) {
        consecutiveNoAction = 0;
        continue;
      }

      // 4. Check Skip
      if (await surveyGenerator.clickSkip()) {
        consecutiveNoAction = 0;
        continue;
      }

      consecutiveNoAction++;
    }

    console.log('Brief generation triggered! Waiting dynamically for up to 8 minutes for completion...');
    
    // Dynamically wait for the 'Edit Audience' button to appear, with a 12-minute timeout.
    // As soon as it appears, it means generation is complete.
    await surveyGenerator.editAudienceWaitBtn.waitFor({ state: 'visible', timeout: 720000 });

    console.log('Brief generation is complete! Proceeding with validation...');
    await surveyGenerator.editAudienceWaitBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(2000);

    // Verify sections
    await surveyGenerator.verifyBriefGenerated();
    
    // Verify Create Survey and Edit Audience buttons are visible
    await surveyGenerator.verifyPostBriefButtonsVisible();

    console.log('--- Validating Create Survey Sign-In Block ---');
    // Click Create Survey and verify the sign-in modal blocks the user
    await surveyGenerator.verifySignInPopupOnCreateSurvey();

    console.log('--- Validating Edit Audience Modal ---');
    // Open Edit Audience for the first time
    await surveyGenerator.openEditAudienceModal();
    
    // Update sample size with a random number up to 5000
    const randomSize = await editAudience.setSampleSizeRandom();

    // Perform random edits as requested
    await editAudience.editLocationsRandomly();
    await editAudience.editDemographicsRandomly();
    await editAudience.editAudienceInterestsRandomly();
    
    // Confirm the edit to close the modal
    await editAudience.clickConfirm();

    // Wait for 2 minutes after editing the audience as requested
    console.log('Waiting for 2 minutes (120000ms)...');
    await page.waitForTimeout(120000);

    // Click on Open sidebar
    console.log('Clicking Open sidebar...');
    const openSidebarBtn = page.locator("[aria-label='Open sidebar']");
    await openSidebarBtn.waitFor({ state: 'visible', timeout: 5000 });
    await openSidebarBtn.click();
    await page.waitForTimeout(2000); // Short wait for sidebar animation

    // Click on "New chat" or the specific chat history item
    console.log('Clicking on New chat / chat history item...');
    // We try to click something that says "New Chat" or the locator provided earlier
    const newChatBtn = page.locator('text="New chat"').or(page.locator("[class='flex flex-col gap-[10px] flex-shrink-0']")).first();
    await newChatBtn.waitFor({ state: 'visible', timeout: 5000 });
    await newChatBtn.click();

    // Verify chat loaded by waiting until 'Edit Audience' is visible
    console.log('Waiting for Edit Audience button to appear...');
    const editAudienceBtn2 = page.locator('button:has-text("Edit Audience")').first();
    await editAudienceBtn2.waitFor({ state: 'visible', timeout: 60000 });
    
    // Click Edit Audience
    console.log('Clicking Edit Audience button...');
    await editAudienceBtn2.scrollIntoViewIfNeeded();
    await editAudienceBtn2.click();

    // Give the UI a brief moment to react, then capture a screenshot
    await page.waitForTimeout(2000);
    const screenshotPath = '/Users/karthiku/.gemini/antigravity/brain/96bf4951-2c59-4b13-b581-1bddbd78665c/scratch/edit_audience_bug.png';
    await page.screenshot({ path: screenshotPath });
    console.log(`Screenshot saved to: ${screenshotPath}`);

    // Verify Sign-in pop-up is displayed
    console.log('Verifying Sign-in pop-up is displayed...');
    // Hercules uses a custom sign-in modal that has a specific close button
    const closeBtn = page.locator("button[aria-label='close']").first();
    await closeBtn.waitFor({ state: 'visible', timeout: 10000 });
    
    const isSignInVisible = await closeBtn.isVisible();
    expect(isSignInVisible, 'Expected Sign-in pop-up to be displayed').toBe(true);

    console.log('SUCCESS: Sign-in pop-up verified!');
    console.log('Test completed successfully.');
  });
});
