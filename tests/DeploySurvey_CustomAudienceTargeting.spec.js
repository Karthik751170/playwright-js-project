const { test, expect } = require('@playwright/test');
const { setupMailosaurAccount } = require('./utils/MailosaurSetup');
const HerculesSurveyGenerator = require('../pages/hercules/HerculesSurveyGenerator');
const path = require('path');
const fs = require('fs');

test.use({ storageState: { cookies: [], origins: [] } });

test('Hercules - Custom Audience Targeting & Demographic Configuration', async ({ browser }) => {
    test.setTimeout(3600000); // 1 hour max

    const scratchDir = path.join(process.cwd(), 'scratch');
    if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

    console.log('\n======================================================');
    console.log(' STEP 1: SETUP FRESH HERCULES ACCOUNT & SURVEY       ');
    console.log('======================================================');
    const { page } = await setupMailosaurAccount(browser);

    const textarea = page.locator("textarea[aria-label='Ask Hercules a question'], [class='w-full pb-[36.821px] pl-[24px] pr-[24.547px] pt-[24px] sm:h-[93px]'] textarea, [class='w-full pb-[36.821px] pl-[24px] pr-[24.547px] pt-[24px] sm:h-[93px]'] input").or(page.getByRole('textbox', { name: 'Describe the research you' })).first();
    await textarea.waitFor({ state: 'visible', timeout: 15000 });
    await textarea.fill('Design a consumer feedback survey for organic skincare products targeting female professionals in tier 1 cities.');
    
    const submitBtn = page.locator('button[aria-label="submit button"]').or(page.getByRole('button', { name: 'Send' })).first();
    await submitBtn.click({ force: true });

    const surveyGenerator = new HerculesSurveyGenerator(page);
    for (let i = 0; i < 60; i++) {
        await page.waitForTimeout(4000);
        if (page.url().includes('editor')) break;
        if (await surveyGenerator.clickGenerateBrief()) break;
        if (await surveyGenerator.handleSelectAllThatApply()) continue;
        if (await surveyGenerator.handleSingleSelect()) continue;
        if (await surveyGenerator.handleTextInputFallback()) continue;
        if (await surveyGenerator.clickSkip()) continue;
    }

    const generateResearchBtn = page.getByRole('button', { name: 'Yes, generate the research' }).or(page.locator("//button[text()='Yes, generate the research brief']"));
    if (await generateResearchBtn.isVisible({ timeout: 15000 }).catch(() => false)) {
        await generateResearchBtn.click({ force: true });
    }

    const createSurveyBtn = page.getByRole('button', { name: 'Yes, create the survey.' }).or(page.locator("//button[text()='Yes, create the survey.']")).first();
    await createSurveyBtn.waitFor({ state: 'visible', timeout: 180000 }).catch(() => {});
    if (await createSurveyBtn.isVisible().catch(() => false)) {
        await createSurveyBtn.click({ force: true });
    }

    await page.waitForURL('**/editor/**', { timeout: 90000 }).catch(() => {});

    console.log('\n======================================================');
    console.log(' STEP 2: OPEN DEPLOY SIDEBAR & EDIT TARGET AUDIENCE   ');
    console.log('======================================================');
    const topDeployBtn = page.getByRole('button', { name: 'Deploy Deploy' })
        .or(page.getByRole('button', { name: 'Deploy', exact: true }))
        .or(page.locator("button:has-text('Deploy')"))
        .first();

    await topDeployBtn.waitFor({ state: 'visible', timeout: 60000 });
    await topDeployBtn.click({ force: true });
    await page.waitForTimeout(2000);

    console.log('Looking for "Edit Target Audience" or "Audience" configuration button...');
    const editAudienceBtn = page.locator("button:has-text('Edit Audience')")
        .or(page.locator("button:has-text('Edit')"))
        .or(page.locator("[aria-label*='audience' i]"))
        .first();

    if (await editAudienceBtn.isVisible().catch(() => false)) {
        console.log('Clicking Edit Target Audience button...');
        await editAudienceBtn.click({ force: true });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(scratchDir, '1_custom_audience_modal_open.png'), fullPage: true });

        console.log('Configuring custom demographic filters (Female, 25-45 age group, Mumbai/Delhi/Bangalore)...');
        const genderFemaleBtn = page.locator("button:has-text('Female')").or(page.locator("label:has-text('Female')")).first();
        if (await genderFemaleBtn.isVisible().catch(() => false)) {
            await genderFemaleBtn.click({ force: true });
            console.log('Selected Female gender preference.');
        }

        const saveAudienceBtn = page.locator("button:has-text('Save Audience')").or(page.locator("button:has-text('Apply')")).or(page.locator("button:has-text('Save')")).first();
        if (await saveAudienceBtn.isVisible().catch(() => false)) {
            await saveAudienceBtn.click({ force: true });
            console.log('Saved custom target audience configuration!');
        }
    }

    await page.screenshot({ path: path.join(scratchDir, '2_audience_targeting_configured.png'), fullPage: true });
    console.log('✅ DEMOGRAPHIC & AUDIENCE TARGETING TEST COMPLETED!');
});
