const { test, expect } = require('@playwright/test');
const { setupMailosaurAccount } = require('./utils/MailosaurSetup');
const path = require('path');
const fs = require('fs');

test.use({ storageState: { cookies: [], origins: [] } });

test('Hercules - H Icon Modal Actions: Rename Chat, Plan Div Pricing Redirect, & Delete Chat', async ({ browser }) => {
    test.setTimeout(300000); // 5 minutes

    const scratchDir = path.join(process.cwd(), 'scratch');
    if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

    console.log('\n======================================================');
    console.log(' STEP 1: SETUP FRESH MAILOSAUR & HERCULES ACCOUNT     ');
    console.log('======================================================');
    const { page } = await setupMailosaurAccount(browser);

    console.log('\n======================================================');
    console.log(' STEP 2: ENTER PROMPT & GENERATE QUESTIONNAIRE        ');
    console.log('======================================================');
    const promptInput = page.locator("textarea[placeholder*='prompt' i], textarea, input[placeholder*='Ask' i]").first();
    await promptInput.waitFor({ state: 'visible', timeout: 20000 });
    await promptInput.click();
    await promptInput.fill("Create a comprehensive survey for a new eco-friendly product launch");
    await page.waitForTimeout(1000);

    console.log('Clicking Send / Generate Prompt button...');
    const sendPromptBtn = page.locator("button[type='submit'], button:has-text('Generate'), button:has-text('Send')").first();
    await sendPromptBtn.click({ force: true });
    
    console.log('Waiting 12 seconds for Questionnaire to appear...');
    await page.waitForTimeout(12000);

    const clickHIcon = async () => {
        console.log('[Hercules] Clicking H Icon: img[alt="hercules-logo"]...');
        const hIcon = page.locator("img[alt='hercules-logo']").first();
        await hIcon.waitFor({ state: 'visible', timeout: 20000 });
        await hIcon.click({ force: true });
        await page.waitForTimeout(2000);
    };

    // ------------------------------------------------------------------
    // STEP A: CLICK H ICON -> EDIT RENAME -> SAVE
    // ------------------------------------------------------------------
    console.log('\n======================================================');
    console.log(' STEP 3: CLICK H ICON -> RENAME CHAT -> SAVE          ');
    console.log('======================================================');
    await clickHIcon();

    console.log('Clicking "Edit" / "Rename" in modal...');
    const renameOption = page.locator("//button[text()='Rename']")
        .or(page.locator("button:has-text('Rename')"))
        .or(page.locator("button:has-text('Edit')"))
        .or(page.locator("text='Rename'"))
        .or(page.locator("text='Edit'"))
        .first();

    await renameOption.waitFor({ state: 'visible', timeout: 15000 });
    await renameOption.click({ force: true });
    await page.waitForTimeout(1500);

    console.log('Clicking input[placeholder="Chat name"]...');
    const chatNameInput = page.locator("input[placeholder='Chat name']").or(page.locator("input[placeholder*='Chat' i]")).first();
    await chatNameInput.waitFor({ state: 'visible', timeout: 10000 });
    await chatNameInput.click();
    await chatNameInput.fill('');
    await chatNameInput.fill('Renamed Eco Product Survey Chat');
    await page.waitForTimeout(1000);

    console.log('Clicking "Save" button...');
    const saveBtn = page.locator("//button[text()='Save']").or(page.locator("button:has-text('Save')")).first();
    await saveBtn.waitFor({ state: 'visible', timeout: 10000 });
    await saveBtn.click({ force: true });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: path.join(scratchDir, '1_chat_renamed_success.png'), fullPage: true });
    console.log('✅ Chat Renamed Successfully & Screenshot Saved!');

    // ------------------------------------------------------------------
    // STEP B: CLICK H ICON -> CLICK [alt='right-gray-icon.svg'] -> PRICING REDIRECT -> EXIT PRICING
    // ------------------------------------------------------------------
    console.log('\n======================================================');
    console.log(' STEP 4: CLICK H ICON -> RIGHT GRAY ICON -> PRICING -> EXIT ');
    console.log('======================================================');
    console.log('Clicking Hercules H Icon again...');
    await clickHIcon();

    console.log('Clicking Plan element [alt="right-gray-icon.svg"]...');
    const rightGrayIcon = page.locator("[alt='right-gray-icon.svg']")
        .or(page.locator("img[alt='right-gray-icon.svg']"))
        .or(page.locator("[class='flex justify-between w-full border-b border-b-[#E6E4E9] pt-[10px] pb-2']"))
        .first();

    await rightGrayIcon.waitFor({ state: 'visible', timeout: 10000 });
    await rightGrayIcon.click({ force: true });
    await page.waitForTimeout(4000);

    console.log('Checking Pricing page redirection...');
    const isPricingPage = page.url().includes('pricing') || (await page.locator("text=/Pricing|Starter|Pro/i").first().isVisible().catch(() => false));
    console.log(`Verified Pricing Page Redirection: ${isPricingPage}`);
    expect(isPricingPage).toBe(true);

    console.log('Clicking Exit / Close icon on Pricing screen using img[alt="cross icon"]...');
    const exitBtn = page.locator("img[alt='cross icon']")
        .or(page.locator("[alt='cross icon']"))
        .or(page.locator("button[aria-label*='close' i]"))
        .first();

    await exitBtn.waitFor({ state: 'visible', timeout: 10000 });
    await exitBtn.click({ force: true });

    console.log('Waiting 1 second...');
    await page.waitForTimeout(1000);

    await page.screenshot({ path: path.join(scratchDir, '2_pricing_exit_success.png'), fullPage: true });
    console.log('✅ Pricing Redirection & Exit Verified & Screenshot Saved!');

    // ------------------------------------------------------------------
    // STEP C: CLICK H ICON -> DUPLICATE CAMPAIGN -> CONFIRM DUPLICATE
    // ------------------------------------------------------------------
    console.log('\n======================================================');
    console.log(' STEP 5: CLICK H ICON -> DUPLICATE CAMPAIGN -> CONFIRM ');
    console.log('======================================================');
    console.log('Clicking Hercules H Icon for duplication...');
    await clickHIcon();

    console.log('Clicking "//p[text()=\'Duplicate Campaign\']" option in modal...');
    const duplicateOption = page.locator("//p[text()='Duplicate Campaign']")
        .or(page.locator("p:has-text('Duplicate Campaign')"))
        .or(page.locator("text='Duplicate Campaign'"))
        .first();

    await duplicateOption.waitFor({ state: 'visible', timeout: 15000 });
    await duplicateOption.click({ force: true });
    await page.waitForTimeout(1500);

    console.log('Clicking "//button[text()=\'Duplicate Campaign\']" in confirmation pop-up...');
    const confirmDuplicateBtn = page.locator("//button[text()='Duplicate Campaign']")
        .or(page.locator("button:has-text('Duplicate Campaign')"))
        .last();
    await confirmDuplicateBtn.waitFor({ state: 'visible', timeout: 10000 });
    await confirmDuplicateBtn.click({ force: true });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: path.join(scratchDir, '3_chat_duplicated_success.png'), fullPage: true });
    console.log('✅ Chat Duplicated Successfully & Screenshot Saved!');

    // ------------------------------------------------------------------
    // STEP D: CLICK H ICON -> DELETE CAMPAIGN -> CONFIRM DELETE
    // ------------------------------------------------------------------
    console.log('\n======================================================');
    console.log(' STEP 6: CLICK H ICON -> DELETE CAMPAIGN -> CONFIRM    ');
    console.log('======================================================');
    console.log('Clicking Hercules H Icon for deletion...');
    await clickHIcon();

    console.log('Clicking "Delete" / "Delete Campaign" option in modal...');
    const deleteOption = page.locator("text='Delete Campaign'")
        .or(page.locator("p:has-text('Delete')"))
        .or(page.locator("//button[text()='Delete']"))
        .or(page.locator("button:has-text('Delete')"))
        .or(page.locator("text='Delete'"))
        .first();

    await deleteOption.waitFor({ state: 'visible', timeout: 15000 });
    await deleteOption.click({ force: true });
    await page.waitForTimeout(1500);

    console.log('Clicking "Delete" in confirmation pop-up...');
    const confirmDeleteBtn = page.locator("//button[text()='Delete']")
        .or(page.locator("button:has-text('Delete')"))
        .or(page.locator("button:has-text('Confirm')"))
        .last();
    await confirmDeleteBtn.waitFor({ state: 'visible', timeout: 10000 });
    await confirmDeleteBtn.click({ force: true });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: path.join(scratchDir, '4_chat_deleted_success.png'), fullPage: true });
    console.log('✅ Chat Deleted Successfully & Screenshot Saved!');

    console.log('\n======================================================');
    console.log(' ALL H ICON CHAT ACTIONS COMPLETED SUCCESSFULLY!       ');
    console.log('======================================================\n');
});
