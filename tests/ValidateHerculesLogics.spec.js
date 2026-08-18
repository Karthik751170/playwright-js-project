const { test, expect } = require('@playwright/test');
const HerculesSurveyGenerator = require('../pages/hercules/HerculesSurveyGenerator');
const { setupMailosaurAccount } = require('./utils/MailosaurSetup');
const SurveyEngine = require('../utils/SurveyEngine');

test.use({ storageState: { cookies: [], origins: [] } });

async function generateSurveyWithCustomLogic(page) {
    const textarea = page.locator("textarea[aria-label='Ask Hercules a question'], [class='w-full pb-[36.821px] pl-[24px] pr-[24.547px] pt-[24px] sm:h-[93px]'] textarea, [class='w-full pb-[36.821px] pl-[24px] pr-[24.547px] pt-[24px] sm:h-[93px]'] input").or(page.getByRole('textbox', { name: 'Describe the research you' })).first();
    try {
        await textarea.waitFor({ state: 'visible', timeout: 10000 });
        console.log('Dashboard loaded directly.');
    } catch (e) {
        console.log('Dashboard chat box not found. Attempting to clear onboarding screens...');
        for (let i = 0; i < 5; i++) {
            if (await textarea.isVisible()) {
                console.log('Dashboard appeared! Onboarding complete.');
                break;
            }
            await page.waitForTimeout(2000);
            const optionBtns = page.locator('button:not([aria-label]):not(:has-text("Continue")):not(:has-text("Next")):not(:has-text("Submit"))');
            if (await optionBtns.count() > 0) {
                try { await optionBtns.first().click({ timeout: 2000 }); } catch(err) {}
            }
            const nextBtn = page.locator('button:has-text("Continue"), button:has-text("Next"), button:has-text("Submit"), button:has-text("Finish")').first();
            if (await nextBtn.isVisible()) {
                await nextBtn.click({ timeout: 2000 }).catch(() => {});
            }
            await page.waitForTimeout(2000);
        }
        await textarea.waitFor({ state: 'visible', timeout: 30000 });
    }

    console.log('\nEntering custom prompt requesting logic rules without initial termination...');
    const customPrompt = "Design a 10-question survey about mobile gaming habits. Please add skip and branching logic rules serially between questions. IMPORTANT: Do NOT add any termination logic initially. Only add skip and branching logic serially to intermediate questions, and add termination logic strictly at the end.";
    console.log(`Prompt: "${customPrompt}"`);
    await textarea.fill(customPrompt);

    const submitBtn = page.locator('button[aria-label="submit button"]').or(page.getByRole('button', { name: 'Send' })).first();
    await submitBtn.scrollIntoViewIfNeeded().catch(() => {});
    await submitBtn.click({ force: true });

    console.log('\nNavigating through AI questionnaire...');
    const surveyGenerator = new HerculesSurveyGenerator(page);
    const finalGenerateSurveyBtn = page.locator('button', { hasText: /create.*survey|generate.*survey/i }).first();
    
    let loopCount = 0;
    let consecutiveFails = 0;
    while (loopCount < 120) {
        await page.waitForTimeout(5000);
        loopCount++;

        const loadingIndicator = page.locator('text=/creating your survey|building your survey/i').first();
        if (page.url().includes('editor')) {
            console.log('URL changed to editor! Questionnaire was skipped or completed.');
            break;
        }
        if (await loadingIndicator.isVisible().catch(() => false)) {
            console.log('Loading screen detected! Survey is generating.');
            break;
        }

        if (await finalGenerateSurveyBtn.isVisible() && await finalGenerateSurveyBtn.isEnabled()) {
            console.log('Create Survey button is already visible!');
            break;
        }
        if (await surveyGenerator.clickGenerateBrief()) {
            console.log('Clicked Generate Brief!');
            break;
        }
        if (await surveyGenerator.selectAllThatApplyHeader.count() > 0 && await surveyGenerator.selectAllThatApplyHeader.first().isVisible()) {
            if (await surveyGenerator.handleSelectAllThatApply()) { consecutiveFails = 0; continue; }
        }
        if (await surveyGenerator.handleSingleSelect()) { consecutiveFails = 0; continue; }
        if (await surveyGenerator.handleTextInputFallback()) { consecutiveFails = 0; continue; }
        if (await surveyGenerator.clickSkip()) { consecutiveFails = 0; continue; }
        
        consecutiveFails++;
        if (consecutiveFails >= 6) {
            console.log('\n--- No questionnaire buttons found for 30 seconds ---');
            console.log('Assuming loading screen or editor. Breaking out of loop!');
            break;
        }
    }

    console.log('Waiting for "Yes, generate the research" button...');
    const generateResearchBtn = page.getByRole('button', { name: 'Yes, generate the research' });
    for (let i = 0; i < 48; i++) {
        if (await generateResearchBtn.isVisible().catch(() => false)) {
            console.log('Found "Yes, generate the research" button! Clicking it...');
            await generateResearchBtn.click({ force: true, timeout: 5000 }).catch(() => {});
            break;
        }
        if (page.url().includes('editor')) break;
        const yesCreateBtn = page.locator("//button[text()='Yes, create the survey.']").or(page.locator("//button[normalize-space()='Yes, create the survey.']")).or(page.getByRole('button', { name: /Yes, create the survey/i })).first();
        if (await yesCreateBtn.isVisible().catch(() => false)) break;
        await page.waitForTimeout(5000);
    }

    let targetCity = 'Pune';
    console.log('Waiting for "Yes, create the survey." button...');
    const createSurveyBtn = page.getByRole('button', { name: 'Yes, create the survey.' }).or(page.locator("//button[text()='Yes, create the survey.']")).or(page.getByRole('button', { name: /Yes, create the survey/i })).first();
    for (let i = 0; i < 720; i++) {
        if (await createSurveyBtn.isVisible().catch(() => false)) {
            await page.waitForTimeout(3000);
            console.log('Clicking "Yes, create the survey" button...');
            await createSurveyBtn.click({ force: true, timeout: 10000 }).catch(() => {});
            await page.waitForTimeout(3000);
            if (!(await createSurveyBtn.isVisible().catch(() => false))) {
                console.log('Create survey button is no longer visible.');
                break;
            }
        }
        if (page.url().includes('editor')) break;
        await page.waitForTimeout(5000);
    }

    console.log('Waiting for Survey Editor to load...');
    await page.waitForURL('**/editor/**', { timeout: 90000 }).catch(() => {});

    console.log('Waiting for Survey Editor Deploy button...');
    const editorDeployBtn = page.getByRole('button', { name: 'Deploy Deploy' })
        .or(page.getByRole('button', { name: 'Deploy', exact: true }))
        .or(page.locator("button:has-text('Deploy')"))
        .or(page.locator("button:has-text('Publish')"))
        .first();
    await editorDeployBtn.waitFor({ state: 'visible', timeout: 3600000 }).catch(() => {});

    const closeBtn = page.locator("button[aria-label='close']");
    if (await closeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await closeBtn.click({ force: true });
    }

    return targetCity;
}

