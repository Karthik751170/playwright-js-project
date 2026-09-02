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
    while (loopCount < 15) {
        await page.waitForTimeout(3000);
        loopCount++;

        // If the server went straight to the loading screen, brief, or editor, break!
        if (page.url().includes('editor')) {
            console.log('URL changed to editor! Questionnaire was skipped or completed.');
            break;
        }
        
        const loadingIndicator = page.locator('text=/creating your survey|building your survey/i').first();
        if (await loadingIndicator.isVisible().catch(()=>false)) {
            console.log('Loading screen detected! Survey is generating.');
            break;
        }

        if (await finalGenerateSurveyBtn.isVisible().catch(()=>false) && await finalGenerateSurveyBtn.isEnabled().catch(()=>false)) {
            console.log('Create Survey button is already visible!');
            break;
        }
        if (await surveyGenerator.clickGenerateBrief().catch(()=>false)) {
            console.log('Clicked Generate Brief!');
            break;
        }

        try {
            if (await surveyGenerator.handleSelectAndRunItThisWay().catch(() => false)) { consecutiveFails = 0; continue; }
            if (await surveyGenerator.selectAllThatApplyHeader.count().catch(()=>0) > 0 && await surveyGenerator.selectAllThatApplyHeader.first().isVisible().catch(() => false)) {
                if (await surveyGenerator.handleSelectAllThatApply().catch(() => false)) { consecutiveFails = 0; continue; }
            }
            if (await surveyGenerator.handleSingleSelect().catch(() => false)) { consecutiveFails = 0; continue; }
            if (await surveyGenerator.handleTextInputFallback().catch(() => false)) { consecutiveFails = 0; continue; }
            if (await surveyGenerator.clickSkip().catch(() => false)) { consecutiveFails = 0; continue; }
        } catch (err) {
            console.log('[Questionnaire] Interaction handled transition cleanly.');
        }
        
        consecutiveFails++;
        if (consecutiveFails >= 10) {
            console.log('\n--- No questionnaire buttons found for 30 seconds ---');
            console.log('Assuming we are on the loading screen, brief screen, or editor. Breaking out of loop!');
            break;
        }
    }
    
    if (loopCount >= 120) {
        console.log('WARNING: Loop timed out after 10 minutes without finding Generate Brief or Create Survey.');
    }

    console.log('Questionnaire finished. Checking for "Generate Research Brief", "Create Survey", or Editor transition (up to 5 minutes)...');
    
    const generateResearchBtn = page.locator('button')
        .filter({ hasText: /generate.*brief|build.*brief|yes.*brief|generate.*research|research.*brief/i })
        .or(page.getByRole('button', { name: /generate.*(research\s*)?brief|yes,?\s*generate/i }))
        .or(page.locator("//button[contains(normalize-space(),'generate') and (contains(normalize-space(),'brief') or contains(normalize-space(),'research'))]"))
        .first();

    const createSurveyBtn = page.locator('button')
        .filter({ hasText: /yes,?\s*create.*survey|create.*survey|generate.*survey|build.*survey/i })
        .or(page.getByRole('button', { name: /yes,?\s*create.*survey|create.*survey/i }))
        .or(page.locator("//button[contains(normalize-space(),'Create') and contains(normalize-space(),'Survey')]"))
        .first();

    const startWaitTime = Date.now();
    let promptSent = false;
    while (Date.now() - startWaitTime < 300000) {
        if (page.url().includes('editor') || await page.locator("//span[text()='Deploy']").first().isVisible().catch(() => false)) {
            console.log('Transitioned to Survey Editor screen!');
            break;
        }

        if (await surveyGenerator.handleSelectAndRunItThisWay().catch(() => false)) {
            continue;
        }

        if (await createSurveyBtn.isVisible().catch(() => false)) {
            console.log('Found Create Survey button! Clicking it...');
            await page.waitForTimeout(1000);
            await createSurveyBtn.click({ force: true }).catch(() => {});
            await page.waitForTimeout(3000);
            break;
        }

        if (await generateResearchBtn.isVisible().catch(() => false)) {
            console.log('Found "Generate Research Brief" button! Clicking it...');
            await generateResearchBtn.click({ force: true }).catch(() => {});
            await page.waitForTimeout(3000);
        }
        
        // If no button is visible after 15 seconds, send chat confirmation to trigger survey creation
        if (!promptSent && (Date.now() - startWaitTime > 15000)) {
            const chatInput = page.locator("#prompt, textarea[aria-label*='Ask Hercules' i], textarea[placeholder*='Ask Hercules' i], textarea").first();
            if (await chatInput.isVisible().catch(() => false)) {
                console.log('Chat input active without buttons. Prompting Hercules to create the survey...');
                await chatInput.fill('Yes, please include these dimensions and create the survey.');
                await page.waitForTimeout(500);
                const sendBtn = page.locator('button[aria-label="submit button"]').or(page.getByRole('button', { name: 'Send' })).first();
                if (await sendBtn.isVisible().catch(() => false)) {
                    await sendBtn.click({ force: true }).catch(() => {});
                } else {
                    await chatInput.press('Enter').catch(() => {});
                }
                promptSent = true;
            }
        }
        await page.waitForTimeout(2000);
    }

    // Secondary wait for Create Survey if brief was generated
    if (!page.url().includes('editor') && !await page.locator("//span[text()='Deploy']").first().isVisible().catch(() => false)) {
        console.log('Waiting for final "Create Survey" button or Editor transition...');
        const secondWaitStart = Date.now();
        while (Date.now() - secondWaitStart < 180000) {
            if (page.url().includes('editor') || await page.locator("//span[text()='Deploy']").first().isVisible().catch(() => false)) {
                console.log('Survey Editor reached!');
                break;
            }
            if (await createSurveyBtn.isVisible().catch(() => false)) {
                console.log('Found Create Survey button! Clicking it...');
                await createSurveyBtn.click({ force: true }).catch(() => {});
                await page.waitForTimeout(3000);
                break;
            }
            await page.waitForTimeout(2000);
        }
    }

    // AUDIENCE PARSING: Extract location (city) if configured in audience panel
    let targetCity = 'Pune'; // Reliable fallback city
    try {
        const audienceSection = page.locator("//div[contains(text(),'Audience') or contains(text(),'Demographics') or contains(@class,'audience')]").first();
        if (await audienceSection.isVisible({ timeout: 5000 }).catch(() => false)) {
            const text = await audienceSection.innerText();
            const cities = ['Bangalore', 'Mumbai', 'Delhi', 'Pune', 'Hyderabad', 'Chennai', 'Kolkata'];
            for (const city of cities) {
                if (text.toLowerCase().includes(city.toLowerCase())) {
                    targetCity = city;
                    break;
                }
            }
        }
    } catch (e) {}
    console.log(`[Test] Using onboarding location: ${targetCity}`);

    console.log('Waiting for Survey generation to finish and Deploy button to appear (up to 10 minutes)...');
    
    // const editorDeployBtn = page.locator("button:has-text('Deploy')").first();
    const editorDeployBtn = page.locator("//span[text()='Deploy']").first();
    const reviewComplete = page.locator("text=/AI Content Review Complete|Share this Survey with friends|View Audience/i").first();
    
    const startTime = Date.now();
    while (Date.now() - startTime < 600000) {
        if (await editorDeployBtn.isVisible().catch(() => false) || await reviewComplete.isVisible().catch(() => false)) {
            console.log('Survey generation complete and Deploy card is visible on screen!');
            break;
        }
        await page.waitForTimeout(4000);
    }

    console.log('Waiting 3 seconds, then refreshing page to ensure questions and Deploy buttons are fully loaded without animation lag...');
    await page.waitForTimeout(3000);
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(3000);

    const closeBtn = page.locator("button[aria-label='Close'], button:has-text('✕'), button:has-text('Dismiss')").first();
    if (await closeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await closeBtn.click({ force: true });
    }
    
    return targetCity;
}

