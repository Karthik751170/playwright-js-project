const { test, expect } = require('@playwright/test');
const HerculesSurveyGenerator = require('../pages/hercules/HerculesSurveyGenerator');
const { setupMailosaurAccount } = require('./utils/MailosaurSetup');

test.use({ storageState: { cookies: [], origins: [] } });

test('Research Hercules Survey Logics', async ({ browser }) => {
    test.setTimeout(1800000); // 30 mins

    console.log('\n--- SETTING UP HERCULES ACCOUNT ---');
    const { page } = await setupMailosaurAccount(browser);

    // Enter Prompt
    console.log('\nEntering prompt...');
    const textarea = page.locator('textarea[aria-label="Ask Hercules a question"]');
    await textarea.fill('Create a survey about coffee habits.');
    await page.locator('button[aria-label="submit button"]').click();

    // Answer AI Questionnaire
    console.log('\nNavigating through AI questionnaire (if it appears)...');
    const surveyGenerator = new HerculesSurveyGenerator(page);
    const finalGenerateSurveyBtn = page.locator('button', { hasText: /create.*survey|generate.*survey|Yes.*create/i }).first();
    
    let loopCount = 0;
    while (loopCount < 120) {
        await page.waitForTimeout(5000);
        loopCount++;

        if (await finalGenerateSurveyBtn.isVisible() && await finalGenerateSurveyBtn.isEnabled()) {
            console.log('Create Survey button is visible!');
            break;
        }
        if (await surveyGenerator.clickGenerateBrief()) {
            console.log('Clicked Generate Brief!');
            break;
        }
        if (await surveyGenerator.selectAllThatApplyHeader.count() > 0 && await surveyGenerator.selectAllThatApplyHeader.first().isVisible()) {
            if (await surveyGenerator.handleSelectAllThatApply()) continue;
        }
        if (await surveyGenerator.handleSingleSelect()) continue;
        if (await surveyGenerator.handleTextInputFallback()) continue;
        if (await surveyGenerator.clickSkip()) continue;
    }

    console.log('Brute-force clicking "Yes, create the survey" button...');
    const yesCreateBtn = page.getByText(/Yes, create the survey/i).first();
    await yesCreateBtn.waitFor({ state: 'visible', timeout: 720000 });
    await yesCreateBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(2000);
    
    // Sometimes clicks get intercepted, try multiple times
    for (let i = 0; i < 3; i++) {
        await yesCreateBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(1000);
    }

    console.log('Waiting for Survey Editor to load (up to 90 seconds)...');
    // Wait for the URL to change or for the editor to load
    await page.waitForURL('**/editor/**', { timeout: 90000 }).catch(() => {});
    
    // The chat input doesn't even appear in the DOM until the survey finishes generating (which takes ~1.5 mins)
    console.log('Waiting up to 2 minutes for the survey to finish generating and the AI chat text field to appear...');
    const chatInput = page.locator('textarea').last(); // General fallback
    
    if (await chatInput.isVisible({ timeout: 120000 }).catch(()=>false)) {
        console.log('Found chat input! Filling prompt for survey logics...');
        await chatInput.fill('Please add redirection logic and termination logic to this survey. Also, tell me what other logics can be added, and explain how each logic works clearly point-wise.');
        
        console.log('Waiting for the chat input to be enabled (survey generation complete)...');
        await expect(chatInput).toBeEnabled({ timeout: 120000 });
        
        console.log('Pressing Enter to submit the prompt (safest method)...');
        await chatInput.press('Enter');

        console.log('Waiting 2 minutes for Hercules to process the logic prompt as requested...');
        await page.waitForTimeout(120000); // 2 minutes wait
        
        // Try to capture the last AI message
        const aiMessages = page.locator('.prose, [class*="message"], [class*="chat-bubble"]');
        const count = await aiMessages.count();
        if (count > 0) {
            const lastMessage = await aiMessages.nth(count - 1).innerText();
            console.log('\n================ HERCULES RESPONSE ================');
            console.log(lastMessage);
            console.log('===================================================\n');
        } else {
            console.log('Could not find AI response element. Dumping entire page text:');
            console.log(await page.innerText('body'));
        }

    } else {
        console.log('Could not find Hercules chat on the editor page. Dumping body text to find it:');
        console.log((await page.innerText('body')).substring(0, 1000));
        await page.screenshot({ path: 'scratch/editor_chat_missing.png' });
    }

    // --- DEPLOYMENT PHASE ---
    console.log('\n--- DEPLOYMENT PHASE ---');
    
    // First, click the Deploy button on the editor page
    console.log('Clicking Deploy on the editor page...');
    const editorDeployBtn = page.locator('button:has-text("Deploy"), button:has-text("Review and Deploy"), button:has-text("Publish")').last();
    if (await editorDeployBtn.isVisible({ timeout: 10000 }).catch(()=>false)) {
        await editorDeployBtn.click({ force: true });
        await page.waitForTimeout(3000);
    } else {
        console.log('Could not find Deploy button on editor. Maybe we are already on the next page?');
    }

    const HerculesPaymentModal = require('../pages/hercules/HerculesPaymentModal');
    const HerculesCampaignManager = require('../pages/hercules/HerculesCampaignManager');
    
    const paymentModal = new HerculesPaymentModal(page);
    const campaignManager = new HerculesCampaignManager(page);

    console.log('Clicking "Deploy Deploy" button...');
    await paymentModal.deployDeployBtn.waitFor({ state: 'visible', timeout: 30000 });
    await paymentModal.deployDeployBtn.click();
    
    await paymentModal.handlePremiumModal();
    
    // Click Pay and Deploy & Handle Razorpay
    await paymentModal.clickPayAndDeploy();
    await paymentModal.handleRazorpaySuccess();

    // Wait for Review page where the survey goes live
    console.log('Waiting for redirection to survey-review page...');
    await page.waitForURL(/.*\/survey-review\/.*/, { timeout: 60000 });
    console.log('Successfully reached survey-review page!');

    // --- VALIDATION PHASE ---
    console.log('\n--- VALIDATION PHASE ---');
    console.log('Clicking the copy link button...');
    
    // Grant clipboard permissions to the context
    await browser.contexts()[0].grantPermissions(['clipboard-read', 'clipboard-write']);
    
    // Click the specific copy button the user provided, but use robust fallback if the exact class string fails
    let copyBtn = page.locator("[class='flex-shrink-0 ml-[8px] rounded-[3px] py-[3px] px-[3px] hover:opacity-80']");
    
    if (!await copyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log('Exact class match failed. Trying CSS class selector...');
        copyBtn = page.locator('.flex-shrink-0.ml-\\[8px\\].hover\\:opacity-80').first();
        
        if (!await copyBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            console.log('CSS selector failed. Trying generic copy button by role or SVG...');
            copyBtn = page.locator('svg').locator('..').filter({ has: page.locator('path[d*="M"]') }).nth(1); // general icon button
            
            // Or try campaign manager's known copy icon
            if (!await copyBtn.isVisible().catch(() => false)) {
                 copyBtn = page.getByRole('img', { name: 'copy' }).first();
            }
        }
    }
    
    await copyBtn.waitFor({ state: 'visible', timeout: 5000 });
    await copyBtn.click({ force: true });
    await page.waitForTimeout(1500); // give clipboard time to populate
    
    // Extract the live link from the clipboard
    const liveSurveyUrl = await page.evaluate(() => navigator.clipboard.readText());
    console.log(`Extracted Live Survey URL: ${liveSurveyUrl}`);
    
    // Open in a new tab
    console.log('Opening live survey in a new tab...');
    const livePage = await browser.contexts()[0].newPage();
    await livePage.goto(liveSurveyUrl);
    
    // Start answering
    console.log('Clicking "Start answering the survey"...');
    const startBtn = livePage.getByText(/Start answering the survey|Start Survey/i).first();
    if (await startBtn.isVisible({ timeout: 15000 }).catch(()=>false)) {
         await startBtn.click();
    }
    
    console.log('Answering survey randomly to validate logic (looking for skips or terminations)...');
    let previousQuestionNumber = 0;
    let loopCountValid = 0;
    let logicFound = false;
    
    while (loopCountValid < 30) {
        loopCountValid++;
        await livePage.waitForTimeout(2000); // allow transitions
        
        // Check for termination / completion
        if (await livePage.getByText(/Disqualified|End of Survey|Thank You|Completed/i).isVisible().catch(()=>false)) {
            console.log('SUCCESS: Reached an end screen! If this was early, Termination Logic works!');
            logicFound = true;
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
        
        // Pick a random option
        const options = livePage.locator('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]');
        const count = await options.count();
        if (count > 0) {
            const randomIndex = Math.floor(Math.random() * count);
            console.log(`Selecting random option index ${randomIndex} out of ${count}...`);
            await options.nth(randomIndex).click({ force: true }).catch(()=>{});
        }
        
        // Click Next
        const nextBtn = livePage.locator('button:has-text("Next"), button:has-text("Continue"), button:has-text("Submit")').first();
        if (await nextBtn.isVisible().catch(()=>false)) {
            await nextBtn.click({ force: true }).catch(()=>{});
        } else {
            console.log('No Next button found, possibly waiting on text input or something else.');
            break;
        }
    }
    
    if (logicFound) {
        console.log('Logic successfully validated during the live survey walkthrough!');
    } else {
        console.log('Completed the survey without explicitly detecting a skip or termination (random choices might not have triggered the logic).');
    }
});
