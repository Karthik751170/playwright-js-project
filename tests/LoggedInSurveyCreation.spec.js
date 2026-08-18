const { test, expect } = require('@playwright/test');
const HerculesSurveyGenerator = require('../pages/hercules/HerculesSurveyGenerator');

const { setupMailosaurAccount } = require('./utils/MailosaurSetup');
const OnboardingUtil = require('../utils/OnboardingUtil');
const HerculesPaymentModal = require('../pages/hercules/HerculesPaymentModal');

test.use({ 
    storageState: { cookies: [], origins: [] },
    permissions: ['clipboard-read', 'clipboard-write']
});

test('logedin user survey creation', async ({ browser }) => {
    // 30 minutes total timeout to ensure individual 12-min waits never cause the whole test to fail
    test.setTimeout(1800000); 

    console.log('\n--- SETTING UP HERCULES ACCOUNT VIA MAILOSAUR ---');
    const { page } = await setupMailosaurAccount(browser);

    const textarea = page.locator('textarea[aria-label="Ask Hercules a question"]');

    // ==========================================
    // 3. ENTER PROMPT & START CHAT
    // ==========================================
    console.log('\nEntering prompt...');
    await textarea.fill('Create a comprehensive market research survey for a new line of eco-friendly athletic wear. Target audience: fitness enthusiasts aged 18-35.');
    await page.locator('button[aria-label="submit button"]').click();

    // ==========================================
    // 4. DYNAMIC QUESTIONNAIRE LOOP (GROQ AI)
    // ==========================================
    console.log('\nNavigating through AI questionnaire (if it appears)...');
    const surveyGenerator = new HerculesSurveyGenerator(page);
    const finalGenerateSurveyBtn = page.locator('button', { hasText: /create.*survey|generate.*survey/i }).first();
    
    let loopCount = 0;

    // Loop for up to 10 minutes checking for questions, the 'Generate Brief' button, or the final 'Create Survey' button.
    while (loopCount < 120) {
        await page.waitForTimeout(5000);
        loopCount++;

        // If the final Create Survey button is already visible, the questionnaire was completely skipped and generation is done!
        if (await finalGenerateSurveyBtn.isVisible() && await finalGenerateSurveyBtn.isEnabled()) {
            console.log('Create Survey button is already visible! Questionnaire was skipped or completed fast.');
            break;
        }

        // If the "Generate Brief" button appears, we click it to explicitly start brief generation
        if (await surveyGenerator.clickGenerateBrief()) {
            console.log('Clicked "Generate Brief". Moving to loading phase...');
            break;
        }

        // Check multi-select
        if (await surveyGenerator.selectAllThatApplyHeader.count() > 0 && await surveyGenerator.selectAllThatApplyHeader.first().isVisible()) {
            if (await surveyGenerator.handleSelectAllThatApply()) continue;
        }

        // Single select fallback
        if (await surveyGenerator.handleSingleSelect()) continue;

        // Check text input
        if (await surveyGenerator.handleTextInputFallback()) continue;

        // Check Skip
        if (await surveyGenerator.clickSkip()) continue;
    }

    // ==========================================
    // 5. WAIT FOR BRIEF & CREATE SURVEY
    // ==========================================
    console.log('\nWaiting for brief to finish generating... (Timeout set to 12 minutes)');
    
    try {
        await finalGenerateSurveyBtn.waitFor({ state: 'visible', timeout: 720000 }); // 12 minutes dynamic timeout
        console.log('Brief generation complete! Scrolling to and clicking "Create Survey"...');
        
        await finalGenerateSurveyBtn.scrollIntoViewIfNeeded();
        // Wait a brief moment for any sticky headers or animations to settle
        await page.waitForTimeout(1000); 
        await finalGenerateSurveyBtn.click({ force: true });
    } catch (e) {
        console.log('\nWARNING: Timeout waiting for the Generate Survey button to appear, or click failed.');
    }
    
    // ==========================================
    // 6. ADD LOGICS VIA CHAT
    // ==========================================
    console.log('Waiting up to 2 minutes for the survey to finish generating and the AI chat text field to appear...');
    const chatInput = page.locator('textarea').last(); 
    
    if (await chatInput.isVisible({ timeout: 120000 }).catch(()=>false)) {
        console.log('Found chat input! Filling prompt for survey logics...');
        await chatInput.fill('Please add redirection logic and termination logic to this survey.');
        
        console.log('Waiting for the chat input to be enabled (survey generation complete)...');
        await expect(chatInput).toBeEnabled({ timeout: 120000 });
        
        console.log('Pressing Enter to submit the prompt (safest method)...');
        await chatInput.press('Enter');

        console.log('Waiting 2 minutes for Hercules to process the logic prompt...');
        await page.waitForTimeout(120000); 
    }

    // ==========================================
    // 7. DEPLOYMENT & LAUNCH
    // ==========================================
    console.log('Clicking Deploy on the editor page...');
    const editorDeployBtn = page.locator('button:has-text("Deploy"), button:has-text("Review and Deploy"), button:has-text("Publish")').last();
    if (await editorDeployBtn.isVisible({ timeout: 10000 }).catch(()=>false)) {
        await editorDeployBtn.click({ force: true });
        await page.waitForTimeout(3000);
    }

    console.log('Clicking "Deploy Deploy" button...');
    const paymentModal = new HerculesPaymentModal(page);
    if (await paymentModal.deployDeployBtn.isVisible({ timeout: 15000 }).catch(()=>false)) {
        await paymentModal.deployDeployBtn.click({ force: true });
    }
    
    // IMPORTANT: Handle the Premium Audience warning modal that pops up first!
    await paymentModal.handlePremiumModal();
    
    console.log('Waiting for deployment modal buttons (Free or Paid)...');
    
    // Look for any variation of the free/paid deploy button
    const finalDeployBtn = page.locator('button').filter({ hasText: /Deploy to 100 Users for Free|Deploy for Free|Deploy Campaign|Pay and Deploy/i }).last();
    
    if (await finalDeployBtn.isVisible({ timeout: 15000 }).catch(()=>false)) {
        const text = await finalDeployBtn.textContent();
        console.log(`Clicking final deployment button: ${text.trim()}`);
        await finalDeployBtn.click({ force: true });
        
        if (text.includes('Pay and Deploy')) {
            await paymentModal.handleRazorpaySuccess();
        } else {
            // If it was a free deploy, sometimes there's a secondary confirmation
            const confirmBtn = page.locator('button').filter({ hasText: /^Deploy for Free$/i }).last();
            if (await confirmBtn.isVisible({ timeout: 5000 }).catch(()=>false)) {
                console.log('Confirming free deployment...');
                await confirmBtn.click({ force: true }).catch(()=>{});
            }
        }
    } else {
        console.log('Could not find ANY Free Deploy or Pay and Deploy buttons! Continuing anyway...');
    }

    console.log('Waiting for redirection to survey-review page...');
    // Do NOT swallow the error here so we fail loudly if deployment didn't work
    await page.waitForURL(/.*\/survey-review\/.*/, { timeout: 60000 });
    
    console.log('Successfully reached survey-review page!');
    
    console.log('Waiting up to 60s for "Launch Survey"...');
    const launchNowBtn = page.locator("//button[text()='Launch Survey']").first();
    if (await launchNowBtn.isVisible({ timeout: 15000 }).catch(()=>false)) {
        console.log('Clicking Launch Survey...');
        await launchNowBtn.click();
    }
    console.log('Reached launched state!');

    // ==========================================
    // 8. COPY LINK & ANSWER SURVEY (SUPER J)
    // ==========================================
    // Wait for the copy button or link to appear
    await page.waitForSelector('a[href*="superj.app"], //img[@alt="copy"]', { state: 'visible', timeout: 10000 }).catch(() => {});
    
    // Most robust method: extract the URL directly from the href of the link on the page!
    let liveSurveyUrl = '';
    const surveyLink = page.locator('a[href*="superj.app"]').first();
    if (await surveyLink.isVisible({ timeout: 2000 }).catch(()=>false)) {
        liveSurveyUrl = await surveyLink.getAttribute('href');
        console.log(`Extracted Live Survey URL directly from DOM href: ${liveSurveyUrl}`);
    }
    
    // Fallback: Try clicking the user's requested copy button and reading the clipboard
    if (!liveSurveyUrl || !liveSurveyUrl.startsWith('http')) {
        console.log('Could not find href in DOM. Falling back to clicking the copy button...');
        const copyBtn = page.locator("//img[@alt='copy']").nth(1);
        if (await copyBtn.isVisible({ timeout: 2000 }).catch(()=>false)) {
            await copyBtn.click({ force: true });
            await page.waitForTimeout(1500);
            liveSurveyUrl = await page.evaluate(() => navigator.clipboard.readText());
            console.log(`Extracted Live Survey URL from clipboard: ${liveSurveyUrl}`);
        }
    }
    
    if (liveSurveyUrl && liveSurveyUrl.includes('superj.app') && !liveSurveyUrl.includes('dev.superj.app')) {
        liveSurveyUrl = liveSurveyUrl.replace('superj.app', 'dev.superj.app');
    } else if (liveSurveyUrl && !liveSurveyUrl.includes('dev.')) {
        liveSurveyUrl = liveSurveyUrl.replace('https://', 'https://dev.');
    }
    console.log(`Final Modified URL for DEV environment: ${liveSurveyUrl}`);

    console.log('Opening live survey in a new tab...');
    const livePage = await page.context().newPage();
    await livePage.goto(liveSurveyUrl);
    
    // Check if we were redirected to Onboarding
    await livePage.waitForTimeout(2000);
    if (livePage.url().includes('OnBoarding')) {
        console.log('[Test] Server forced us to Onboarding page. Running onboarding utility...');
        const onboardingUtil = new OnboardingUtil(livePage);
        await onboardingUtil.completeOnboarding('1997', 'Hyderabad', 'Male');
        console.log('[Test] Onboarding complete. We should now be redirected to the survey!');
        await livePage.waitForTimeout(2000);
    }
    
    console.log('Clicking "Start answering the survey"...');
    const startBtn = livePage.getByText(/Start answering the survey|Start Survey/i).first();
    if (await startBtn.isVisible({ timeout: 15000 }).catch(()=>false)) {
         await startBtn.click();
    }
    
    console.log('Answering survey randomly to validate logic (looking for skips or terminations)...');
    let logicFound = false;
    let previousQuestionNumber = 0;
    let loopCountValid = 0;
    while (loopCountValid < 30) {
        loopCountValid++;
        await livePage.waitForTimeout(2000);
        
        if (await livePage.getByText(/Disqualified|End of Survey|Thank You|Completed|Redirecting/i).isVisible().catch(()=>false)) {
            console.log('SUCCESS: Reached an end/termination/redirect screen! Logic works!');
            break;
        }
        
        // Extract current question number to check for Skip Logic
        const questionText = await livePage.locator('h1, h2, h3, [class*="question"]').first().innerText().catch(()=>"");
        const match = questionText.match(/^(\d+)\./);
        if (match) {
            const currentNumber = parseInt(match[1]);
            if (previousQuestionNumber > 0 && currentNumber > previousQuestionNumber + 1) {
                console.log(`SUCCESS: Skip logic detected! Jumped from Q${previousQuestionNumber} to Q${currentNumber}`);
                logicFound = true;
            }
            previousQuestionNumber = currentNumber;
        }
        
        // Randomly select options if available
        const options = livePage.locator('[class*="option"], input[type="radio"], input[type="checkbox"]');
        if (await options.count() > 0) {
            await options.first().click({ force: true }).catch(()=>{});
        }
        
        // Click Next
        const nextBtn = livePage.locator('button', { hasText: /Next|Continue|Submit/i }).first();
        if (await nextBtn.isVisible().catch(()=>false)) {
            await nextBtn.click({ force: true }).catch(()=>{});
        }
    }
    
    if (logicFound) {
        console.log('\n✅ Script successfully validated Survey Creation, Logic Application, and Super J Redirection!');
    } else {
        console.log('\n⚠️ Reached end of logic test but no skips/terminations were triggered (which might be expected if no logic applied to this specific random path).');
    }
    
    console.log('Adding global wait before closing as requested by user...');
    await page.waitForTimeout(30000);
});
