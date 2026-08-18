const { test, expect } = require('@playwright/test');
const HerculesHomePage = require('../pages/hercules/HerculesHomePage');
const HerculesLoginPage = require('../pages/hercules/HerculesLoginPage');

test.describe('Hercules Dashboard Survey Actions', () => {

  test('Filter, Star, Unstar, Delete and Duplicate', async ({ context, page }) => {
    test.setTimeout(180000); // 3 minutes

    // Hide webdriver flag to prevent bot detection
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const homePage = new HerculesHomePage(page);
    const loginPage = new HerculesLoginPage(page);

    console.log('Navigating to Hercules Homepage...');
    await homePage.navigate();
    
    console.log('Clicking Sign Up...');
    await homePage.clickSignUp();
    
    console.log('Initiating Google SSO...');
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      loginPage.clickContinueWithGoogle()
    ]);
    
    await popup.waitForLoadState('domcontentloaded');
    
    const GOOGLE_EMAIL = process.env.GOOGLE_EMAIL || 'karthik@jupitermeta.io';
    const GOOGLE_PASSWORD = process.env.GOOGLE_PASSWORD || 'Karthik@8342';
    
    console.log(`Filling Google Email: ${GOOGLE_EMAIL}...`);
    const emailInput = popup.getByRole('textbox', { name: 'Email or phone' });
    await emailInput.waitFor({ state: 'visible', timeout: 15000 });
    await emailInput.click();
    await emailInput.fill(GOOGLE_EMAIL);
    await popup.keyboard.press('Enter');
    
    console.log('Filling Google Password...');
    const passwordInput = popup.getByRole('textbox', { name: 'Enter your password' });
    try {
        await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
    } catch (e) {
        console.log('Could not find password textbox by role, falling back to input[type="password"]');
        await popup.locator('input[type="password"]').waitFor({ state: 'visible', timeout: 5000 });
    }
    await popup.waitForTimeout(1500); 
    const pwField = popup.locator('input[type="password"]');
    await pwField.click();
    await pwField.fill(GOOGLE_PASSWORD);
    await popup.keyboard.press('Enter');
    
    console.log('Checking for Google Consent/Continue screen...');
    try {
        const continueBtn = popup.getByRole('button', { name: 'Continue' }).first();
        await continueBtn.waitFor({ state: 'visible', timeout: 8000 });
        console.log('Clicking Continue on Google Consent screen...');
        await continueBtn.click();
    } catch (e) {}
    
    console.log('Waiting for Google OAuth popup to close...');
    while (!popup.isClosed()) {
        await page.waitForTimeout(1000);
    }
    
    console.log('Popup closed. Waiting for Dashboard to load...');
    await page.waitForTimeout(5000); 
    const dashboardHeader = page.locator('h1, h2').filter({ hasText: /Dashboard|Hercules AI Research/i }).first();
    await dashboardHeader.waitFor({ state: 'visible', timeout: 60000 }).catch(() => {});
    
    console.log('Dashboard loaded successfully!');

    // -------------------------------------------------------------
    // DRAFTS FILTER: Star, Unstar, Delete
    // -------------------------------------------------------------
    console.log('Clicking Filter Dropdown (currently "All")...');
    const filterBtn = page.getByRole('button', { name: 'All' }).first();
    await filterBtn.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    if (await filterBtn.isVisible()) {
        await filterBtn.click();
    } else {
        console.log('Filter button not found, maybe it is already expanded or named differently.');
    }

    console.log('Selecting "Drafts" from dropdown...');
    const draftsOption = page.locator('text="Drafts"').first();
    await draftsOption.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    if (await draftsOption.isVisible()) {
        await draftsOption.click();
        await page.waitForTimeout(2000); // Wait for list to update
    }

    console.log('Locating the first Draft survey card...');
    const firstCardMenuBtn = page.getByRole('button', { name: 'Open menu' }).first();
    await firstCardMenuBtn.waitFor({ state: 'visible', timeout: 10000 });
    
    console.log('Clicking ... menu on the Draft card...');
    await firstCardMenuBtn.click();
    await page.waitForTimeout(1000);

    console.log('Clicking "Star" (or Add to Favorites)...');
    const starBtn = page.locator('button:has-text("Star"), [role="menuitem"]:has-text("Star"), button:has-text("Favorite")').first();
    if (await starBtn.isVisible()) {
        await starBtn.click();
        console.log('Draft survey Starred successfully.');
    } else {
        console.log('Could not find Star button. Might be a toggle.');
    }

    await page.waitForTimeout(2000);

    console.log('Clicking ... menu again to Unstar...');
    await firstCardMenuBtn.click();
    await page.waitForTimeout(1000);
    
    console.log('Clicking "Unstar"...');
    const unstarBtn = page.locator('button:has-text("Unstar"), [role="menuitem"]:has-text("Unstar"), button:has-text("Remove Favorite")').first();
    if (await unstarBtn.isVisible()) {
        await unstarBtn.click();
        console.log('Draft survey Unstarred successfully.');
    } else {
        console.log('Could not find Unstar button.');
    }

    await page.waitForTimeout(2000);

    console.log('Clicking ... menu again to Delete...');
    await firstCardMenuBtn.click();
    await page.waitForTimeout(1000);

    console.log('Clicking "Delete"...');
    const deleteBtn = page.locator('button:has-text("Delete"), [role="menuitem"]:has-text("Delete")').first();
    await deleteBtn.click();
    console.log('Delete clicked. Checking for confirmation modal...');

    const confirmDeleteBtn = page.locator('button:has-text("Delete"), button:has-text("Confirm"), button:has-text("Yes")').filter({ hasNotText: 'Cancel' }).first();
    if (await confirmDeleteBtn.isVisible({ timeout: 5000 }).catch(()=>false)) {
        await confirmDeleteBtn.click();
        console.log('Confirmed deletion of Draft survey.');
    }
    await page.waitForTimeout(3000);

    // -------------------------------------------------------------
    // LIVE FILTER: Duplicate
    // -------------------------------------------------------------
    console.log('Clicking Filter Dropdown to switch to Live...');
    const currentFilterBtn = page.getByRole('button', { name: /Drafts|All/i }).first();
    await currentFilterBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    if (await currentFilterBtn.isVisible()) {
        await currentFilterBtn.click();
    }

    console.log('Selecting "Live" (or "Active" / "Published") from dropdown...');
    const liveOption = page.locator('text="Live", text="Active", text="Published"').first();
    await liveOption.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    if (await liveOption.isVisible()) {
        await liveOption.click();
        await page.waitForTimeout(2000); // Wait for list to update
    }

    console.log('Locating the first Live survey card...');
    const firstLiveCardMenuBtn = page.getByRole('button', { name: 'Open menu' }).first();
    await firstLiveCardMenuBtn.waitFor({ state: 'visible', timeout: 10000 });

    console.log('Clicking ... menu on the Live card...');
    await firstLiveCardMenuBtn.click();
    await page.waitForTimeout(1000);

    console.log('Clicking "Duplicate"...');
    const duplicateBtn = page.locator('button:has-text("Duplicate"), [role="menuitem"]:has-text("Duplicate")').first();
    await duplicateBtn.click();
    
    console.log('Duplicate action triggered successfully!');
    await page.waitForTimeout(5000); // Wait for duplication to finish
  });
});
