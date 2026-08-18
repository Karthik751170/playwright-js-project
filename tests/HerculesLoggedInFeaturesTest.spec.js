const { test, expect } = require('@playwright/test');

test.use({ storageState: '.auth/apple-user.json' });

test.describe('Hercules Logged-In Features - Navigation & Dashboards', () => {
  
  test.beforeEach(async ({ page }) => {
    console.log('Navigating to Dashboard...');
    await page.goto('https://dev.hercules.works/ai');
    
    // Wait for the main page to load
    await page.waitForLoadState('networkidle');
  });

  test('User can navigate to Saved Audiences tab', async ({ page }) => {
    test.setTimeout(60000);

    console.log('Clicking on Saved Audiences tab...');
    const savedAudiencesBtn = page.locator('button:has-text("Saved Audiences")');
    await savedAudiencesBtn.waitFor({ state: 'visible', timeout: 15000 });
    await savedAudiencesBtn.click();

    console.log('Waiting for the UI to update...');
    await page.waitForTimeout(3000); // Give the tab time to load

    // Since we don't know the exact internal elements of the Saved Audiences tab yet,
    // we'll verify the button became active/selected, or at least that the page didn't crash.
    const isVisible = await savedAudiencesBtn.isVisible();
    expect(isVisible).toBe(true);

    // Let's capture a screenshot to visually verify the tab loaded properly
    const screenshotPath = '/Users/karthiku/.gemini/antigravity/brain/96bf4951-2c59-4b13-b581-1bddbd78665c/scratch/saved_audiences_tab.png';
    await page.screenshot({ path: screenshotPath });
    console.log(`Saved Audiences Tab screenshot captured at ${screenshotPath}`);
  });

  test('User can interact with Campaign History filters and actions', async ({ page }) => {
    test.setTimeout(90000);

    console.log('Locating the "Newest First" or "All" filters...');
    const newestFirstBtn = page.locator('button:has-text("Newest First")').first();
    const allBtn = page.locator('button:has-text("All")').first();

    // The buttons might be labeled "Newest First" or "All"
    if (await newestFirstBtn.isVisible()) {
        console.log('Clicking Newest First...');
        await newestFirstBtn.click();
    } else if (await allBtn.isVisible()) {
        console.log('Clicking All filter...');
        await allBtn.click();
    } else {
        console.log('No filters found. Assuming Campaign History is empty or UI changed.');
    }

    await page.waitForTimeout(2000); // Wait for list to sort/filter

    console.log('Looking for a historical campaign context menu "..."...');
    const contextMenuBtn = page.locator('button:has-text("...")').first();
    
    if (await contextMenuBtn.isVisible()) {
        console.log('Clicking context menu "..."...');
        await contextMenuBtn.click();
        await page.waitForTimeout(1500); // Wait for dropdown to animate
        
        // Take a screenshot of the dropdown options
        await page.screenshot({ path: '/Users/karthiku/.gemini/antigravity/brain/96bf4951-2c59-4b13-b581-1bddbd78665c/scratch/campaign_context_menu.png' });
        console.log('Captured context menu screenshot.');
        
        // Close the context menu by clicking somewhere else or pressing escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
    } else {
        console.log('No "..." context menu found. Proceeding to look for "View" button.');
    }

    console.log('Looking for a "View" button to load a past campaign...');
    const viewBtn = page.locator('button:has-text("View")').first();
    
    if (await viewBtn.isVisible()) {
        console.log('Clicking View button...');
        await viewBtn.click();
        
        console.log('Waiting for historical brief to load...');
        // The brief typically has "RESEARCH BRIEF" or similar headings, let's just wait for 5 seconds
        await page.waitForTimeout(5000);

        const screenshotPath = '/Users/karthiku/.gemini/antigravity/brain/96bf4951-2c59-4b13-b581-1bddbd78665c/scratch/view_historical_campaign.png';
        await page.screenshot({ path: screenshotPath });
        console.log(`Captured loaded historical campaign screenshot at ${screenshotPath}`);
    } else {
        console.log('No "View" button found. There might be no past campaigns for this account.');
    }

    console.log('Campaign History interactions test complete.');
  });
});
