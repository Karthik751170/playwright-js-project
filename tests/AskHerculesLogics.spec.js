const { test, expect } = require('@playwright/test');
const { setupMailosaurAccount } = require('./utils/MailosaurSetup');
const fs = require('fs');
const path = require('path');

test.use({ storageState: { cookies: [], origins: [] } });

test('Ask Hercules about all supported Survey Logics and understand each type', async ({ browser }) => {
    test.setTimeout(600000); // 10 minutes timeout

    console.log('\n--- STEP 1: SETUP ACCOUNT & NAVIGATE TO HERCULES ---');
    const { page } = await setupMailosaurAccount(browser);

    console.log('\n--- STEP 2: LOCATE HERCULES CHAT INPUT ---');
    const textarea = page.locator("textarea[aria-label='Ask Hercules a question'], [class='w-full pb-[36.821px] pl-[24px] pr-[24.547px] pt-[24px] sm:h-[93px]'] textarea, [class='w-full pb-[36.821px] pl-[24px] pr-[24.547px] pt-[24px] sm:h-[93px]'] input, textarea").first();
    
    try {
        await textarea.waitFor({ state: 'visible', timeout: 15000 });
        console.log('Hercules chat input box located successfully.');
    } catch (e) {
        console.log('Chat box not immediately visible. Clearing any onboarding screens...');
        for (let i = 0; i < 5; i++) {
            if (await textarea.isVisible()) break;
            await page.waitForTimeout(2000);
            const nextBtn = page.locator('button:has-text("Continue"), button:has-text("Next"), button:has-text("Submit"), button:has-text("Finish")').first();
            if (await nextBtn.isVisible()) await nextBtn.click({ timeout: 2000 }).catch(() => {});
        }
        await textarea.waitFor({ state: 'visible', timeout: 30000 });
    }

    console.log('\n--- STEP 3: ASK HERCULES ABOUT ALL SURVEY LOGIC TYPES ---');
    const questionPrompt = "What types of survey logics do you support in Hercules? Please explain all available types of survey logic (such as Skip Logic, Branching Logic, Display Logic, Termination/Disqualification Logic, Piping/Dynamic Logic, etc.), explain how each logic works point-by-point with clear examples, and explain when to add intermediate logics vs termination logic at the end.";
    
    console.log(`Sending Prompt:\n"${questionPrompt}"\n`);
    await textarea.fill(questionPrompt);

    const submitBtn = page.locator('button[aria-label="submit button"]').or(page.getByRole('button', { name: 'Send' })).or(page.locator('button[type="submit"]')).first();
    if (await submitBtn.isVisible().catch(() => false)) {
        await submitBtn.click({ force: true });
    } else {
        await textarea.press('Enter');
    }

    console.log('\n--- STEP 4: WAIT FOR HERCULES TO GENERATE COMPLETE RESPONSE ---');
    await page.waitForTimeout(10000);

    // Wait up to 3 minutes for response completion
    const aiResponseLocator = page.locator('main').or(page.locator('div:has(h1)').last()).or(page.locator('.prose'));
    
    let lastResponseText = "";
    for (let i = 0; i < 36; i++) { // 36 * 5s = 180s (3 minutes)
        await page.waitForTimeout(5000);
        const text = await aiResponseLocator.last().innerText().catch(() => "");
        if (text.length > 200 && text === lastResponseText) {
            console.log('Hercules response complete and stabilized!');
            break;
        }
        if (text.length > 200) {
            lastResponseText = text;
        }
    }

    console.log('\n=======================================================');
    console.log('       HERCULES SURVEY LOGICS EXPLANATION RESPONSE     ');
    console.log('=======================================================');
    console.log(lastResponseText);
    console.log('=======================================================\n');

    // Save to scratch file
    const scratchDir = path.join(process.cwd(), 'scratch');
    if (!fs.existsSync(scratchDir)) {
        fs.mkdirSync(scratchDir, { recursive: true });
    }
    const outputPath = path.join(scratchDir, 'hercules_logics_explained.md');
    fs.writeFileSync(outputPath, `# Hercules Survey Logics Breakdown\n\n${lastResponseText}`);
    console.log(`Saved Hercules explanation to: ${outputPath}`);

    expect(lastResponseText.length).toBeGreaterThan(50);
});