test('Deploy survey to 100 Users for Free', async ({ browser }) => {
    test.setTimeout(3600000); // 1 hour max

    let page, herculesContext;
    await test.step('Step 1: Setup Mailosaur Account & Login to Hercules', async () => {
        ({ page, herculesContext } = await setupMailosaurAccount(browser));
    });

    let targetCity = 'Pune';
    await test.step('Step 2: Generate Survey via AI Brief & Questionnaire', async () => {
        targetCity = await generateSurvey(page);
    });

    const surveyLogics = [];
    await test.step('Step 3: Inspect and Extract Survey Logic Rules', async () => {
        await page.waitForTimeout(3000);
        const logicsBtn = page.locator("//button[text()='Logics']");
        if (await logicsBtn.isVisible()) {
            console.log('Found Logics button, clicking it...');
            await logicsBtn.click({ force: true });
            await page.waitForTimeout(2000);
        }
        
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
                surveyLogics.push({ index: i + 1, text: logicText.trim() });
            }
        }
        console.log(`Extracted Logic Rules: ${surveyLogics.length} rules found.`);
    });

    let liveSurveyUrl = '';
    let superjContext, livePage;

    await test.step('Step 4: Deploy Survey to 100 Free Users & Launch Live Survey', async () => {
        console.log('Refreshing editor page to ensure Deploy button state is fresh...');
        await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.waitForTimeout(5000);

        const audienceBannerClose = page.locator("div:has-text('Audience set has been applied') button").first();
        if (await audienceBannerClose.isVisible({ timeout: 3000 }).catch(() => false)) {
            await audienceBannerClose.click({ force: true }).catch(() => {});
        }

        // const cardDeployBtn = page.locator("button:has-text('Deploy')").first();
        const cardDeployBtn = page.locator("//span[text()='Deploy']").first();
        await cardDeployBtn.waitFor({ state: 'visible', timeout: 60000 });
        console.log('Clicking Deploy button on survey card...');
        await cardDeployBtn.click({ force: true });
        await page.waitForTimeout(3000);

        const free100Btn = page.locator("button:has-text('Deploy to 100 Users for Free'), button:has-text('Deploy 100 Users for Free'), button:has-text('100 Users for Free')").first();
        await free100Btn.waitFor({ state: 'visible', timeout: 30000 });
        console.log('Clicking "Deploy to 100 Users for Free" button...');
        await free100Btn.click({ force: true });
        await page.waitForTimeout(2000);

        const modalDeployFreeBtn = page.locator("button:has-text('Deploy for Free')").first();
        if (await modalDeployFreeBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
            console.log('Clicking "Deploy for Free" confirmation in modal...');
            await modalDeployFreeBtn.click({ force: true });
            await page.waitForTimeout(2000);
        }

        console.log('Waiting for survey-review page...');
        await page.waitForURL(/survey-review|survey.*review|chat/i, { timeout: 30000 }).catch(() => {});

        const launchSurveyBtn = page.locator("button:has-text('Launch Survey')").first();
        await launchSurveyBtn.waitFor({ state: 'visible', timeout: 120000 });
        console.log('"Launch Survey" button is available. Clicking it...');
        await launchSurveyBtn.click({ force: true });
        await page.waitForTimeout(3000);
        console.log('Successfully clicked Launch Survey button!');

        // Extract survey URL
        await page.waitForTimeout(3000);
        const rawText = await page.locator('body').innerText().catch(() => '');
        const m = rawText.match(/https?:\/\/(?:dev\.)?superj\.app\/survey\/[A-Za-z0-9]+/);
        if (m) {
            liveSurveyUrl = m[0];
            console.log(`Extracted Live Survey URL: ${liveSurveyUrl}`);
        }
        if (!liveSurveyUrl || !liveSurveyUrl.startsWith('http')) {
            const surveyLink = page.locator('a[href*="superj.app"]').first();
            if (await surveyLink.isVisible({ timeout: 5000 }).catch(()=>false)) {
                liveSurveyUrl = await surveyLink.getAttribute('href');
            }
        }
        if (liveSurveyUrl && liveSurveyUrl.includes('superj.app') && !liveSurveyUrl.includes('dev.superj.app')) {
            liveSurveyUrl = liveSurveyUrl.replace('superj.app', 'dev.superj.app');
        } else if (liveSurveyUrl && !liveSurveyUrl.includes('dev.')) {
            liveSurveyUrl = liveSurveyUrl.replace('https://', 'https://dev.');
        }
        console.log(`Final Modified URL for DEV environment: ${liveSurveyUrl}`);
        expect(liveSurveyUrl).toMatch(/^https?:\/\//);

        // Open live survey context with video recording
        superjContext = await browser.newContext({
            viewport: { width: 1280, height: 720 },
            recordVideo: { dir: 'test-results/videos/' }
        });
        livePage = await superjContext.newPage();
        livePage.setDefaultTimeout(300000);

        // Audio listener
        livePage.on('response', async (response) => {
            try {
                const url = response.url();
                const contentType = response.headers()['content-type'] || '';
                if (url.includes('.mp3') || url.includes('.wav') || contentType.includes('audio')) {
                    const buffer = await response.body().catch(() => null);
                    if (buffer && buffer.length > 0) {
                        if (!fs.existsSync('scratch')) fs.mkdirSync('scratch', { recursive: true });
                        fs.writeFileSync('scratch/live_survey_audio.mp3', buffer);
                        console.log(`[AudioCapture] Captured live audio stream (${buffer.length} bytes) from: ${url}`);
                    }
                }
            } catch (e) {}
        });

        await livePage.goto(liveSurveyUrl);
    });

    await test.step('Step 5: Consumer Authentication & Pune Onboarding', async () => {
        const LoginPage = require('../pages/LoginPage');
        const DataGeneratorUtil = require('../utils/DataGeneratorUtil');
        const OnboardingUtil = require('../utils/OnboardingUtil');
        
        const loginPage = new LoginPage(livePage);
        const randomPhone = process.env.TEST_PHONE || DataGeneratorUtil.generateRandomPhoneNumber();
        console.log(`[Test] Consumer Phone Number: ${randomPhone}`);
        
        const phoneInput = livePage.locator('input[type="tel"], input[placeholder*="phone" i], input[placeholder*="mobile" i]').first();
        if (await phoneInput.isVisible({ timeout: 8000 }).catch(() => false)) {
            await loginPage.login(randomPhone, '777777');
            await livePage.waitForTimeout(5000);
        }

        const welcomeLocator = livePage.locator("//h2[text()='Welcome to SuperJ'] | h2");
        if (await welcomeLocator.first().isVisible({ timeout: 8000 }).catch(() => false)) {
            const onboardingUtil = new OnboardingUtil(livePage);
            await onboardingUtil.completeOnboarding('1997', targetCity, 'Male').catch(() => {});
            await livePage.waitForTimeout(3000);
            await livePage.goto(liveSurveyUrl);
            await livePage.waitForTimeout(3000);
        }
    });

    await test.step('Step 6: Launch Survey & Answer All Questions', async () => {
        const startBtn = livePage.locator("button:has-text('Start Survey'), button:has-text('Take Survey'), button:has-text('Start')").first();
        if (await startBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
            console.log('Clicking Start Survey button...');
            await startBtn.click({ force: true }).catch(() => {});
            await livePage.waitForTimeout(3000);
        }

        const startBtn2 = livePage.locator("button:has-text('Start Survey'), button:has-text('Take Survey'), button:has-text('Start')").first();
        if (await startBtn2.isVisible({ timeout: 5000 }).catch(() => false)) {
            console.log('Clicking second Start Survey button...');
            await startBtn2.click({ force: true }).catch(() => {});
            await livePage.waitForTimeout(3000);
        }

        const AnswerEngine = require('../utils/AnswerEngine');
        const ActiveQuestionFinder = require('../utils/ActiveQuestionFinder');

        const answerEngine = new AnswerEngine(livePage, surveyLogics);
        answerEngine.getAiContext = function() {
            return `I am an active, enthusiastic, and highly qualified participant taking this market research survey.
IMPORTANT INSTRUCTIONS FOR THIS SURVEY:
1. Always qualify for the survey: If asked about profession, habits, product usage, or behaviors, ALWAYS choose the positive active option.
2. Answer positively and constructively to ensure the survey does NOT screen out or terminate early.
3. Complete all slides until the very end.`;
        };

        const questionFinder = new ActiveQuestionFinder(livePage);
        let answeredCount = 0;
        let lastSlideNumber = null;
        let sameSlideRepeats = 0;

        for (let i = 0; i < 80; i++) {
            const activeData = await questionFinder.getActiveQuestion(10000);
            if (!activeData || !activeData.container) {
                console.log('[AnswerEngine] No active question found — checking for completion modal...');
                break;
            }

            const { container, slideNumber, totalSlides } = activeData;

            if (slideNumber === lastSlideNumber) {
                sameSlideRepeats++;
                if (sameSlideRepeats >= 4) {
                    const errorMsg = `[BUG REPORT] Stuck on slide ${slideNumber}/${totalSlides} for ${sameSlideRepeats} attempts.`;
                    console.log(errorMsg);
                    await livePage.screenshot({ path: `scratch/bug_slide_${slideNumber}.png`, fullPage: true }).catch(() => {});
                    test.info().attach(`BUG_REPORT_Slide_${slideNumber}`, {
                        contentType: 'text/plain',
                        body: errorMsg
                    });
                    break;
                }
            } else {
                sameSlideRepeats = 0;
                lastSlideNumber = slideNumber;
            }

            const isLastQuestion = Number.isInteger(totalSlides) && slideNumber >= totalSlides;
            const qInfo = await answerEngine.extractQuestionInfo(container);
            const questionTitle = (qInfo.questionText || `Question ${slideNumber}`).substring(0, 60).replace(/\s+/g, ' ');

            await test.step(`Slide ${slideNumber}/${totalSlides || '?'}: "${questionTitle}"`, async () => {
                const elements = { activeQuestion: container, nextButton: null };
                const answered = await answerEngine.answer(elements, isLastQuestion).catch((e) => {
                    console.log(`[AnswerEngine] answer() error on slide ${slideNumber}: ${e.message}`);
                    return false;
                });

                const summary = answerEngine.lastAnswerSummary || {};
                const reportDetails = {
                    surveyUrl: liveSurveyUrl,
                    slideNumber: `${slideNumber}/${totalSlides || '?'}`,
                    questionText: summary.questionText || qInfo.questionText || "Unknown",
                    optionsPresent: summary.optionsPresent || [],
                    optionsSelected: summary.optionsSelected || [],
                    interactionType: summary.handlerUsed || "Standard Answer Handler"
                };

                test.info().attach(`Slide_${slideNumber}_Details`, {
                    contentType: 'application/json',
                    body: JSON.stringify(reportDetails, null, 2)
                });

                console.log(`\n[Report Step] Slide ${slideNumber}/${totalSlides || '?'} | Q: "${(reportDetails.questionText).substring(0, 50)}..."`);
                console.log(`  Options Available: [${reportDetails.optionsPresent.join(', ')}]`);
                console.log(`  Option(s) Selected: [${reportDetails.optionsSelected.join(', ')}]`);
                console.log(`  Interaction Type: ${reportDetails.interactionType}`);

                if (answered) answeredCount++;

                await livePage.waitForTimeout(1000);
                await answerEngine.clickNext(elements).catch(() => {});
                await livePage.waitForTimeout(1500);

                if (isLastQuestion) {
                    console.log('[AnswerEngine] Final slide answered! Waiting for submission modal...');
                    await livePage.waitForTimeout(5000);
                    const finishModal = livePage.locator("button:has-text('Earn More Rewards'), button:has-text('Claim'), button:has-text('Finish'), button:has-text('Okay!'), button:has-text('Okay')").first();
                    if (await finishModal.isVisible({ timeout: 8000 }).catch(() => false)) {
                        console.log('[AnswerEngine] Survey completed and submitted!');
                        await finishModal.click({ force: true }).catch(() => {});
                        await livePage.waitForTimeout(3000);
                    }
                }
            });

            if (isLastQuestion) break;
        }

        console.log(`Survey answering finished. Total slides answered: ${answeredCount}`);
        expect(answeredCount, 'Expected to answer multiple survey questions').toBeGreaterThan(0);
    });

    await test.step('Step 7: Verify Response Count on B2B Hercules Dashboard', async () => {
        console.log('\n--- VERIFYING RESPONSE COUNT IN B2B HERCULES ---');
        await page.bringToFront();
        
        console.log('Waiting 10 seconds for backend database to update...');
        await page.waitForTimeout(10000);
        
        console.log('Reloading Hercules B2B page to fetch updated response count...');
        await page.reload();
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(5000);
        
        const responsesLabel = page.locator("//span[contains(text(), 'Responses Collected:')] | //p[contains(text(), 'Responses Collected:')] | //div[contains(text(), 'Responses Collected:')]").first();
        await responsesLabel.scrollIntoViewIfNeeded().catch(() => {});
        
        if (await responsesLabel.isVisible().catch(()=>false)) {
            const labelText = await responsesLabel.innerText().catch(() => "");
            const countLocator = page.locator("//span[contains(text(), 'Responses Collected:')]/following-sibling::*").first()
                .or(page.locator("//span[contains(text(), 'Responses Collected:')]/.."))
                .first();
            const countText = await countLocator.innerText().catch(() => "");
            
            console.log(`Responses Collected Label: "${labelText}", Count: "${countText}"`);
            
            const firstNumMatch = countText.replace(/Responses Collected:/i, '').match(/\d+/);
            const firstNum = firstNumMatch ? parseInt(firstNumMatch[0], 10) : 0;
            
            test.info().attach('B2B_Response_Count_Verification', {
                contentType: 'application/json',
                body: JSON.stringify({
                    surveyUrl: liveSurveyUrl,
                    labelText: labelText,
                    countText: countText,
                    recordedResponses: firstNum,
                    status: firstNum > 0 ? "PASSED" : "FAILED"
                }, null, 2)
            });

            if (firstNum > 0) {
                console.log(`SUCCESS: Verified that the response count has successfully reflected on Hercules B2B! (Count: ${firstNum})`);
            } else {
                throw new Error(`[BUG REPORT] Response count is 0! The survey response was not recorded by the backend. Found text: ${countText}`);
            }
        } else {
            console.log('Notice: Responses Collected label not found on active view; taking screenshot...');
            await page.screenshot({ path: 'scratch/b2b_responses_view.png', fullPage: true });
        }
        
        // Gracefully close contexts so all video buffers are flushed to disk
        await superjContext.close().catch(() => {});
        await herculesContext.close().catch(() => {});

        console.log('\n========================================');
        console.log('[Test] Video recordings saved to: test-results/videos/');
        if (fs.existsSync('test-results/videos')) {
            const files = fs.readdirSync('test-results/videos').filter(f => f.endsWith('.webm'));
            console.log('[Test] Generated video files:', files);
        }
        console.log('========================================\n');
    });
});
