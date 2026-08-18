const { test, expect } = require('@playwright/test');
const { setupMailosaurAccount } = require('./utils/MailosaurSetup');
const HerculesSurveyGenerator = require('../pages/hercules/HerculesSurveyGenerator');
const path = require('path');
const fs = require('fs');

test.use({ storageState: { cookies: [], origins: [] } });

test('Hercules - Generate Survey via Document/File Upload Attachment', async ({ browser }) => {
    test.setTimeout(3600000); // 1 hour max

    const scratchDir = path.join(process.cwd(), 'scratch');
    if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

    console.log('\n======================================================');
    console.log(' STEP 1: SETUP FRESH HERCULES ACCOUNT                 ');
    console.log('======================================================');
    const { page } = await setupMailosaurAccount(browser);

    console.log('\n======================================================');
    console.log(' STEP 2: CREATE SAMPLE RESEARCH DOCUMENT               ');
    console.log('======================================================');
    const sampleDocPath = path.join(scratchDir, 'Sample_EV_Research_Brief.txt');
    fs.writeFileSync(sampleDocPath, `
        Project Title: Electric Vehicle Adoption in India
        Target Audience: Urban professionals aged 25-45 in Tier 1 cities.
        Key Objectives:
        1. Evaluate primary purchase barriers for electric 2-wheelers vs 4-wheelers.
        2. Assess charging infrastructure availability concerns.
        3. Determine price sensitivity and willingness to pay.
    `.trim());

    console.log(`Sample document created at: ${sampleDocPath}`);

    console.log('\n======================================================');
    console.log(' STEP 3: UPLOAD DOCUMENT ATTACHMENT TO ASK HERCULES   ');
    console.log('======================================================');
    
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.waitFor({ state: 'attached', timeout: 15000 });
    await fileInput.setInputFiles(sampleDocPath);
    console.log('Uploaded Sample_EV_Research_Brief.txt into chat input box!');

    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(scratchDir, '1_document_attached_preview.png') });

    const textarea = page.locator("textarea[aria-label='Ask Hercules a question'], [class='w-full pb-[36.821px] pl-[24px] pr-[24.547px] pt-[24px] sm:h-[93px]'] textarea, [class='w-full pb-[36.821px] pl-[24px] pr-[24.547px] pt-[24px] sm:h-[93px]'] input").or(page.getByRole('textbox', { name: 'Describe the research you' })).first();
    await textarea.fill('Generate a comprehensive market research survey based on the attached document.');
    
    const submitBtn = page.locator('button[aria-label="submit button"]').or(page.getByRole('button', { name: 'Send' })).first();
    await submitBtn.click({ force: true });

    console.log('\n======================================================');
    console.log(' STEP 4: ANSWER QUESTIONNAIRE & GENERATE BRIEF         ');
    console.log('======================================================');
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
        console.log('Clicking "Yes, generate the research brief"...');
        await generateResearchBtn.click({ force: true });
    }

    console.log('\n======================================================');
    console.log(' STEP 5: CLICK CREATE SURVEY & VERIFY EDITOR LOADED    ');
    console.log('======================================================');
    const createSurveyBtn = page.getByRole('button', { name: 'Yes, create the survey.' }).or(page.locator("//button[text()='Yes, create the survey.']")).first();
    await createSurveyBtn.waitFor({ state: 'visible', timeout: 180000 }).catch(() => {});
    if (await createSurveyBtn.isVisible().catch(() => false)) {
        await createSurveyBtn.click({ force: true });
    }

    await page.waitForURL('**/editor/**', { timeout: 90000 }).catch(() => {});
    console.log(`Editor URL: ${page.url()}`);
    expect(page.url()).toContain('editor');

    await page.screenshot({ path: path.join(scratchDir, '2_document_upload_survey_success.png'), fullPage: true });
    console.log('✅ DOCUMENT-BASED SURVEY GENERATION SUCCESSFUL!');
});
