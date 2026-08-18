const { test, expect } = require('@playwright/test');
const HerculesSurveyGenerator = require('../pages/hercules/HerculesSurveyGenerator');
const { setupMailosaurAccount } = require('./utils/MailosaurSetup');
const path = require('path');
const fs = require('fs');

test.use({ storageState: { cookies: [], origins: [] } });

test('Crawl and Fetch Exact Button Locators in Hercules Flow', async ({ browser }) => {
    test.setTimeout(1800000); // 30 minutes max

    const scratchDir = path.join(process.cwd(), 'scratch');
    if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

    console.log('\n======================================================');
    console.log(' STEP 1: SETUP FRESH HERCULES ACCOUNT                 ');
    console.log('======================================================');
    const { page } = await setupMailosaurAccount(browser);

    const textarea = page.locator("textarea[aria-label='Ask Hercules a question'], [class='w-full pb-[36.821px] pl-[24px] pr-[24.547px] pt-[24px] sm:h-[93px]'] textarea, [class='w-full pb-[36.821px] pl-[24px] pr-[24.547px] pt-[24px] sm:h-[93px]'] input").or(page.getByRole('textbox', { name: 'Describe the research you' })).first();
    await textarea.waitFor({ state: 'visible', timeout: 30000 });

    console.log('\nEntering prompt to create survey...');
    const SURVEY_PROMPTS = require('./utils/SurveyPrompts');
    const promptText = SURVEY_PROMPTS[Math.floor(Math.random() * SURVEY_PROMPTS.length)];
    console.log(`Prompt: "${promptText}"`);
    await textarea.fill(promptText);
    const submitBtn = page.locator('button[aria-label="submit button"]').or(page.getByRole('button', { name: 'Send' })).first();
    await submitBtn.click({ force: true });

    console.log('\n======================================================');
    console.log(' STEP 2: ANSWER QUESTIONNAIRE & CRAWL BUTTONS         ');
    console.log('======================================================');
    const surveyGenerator = new HerculesSurveyGenerator(page);
    const discoveredButtons = [];

    // Helper to log all visible action buttons
    async function dumpPageButtons(stageName) {
        const buttons = await page.evaluate((stage) => {
            const elements = Array.from(document.querySelectorAll('button, a, div[role="button"], [class*="button" i], p'));
            return elements
                .filter(el => el.innerText && el.innerText.trim().length > 0)
                .map(el => ({
                    stage,
                    tagName: el.tagName,
                    innerText: el.innerText.trim(),
                    className: el.className,
                    disabled: el.hasAttribute('disabled') || el.disabled === true,
                    outerHTML: el.outerHTML.substring(0, 300)
                }));
        }, stageName);

        console.log(`\n--- [CRAWLER: ${stageName.toUpperCase()}] DISCOVERED ${buttons.length} ELEMENTS ---`);
        for (const b of buttons) {
            if (/generate|brief|create|survey|target audience|share/i.test(b.innerText)) {
                console.log(`📌 MATCH: [${b.tagName}] "${b.innerText}" | Class: ${b.className} | Disabled: ${b.disabled}`);
                discoveredButtons.push(b);
            }
        }
        return buttons;
    }

    let loopCount = 0;
    let consecutiveFails = 0;
    while (loopCount < 90) {
        await page.waitForTimeout(2000);
        loopCount++;

        if (page.url().includes('editor')) {
            console.log('URL changed to editor! Survey created.');
            break;
        }

        await dumpPageButtons(`Questionnaire Loop ${loopCount}`);

        // Try clicking Yes generate research brief if visible
        const briefBtn = page.locator("button, div, p").filter({ hasText: /Yes, generate the research brief|Yes, generate brief|Generate Brief/i }).first();
        if (await briefBtn.isVisible().catch(() => false)) {
            console.log('🎯 [CRAWLER] FOUND BRIEF BUTTON! Extracting details...');
            const html = await briefBtn.evaluate(el => el.outerHTML).catch(() => '');
            console.log(`📌 BRIEF BUTTON HTML:\n${html}\n`);
            await briefBtn.scrollIntoViewIfNeeded().catch(() => {});
            await briefBtn.click({ force: true }).catch(() => {});
            console.log('Clicked brief button!');
            await page.waitForTimeout(4000);
            break;
        }

        if (await surveyGenerator.handleSelectAllThatApply()) { consecutiveFails = 0; continue; }
        if (await surveyGenerator.handleSingleSelect()) { consecutiveFails = 0; continue; }
        if (await surveyGenerator.handleTextInputFallback()) { consecutiveFails = 0; continue; }
        if (await surveyGenerator.clickSkip()) { consecutiveFails = 0; continue; }

        consecutiveFails++;
        if (consecutiveFails >= 6) {
            console.log('No questionnaire cards found, proceeding to brief & survey creation detection...');
            break;
        }
    }

    console.log('\n======================================================');
    console.log(' STEP 3: CRAWL RESEARCH BRIEF & CREATE SURVEY BUTTON ');
    console.log('======================================================');
    
    // Explicit check for Brief button if not clicked yet
    const briefBtn = page.locator("button, div, p, span, a").filter({ hasText: /Yes, generate the research brief|Yes, generate brief|Generate Brief/i }).first();
    if (await briefBtn.isVisible().catch(() => false)) {
        console.log('🎯 [CRAWLER] FOUND BRIEF BUTTON IN STEP 3!');
        const html = await briefBtn.evaluate(el => el.outerHTML).catch(() => '');
        console.log(`📌 BRIEF BUTTON HTML:\n${html}\n`);
        await briefBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(5000);
    }

    console.log('Monitoring page as Research Brief streams...');
    let createSurveyFound = false;
    for (let i = 0; i < 60; i++) {
        if (page.isClosed()) break;
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});

        const createSurveyBtn = page.locator("button, div, p, span, a").filter({ hasText: /Yes, create the survey|Create Survey/i }).first();
        if (await createSurveyBtn.isVisible().catch(() => false)) {
            console.log('🎯 [CRAWLER] FOUND CREATE SURVEY BUTTON!');
            const html = await createSurveyBtn.evaluate(el => el.outerHTML).catch(() => '');
            console.log(`📌 CREATE SURVEY BUTTON HTML:\n${html}\n`);
            
            await createSurveyBtn.scrollIntoViewIfNeeded().catch(() => {});
            await createSurveyBtn.click({ force: true }).catch(() => {});
            console.log('Clicked Create Survey button!');
            createSurveyFound = true;
            await page.waitForTimeout(5000);
            break;
        }

        await dumpPageButtons(`Brief Streaming ${i}`);
        await page.waitForTimeout(2000);
    }

    fs.writeFileSync(path.join(scratchDir, 'crawled_button_locators.json'), JSON.stringify(discoveredButtons, null, 2));
    console.log(`Saved ${discoveredButtons.length} button locators to scratch/crawled_button_locators.json`);

    console.log('Waiting for Survey Editor to load...');
    await page.waitForURL('**/editor/**', { timeout: 90000 }).catch(() => {});

    console.log('\n======================================================');
    console.log(' STEP 4: CRAWL SHARE BUTTON & SHARE OPTIONS           ');
    console.log('======================================================');
    const shareBtn = page.locator("button:has-text('Share')")
        .or(page.locator("button[aria-label*='share' i]"))
        .first();

    await shareBtn.waitFor({ state: 'visible', timeout: 60000 });
    console.log('Clicking Share button...');
    await shareBtn.click({ force: true });
    await page.waitForTimeout(3000);

    await dumpPageButtons('Share Menu Expanded');

    console.log('\n======================================================');
    console.log(' CRAWLING & LOCATOR EXTRACTION COMPLETED!            ');
    console.log('======================================================\n');
});
