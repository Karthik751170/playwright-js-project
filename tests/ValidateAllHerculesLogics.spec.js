const { test, expect } = require('@playwright/test');
const HerculesSurveyGenerator = require('../pages/hercules/HerculesSurveyGenerator');
const { setupMailosaurAccount } = require('./utils/MailosaurSetup');
const SurveyEngine = require('../utils/SurveyEngine');

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Helper to prompt Hercules to generate a survey with explicit logic rules
 */
async function generateSurveyWithAllLogics(page) {
    const textarea = page.locator("textarea[aria-label='Ask Hercules a question'], [class='w-full pb-[36.821px] pl-[24px] pr-[24.547px] pt-[24px] sm:h-[93px]'] textarea, [class='w-full pb-[36.821px] pl-[24px] pr-[24.547px] pt-[24px] sm:h-[93px]'] input").or(page.getByRole('textbox', { name: 'Describe the research you' })).first();
    
    try {
        await textarea.waitFor({ state: 'visible', timeout: 15000 });
        console.log('[GenerateSurvey] Hercules dashboard chat box loaded directly.');
    } catch (e) {
        console.log('[GenerateSurvey] Chat box not visible. Clearing onboarding screens...');
        for (let i = 0; i < 20; i++) {
            if (await textarea.isVisible().catch(() => false)) break;
            
            const fullNameInput = page.getByPlaceholder(/Full name/i).or(page.locator("input[placeholder*='name' i]")).first();
            if (await fullNameInput.isVisible().catch(() => false)) {
                console.log('[GenerateSurvey] Filling full name input...');
                await fullNameInput.fill('Test Researcher').catch(() => {});
                await page.keyboard.press('Enter').catch(() => {});
            }
            
            const optionBtns = page.locator('button:not([aria-label]):not(:has-text("Continue")):not(:has-text("Next")):not(:has-text("Submit"))');
            if (await optionBtns.count().catch(() => 0) > 0) {
                await optionBtns.first().click({ force: true, timeout: 2000 }).catch(() => {});
            }

            const nextBtn = page.locator('button:has-text("Continue"), button:has-text("Next"), button:has-text("Submit"), button:has-text("Finish")').first();
            if (await nextBtn.isVisible().catch(() => false)) {
                await nextBtn.click({ force: true, timeout: 2000 }).catch(() => {});
            }
            await page.waitForTimeout(2000);
        }
        await textarea.waitFor({ state: 'visible', timeout: 60000 });
    }

    console.log('\nEntering prompt to request all types of survey logics...');
    const logicPrompt = "Design a 10-question survey about online shopping habits. Apply Skip Logic, Branching Logic, Display Logic, and Piping Logic serially between intermediate questions. CRITICAL INSTRUCTION: On Question 9, add an explicit Termination / Disqualification Logic rule (if respondent selects a disqualifying option on Question 9, terminate the survey immediately with a disqualification popup). Finally, add completion logic at the end.";
    
    console.log(`Prompt: "${logicPrompt}"`);
    await textarea.fill(logicPrompt);

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
            console.log('URL changed to editor! Questionnaire complete.');
            break;
        }
        if (await loadingIndicator.isVisible().catch(() => false)) {
            console.log('Loading screen detected! Survey generating.');
            break;
        }

        if (await finalGenerateSurveyBtn.isVisible() && await finalGenerateSurveyBtn.isEnabled()) {
            console.log('Create Survey button visible!');
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
            console.log('No questionnaire buttons for 30s. Moving to research button check.');
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
                console.log('Create survey button successfully processed.');
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

test('Validate All Hercules Survey Logics (Skip, Display, Branching & End-to-End Execution)', async ({ browser }) => {
    test.setTimeout(3600000); // 1 hour max

    console.log('\n======================================================');
    console.log(' STEP 1: SETUP MAILOSAUR ACCOUNT & LOGIN TO HERCULES ');
    console.log('======================================================');
    const { page, herculesContext } = await setupMailosaurAccount(browser);

    console.log('\n======================================================');
    console.log(' STEP 2: GENERATE SURVEY WITH EXPLICIT LOGIC RULES    ');
    console.log('======================================================');
    const targetCity = await generateSurveyWithAllLogics(page);

    console.log('\n======================================================');
    console.log(' STEP 3: EXTRACT AND VALIDATE ALL LOGIC RULES        ');
    console.log('======================================================');
    await page.waitForTimeout(5000);
    const logicsBtn = page.locator("//button[text()='Logics']").or(page.locator("button:has-text('Logics')")).first();
    if (await logicsBtn.isVisible()) {
        console.log('Found Logics button, clicking it...');
        await logicsBtn.click({ force: true });
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'scratch/logics_panel_all.png', fullPage: true });
    } else {
        console.log('WARNING: Logics button was NOT visible on editor page.');
    }

    const surveyLogics = [];
    const logicBadges = page.locator("//span[contains(text(), 'Logic')] | //div[contains(text(), 'Logic')]");
    const badgeCount = await logicBadges.count();
    console.log(`Found ${badgeCount} logic badges in the Logics sidebar.`);

    for (let i = 0; i < badgeCount; i++) {
        const badge = logicBadges.nth(i);
        if (await badge.isVisible().catch(() => false)) {
            console.log(`Clicking logic item ${i + 1}/${badgeCount} to expand rule...`);
            await badge.scrollIntoViewIfNeeded().catch(() => {});
            await badge.click({ force: true }).catch(() => {});
            await page.waitForTimeout(1000);
            
            const parentContainer = badge.locator("xpath=ancestor::div[contains(@class,'cursor-pointer') or contains(@class,'flex')][1]");
            const ruleText = await parentContainer.innerText().catch(() => "");
            console.log(`[Extracted Logic Rule ${i + 1}]: "${ruleText.replace(/\s+/g, ' ')}"`);
            surveyLogics.push({ slideIndex: i, text: ruleText });
        }
    }

    console.log('\n--- EXTRACTED SURVEY LOGIC RULES ---');
    console.log(JSON.stringify(surveyLogics, null, 2));
    console.log(`Total logic rules extracted: ${surveyLogics.length}`);

    console.log('\n======================================================');
    console.log(' STEP 4: DEPLOY SURVEY TO 100 USERS FOR FREE         ');
    console.log('======================================================');
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

    console.log('Waiting for "Launch Survey" button...');
    const launchNowBtn = page.locator("//button[contains(., 'Launch Survey')]").or(page.getByRole('button', { name: /Launch Survey/i })).first();
    await launchNowBtn.waitFor({ state: 'visible', timeout: 30000 });
    await launchNowBtn.scrollIntoViewIfNeeded().catch(() => {});
    await launchNowBtn.click({ force: true });
    console.log('Successfully clicked Launch Survey button! Waiting 10 seconds for survey to be published live...\n');
    await page.waitForTimeout(10000);

    console.log('\n======================================================');
    console.log(' STEP 5: EXTRACT LIVE SURVEY URL                     ');
    console.log('======================================================');
    await page.waitForTimeout(3000);
    let liveSurveyUrl = '';
    
    // Method 1: DOM link href matching superj.app
    const surveyLink = page.locator('a[href*="superj.app"]').first();
    if (await surveyLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        liveSurveyUrl = await surveyLink.getAttribute('href') || '';
        console.log(`[LinkExtraction] Found URL in DOM: ${liveSurveyUrl}`);
    }

    // Method 2: Regex search in page body text
    if (!liveSurveyUrl || !liveSurveyUrl.startsWith('http') || !liveSurveyUrl.includes('superj')) {
        const bodyText = await page.innerText('body').catch(() => '');
        const match = bodyText.match(/https?:\/\/[^\s"']*superj\.app[^\s"']*/i);
        if (match) {
            liveSurveyUrl = match[0];
            console.log(`[LinkExtraction] Extracted URL via regex from page body: ${liveSurveyUrl}`);
        }
    }

    // Method 3: Construct fallback from survey review page URL ID
    if (!liveSurveyUrl || !liveSurveyUrl.startsWith('http') || !liveSurveyUrl.includes('superj')) {
        const currentUrl = page.url();
        const surveyIdMatch = currentUrl.match(/survey[^\/]*\/([a-zA-Z0-9]+)/);
        if (surveyIdMatch) {
            liveSurveyUrl = `https://dev.superj.app/survey/${surveyIdMatch[1]}`;
            console.log(`[LinkExtraction] Constructed fallback URL from survey ID: ${liveSurveyUrl}`);
        }
    }

    if (liveSurveyUrl && liveSurveyUrl.includes('superj.app') && !liveSurveyUrl.includes('dev.superj.app')) {
        liveSurveyUrl = liveSurveyUrl.replace('superj.app', 'dev.superj.app');
    } else if (liveSurveyUrl && !liveSurveyUrl.includes('dev.')) {
        liveSurveyUrl = liveSurveyUrl.replace('https://', 'https://dev.');
    }
    console.log(`Final Modified URL for DEV environment: ${liveSurveyUrl}`);

    console.log('\n======================================================');
    console.log(' STEP 6: EXECUTE LIVE SURVEY & VALIDATE LOGICS       ');
    console.log('======================================================');
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

    try {
        console.log('[Test] Attempting to click Start Survey (Screen 1 & Screen 2)...');
        const LandingPage = require('../pages/LandingPage');
        const landingPage = new LandingPage(livePage);
        await landingPage.clickFirstStartSurvey().catch(() => {});
        await landingPage.clickSecondStartSurvey().catch(() => {});
    } catch (e) {
        console.log('[Test] Click Start Survey warning:', e.message);
    }

    console.log('Running SurveyEngine with all extracted logic rules...');
    const surveyEngine = new SurveyEngine(livePage, { surveyLogics });
    const result = await surveyEngine.run();
    console.log(`Survey Engine finished with result: ${JSON.stringify(result)}`);

    expect(result.completed).toBe(true);
    await livePage.waitForTimeout(10000);
    await superjContext.close().catch(() => {});

    console.log('\n======================================================');
    console.log(' STEP 7: VERIFY RESPONSE ON HERCULES B2B DASHBOARD   ');
    console.log('======================================================');
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
        console.log(`Responses Collected Label Text: "${countText}"`);

        const firstNumMatch = countText.replace(/Responses Collected:/i, '').match(/\d+/);
        const firstNum = firstNumMatch ? parseInt(firstNumMatch[0], 10) : 0;
        console.log(`Verified Response Count on B2B Dashboard: ${firstNum}`);
        expect(firstNum).toBeGreaterThan(0);
    }
});
