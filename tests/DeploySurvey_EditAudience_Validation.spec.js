const { test, expect } = require('@playwright/test');
const HerculesSurveyGenerator = require('../pages/hercules/HerculesSurveyGenerator');
const HerculesEditAudience = require('../pages/hercules/HerculesEditAudience');
const { setupMailosaurAccount } = require('./utils/MailosaurSetup');

// Use empty storage state so we don't crash on missing file, and force a fresh login
test.use({ storageState: { cookies: [], origins: [] } });

test('Deploy survey with Edit Audience validation', async ({ browser }) => {
    test.setTimeout(1800000); // 30 mins

    console.log('\n--- STEP 1: MAILOSAUR ACCOUNT SETUP & LOGIN ---');
    const { page } = await setupMailosaurAccount(browser);

    // Enter Prompt
    console.log('\nEntering prompt...');
    const textarea = page.locator("textarea[aria-label='Ask Hercules a question'], [class='w-full pb-[36.821px] pl-[24px] pr-[24.547px] pt-[24px] sm:h-[93px]'] textarea, [class='w-full pb-[36.821px] pl-[24px] pr-[24.547px] pt-[24px] sm:h-[93px]'] input").or(page.getByRole('textbox', { name: 'Describe the research you' })).first();
    await textarea.fill('Create a comprehensive survey for tech enthusiasts in Mumbai about smartwatch features.');
    await page.locator('button[aria-label="submit button"]').or(page.getByRole('button', { name: 'Send' })).first().click();

    // Answer AI Questionnaire
    console.log('\nNavigating through AI questionnaire loop...');
    const surveyGenerator = new HerculesSurveyGenerator(page);
    const editAudience = new HerculesEditAudience(page);
    
    let loopCount = 0;
    let briefGenerated = false;
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
            if (await surveyGenerator.handleSelectAllThatApply()) continue;
        }

        // 3. Single select fallback
        if (await surveyGenerator.handleSingleSelect()) continue;

        // 4. Check text input
        if (await surveyGenerator.handleTextInputFallback()) continue;

        // 5. Check Skip
        if (await surveyGenerator.clickSkip()) continue;
    }

    console.log('Brief generation triggered! Waiting dynamically for up to 12 minutes for completion...');
    // Dynamically wait for the 'Edit Audience' button to appear on the chat card
    const editAudienceBtn = page.locator('button:has-text("Edit Audience")').last();
    await editAudienceBtn.waitFor({ state: 'visible', timeout: 720000 });

    console.log('Brief generation is complete! Proceeding with Edit Audience in chat card...');
    await page.waitForTimeout(3000);
    await editAudienceBtn.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(1000);

    console.log('--- STEP 2: OPEN EDIT AUDIENCE MODAL (SAME AS GUEST FLOW) ---');
    await editAudienceBtn.click({ force: true });
    
    // Wait for the modal cancel button to appear to ensure modal is loaded
    const modalCancelBtn = page.locator('button:has-text("Cancel")');
    await modalCancelBtn.waitFor({ state: 'visible', timeout: 15000 });
    console.log('Edit Audience modal opened.');
    
    // Update sample size with a random number up to 5000
    const updatedSampleSize = await editAudience.setSampleSizeRandom();
    console.log(`Target Sample Size configured: ${updatedSampleSize}`);

    // Perform random edits as requested in guest audience flow
    await editAudience.editLocationsRandomly();
    await editAudience.editDemographicsRandomly();
    await editAudience.editAudienceInterestsRandomly();
    
    // Confirm the edit to close the modal
    console.log('Confirming audience edits...');
    await editAudience.clickConfirm();
    await page.waitForTimeout(3000);

    console.log('--- STEP 3: WAIT FOR VERSION 2 BRIEF COMPILATION & CLICK CREATE SURVEY BUTTON ---');
    // After audience confirmation in chat, Hercules compiles "Version 2 of Research Brief"
    // Wait for the final "Yes, create the survey." button to reappear after v2 completes
    const createSurveyBtn = page.locator('button:has-text("Yes, create the survey.")')
        .or(page.locator('button:has-text("create the survey")'))
        .or(page.getByRole('button', { name: /create.*survey/i }))
        .or(page.locator("//button[contains(text(),'create the survey')]"))
        .or(page.locator("button:has-text('Create Survey')"))
        .first();
    
    console.log('Waiting up to 45 mins for Version 2 brief generation & Create Survey button...');
    await createSurveyBtn.waitFor({ state: 'visible', timeout: 2700000 });
    await createSurveyBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(2000);
    await createSurveyBtn.click({ force: true });
    console.log('Clicked create survey button!');

    console.log('--- STEP 4: CLICK AUDIENCE SUMMARY LINK & VALIDATE PERSISTED DATA ---');
    // Click class font-semibold underline cursor-pointer mr-2
    const audienceSummaryLink = page.locator("[class*='font-semibold'][class*='underline'][class*='cursor-pointer'][class*='mr-2']")
        .or(page.locator("[class='font-semibold underline cursor-pointer mr-2']"))
        .or(page.getByText('View Audience'))
        .or(page.getByText('Edit Manually'))
        .first();

    await audienceSummaryLink.waitFor({ state: 'visible', timeout: 300000 });
    const summaryLinkText = (await audienceSummaryLink.innerText().catch(() => '')).trim();
    console.log(`Found audience summary link with text: "${summaryLinkText}"`);
    
    console.log('Scrolling audience summary link into view and waiting 2 seconds...');
    await audienceSummaryLink.scrollIntoViewIfNeeded();
    await page.waitForTimeout(2000);
    await audienceSummaryLink.click({ force: true });
    console.log('Clicked audience summary link! Pop-up modal should display now.');
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'scratch/logged_in_audience_popup_validation.png', fullPage: true }).catch(() => {});

    // Fetch text from modal and validate updated data
    const modalContent = page.locator("div[role='dialog']").or(page.locator("[class*='modal'], [class*='dialog'], div[class*='fixed inset-0']")).first();
    await modalContent.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

    const modalText = await modalContent.innerText().catch(() => '');
    console.log('\n--- FETCHED MODAL TEXT ---');
    console.log(modalText);

    // Read back Sample Size / User Count input value inside modal
    const currentSampleSize = await page.locator("input[type='text'], input[class*='border']").first().inputValue().catch(() => null);
    console.log(`Current Sample Size in re-opened modal: ${currentSampleSize}`);

    // Assertions
    expect(modalText.length, 'Audience pop-up modal text should not be empty').toBeGreaterThan(0);
    
    // Assert updated Sample Size is present in modal text
    if (updatedSampleSize) {
        console.log(`Validating modal text contains updated Sample Size: "${updatedSampleSize}"`);
        expect(modalText).toContain(updatedSampleSize.toString());
    }

    if (updatedSampleSize && currentSampleSize) {
        console.log(`Validating Sample Size input: configured ${updatedSampleSize} vs modal ${currentSampleSize}`);
        expect(currentSampleSize).toBe(updatedSampleSize.toString());
    }

    console.log('\n✔ Logged-in Edit Audience validation assertions completed successfully!');
});

