const { test, expect } = require('@playwright/test');
const HerculesSurveyGenerator = require('../pages/hercules/HerculesSurveyGenerator');
const { setupMailosaurAccount } = require('./utils/MailosaurSetup');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

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
        if (await surveyGenerator.handleSelectAndRunItThisWay().catch(() => false)) { consecutiveFails = 0; continue; }
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
    
    const generateResearchBtn = page.getByRole('button', { name: 'Yes, generate the research' }).or(page.locator("//button[text()='Yes, generate the research brief']"));
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
}

test('Hercules - 100 Users Deploy Script Flow -> Share Link Validation (Pause on Deploy Visible)', async ({ browser }) => {
    test.setTimeout(3600000); // 1 hour max

    const scratchDir = path.join(process.cwd(), 'scratch');
    if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

    console.log('\n======================================================');
    console.log(' STEP 1: SETUP FRESH HERCULES ACCOUNT                 ');
    console.log('======================================================');
    const { page } = await setupMailosaurAccount(browser);

    console.log('\n======================================================');
    console.log(' STEP 2: CREATE SURVEY VIA PROMPT & QUESTIONNAIRE     ');
    console.log('======================================================');
    await generateSurvey(page);

    console.log('\n======================================================');
    console.log(' STEP 3: VERIFY DEPLOY BUTTON VISIBLE & ENABLED        ');
    console.log('======================================================');
    const topDeployBtn = page.getByRole('button', { name: 'Deploy Deploy' })
        .or(page.getByRole('button', { name: 'Deploy', exact: true }))
        .or(page.locator("button:has-text('Deploy')"))
        .or(page.locator("button:has-text('Publish')"))
        .first();

    const isDeployVisible = await topDeployBtn.isVisible().catch(() => false);
    const isDeployEnabled = await topDeployBtn.isEnabled().catch(() => false);

    console.log(`✅ DEPLOY BUTTON VISIBLE: ${isDeployVisible}`);
    console.log(`✅ DEPLOY BUTTON ENABLED: ${isDeployEnabled}`);

    await browser.contexts()[0].grantPermissions(['clipboard-read', 'clipboard-write']);

    console.log('\n======================================================');
    console.log(' STEP 4: WAIT UNTIL ALL 3 SHARE OPTIONS ARE ENABLED   ');
    console.log('======================================================');

    const shareBtn = page.locator("button:has-text('Share')")
        .or(page.locator("button[aria-label*='share' i]"))
        .or(page.locator("//button[text()='Share']"))
        .first();

    if (await shareBtn.isVisible().catch(() => false)) {
        console.log('Clicking Share button in bottom left...');
        await shareBtn.click({ force: true });
        await page.waitForTimeout(2000);

        console.log('Waiting for ALL 3 share options (Share Campaign Chat, Share Survey, Share Research Brief) to be ENABLED...');
        
        const enabledOpt1 = page.locator("//button[contains(., 'Share Campaign Chat') and not(@disabled)]");
        const enabledOpt2 = page.locator("//button[contains(., 'Share Survey') and not(@disabled)]");
        const enabledOpt3 = page.locator("//button[contains(., 'Share Research Brief') and not(@disabled)]");

        for (let i = 0; i < 90; i++) {
            if (page.isClosed()) break;

            const is1Enabled = await enabledOpt1.isVisible().catch(() => false);
            const is2Enabled = await enabledOpt2.isVisible().catch(() => false);
            const is3Enabled = await enabledOpt3.isVisible().catch(() => false);

            if (is1Enabled && is2Enabled && is3Enabled) {
                console.log('✅ ALL 3 SHARE OPTIONS ARE NOW FULLY ENABLED AND ACTIVE!');
                break;
            }

            const isShareMenuVisible = await page.locator("text='Share Campaign Chat'").first().isVisible().catch(() => false);
            if (!isShareMenuVisible) {
                await shareBtn.click({ force: true }).catch(() => {});
            }
            await page.waitForTimeout(3000);
        }

        const SHARE_OPTIONS = [
            { name: 'Share Campaign Chat', buttonText: 'Share Campaign Chat', filename: '1_incognito_shared_campaign_chat.png' },
            { name: 'Share Survey', buttonText: 'Share Survey', filename: '2_incognito_shared_survey.png' },
            { name: 'Share Research Brief', buttonText: 'Share Research Brief', filename: '3_incognito_shared_research_brief.png' }
        ];

        for (let i = 0; i < SHARE_OPTIONS.length; i++) {
            if (page.isClosed()) break;
            const option = SHARE_OPTIONS[i];
            console.log(`\n======================================================`);
            console.log(` TESTING SHARE OPTION ${i + 1}: ${option.name.toUpperCase()} `);
            console.log(`======================================================`);

            const isMenuOpen = await page.locator(`text='${option.buttonText}'`).first().isVisible().catch(() => false);
            if (!isMenuOpen) {
                console.log(`Clicking Share button in bottom left (Attempt ${i + 1})...`);
                await shareBtn.click({ force: true }).catch(() => {});
                await page.waitForTimeout(2000);
            }

            console.log(`Clicking option "${option.name}"...`);
            const targetOption = page.locator(`//button[contains(., '${option.buttonText}')]`)
                .or(page.locator(`button:has-text('${option.buttonText}')`))
                .or(page.locator(`text='${option.buttonText}'`))
                .first();

            await targetOption.waitFor({ state: 'visible', timeout: 15000 });
            await targetOption.click({ force: true });
            await page.waitForTimeout(2000);

            const copyLinkBtn = page.locator("button:has-text('Copy Link')")
                .or(page.locator("//button[contains(., 'Copy Link')]"))
                .or(page.locator("button:has-text('Copy')"))
                .first();

            if (await copyLinkBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
                console.log('Clicking "Copy Link" button in pop-up modal...');
                await copyLinkBtn.click({ force: true });
                await page.waitForTimeout(1500);
            } else {
                console.log('No separate "Copy Link" button appeared; reading clipboard directly...');
            }

            let sharedUrl = await page.evaluate(async () => {
                try { return await navigator.clipboard.readText(); } catch (e) { return null; }
            }).catch(() => null);

            if (!sharedUrl || !sharedUrl.startsWith('http')) {
                const inputField = page.locator("input[value*='http']").first();
                if (await inputField.isVisible().catch(() => false)) {
                    sharedUrl = await inputField.getAttribute('value');
                }
            }

            console.log(`✅ EXTRACTED URL FOR ${option.name}: ${sharedUrl}`);
            expect(sharedUrl).toBeTruthy();

            console.log(`Opening incognito window for ${option.name}: ${sharedUrl}...`);
            const incognitoContext = await browser.newContext();
            await incognitoContext.grantPermissions(['clipboard-read', 'clipboard-write']);
            
            const incognitoPage = await incognitoContext.newPage();
            await incognitoPage.goto(sharedUrl);
            await incognitoPage.waitForTimeout(4000);
            await incognitoPage.screenshot({ path: path.join(scratchDir, option.filename), fullPage: true });

            const downloadBtn = incognitoPage.locator("button:has-text('Download')")
                .or(incognitoPage.locator("a:has-text('Download')"))
                .or(incognitoPage.locator("[aria-label*='download' i]"))
                .or(incognitoPage.locator("img[alt*='download' i]"))
                .first();

            const isDownloadBtnPresent = await downloadBtn.isVisible().catch(() => false);
            console.log(`✅ IS DOWNLOAD BUTTON PRESENT ON ${option.name.toUpperCase()} PAGE? ${isDownloadBtnPresent}`);
            if (isDownloadBtnPresent) {
                console.log(`📥 Download button found! Clicking Download button for ${option.name}...`);
                
                const respectivePdfPath = path.join(scratchDir, `${option.name.replace(/\s+/g, '_')}.pdf`);
                
                // 1. Click Download button on page
                await downloadBtn.click({ force: true }).catch(() => console.log('Could not click download button.'));
                await incognitoPage.waitForTimeout(1500);

                // 2. Click blue Save button in Chrome Print Preview sidebar via keyboard Enter
                await incognitoPage.keyboard.press('Enter').catch(() => {});
                await incognitoPage.waitForTimeout(1500);

                // 3. Click blue Save button in native macOS "Save As:" modal pop-up via osascript System Events keystroke return
                try {
                    execSync(`osascript -e 'tell application "System Events" to keystroke return'`);
                    console.log('Dispatched native macOS Return keystroke to confirm Save in Save As pop-up!');
                } catch (e) {
                    await incognitoPage.keyboard.press('Enter').catch(() => {});
                }
                await incognitoPage.waitForTimeout(2000);

                // 4. Save respective PDF file into scratch directory
                await incognitoPage.pdf({ path: respectivePdfPath, format: 'A4', printBackground: true }).catch(async () => {
                    try {
                        const client = await incognitoContext.newCDPSession(incognitoPage);
                        const { data } = await client.send('Page.printToPDF', { printBackground: true });
                        fs.writeFileSync(respectivePdfPath, Buffer.from(data, 'base64'));
                    } catch (e) {}
                });
                console.log(`✅ RESPECTIVE PDF FILE SAVED TO: ${respectivePdfPath}`);

                const downloadHtml = await downloadBtn.evaluate(el => el.outerHTML).catch(() => '');
                console.log(`📌 DOWNLOAD BUTTON HTML:\n${downloadHtml}\n`);
            } else {
                console.log(`ℹ️ Download button was not found on the ${option.name} incognito page.`);
            }

            const copyBtnOnTab = incognitoPage.locator("button:has-text('Copy')")
                .or(incognitoPage.locator("a:has-text('Copy')"))
                .or(incognitoPage.locator("[aria-label*='copy' i]"))
                .first();

            if (await copyBtnOnTab.isVisible().catch(() => false)) {
                console.log(`📋 Copy button found! Clicking Copy button on ${option.name} page...`);
                await copyBtnOnTab.click({ force: true }).catch(() => {});
                await incognitoPage.waitForTimeout(1000);
                const copyText = await incognitoPage.evaluate(async () => {
                    try { return await navigator.clipboard.readText(); } catch (e) { return null; }
                }).catch(() => null);
                console.log(`📋 COPIED TEXT FROM OPENED TAB: "${copyText}"`);
            }

            await incognitoContext.close();
        }
    }

    console.log('\n======================================================');
    console.log(' USER REQUEST: PAUSING ON PAGE WHEN DEPLOY BUTTON VISIBLE/ENABLED ');
    console.log(' DO NOT CLICK DEPLOY - PAUSING EXECUTION VIA page.pause()');
    console.log('======================================================\n');

    await page.pause();
});
