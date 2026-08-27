const { test, expect } = require('@playwright/test');
const HerculesSurveyGenerator = require('../pages/hercules/HerculesSurveyGenerator');
const { setupMailosaurAccount } = require('./utils/MailosaurSetup');
const fs = require('fs');
const path = require('path');

test.use({ storageState: { cookies: [], origins: [] } });

test('Create survey, Star, Unstar, Delete from 3-dot menu, and verify deletion in All Campaigns', async ({ browser }) => {
    test.setTimeout(1800000); // 30 minutes timeout for full AI chat & sidebar operations

    console.log('\n======================================================');
    console.log(' STEP 1: SETUP MAILOSAUR ACCOUNT & LOGIN TO HERCULES ');
    console.log('======================================================');
    const { page } = await setupMailosaurAccount(browser);

    console.log('\n======================================================');
    console.log(' STEP 2: CREATE A NEW SURVEY VIA AI CHAT             ');
    console.log('======================================================');
    if (!page.url().includes('/ai')) {
        console.log(`Current page URL is ${page.url()}. Navigating to https://dev.hercules.works/ai...`);
        await page.goto('https://dev.hercules.works/ai', { waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.waitForTimeout(4000);
    }

    const textarea = page.locator("textarea[aria-label='Ask Hercules a question'], [class='w-full pb-[36.821px] pl-[24px] pr-[24.547px] pt-[24px] sm:h-[93px]'] textarea, [class='w-full pb-[36.821px] pl-[24px] pr-[24.547px] pt-[24px] sm:h-[93px]'] input, textarea").first();
    
    try {
        await textarea.waitFor({ state: 'visible', timeout: 15000 });
        console.log('[Setup] Hercules chat input loaded.');
    } catch (e) {
        console.log('[Setup] Clearing profile onboarding screens...');
        for (let i = 0; i < 15; i++) {
            if (await textarea.isVisible().catch(() => false)) break;
            const fullNameInput = page.getByPlaceholder(/Full name/i).or(page.locator("input[placeholder*='name' i]")).first();
            if (await fullNameInput.isVisible().catch(() => false)) {
                await fullNameInput.fill('Test Researcher').catch(() => {});
                await page.keyboard.press('Enter').catch(() => {});
            }
            const nextBtn = page.locator('button:has-text("Continue"), button:has-text("Next"), button:has-text("Submit"), button:has-text("Finish")').first();
            if (await nextBtn.isVisible().catch(() => false)) await nextBtn.click({ timeout: 2000 }).catch(() => {});
            await page.waitForTimeout(1000);
        }
        await textarea.waitFor({ state: 'visible', timeout: 30000 });
    }

    const targetSurveyTitle = "Star Unstar Delete Test Survey";
    const promptText = `Create a 3-question survey titled "${targetSurveyTitle}" about coffee preferences.`;
    console.log(`Submitting prompt: "${promptText}"`);
    await textarea.fill(promptText);

    const submitBtn = page.locator('button[aria-label="submit button"]').or(page.getByRole('button', { name: 'Send' })).or(page.locator('button[type="submit"]')).first();
    if (await submitBtn.isVisible().catch(() => false)) {
        await submitBtn.click({ force: true });
    } else {
        await textarea.press('Enter');
    }

    const surveyGenerator = new HerculesSurveyGenerator(page);
    const questionnaireGenerateBtn = page.locator("button").filter({ hasText: /^Generate$|^Generate Survey$|^Generate Brief$|Generate/i }).first();
    
    let loopCount = 0;
    while (loopCount < 35) {
        await page.waitForTimeout(2000);
        loopCount++;

        if (await questionnaireGenerateBtn.isVisible().catch(() => false)) {
            console.log('Found questionnaire Generate button! NOT clicking it (proceeding to sidebar)...');
            await page.waitForTimeout(2000);
            break;
        }
        if (await page.locator("//button[@aria-label='Open sidebar']").isVisible().catch(() => false) && loopCount > 12) {
            console.log('Sidebar toggle button is visible. Proceeding to sidebar steps...');
            break;
        }
        if (await surveyGenerator.handleSelectAndRunItThisWay().catch(() => false)) continue;
        if (await surveyGenerator.selectAllThatApplyHeader.count() > 0 && await surveyGenerator.selectAllThatApplyHeader.first().isVisible()) {
            if (await surveyGenerator.handleSelectAllThatApply()) continue;
        }
        if (await surveyGenerator.handleSingleSelect()) continue;
        if (await surveyGenerator.handleTextInputFallback()) continue;
        if (await surveyGenerator.clickSkip()) continue;
    }

    console.log('Questionnaire complete! Waiting 5 seconds before opening sidebar...');
    await page.waitForTimeout(5000);

    console.log('\n======================================================');
    console.log(' STEP 3: OPEN SIDEBAR                                ');
    console.log('======================================================');
    const openSidebarBtn = page.locator("//button[@aria-label='Open sidebar']").or(page.getByRole('button', { name: 'Open sidebar' })).first();
    const closeSidebarBtn = page.locator("//button[@aria-label='Close sidebar']").or(page.getByRole('button', { name: 'Close sidebar' })).first();
    
    if (!(await closeSidebarBtn.isVisible().catch(() => false))) {
        console.log('Clicking //button[@aria-label=\'Open sidebar\']...');
        await openSidebarBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(2000);
    } else {
        console.log('Sidebar is already open.');
        await page.waitForTimeout(2000);
    }

    const scratchDir = path.join(process.cwd(), 'scratch');
    if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

    const userItemLocator = page.locator("[class*='relative z-10 w-[173px]']").first();
    const userItemContainer = page.locator("a[href*='/ai/chat/']").filter({ hasNotText: 'All Campaigns' }).filter({ hasNot: page.locator("[href*='campaign-history']") }).first();
    const user3DotLocator = userItemContainer.locator("[class*='dots']").or(page.locator(".dots")).first();

    console.log('\n======================================================');
    console.log(' STEP 4: STAR THE SURVEY                             ');
    console.log('======================================================');
    await userItemLocator.waitFor({ state: 'visible', timeout: 30000 });
    
    await page.waitForTimeout(1000);
    console.log('Mousehover on item container [class=\'relative z-10 w-[173px] shrink-0...\']...');
    await userItemContainer.hover().catch(() => {});
    await userItemLocator.hover().catch(() => {});
    await page.waitForTimeout(1000);

    console.log('Clicking 3-dot button...');
    await user3DotLocator.click({ force: true });
    await page.waitForTimeout(1000);

    const starBtn = page.locator("//button[text()='Star']").or(page.getByRole('menuitem', { name: 'Star' })).or(page.locator("//*[contains(text(), 'Star')]")).first();
    console.log('Clicking //button[text()=\'Star\']...');
    await starBtn.click({ force: true });
    await page.waitForTimeout(2000);
    console.log('Survey STARRED!');
    await page.screenshot({ path: path.join(scratchDir, 'step4_star.png'), fullPage: true });

    console.log('\n======================================================');
    console.log(' STEP 5: UNSTAR THE SURVEY                           ');
    console.log('======================================================');
    await page.waitForTimeout(1000);
    console.log('Mousehover before 3-dot for Unstar...');
    await userItemContainer.hover().catch(() => {});
    await userItemLocator.hover().catch(() => {});
    await page.waitForTimeout(1000);

    console.log('Clicking 3-dot button for Unstar...');
    await user3DotLocator.click({ force: true });
    await page.waitForTimeout(1000);

    const unstarBtn = page.locator("//button[text()='Unstar']").or(page.getByRole('menuitem', { name: 'Unstar' })).or(page.locator("//*[contains(text(), 'Unstar')]")).first();
    console.log('Clicking //button[text()=\'Unstar\']...');
    await unstarBtn.click({ force: true });
    await page.waitForTimeout(2000);
    console.log('Survey UNSTARRED!');
    await page.screenshot({ path: path.join(scratchDir, 'step5_unstar.png'), fullPage: true });

    console.log('\n======================================================');
    console.log(' STEP 6: RENAME THE SURVEY TO "Good"                 ');
    console.log('======================================================');
    await page.waitForTimeout(1000);
    console.log('Mousehover before 3-dot for Rename...');
    await userItemContainer.hover().catch(() => {});
    await userItemLocator.hover().catch(() => {});
    await page.waitForTimeout(1000);

    console.log('Clicking 3-dot button for Rename...');
    await user3DotLocator.click({ force: true });
    await page.waitForTimeout(1000);

    const renameBtn = page.locator("//button[text()='Rename']").or(page.getByRole('menuitem', { name: 'Rename' })).or(page.locator("//*[contains(text(), 'Rename')]")).first();
    console.log('Clicking //button[text()=\'Rename\']...');
    await renameBtn.click({ force: true });
    await page.waitForTimeout(1000);

    const chatNameInput = page.locator("input[placeholder='Chat name']")
        .or(page.getByRole('textbox', { name: 'Chat name' }))
        .or(page.locator("input[placeholder*='name' i]"))
        .or(page.locator("div[role='dialog'] input"))
        .or(page.locator("input[type='text']"))
        .first();
    console.log('Clicking input[placeholder=\'Chat name\']...');
    await chatNameInput.waitFor({ state: 'visible', timeout: 10000 });
    await chatNameInput.click();
    await chatNameInput.fill('Good');
    await page.waitForTimeout(1000);

    const saveBtn = page.locator("//button[text()='Save']").or(page.getByRole('button', { name: 'Save' })).first();
    console.log('Clicking //button[text()=\'Save\']...');
    await saveBtn.click({ force: true });
    await page.waitForTimeout(3000);
    console.log('Survey renamed to "Good" successfully!');
    await page.screenshot({ path: path.join(scratchDir, 'step6_rename.png'), fullPage: true });

    console.log('\n======================================================');
    console.log(' STEP 7: DELETE THE RENAMED SURVEY "Good"            ');
    console.log('======================================================');
    const goodLink = page.getByRole('link', { name: 'Good' }).or(page.locator("a:has-text('Good')")).first();
    await goodLink.waitFor({ state: 'visible', timeout: 15000 });

    await page.waitForTimeout(1000);
    console.log('Mousehover before 3-dot for Delete...');
    await goodLink.hover().catch(() => {});
    await page.waitForTimeout(1000);

    console.log('Clicking 3-dot button on "Good" campaign link...');
    const goodMenuBtn = goodLink.locator("..").locator("[class*='dots']").or(page.locator(".dots")).first();
    await goodMenuBtn.click({ force: true });
    await page.waitForTimeout(1000);

    const deleteMenuItem = page.locator("//button[text()='Delete']").or(page.getByRole('menuitem', { name: 'Delete' })).or(page.locator("//*[contains(text(), 'Delete')]")).first();
    console.log('Clicking //button[text()=\'Delete\']...');
    await deleteMenuItem.click({ force: true });
    await page.waitForTimeout(1000);

    console.log('Clicking confirmation modal button "Delete"...');
    const confirmDeleteBtn = page.getByRole('button', { name: 'Delete' }).last();
    await confirmDeleteBtn.waitFor({ state: 'visible', timeout: 10000 });
    await confirmDeleteBtn.click({ force: true });
    await page.waitForTimeout(4000);
    console.log('Survey "Good" deleted successfully!');
    await page.screenshot({ path: path.join(scratchDir, 'step7_delete.png'), fullPage: true });

    console.log('\n======================================================');
    console.log(' STEP 8: OBSERVE & LOG RESULTS AFTER DELETION         ');
    console.log('======================================================');
    const postDeleteUrl = page.url();
    console.log(`Current Page URL after deletion: ${postDeleteUrl}`);

    // Check sidebar visibility of "Good"
    const isGoodInSidebar = await page.getByRole('link', { name: 'Good' }).isVisible().catch(() => false);
    console.log(`Is "Good" link visible in Sidebar after deletion?: ${isGoodInSidebar}`);

    // Check All Campaigns page
    const allCampaignsLink = page.getByRole('link', { name: 'All Campaigns' }).or(page.locator("a[href*='campaign-history']")).first();
    if (await allCampaignsLink.isVisible().catch(() => false)) {
        console.log('Navigating to All Campaigns page...');
        await allCampaignsLink.click({ force: true });
        await page.waitForURL('**/campaign-history**', { timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(3000);
    }

    const isGoodInAllCampaigns = await page.locator("text='Good'").first().isVisible().catch(() => false);
    console.log(`Is "Good" campaign visible on All Campaigns page?: ${isGoodInAllCampaigns}`);

    console.log('Reloading All Campaigns page to double-check persistence...');
    await page.reload();
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(3000);

    const isGoodAfterReload = await page.locator("text='Good'").first().isVisible().catch(() => false);
    console.log(`Is "Good" campaign visible after Reload?: ${isGoodAfterReload}`);

    await page.screenshot({ path: path.join(scratchDir, 'step8_all_campaigns.png'), fullPage: true });

    const obsSummary = `# Post-Deletion Observation Results\n\n- Post Delete URL: ${postDeleteUrl}\n- Visible in Sidebar: ${isGoodInSidebar ? "YES (Fail)" : "NO (Cleanly Removed)"}\n- Visible in All Campaigns: ${isGoodInAllCampaigns ? "YES (Present)" : "NO (Cleanly Removed)"}\n- Visible after Reload: ${isGoodAfterReload ? "YES (Persisted)" : "NO (Permanently Deleted)"}\n- Timestamp: ${new Date().toISOString()}\n`;
    fs.writeFileSync(path.join(scratchDir, 'star_unstar_rename_delete_result.md'), obsSummary);
    console.log(`Saved observation results to: scratch/star_unstar_rename_delete_result.md`);

    expect(isGoodInSidebar).toBe(false);
    expect(isGoodAfterReload).toBe(false);

    console.log('\n======================================================');
    console.log(' ALL STEPS COMPLETE & DELETION OBSERVED SUCCESSFULLY! ');
    console.log('======================================================\n');
});
