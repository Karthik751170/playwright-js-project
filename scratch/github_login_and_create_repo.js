const { chromium } = require('@playwright/test');

(async () => {
    console.log('Launching browser to log in to GitHub...');
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('Navigating to https://github.com/login...');
    await page.goto('https://github.com/login');

    await page.fill('#login_field', 'Karthik751170');
    await page.fill('#password', 'Karthik@8342');
    await page.click('input[type="submit"][name="commit"]');

    await page.waitForTimeout(4000);
    console.log(`Current Page URL after login: ${page.url()}`);

    console.log('Navigating to create new repository page: https://github.com/new...');
    await page.goto('https://github.com/new');
    await page.waitForTimeout(4000);

    // Take screenshot of github.com/new to inspect
    const inputs = page.locator('input');
    const inputCount = await inputs.count();
    console.log(`Found ${inputCount} input fields on github.com/new.`);

    // Find the text input for repo name
    let repoInput = page.locator('input[aria-label*="Repository name" i], input[name*="repository" i], input[id*="repo" i], input[placeholder*="name" i]').first();
    
    if (!(await repoInput.isVisible().catch(() => false))) {
        console.log('Trying fallback input locator...');
        repoInput = page.locator('input[type="text"]').first();
    }

    await repoInput.waitFor({ state: 'visible', timeout: 15000 });
    await repoInput.fill('playwright-js-project');
    console.log('Successfully filled repository name: playwright-js-project');

    await page.waitForTimeout(3000);

    // Look for Create repository button
    const createRepoBtn = page.locator('button:has-text("Create repository")')
        .or(page.locator('button:has-text("Create")'))
        .or(page.locator('input[type="submit"][value*="Create"]'))
        .first();

    if (await createRepoBtn.isVisible().catch(() => false)) {
        console.log('Clicking Create repository button...');
        await createRepoBtn.click({ force: true });
        await page.waitForTimeout(6000);
    }

    const createdUrl = page.url();
    console.log(`Final URL: ${createdUrl}`);

    // Create Personal Access Token or get HTTPS remote URL
    const repoRemoteUrl = `https://Karthik751170:Karthik%408342@github.com/Karthik751170/playwright-js-project.git`;
    console.log(`Target Remote URL: ${repoRemoteUrl}`);

    await browser.close();
})();
