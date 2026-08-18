const { test, expect } = require('@playwright/test');
const fs = require('fs');
const HerculesSurveyGenerator = require('../pages/hercules/HerculesSurveyGenerator');

test.use({ storageState: '.auth/google-user.json' });

const results = {};

async function extractLocators(page, screenName) {
    console.log(`Extracting locators for screen: ${screenName}`);
    await page.waitForTimeout(2000); // Wait for UI to settle

    const data = await page.evaluate(() => {
        const getLocator = (el) => {
            if (el.getAttribute('data-testid')) return `[data-testid="${el.getAttribute('data-testid')}"]`;
            if (el.getAttribute('aria-label')) return `${el.tagName.toLowerCase()}[aria-label="${el.getAttribute('aria-label')}"]`;
            if (el.getAttribute('placeholder')) return `[placeholder="${el.getAttribute('placeholder')}"]`;
            
            const text = (el.innerText || '').trim();
            // Clean up text for locator to prevent newlines breaking the selector
            const cleanText = text.replace(/\n/g, ' ').substring(0, 30).trim();
            
            if (cleanText && el.tagName !== 'DIV' && el.tagName !== 'SPAN') {
                return `${el.tagName.toLowerCase()}:has-text("${cleanText}")`;
            }
            
            if (el.className && typeof el.className === 'string') {
                // Take only the first two classes to avoid overly brittle selectors
                const classes = el.className.split(' ').filter(c => c && !c.includes(':')).slice(0, 2).join('.');
                if (classes) return `${el.tagName.toLowerCase()}.${classes}`;
            }
            
            return el.tagName.toLowerCase();
        };

        const elements = Array.from(document.querySelectorAll('button, a, input, textarea, select, h1, h2, h3, [role="dialog"]'));
        
        return elements.map(el => {
            const textContent = (el.innerText || el.getAttribute('placeholder') || el.getAttribute('aria-label') || '').trim().replace(/\n/g, ' ').substring(0, 50);
            return {
                type: el.tagName.toLowerCase(),
                text: textContent,
                suggestedLocator: getLocator(el)
            };
        }).filter(item => item.suggestedLocator && item.suggestedLocator !== item.type); // filter out empty/generic ones
    });

    // Deduplicate
    const unique = [...new Set(data.map(d => JSON.stringify(d)))].map(s => JSON.parse(s));
    results[screenName] = unique;
    
    // Save incrementally
    fs.writeFileSync('/Users/karthiku/.gemini/antigravity/brain/96bf4951-2c59-4b13-b581-1bddbd78665c/scratch/extracted_locators.json', JSON.stringify(results, null, 2));
    console.log(`Saved ${unique.length} locators for ${screenName}`);
}

test('Locator Crawler - Dashboard & Survey Generation', async ({ page }) => {
    test.setTimeout(1800000); // 30 minutes for the full flow and backend wait

    const surveyGenerator = new HerculesSurveyGenerator(page);

    console.log('Navigating to Dashboard...');
    await page.goto('https://dev.hercules.works/ai');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // 1. Dashboard
    await extractLocators(page, 'Main_Dashboard');

    // Start Survey Creation
    console.log('Initiating Survey Creation...');
    // The textarea might not be uniquely 'textarea'. Let's look for the one with the placeholder or any visible textarea.
    const textarea = page.locator('textarea[aria-label="Ask Hercules a question"]');
    try {
        await textarea.waitFor({ state: 'visible', timeout: 15000 });
        await textarea.fill('Automated locator extraction survey testing');
        await page.locator('button[aria-label="submit button"]').click();
        await page.waitForTimeout(5000); // Wait for chat to initialize
    } catch (e) {
        console.log('Could not find generic textarea. Taking screenshot and attempting to click a pill instead...');
        await page.screenshot({ path: '/Users/karthiku/.gemini/antigravity/brain/96bf4951-2c59-4b13-b581-1bddbd78665c/scratch/crawler_dashboard_error.png' });
        
        // Try clicking a Quick Start pill to start a chat
        const pillBtn = page.locator('button:has-text("New Idea Testing")').first();
        if (await pillBtn.isVisible()) {
            await pillBtn.click();
            await page.waitForTimeout(2000);
            await page.locator('button[aria-label="submit button"]').click(); // click send
            await page.waitForTimeout(5000);
        }
    }

    // 2. Questionnaire Loop Extraction
    let loopCount = 0;
    let briefGenerated = false;
    let consecutiveNoAction = 0;
    let questionScreensFound = 0;

    console.log('Entering Questionnaire Loop for Extraction... Will wait up to 30 mins');
    while (loopCount < 360 && !briefGenerated) { // 360 * 5s = 1800 seconds (30 mins)
        await page.waitForTimeout(5000);
        loopCount++;

        // Check for confirmation screen before generating brief
        if (await surveyGenerator.generateBriefBtn.count() > 0 && await surveyGenerator.generateBriefBtn.first().isVisible()) {
            await extractLocators(page, 'Survey_Confirmation_Generate_Screen');
            await surveyGenerator.clickGenerateBrief();
            briefGenerated = true;
            break;
        }

        if (await surveyGenerator.selectAllThatApplyHeader.count() > 0 && await surveyGenerator.selectAllThatApplyHeader.first().isVisible()) {
            await extractLocators(page, `Survey_MultiSelect_Question_${questionScreensFound}`);
            questionScreensFound++;
            if (await surveyGenerator.handleSelectAllThatApply()) {
                consecutiveNoAction = 0;
                continue;
            }
        }

        // We temporarily override the handle methods in the generator so we can extract before action
        const singleSelectBtns = page.locator('.flex.flex-col.gap-\\[10px\\].mt-4 > button');
        if (await singleSelectBtns.count() > 0 && await singleSelectBtns.first().isVisible()) {
            await extractLocators(page, `Survey_SingleSelect_Question_${questionScreensFound}`);
            questionScreensFound++;
            if (await surveyGenerator.handleSingleSelect()) {
                consecutiveNoAction = 0;
                continue;
            }
        }

        const textInput = page.locator('textarea[placeholder*="Type your answer"]');
        if (await textInput.count() > 0 && await textInput.first().isVisible()) {
            await extractLocators(page, `Survey_TextInput_Question_${questionScreensFound}`);
            questionScreensFound++;
            if (await surveyGenerator.handleTextInputFallback()) {
                consecutiveNoAction = 0;
                continue;
            }
        }

        if (await surveyGenerator.clickSkip()) {
            consecutiveNoAction = 0;
            continue;
        }

        consecutiveNoAction++;
    }

    console.log('Brief generation triggered. Extracting Loading Screen locators...');
    await extractLocators(page, 'Survey_Generation_Loading_Screen');
    
    // Now wait for generation to finish! Up to 30 mins
    console.log('Waiting for brief generation to finish (up to 30 mins)...');
    try {
        await surveyGenerator.editAudienceWaitBtn.waitFor({ state: 'visible', timeout: 1800000 });
        console.log('Brief generated! Extracting Edit Audience screen locators...');
        await extractLocators(page, 'Survey_Generated_Success_Screen');
    } catch(e) {
        console.log('Generation timed out or failed.', e);
    }

    console.log('Extraction complete! Writing to file...');
    fs.writeFileSync('/Users/karthiku/.gemini/antigravity/brain/96bf4951-2c59-4b13-b581-1bddbd78665c/scratch/extracted_locators.json', JSON.stringify(results, null, 2));
    console.log('Successfully saved to extracted_locators.json');
});
