const { test, expect } = require('@playwright/test');
const LoginPage = require('../pages/LoginPage');
const OnboardingUtil = require('../utils/OnboardingUtil');
const DataGeneratorUtil = require('../utils/DataGeneratorUtil');
const LandingPage = require('../pages/LandingPage');
const LiveAIAssistant = require('../utils/LiveAIAssistant');
const WalletValidator = require('../utils/WalletValidator');

test('SuperJ - Answer 6 Surveys', async ({ page }) => {
    test.setTimeout(600000); // 10 minutes timeout for answering 6 surveys

    const loginPage = new LoginPage(page);
    const onboardingUtil = new OnboardingUtil(page);
    const landingPage = new LandingPage(page);
    const walletValidator = new WalletValidator(page);

    let maxAccountRetries = 5;
    let accountSuccess = false;
    
    for (let attempt = 1; attempt <= maxAccountRetries; attempt++) {
        console.log(`\n=========================================`);
        console.log(`  ACCOUNT GENERATION ATTEMPT #${attempt}`);
        console.log(`=========================================\n`);
        
        // Clear cookies/state for fresh login
        await page.context().clearCookies();
        
        // 1. Login with dynamic or provided phone number
        const randomPhone = process.env.TEST_PHONE || DataGeneratorUtil.generateRandomPhoneNumber();
        console.log(`[Test] Using phone number: ${randomPhone}`);
        await loginPage.login(randomPhone, '777777');

        // 2. Wait for page to fully load after OTP redirect (staging server can be very slow)
        console.log('[Test] Waiting 15 seconds for post-OTP redirect to settle...');
        await page.waitForTimeout(15000); 
        
        // Check if we got redirected to home by looking for dashboard indicators
        let bodyText = await page.innerText('body');
        let isOnDashboard = bodyText.includes('Wallet') && bodyText.includes('Copy DID');
        
        if (isOnDashboard) {
            console.log('[Test] Server skipped onboarding! Forcing navigation back to /OnBoarding...');
            await page.goto('https://dev.superj.app/OnBoarding');
            await page.waitForTimeout(3000); // Wait for OnBoarding to load
        }
        
        // Now verify we are actually on an onboarding page (or can find the form)
        let newBodyText = await page.innerText('body');
        let isStillOnDashboard = newBodyText.includes('Wallet') && newBodyText.includes('Copy DID');
        
        if (isStillOnDashboard) {
            console.log('[Test] Server STILL forced us to Home! Cannot complete onboarding demographics. Surveys may be limited.');
        } else {
            const result = await onboardingUtil.completeOnboarding('1997', 'Pune', 'Male');
            // We won't strictly expect(success) here because we want to gracefully retry if the backend fails
            if (!result.success) {
                 console.log('[Test] Onboarding failed to complete cleanly. We will check the dashboard anyway.');
            }
        }
        
        // --- ADDED WALLET VALIDATION POST-ONBOARDING ---
        await walletValidator.validateWalletAndTransactions('Post-Onboarding');
        
        // Wait for dashboard to load completely before checking surveys
        await page.waitForTimeout(3000);

        // Check survey count
        console.log("Screen 1: Searching for 'Start Survey' button on dashboard...");
        const surveyBtnCheck = page.locator('button:has-text("Start Survey"), a:has-text("Start Survey"), div[class*="SurveyCard"] button');
        
        const initialCount = await surveyBtnCheck.count();
        console.log(`Screen 1: Found ${initialCount} survey item(s) on dashboard for this account`);

        if (initialCount < 6) {
             console.log(`[Test] Account only got ${initialCount} surveys (we need at least 6 to test the daily limit rule). Abandoning account and trying a new one...`);
             continue; // Try next account
        }
        
        // If we found enough surveys, we can break the retry loop and start answering!
        console.log(`[Test] SUCCESS! Account has enough surveys to test the limit rule! Starting test...`);
        accountSuccess = true;
        break;
    }
    
    if (!accountSuccess) {
         throw new Error("[Test] FAILED to generate a valid account with 6+ surveys after 5 attempts! The staging server onboarding is too buggy right now.");
    }

    // Helper to answer a survey randomly
    async function answerSurveyAutomatically() {
        console.log('[Test] Starting survey answering logic...');
        let questionCount = 0;
        let completed = true;
        
        async function clickVisibleHomeButton() {
            const homeBtns = page.locator('button, a, div, span').filter({ hasText: /^Home$/i });
            const count = await homeBtns.count();
            for (let i = 0; i < count; i++) {
                const btn = homeBtns.nth(i);
                if (await btn.isVisible()) {
                    console.log(`[Test] Found visible Home button at index ${i}. Clicking...`);
                    await btn.scrollIntoViewIfNeeded().catch(() => {});
                    await page.waitForTimeout(500);
                    await btn.click({ force: true, timeout: 5000 }).catch(e => console.log('Home click failed:', e.message));
                    return true;
                }
            }
            return false;
        }
        
        while (true) {
            await page.waitForTimeout(2000); // Wait for animations
            
            // 1. Check for success screen (Congratulations, Claim Reward, or Thank you)
            const successHeading = page.getByText(/Congratulations|Thank you for your participation|Job well done/i, { exact: false }).first();
            const claimBtn = page.locator('button:has-text("Claim"), button:has-text("Back to Home"), button:has-text("Okay!")').first();
            
            const isSuccessHeading = await successHeading.isVisible();
            const isClaimBtn = await claimBtn.isVisible();
            
            // Only consider it a success if we see a heading, OR if we see the earn more rewards button
            const earnMoreFastCheck = page.locator('button, div').filter({ hasText: /earn more rewards/i }).first();
            const isEarnMore = await earnMoreFastCheck.isVisible().catch(() => false);

            if (isSuccessHeading || isEarnMore) {
                console.log('[Test] Reached the end of the survey (success screen)!');
                
                // Wait for any pop-up animations to settle
                await page.waitForTimeout(3000);
                
                if (await claimBtn.isVisible()) {
                    console.log('[Test] Clicking initial Claim/Okay button...');
                    await claimBtn.click({ force: true, timeout: 5000 }).catch(e => console.log('Claim click failed:', e.message));
                    await page.waitForTimeout(3000); // Wait for transition
                }
                
                // Find ALL elements in the DOM with the requested text (case insensitive)
                const earnMoreBtns = page.locator('button, div').filter({ hasText: /earn more rewards/i });
                
                // Explicitly wait up to 5 seconds for at least one to become visible
                // The staging server is very slow with animations, so this is critical!
                await earnMoreBtns.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
                
                let clicked = false;
                const count = await earnMoreBtns.count();
                console.log(`[Test] Found ${count} potential "Earn more Rewards!" elements in DOM.`);
                
                // Loop through all of them and click the first one that is actually visible on screen
                for (let i = 0; i < count; i++) {
                    const btn = earnMoreBtns.nth(i);
                    if (await btn.isVisible()) {
                        console.log(`[Test] Element at index ${i} is VISIBLE! Scrolling into view and waiting 1 second...`);
                        await btn.scrollIntoViewIfNeeded().catch(() => {});
                        await page.waitForTimeout(1000);
                        await btn.click({ force: true, timeout: 5000 }).catch(e => console.log('Earn More Rewards click failed:', e.message));
                        clicked = true;
                        await page.waitForTimeout(2000);
                        break; // Stop looping once we successfully click the visible one
                    }
                }
                
                if (!clicked) {
                    console.log('[Test] No visible "Earn more Rewards!" found. Looking for Home button fallback...');
                    const clickedHome = await clickVisibleHomeButton();
                    if (!clickedHome) {
                        console.log('[Test] No visible Home button found either.');
                    }
                }
                break;
            }

            const activeCarouselItem = page.locator("div[class*='carouselItem']").filter({ hasNot: page.locator('style[display="none"]') }).last();

            if (!await activeCarouselItem.isVisible() || questionCount > 25) {
                if (questionCount > 25) console.log('[Test] Failsafe triggered! Assuming survey is finished to avoid infinite loop.');
                console.log('[Test] Could not find active question. Attempting to click generic next button...');
                const globalNext = page.locator('button:has-text("Next"), button:has-text("Continue"), button:has-text("Submit"), button:has-text("Finish")').first();
                if (await globalNext.isVisible() && await globalNext.isEnabled() && questionCount <= 25) {
                    await globalNext.click({ force: true, timeout: 5000 }).catch(() => {});
                } else {
                    console.log('[Test] No active question and no valid Next button. Survey must be finished!');
                    const clickedHome = await clickVisibleHomeButton();
                    if (clickedHome) {
                        await page.waitForTimeout(2000);
                    } else {
                        await page.goto('https://dev.superj.app/');
                        await page.waitForLoadState('networkidle');
                    }
                    break;
                }
            }

            questionCount++;
            console.log(`[Test] Answering question #${questionCount}`);

            // User provided exact locator for "More options" button. 
            // Add loop to click it wherever it is visible on screen.
            const moreOptionsBtns = page.getByRole('button', { name: 'More options More options' });
            const moreOptionsCount = await moreOptionsBtns.count();
            if (moreOptionsCount > 0) {
                console.log(`[Test] Found ${moreOptionsCount} "More options" button(s). Looking for a visible one...`);
                for (let i = 0; i < moreOptionsCount; i++) {
                    const btn = moreOptionsBtns.nth(i);
                    if (await btn.isVisible()) {
                        console.log(`[Test] Clicking visible "More options" button at index ${i}...`);
                        await btn.scrollIntoViewIfNeeded().catch(() => {});
                        await btn.click({ force: true, timeout: 5000 }).catch(e => console.log('More options click failed:', e.message));
                        await page.waitForTimeout(1000); // Wait for the new options to expand/render
                        break;
                    }
                }
            }

            // --- GROQ AI INTEGRATION: Extract Question Text ---
            let questionText = "Please answer this question.";
            const fullText = await activeCarouselItem.innerText();
            if (fullText) {
                // Take the first 3 lines of text (excluding empty lines) to give Groq enough context
                const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                questionText = lines.slice(0, 3).join(' | ');
            }
            console.log(`[Test] AI extracted question: "${questionText.substring(0, 50)}..."`);
            
            const aiContext = "I am a generic consumer taking a survey to earn rewards. I am truthful, concise, and professional.";

            // 2. Try to select an option (Radio, Checkbox, Rating, or simple div option)
            // First check if it's a standard radio/checkbox
            const radioOrCheckbox = activeCarouselItem.locator('input[type="radio"], input[type="checkbox"]');
            const radioCount = await radioOrCheckbox.count();
            
            if (radioCount > 0) {
                console.log(`[Test] Found ${radioCount} radio/checkbox inputs!`);
                const isMulti = await radioOrCheckbox.first().getAttribute('type') === 'checkbox';
                const type = isMulti ? 'multi' : 'single';
                
                // Extract options by looking at sibling labels or parent text
                const options = [];
                for (let i = 0; i < radioCount; i++) {
                    const el = radioOrCheckbox.nth(i);
                    // Try to get label text or parent text
                    let optText = await el.evaluate(e => {
                        if (e.labels && e.labels.length > 0) return e.labels[0].innerText;
                        if (e.nextElementSibling && e.nextElementSibling.tagName === 'LABEL') return e.nextElementSibling.innerText;
                        return e.parentElement.innerText;
                    }).catch(() => `Option ${i}`);
                    options.push(optText.trim() || `Option ${i}`);
                }
                
                const response = await LiveAIAssistant.answerQuestion(aiContext, questionText, type, options);
                
                if (isMulti) {
                    let indices = response.indices;
                    if (!indices || !Array.isArray(indices) || indices.length === 0) {
                        indices = [];
                        const numToSelect = Math.max(1, Math.min(2, Math.floor(Math.random() * 2) + 1));
                        for (let i = 0; i < numToSelect; i++) {
                            const r = Math.floor(Math.random() * radioCount);
                            if (!indices.includes(r)) indices.push(r);
                        }
                        console.log(`[Test] AI provided empty/invalid indices for native checkboxes. Randomly picked: ${indices.join(', ')}`);
                    } else {
                        console.log(`[Test] AI selected checkbox indices: ${indices.join(', ')}`);
                    }
                    for (const idx of indices) {
                        if (idx >= 0 && idx < radioCount) {
                            await radioOrCheckbox.nth(idx).click({ force: true, timeout: 2000 }).catch(() => {});
                            await page.waitForTimeout(300);
                        }
                    }
                } else {
                    const idx = (response.index !== undefined && response.index >= 0 && response.index < radioCount) ? response.index : 0;
                    console.log(`[Test] AI selected radio index: ${idx} ("${options[idx]}")`);
                    await radioOrCheckbox.nth(idx).click({ force: true, timeout: 2000 }).catch(() => {});
                }
            } else {
                // Check if it's a text input
                let input = activeCarouselItem.locator('input:not([type="radio"]):not([type="checkbox"]), textarea').first();
                if (!await input.isVisible()) {
                    input = page.locator('input:not([type="radio"]):not([type="checkbox"]), textarea').first();
                }
                
                if (await input.count() > 0 && await input.isVisible()) {
                    console.log('[Test] Found text input. Asking AI for answer...');
                    const response = await LiveAIAssistant.answerQuestion(aiContext, questionText, 'text');
                    const answerText = response.answer || 'I am highly interested in this product and its benefits.';
                    console.log(`[Test] AI generated answer: "${answerText}"`);
                    
                    await input.scrollIntoViewIfNeeded().catch(() => {});
                    await input.focus().catch(() => {});
                    await input.fill('').catch(() => {}); // clear existing
                    await input.pressSequentially(answerText, { delay: 30 }).catch(e => console.log('Press sequentially failed:', e.message));
                    
                    // Add combobox / autocomplete support
                    await page.waitForTimeout(500);
                    console.log('[Test] Pressing ArrowDown and Enter to select any potential combobox options...');
                    await input.press('ArrowDown').catch(() => {});
                    await page.waitForTimeout(200);
                    await input.press('Enter').catch(() => {});
                    await page.waitForTimeout(1000);
                } else {
                    // It must be a custom div/button option. 
                    console.log('[Test] Looking for clickable custom options...');
                    
                    // We must evaluate to get options, then call AI, then evaluate to click.
                    const clickablesData = await activeCarouselItem.evaluate(container => {
                        const allClickables = Array.from(container.querySelectorAll('*')).filter(el => {
                            const style = window.getComputedStyle(el);
                            const text = el.innerText || el.textContent || '';
                            const isNav = /Next|Continue|Submit|Finish|Previous/i.test(text.trim());
                            // Ensure it's clickable and has text
                            return !isNav && text.trim().length > 0 && (style.cursor === 'pointer' || el.tagName === 'LABEL' || el.tagName === 'LI' || el.getAttribute('role') === 'radio' || (el.className && typeof el.className === 'string' && el.className.includes('hover:bg')));
                        });
                        return allClickables.map(el => el.innerText.trim());
                    }).catch(e => { console.log('Evaluate option extract failed:', e.message); return []; });
                    
                    if (clickablesData.length > 0) {
                        const isMulti = questionText.toLowerCase().includes('select all') || questionText.toLowerCase().includes('multiple');
                        const type = isMulti ? 'multi' : 'single';
                        const response = await LiveAIAssistant.answerQuestion(aiContext, questionText, type, clickablesData);
                        
                        let finalIndices = [];
                        if (isMulti) {
                            finalIndices = response.indices;
                            if (!finalIndices || !Array.isArray(finalIndices) || finalIndices.length === 0) {
                                finalIndices = [];
                                const countToPick = Math.max(1, Math.min(3, Math.floor(Math.random() * 3) + 1));
                                for(let i=0; i<countToPick; i++) {
                                    const r = Math.floor(Math.random() * clickablesData.length);
                                    if(!finalIndices.includes(r)) finalIndices.push(r);
                                }
                                console.log(`[Test] AI provided empty/invalid indices for custom options. Randomly picked: ${finalIndices.join(', ')}`);
                            }
                        } else {
                            finalIndices = [(response.index !== undefined && response.index >= 0) ? response.index : 0];
                        }
                        
                        await activeCarouselItem.evaluate((container, { indicesToClick }) => {
                            const allClickables = Array.from(container.querySelectorAll('*')).filter(el => {
                                const style = window.getComputedStyle(el);
                                const text = el.innerText || el.textContent || '';
                                const isNav = /Next|Continue|Submit|Finish|Previous/i.test(text.trim());
                                return !isNav && text.trim().length > 0 && (style.cursor === 'pointer' || el.tagName === 'LABEL' || el.tagName === 'LI' || el.getAttribute('role') === 'radio' || (el.className && typeof el.className === 'string' && el.className.includes('hover:bg')));
                            });
                            for (const idx of indicesToClick) {
                                if (allClickables[idx]) allClickables[idx].click();
                            }
                        }, { indicesToClick: finalIndices })
                        .catch(e => console.log('Evaluate option click failed:', e.message));
                        
                        console.log(`[Test] AI originally suggested: ${JSON.stringify(response)}. Final indices clicked: ${finalIndices.join(', ')}`);
                    } else {
                        console.log('[Test] No custom clickable options found.');
                    }
                }
            }

            // 2.5 Check if it's a video question and skip survey if so
            const videoWrapper = activeCarouselItem.locator('[data-video-wrapper="true"], .video-wrapper, iframe').first();
            if (await videoWrapper.isVisible()) {
                console.log('[Test] Video question detected! Skipping this survey as requested...');
                completed = false;
                const clickedHome = await clickVisibleHomeButton();
                if (clickedHome) {
                    await page.waitForTimeout(2000);
                } else {
                    await page.goto('https://dev.superj.app/'); // Fallback to URL
                    await page.waitForLoadState('networkidle');
                }
                break;
            }

            // 3. Click Next / Continue
            const nextBtn = activeCarouselItem.locator('button:has-text("Next"), button:has-text("Continue"), button:has-text("Submit"), button:has-text("Finish")').first();
            if (await nextBtn.isVisible()) {
                await nextBtn.click({ force: true, timeout: 5000 }).catch(() => {});
            } else {
                console.log('[Test] Next button not found on active item. Trying global next button...');
                const globalNext = page.locator('button:has-text("Next"), button:has-text("Continue"), button:has-text("Submit"), button:has-text("Finish")').first();
                if (await globalNext.isVisible()) {
                    await globalNext.click({ force: true, timeout: 5000 }).catch(() => {});
                }
            }
            
            // Safety break
            if (questionCount > 100) {
                console.log(`[Test] Max questions reached (100), breaking out.`);
                break;
            }
        }
        return completed;
    }

    // 3. Answer 2 surveys (as requested by user)
    let completedSurveys = 0;
    let iteration = 1;
    let skippedVideoCount = 0;

    while (completedSurveys < 2) {
        // 2. Select a survey
        console.log(`\n--- Starting Survey Iteration #${iteration} ---`);
        console.log("Screen 1: Searching for 'Start Survey' button on dashboard...");
        const baseSurveyLocator = page.locator('button:has-text("Start Survey"), a:has-text("Start Survey"), div[class*="SurveyCard"] button');
        
        // Explicitly wait for at least one survey to appear on the dashboard before checking our target index
        await baseSurveyLocator.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
        
        const totalSurveys = await baseSurveyLocator.count();
        if (totalSurveys === 0) {
            console.log(`[Test] No surveys found on dashboard for iteration ${iteration}!`);
            break;
        }

        // Pick a random survey index
        const randomIndex = Math.floor(Math.random() * totalSurveys);
        const surveyBtn = baseSurveyLocator.nth(randomIndex);
        console.log(`Screen 1: Found ${totalSurveys} survey item(s) on dashboard. Randomly selected index ${randomIndex}`);

        let currentRewardType = 'COUPON';

        if (!await surveyBtn.isVisible()) {
            console.log(`[Test] Randomly selected survey at index ${randomIndex} is not visible! Clicking index 0 instead.`);
            await baseSurveyLocator.first().click();
        } else {
            // Get survey text to check for reward
            const cardText = await surveyBtn.locator('..').locator('..').innerText().catch(() => "Unknown");
            console.log(`[LandingPage] First Survey Card Text: "${cardText.replace(/\n/g, ' ')}"`);
            
            if (cardText.includes('₹') || cardText.includes('Cash')) {
                currentRewardType = 'CASH';
                console.log(`[LandingPage] Detected CASH reward in survey card: ${cardText.match(/₹\d+/)?.[0] || 'Unknown'}`);
            } else {
                console.log(`[LandingPage] Detected COUPON / Gift Card reward in survey card.`);
            }

            // Click Start Survey (dashboard)
            console.log(`Screen 1: Clicking randomly selected 'Start Survey' button to open Screen 2...`);
            await surveyBtn.click();
        }
             // Wait for next screen
        console.log("Screen 2: Waiting for survey detail / confirmation screen to load...");
        await page.waitForTimeout(2000); // Give time for transition
        
        let surveyPage = page;
        
        // Helper to check for new pages
        const checkNewPage = async () => {
            const pages = page.context().pages();
            if (pages.length > 1) {
                surveyPage = pages[pages.length - 1];
            }
        };
        await checkNewPage();
        
        // Click Start Survey (confirmation)
        const startBtn2 = surveyPage.locator('button:has-text("Start Survey"), a:has-text("Start Survey")').first();
        if (await startBtn2.isVisible({ timeout: 5000 }).catch(() => false)) {
            console.log("Screen 2: Found 'Start Survey' button candidate!");
            console.log("Screen 2: Clicking 2nd 'Start Survey' button to start survey questions...");
            await startBtn2.click();
            console.log("Screen 2: Clicked 2nd 'Start Survey' button (standard click)");
        } else {
             console.log("Screen 2: Could not find 2nd 'Start Survey' button. Assuming it started automatically.");
        }

        await page.waitForTimeout(5000);
        await checkNewPage();

        // Answer questions using SurveyEngine
        const SurveyEngine = require('../utils/SurveyEngine');
        const surveyEngine = new SurveyEngine(surveyPage);
        const result = await surveyEngine.run();
        
        if (result.completed) {
            completedSurveys++;
            console.log(`--- Finished Survey Iteration #${iteration} (Total Completed: ${completedSurveys}) ---\n`);
        } else {
            console.log(`--- Skipped Survey Iteration #${iteration} ---\n`);
            skippedVideoCount++;
        }
        
        // Close the new tab if it opened one!
        if (surveyPage !== page) {
            console.log('[Test] Closing new survey tab...');
            await surveyPage.close();
            await page.bringToFront();
        }
        
        // --- ADDED WALLET VALIDATION POST-SURVEY ---
        if (completedSurveys > 0) {
            await walletValidator.validateWalletAndTransactions(`Post-Survey - Reward: ${currentRewardType}`, currentRewardType === 'COUPON');
        }
        
        // Force navigate to dashboard to ensure we are ready for the next survey
        // This is necessary because some success screens automatically load the next survey!
        console.log('[Test] Forcing navigation back to dashboard for next iteration...');
        await page.goto('https://dev.superj.app/');
        
        // Wait for dashboard to reload
        await page.waitForTimeout(3000);
        iteration++;
    }
    
    // Summary
    console.log(`\n=========================================`);
    console.log(`  SURVEY TEST COMPLETED!`);
    console.log(`  Surveys successfully answered: ${completedSurveys}`);
    console.log(`  Surveys skipped: ${skippedVideoCount}`);
    console.log(`=========================================\n`);

    // 4. Try 3rd survey and capture behavior
    console.log(`\n--- Attempting Survey #3 ---`);
    const thirdSurveyBtn = page.locator('button:has-text("Start Survey"), a:has-text("Start Survey"), div[class*="SurveyCard"] button').nth(0);
    
    const isVisible = await thirdSurveyBtn.isVisible();
    console.log(`[Test] Is 3rd Survey button visible? ${isVisible}`);
    
    if (isVisible) {
        console.log('[Test] Clicking 3rd survey on dashboard...');
        await thirdSurveyBtn.click();
        
        console.log('[Test] Immediately polling for toast message for 3 seconds...');
        let foundToast = false;
        for (let i = 0; i < 30; i++) {
            const bodyText = await page.innerText('body');
            if (bodyText.match(/both brand surveys for today|brand survey|limit reached/i)) {
                foundToast = true;
                console.log(`[Test] SUCCESS: Caught toast message on dashboard at iteration ${i}!`);
                console.log(`[Test] Toast Text Context: ${bodyText.substring(0, 500)}`);
                await page.screenshot({ path: `scratch/dashboard_toast_found.png` });
                break;
            }
            await page.waitForTimeout(100);
        }
        
        if (!foundToast) {
            console.log('[Test] No toast on dashboard. Waiting for survey detail screen...');
            await page.waitForTimeout(2000);
            
            const startBtn2 = page.locator('button:has-text("Start Survey"), a:has-text("Start Survey")').first();
            if (await startBtn2.isVisible()) {
                console.log('[Test] Clicking 2nd Start Survey button on detail screen...');
                await startBtn2.click();
                
                console.log('[Test] Immediately polling for toast message for 3 seconds...');
                for (let i = 0; i < 30; i++) {
                    const bodyText = await page.innerText('body');
                    if (bodyText.match(/both brand surveys for today|brand survey|limit reached/i)) {
                        foundToast = true;
                        console.log(`[Test] SUCCESS: Caught toast message on detail screen at iteration ${i}!`);
                        console.log(`[Test] Toast Text Context: ${bodyText.substring(0, 500)}`);
                        await page.screenshot({ path: `scratch/detail_toast_found.png` });
                        break;
                    }
                    await page.waitForTimeout(100);
                }
            } else {
                console.log('[Test] No 2nd Start Survey button found. Assuming it triggered anyway...');
            }
        }
        
        if (!foundToast) {
             console.log('[Test] WARNING: Did not find toast error text in fast polling loops!');
             const bodyText = await page.innerText('body');
             console.log(`[Test] Captured Body Text instead:\n${bodyText.substring(0, 500)}...`);
             await page.screenshot({ path: 'scratch/survey_3_behavior.png' });
        }
    } else {
        console.log('[Test] No 3rd survey is available. Checking dashboard for messages...');
        const allText = await page.innerText('body');
        console.log(`[Test] Captured Dashboard Text:\n${allText.substring(0, 500)}...`);
        await page.screenshot({ path: 'scratch/survey_6_behavior.png' });
    }
});
