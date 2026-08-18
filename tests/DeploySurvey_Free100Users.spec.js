const { test, expect } = require('@playwright/test');
const HerculesSurveyGenerator = require('../pages/hercules/HerculesSurveyGenerator');
const { setupMailosaurAccount } = require('./utils/MailosaurSetup');
const fs = require('fs');

test.use({ storageState: { cookies: [], origins: [] } });

async function generateSurvey(page) {
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
                try { await optionBtns.first().click({ timeout: 2000 }); } catch(e) {}
            }
            const nextBtn = page.locator('button:has-text("Continue"), button:has-text("Next"), button:has-text("Submit"), button:has-text("Finish")').first();
            if (await nextBtn.isVisible()) {
                await nextBtn.click({ timeout: 2000 }).catch(() => {});
            }
            await page.waitForTimeout(2000);
        }
        await textarea.waitFor({ state: 'visible', timeout: 30000 });
    }

    console.log('\nEntering prompt...');
    const SURVEY_PROMPTS = require('./utils/SurveyPrompts');
    const randomPrompt = SURVEY_PROMPTS[Math.floor(Math.random() * SURVEY_PROMPTS.length)];
    console.log(`Selected prompt: "${randomPrompt}"`);
    await textarea.fill(randomPrompt);
    const submitBtn = page.locator('button[aria-label="submit button"]').or(page.getByRole('button', { name: 'Send' })).first();
    await submitBtn.scrollIntoViewIfNeeded().catch(() => {});
    await submitBtn.click({ force: true });

    console.log('\nNavigating through AI questionnaire (if it appears)...');
    const surveyGenerator = new HerculesSurveyGenerator(page);
    const finalGenerateSurveyBtn = page.locator('button', { hasText: /create.*survey|generate.*survey/i }).first();
    
    let loopCount = 0;
    let consecutiveFails = 0;
    while (loopCount < 120) {
        await page.waitForTimeout(5000);
        loopCount++;

        // Failsafe 1: Check if we are already generating
        const loadingIndicator = page.locator('text=/creating your survey|building your survey/i').first();

        // If the server skipped the questionnaire and went straight to the loading screen or editor, break!
        if (page.url().includes('editor')) {
            console.log('URL changed to editor! Questionnaire was skipped or completed.');
            break;
        }
        if (await loadingIndicator.isVisible().catch(()=>false)) {
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
            console.log('Assuming we are on the loading screen or editor. Breaking out of loop!');
            break;
        }
    }
    
    if (loopCount >= 120) {
        console.log('WARNING: Loop timed out after 10 minutes without finding Generate Brief or Create Survey.');
    }

    console.log('Questionnaire finished. Waiting for "Yes, generate the research" button (up to 4 minutes)...');
    
    const generateResearchBtn = page.getByRole('button', { name: 'Yes, generate the research' });
    for (let i = 0; i < 48; i++) {
        if (await generateResearchBtn.isVisible().catch(()=>false)) {
            console.log('Found "Yes, generate the research" button! Clicking it...');
            await generateResearchBtn.click({ force: true, timeout: 5000 }).catch((e) => {
                console.log(`[Test] Research button click completed/timed out: ${e.message}`);
            });
            break;
        }
        if (page.url().includes('editor')) break;
        const yesCreateBtn = page.locator("//button[text()='Yes, create the survey.']").or(page.locator("//button[normalize-space()='Yes, create the survey.']")).or(page.getByRole('button', { name: /Yes, create the survey/i })).first();
        if (await yesCreateBtn.isVisible().catch(()=>false)) break; // Skip if we already got to the next stage
        await page.waitForTimeout(5000);
    }
    
    let targetCity = 'Pune';
    console.log(`[Test] Using onboarding location: ${targetCity}`);

    console.log('Waiting up to 1 hour for "Yes, create the survey." button...');
    const createSurveyBtn = page.getByRole('button', { name: 'Yes, create the survey.' }).or(page.locator("//button[text()='Yes, create the survey.']")).or(page.getByRole('button', { name: /Yes, create the survey/i })).first();
    for (let i = 0; i < 720; i++) { // 720 * 5s = 3600s (1 hour)
        if (await createSurveyBtn.isVisible().catch(()=>false)) {
            console.log('Found "Yes, create the survey." button! Waiting 3 seconds...');
            await page.waitForTimeout(3000);
            console.log('Clicking "Yes, create the survey" button...');
            await createSurveyBtn.click({ force: true, timeout: 10000 }).catch((e) => {
                console.log(`[Test] Create survey button click completed/timed out: ${e.message}`);
            });
            await page.waitForTimeout(3000);
            if (!(await createSurveyBtn.isVisible().catch(()=>false))) {
                console.log('Create survey button is no longer visible.');
                break;
            }
        }
        if (page.url().includes('editor')) break;
        await page.waitForTimeout(5000);
    }

    console.log('Waiting for Survey Editor to load (up to 90 seconds)...');
    await page.waitForURL('**/editor/**', { timeout: 90000 }).catch(() => {});

    console.log('Waiting up to 1 hour for the final Survey to generate and the Deploy button to appear...');
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