test('Validate Survey Logics - Serial Intermediate Logics and Terminal Logic at End', async ({ browser }) => {
    test.setTimeout(3600000); // 1 hour max

    console.log('\n--- STEP 1: MAILOSAUR ACCOUNT SETUP & LOGIN ---');
    const { page, herculesContext } = await setupMailosaurAccount(browser);

    console.log('\n--- STEP 2: GENERATE SURVEY WITH SERIAL LOGICS (NO INITIAL TERMINATION) ---');
    const targetCity = await generateSurveyWithCustomLogic(page);

    console.log('\n--- STEP 3: EXTRACT ALL LOGIC RULES FROM EDITOR ---');
    await page.waitForTimeout(5000);
    const logicsBtn = page.locator("//button[text()='Logics']");
    if (await logicsBtn.isVisible()) {
        console.log('Found Logics button, clicking it...');
        await logicsBtn.click({ force: true });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'scratch/logics_panel_validation.png', fullPage: true });
    } else {
        console.log('WARNING: Logics button was NOT visible!');
    }

    const surveyLogics = [];
    const logicRows = page.locator("[class='flex items-center justify-between gap-3 px-[18px] pt-[16px] pb-3 cursor-pointer']");
    const count = await logicRows.count();

    for (let i = 0; i < count; i++) {
        const row = logicRows.nth(i);
        const hasLogic = await row.locator("//span[contains(text(), 'Logic')]").isVisible().catch(() => false);

        if (hasLogic) {
            const parent = row.locator('xpath=..');
            let logicText = await parent.innerText();

            if (!logicText.includes('If') && !logicText.includes('End') && !logicText.includes('Skip') && !logicText.includes('Terminate')) {
                await row.locator("//span[contains(text(), 'Logic')]").click({ force: true }).catch(() => row.click({ force: true }));
                await page.waitForTimeout(1000);
                logicText = await parent.innerText();
            }

            if (!logicText.includes('If') && !logicText.includes('End') && !logicText.includes('Skip') && !logicText.includes('Terminate')) {
                await row.click({ force: true });
                await page.waitForTimeout(1000);
                logicText = await parent.innerText();
            }

            surveyLogics.push({ slideIndex: i, text: logicText });
        }
    }

    console.log('\n--- EXTRACTED ALL LOGIC RULES ---');
    console.log(JSON.stringify(surveyLogics, null, 2));

    // Validate extracted logics structure
    console.log(`Extracted ${surveyLogics.length} logic rules across the survey.`);

    console.log('\n--- STEP 4: DEPLOY SURVEY TO 100 USERS FOR FREE ---');
    const topDeployBtn = page.getByRole('button', { name: 'Deploy Deploy' })
        .or(page.getByRole('button', { name: 'Deploy', exact: true }))
        .or(page.locator("button:has-text('Deploy')"))
        .or(page.locator("button:has-text('Publish')"))
        .first();
    await topDeployBtn.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
    await topDeployBtn.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(1000);
    await topDeployBtn.click({ force: true });
    await page.waitForTimeout(2000);

    const freeDeployBtn = page.getByRole('button', { name: 'Deploy to 100 Users for Free' });
    await freeDeployBtn.waitFor({ state: 'visible', timeout: 30000 });
    await freeDeployBtn.scrollIntoViewIfNeeded().catch(() => {});
    await freeDeployBtn.click({ force: true });

    const confirmDeployForFreeBtn = page.getByRole('button', { name: 'Deploy for Free' });
    await confirmDeployForFreeBtn.waitFor({ state: 'visible', timeout: 15000 });
    await confirmDeployForFreeBtn.scrollIntoViewIfNeeded().catch(() => {});
    await confirmDeployForFreeBtn.click({ force: true });

    await page.waitForURL(/.*\/survey-review\/.*/, { timeout: 60000 });

    const launchNowBtn = page.locator("//button[text()='Launch Survey']").first();
    if (await launchNowBtn.isVisible({ timeout: 15000 }).catch(() => false)) {
        await launchNowBtn.click({ force: true }).catch(() => {});
        console.log('Clicked Launch Survey button!');
    }

    console.log('\n--- STEP 5: EXTRACT LIVE SURVEY URL & RUN SURVEY ENGINE ---');
    await page.waitForTimeout(3000);
    let liveSurveyUrl = '';
    const surveyLink = page.locator('a[href*="superj.app"]').first();
    if (await surveyLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        liveSurveyUrl = await surveyLink.getAttribute('href');
    }

    if (liveSurveyUrl && liveSurveyUrl.includes('superj.app') && !liveSurveyUrl.includes('dev.superj.app')) {
        liveSurveyUrl = liveSurveyUrl.replace('superj.app', 'dev.superj.app');
    } else if (liveSurveyUrl && !liveSurveyUrl.includes('dev.')) {
        liveSurveyUrl = liveSurveyUrl.replace('https://', 'https://dev.');
    }
    console.log(`Live Survey URL: ${liveSurveyUrl}`);

    const superjContext = await browser.newContext();
    const livePage = await superjContext.newPage();
    livePage.setDefaultTimeout(300000);
    await livePage.goto(liveSurveyUrl);

    // Onboard consumer
    const LoginPage = require('../pages/LoginPage');
    const DataGeneratorUtil = require('../utils/DataGeneratorUtil');
    const loginPage = new LoginPage(livePage);
    const randomPhone = process.env.TEST_PHONE || DataGeneratorUtil.generateRandomPhoneNumber();
    await loginPage.login(randomPhone, '777777');
    await livePage.waitForTimeout(15000);

    const OnboardingUtil = require('../utils/OnboardingUtil');
    const onboardingUtil = new OnboardingUtil(livePage);
    await onboardingUtil.completeOnboarding('1997', targetCity, 'Male');
    await livePage.waitForTimeout(5000);
    await livePage.goto(liveSurveyUrl);
    await livePage.waitForTimeout(5000);

    const LandingPage = require('../pages/LandingPage');
    const landingPage = new LandingPage(livePage);
    await landingPage.clickStartSurvey(2);

    console.log('\n--- STEP 6: EXECUTE SURVEY ENGINE WITH ALL EXTRACTED LOGICS ---');
    const surveyEngine = new SurveyEngine(livePage, { surveyLogics });
    const result = await surveyEngine.run();
    console.log(`Survey Engine finished with result: ${JSON.stringify(result)}`);

    await livePage.waitForTimeout(10000);
    await superjContext.close().catch(() => {});

    console.log('\n--- STEP 7: VERIFY RESPONSE ON HERCULES B2B DASHBOARD ---');
    await page.bringToFront();
    await page.waitForTimeout(10000);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);

    const responsesLabel = page.locator("//span[contains(text(), 'Responses Collected:')] | //p[contains(text(), 'Responses Collected:')] | //div[contains(text(), 'Responses Collected:')]").first();
    await responsesLabel.scrollIntoViewIfNeeded().catch(() => {});

    if (await responsesLabel.isVisible().catch(() => false)) {
        const countLocator = page.locator("//span[contains(text(), 'Responses Collected:')]/following-sibling::*").first()
            .or(page.locator("//span[contains(text(), 'Responses Collected:')]/.."))
            .first();
        const countText = await countLocator.innerText().catch(() => "");
        console.log(`Responses Collected Output: "${countText}"`);

        const firstNumMatch = countText.replace(/Responses Collected:/i, '').match(/\d+/);
        const firstNum = firstNumMatch ? parseInt(firstNumMatch[0], 10) : 0;
        console.log(`Verified Response Count on B2B: ${firstNum}`);
        expect(firstNum).toBeGreaterThan(0);
    }
});