test('Deploy survey to 100 Users for Free', async ({ browser }) => {
    test.setTimeout(3600000); // 1 hour max

    console.log('\n--- MAILOSAUR ACCOUNT SETUP ---');
    let page, herculesContext;
    await test.step('Setup Mailosaur Account & Login to Hercules', async () => {
        ({ page, herculesContext } = await setupMailosaurAccount(browser));
    });

    // ==========================================
    // SURVEY 1: THE FREE 100 USERS FLOW
    // ==========================================
    console.log('\n--- CREATING SURVEY #1 (FREE) ---');
    let targetCity;
    await test.step('Generate Survey via AI Brief', async () => {
        targetCity = await generateSurvey(page);
    });

    console.log('\n--- DEPLOYMENT PHASE 1 ---');

    console.log('--- EXTRACTING LOGIC RULES ---');
    await page.waitForTimeout(5000);
    const logicsBtn = page.locator("//button[text()='Logics']");
    if (await logicsBtn.isVisible()) {
        console.log('Found Logics button, clicking it...');
        await logicsBtn.click({ force: true });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'scratch/logics_panel.png', fullPage: true });
    } else {
        console.log('WARNING: Logics button was NOT visible!');
        await page.screenshot({ path: 'scratch/no_logics_button.png', fullPage: true });
    }
    
    const surveyLogics = [];
    const logicRows = page.locator("[class='flex items-center justify-between gap-3 px-[18px] pt-[16px] pb-3 cursor-pointer']");
    const count = await logicRows.count();
    
    for (let i = 0; i < count; i++) {
        const row = logicRows.nth(i);
        const hasLogic = await row.locator("//span[contains(text(), 'Logic')]").isVisible().catch(() => false);
        
        if (hasLogic) {
            // First, get text before clicking. If it's already expanded, it might contain the logic.
            const parent = row.locator('xpath=..');
            let logicText = await parent.innerText();
            
            // If it doesn't contain logic keywords, it might be collapsed, so click to expand
            if (!logicText.includes('If') && !logicText.includes('End') && !logicText.includes('Skip') && !logicText.includes('Terminate')) {
                await row.locator("//span[contains(text(), 'Logic')]").click({ force: true }).catch(() => row.click({ force: true }));
                await page.waitForTimeout(1000);
                logicText = await parent.innerText();
            }
            
            // If clicking the span closed it, click again!
            if (!logicText.includes('If') && !logicText.includes('End') && !logicText.includes('Skip') && !logicText.includes('Terminate')) {
                await row.click({ force: true });
                await page.waitForTimeout(1000);
                logicText = await parent.innerText();
            }
            
            surveyLogics.push({ slideIndex: i, text: logicText });
        }
    }
    
    console.log('Extracted Logic Rules (All Questions):', JSON.stringify(surveyLogics, null, 2));

    await page.screenshot({ path: 'scratch/editor_deploy_phase.png', fullPage: true });

    console.log('Clicking top-right Publish/Deploy button to open sidebar...');
    await page.waitForTimeout(3000);
    const topDeployBtn = page.getByRole('button', { name: 'Deploy Deploy' })
        .or(page.getByRole('button', { name: 'Deploy', exact: true }))
        .or(page.locator("button:has-text('Deploy')"))
        .or(page.locator("button:has-text('Publish')"))
        .first();
    await topDeployBtn.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
    await topDeployBtn.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(1000);
    await topDeployBtn.click({ force: true });
    await page.waitForTimeout(2000); // Wait for sidebar to slide open

    console.log('Looking for "Deploy to 100 Users for Free" button...');
    const freeDeployBtn = page.getByRole('button', { name: 'Deploy to 100 Users for Free' });
    await freeDeployBtn.waitFor({ state: 'visible', timeout: 30000 });
    await freeDeployBtn.scrollIntoViewIfNeeded().catch(() => {});
    await freeDeployBtn.click({ force: true });

    console.log('Waiting for "Deploy for Free" confirmation...');
    const confirmDeployForFreeBtn = page.getByRole('button', { name: 'Deploy for Free' });
    await confirmDeployForFreeBtn.waitFor({ state: 'visible', timeout: 15000 });
    await confirmDeployForFreeBtn.scrollIntoViewIfNeeded().catch(() => {});
    await confirmDeployForFreeBtn.click({ force: true });

    console.log('Waiting for survey-review page...');
    await page.waitForURL(/.*\/survey-review\/.*/, { timeout: 60000 });

    console.log('Waiting up to 15s for "Launch Survey" button (if present)...');
    const launchNowBtn = page.locator("//button[text()='Launch Survey']").first();
    if (await launchNowBtn.isVisible({ timeout: 15000 }).catch(() => false)) {
        await launchNowBtn.click({ force: true }).catch(() => {});
        console.log('Successfully clicked Launch Survey button!\n');
    } else {
        console.log('"Launch Survey" button not present or survey in review. Proceeding...');
    }

    // ==========================================
    // 8. COPY LINK & ANSWER SURVEY (SUPER J)
    // ==========================================
    // Wait for the copy button or link to appear
    await page.waitForTimeout(3000); // Wait for transition after Launch Survey
    
    // Most robust method: extract the URL directly from the href of the link on the page!
    let liveSurveyUrl = '';
    const surveyLink = page.locator('a[href*="superj.app"]').first();
    if (await surveyLink.isVisible({ timeout: 5000 }).catch(()=>false)) {
        liveSurveyUrl = await surveyLink.getAttribute('href');
        console.log(`Extracted Live Survey URL directly from DOM href: ${liveSurveyUrl}`);
    }
    
    // Fallback: Try clicking the user's requested copy button and reading the clipboard
    if (!liveSurveyUrl || !liveSurveyUrl.startsWith('http')) {
        console.log('Could not find href in DOM. Falling back to clicking the copy button...');
        await browser.contexts()[0].grantPermissions(['clipboard-read', 'clipboard-write']);
        const copyBtn = page.locator("//img[@alt='copy' or @alt='Copy']").nth(1);
        
        await copyBtn.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
        if (await copyBtn.isVisible()) {
            await copyBtn.click({ force: true });
            await page.waitForTimeout(1500);
            liveSurveyUrl = await page.evaluate(() => navigator.clipboard.readText());
            console.log(`Extracted Live Survey URL from clipboard: ${liveSurveyUrl}`);
        } else {
            console.log('Could not find the copy button. It might be an SVG or have a different alt text.');
        }
    }
    
    if (liveSurveyUrl && liveSurveyUrl.includes('superj.app') && !liveSurveyUrl.includes('dev.superj.app')) {
        liveSurveyUrl = liveSurveyUrl.replace('superj.app', 'dev.superj.app');
    } else if (liveSurveyUrl && !liveSurveyUrl.includes('dev.')) {
        liveSurveyUrl = liveSurveyUrl.replace('https://', 'https://dev.');
    }
    console.log(`Final Modified URL for DEV environment: ${liveSurveyUrl}`);

    if (!liveSurveyUrl || liveSurveyUrl.trim() === '') {
        console.log('\n--- ERROR: COULD NOT FIND LIVE SURVEY URL ---');
        console.log('The script failed to extract the URL from the DOM and the clipboard copy button failed.');
        console.log('Pausing for manual inspection so you can find the correct locator for the copy button...');
        await page.pause();
    }

        console.log('Waiting 2 seconds before opening in new tab...');
        await page.waitForTimeout(2000);

        console.log('Opening live survey in a fresh Super J context for the consumer...');
    const superjContext = await browser.newContext();
    const livePage = await superjContext.newPage();
    livePage.setDefaultTimeout(300000); // 5 minutes global timeout for this page
    await livePage.goto(liveSurveyUrl);
    
    console.log('Forcing Super J Login, Onboarding, and Survey interactions...');
    
    try {
        console.log('[Test] Attempting Login for fresh consumer...');
        const LoginPage = require('../pages/LoginPage');
        const DataGeneratorUtil = require('../utils/DataGeneratorUtil');
        
        const loginPage = new LoginPage(livePage);
        const randomPhone = process.env.TEST_PHONE || DataGeneratorUtil.generateRandomPhoneNumber();
        console.log(`[Test] Using phone number: ${randomPhone}`);
        await loginPage.login(randomPhone, '777777');
        
        // Wait for redirect after login
        console.log('[Test] Waiting 15 seconds for post-OTP redirect...');
        await livePage.waitForTimeout(15000);
    } catch (e) {
        console.log('[Test] Login failed or skipped:', e.message);
    }

    try {
        console.log('[Test] Attempting Onboarding...');
        const OnboardingUtil = require('../utils/OnboardingUtil');
        const onboardingUtil = new OnboardingUtil(livePage);
        await onboardingUtil.completeOnboarding('1997', targetCity, 'Male');
        
        console.log('[Test] Waiting 5 seconds for post-onboarding redirect...');
        await livePage.waitForTimeout(5000);
        
        console.log(`[Test] Force-redirecting back to survey URL to bypass redirect bug: ${liveSurveyUrl}`);
        await livePage.goto(liveSurveyUrl);
        await livePage.waitForTimeout(5000);
    } catch (e) {
        console.log('[Test] Onboarding failed or skipped:', e.message);
    }

    try {
        console.log('[Test] Attempting to click Start Survey...');
        const LandingPage = require('../pages/LandingPage');
        const landingPage = new LandingPage(livePage);
        await landingPage.clickStartSurvey(2);
    } catch (e) {
        console.log('[Test] Click Start Survey failed:', e.message);
    }
    
    console.log('Answering survey using SurveyEngine...');
    const SurveyEngine = require('../utils/SurveyEngine');
    const surveyEngine = new SurveyEngine(livePage, { surveyLogics });
    const result = await surveyEngine.run();
    console.log(`Survey Engine finished with result: ${JSON.stringify(result)}`);

    console.log('[Test] Waiting 10 seconds for the survey completion network request to save to backend before closing browser...');
    await livePage.waitForTimeout(10000);

    console.log('[Test] Closing consumer context to free memory before verifying B2B dashboard...');
    await superjContext.close().catch(() => {});

    await test.step('Verify Response Count in B2B Dashboard', async () => {
        console.log('\n--- VERIFYING RESPONSE COUNT IN B2B HERCULES ---');
        await page.bringToFront();
        
        // Wait 10 seconds first for the backend DB to sync
        console.log('Waiting 10 seconds for backend database to update...');
        await page.waitForTimeout(10000);
        
        console.log('Reloading Hercules B2B page to fetch updated response count...');
        await page.reload();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(5000); // Wait for data to load
        
        const responsesLabel = page.locator("//span[contains(text(), 'Responses Collected:')] | //p[contains(text(), 'Responses Collected:')] | //div[contains(text(), 'Responses Collected:')]").first();
        await responsesLabel.scrollIntoViewIfNeeded().catch(() => {});
        
        if (await responsesLabel.isVisible().catch(()=>false)) {
            const labelText = await responsesLabel.innerText().catch(() => "");
            
            const countLocator = page.locator("//span[contains(text(), 'Responses Collected:')]/following-sibling::*").first()
                .or(page.locator("//span[contains(text(), 'Responses Collected:')]/.."))
                .first();
            const countText = await countLocator.innerText().catch(() => "");
            
            console.log(`Responses Collected Label: "${labelText}", Count: "${countText}"`);
            
            // Extract the first number from the countText (excluding title prefix)
            const firstNumMatch = countText.replace(/Responses Collected:/i, '').match(/\d+/);
            const firstNum = firstNumMatch ? parseInt(firstNumMatch[0], 10) : 0;
            
            if (firstNum > 0) {
                console.log(`SUCCESS: Verified that the response count has successfully reflected on Hercules B2B! (Count: ${firstNum})`);
            } else {
                throw new Error(`FAILURE: Response count is 0! The survey response was not recorded by the backend. Found text: ${countText}`);
            }
        } else {
            throw new Error('FAILURE: "Responses Collected:" label not found on the active page.');
        }
        
        // Capture screenshot of Hercules B2B after reload
        await page.screenshot({ path: 'scratch/b2b_after_responses.png', fullPage: true });
    });
});
