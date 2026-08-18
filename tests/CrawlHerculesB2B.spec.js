const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const authFile = path.join(__dirname, '../.auth/google-karthik.json');
const storageState = fs.existsSync(authFile) ? authFile : undefined;

test.use({ 
  channel: 'chrome',
  storageState,
  launchOptions: {
    args: ['--disable-blink-features=AutomationControlled', '--disable-infobars', '--headless=new']
  }
});

test('Crawl Hercules B2B and Explore Sections', async ({ context, page }) => {
    test.setTimeout(600000); // 10 minutes max
    
    // Mask bot signals
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    console.log('Navigating to Hercules Homepage...');
    await page.goto('https://dev.hercules.works');
    await page.waitForLoadState('networkidle');

    // Check if we are already logged in (using stored storageState)
    const herculesPromptArea = page.getByRole('textbox', { name: 'Describe the research you' });
    let loggedIn = false;
    try {
        await herculesPromptArea.waitFor({ state: 'visible', timeout: 8000 });
        console.log('Detected active session via storageState! Skipping login flow.');
        loggedIn = true;
    } catch (e) {
        console.log('No active session found or storageState expired. Proceeding to login via Google SSO...');
    }

    if (!loggedIn) {
        console.log('Clicking Sign Up...');
        const signUpBtn = page.locator('a:has-text("Sign Up"), button:has-text("Sign Up"), a:has-text("Get Started"), a[href*="signup"]').first();
        await signUpBtn.waitFor({ state: 'visible', timeout: 15000 });
        await signUpBtn.click();
        await page.waitForTimeout(3000);

        console.log('Initiating Google SSO...');
        const googleSsoBtn = page.locator('button:has-text("Continue with Google"), [class*="google" i] button, button:has-text("Sign in with Google")').first();
        
        const [popup] = await Promise.all([
          context.waitForEvent('page'),
          googleSsoBtn.click()
        ]);
        
        await popup.waitForLoadState('domcontentloaded');
        console.log(`OAuth Popup URL: ${popup.url()}`);
        
        const GOOGLE_EMAIL = 'karthik@jupitermeta.io';
        const GOOGLE_PASSWORD = 'Karthik@8342';
        
        console.log(`Filling Google Email: ${GOOGLE_EMAIL}...`);
        const emailInput = popup.getByRole('textbox', { name: 'Email or phone' });
        await emailInput.waitFor({ state: 'visible', timeout: 15000 });
        await emailInput.click();
        await emailInput.fill(GOOGLE_EMAIL);
        await popup.keyboard.press('Enter');
        
        console.log('Filling Google Password...');
        const passwordInput = popup.locator('input[type="password"]');
        await passwordInput.waitFor({ state: 'visible', timeout: 15000 });
        await popup.waitForTimeout(2000); // wait for animation
        await passwordInput.click();
        await passwordInput.fill(GOOGLE_PASSWORD);
        await popup.keyboard.press('Enter');
        
        console.log('Checking for Google Consent/Continue/2FA screen...');
        const popupCloseTimeout = Date.now() + 45000;
        while (!popup.isClosed() && Date.now() < popupCloseTimeout) {
            const continueBtn = popup.getByRole('button', { name: 'Continue' }).first();
            if (await continueBtn.isVisible().catch(() => false)) {
                await continueBtn.click().catch(() => {});
            }
            await page.waitForTimeout(1000);
        }
        
        if (!popup.isClosed()) {
            console.log('WARNING: Google login popup still open. Might need 2FA verification.');
        } else {
            console.log('Google SSO Login Popup closed successfully.');
        }
        
        console.log('Waiting 10 seconds for main dashboard redirection and loading...');
        await page.waitForTimeout(10000);
    }
    
    console.log(`Current page URL: ${page.url()}`);
    const scratchDir = '/Users/karthiku/playwright-js-project/scratch';
    if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
    
    await page.screenshot({ path: 'scratch/dashboard_initial.png', fullPage: true });
    
    // Check if onboarding prompt is visible, clear it if present
    const closeOnboardingBtn = page.locator("button[aria-label='close'], button:has-text('Skip'), button:has-text('Close')").first();
    if (await closeOnboardingBtn.isVisible().catch(() => false)) {
        console.log('Onboarding overlay detected, closing...');
        await closeOnboardingBtn.click().catch(() => {});
        await page.waitForTimeout(2000);
    }

    // Capture main dashboard components
    console.log('\n--- FETCHING DASHBOARD COMPONENTS ---');
    const dashboardText = await page.innerText('body');
    const headings = await page.locator('h1, h2, h3, h4').allInnerTexts();
    const buttons = await page.locator('button').allInnerTexts();
    
    console.log('Headings found:', headings);
    console.log('Buttons found:', [...new Set(buttons.map(b => b.trim()).filter(Boolean))]);

    // Find and toggle sidebar menu if present
    const sidebarToggle = page.locator("button[aria-label*='menu' i], [class*='hamburger' i], [class*='sidebar' i] button").first();
    if (await sidebarToggle.isVisible().catch(() => false)) {
        console.log('Sidebar toggle button detected. Clicking to expand...');
        await sidebarToggle.click().catch(() => {});
        await page.waitForTimeout(1500);
        await page.screenshot({ path: 'scratch/dashboard_sidebar_open.png', fullPage: true });
    }

    // Scrape all navigation links
    const linksData = [];
    const linkLocators = await page.locator('a').all();
    for (const link of linkLocators) {
        const text = await link.innerText().catch(() => '');
        const href = await link.getAttribute('href').catch(() => null);
        if (href && (href.startsWith('/') || href.includes('hercules.works'))) {
            linksData.push({ text: text.trim().replace(/\n/g, ' '), href });
        }
    }
    
    // Deduplicate paths
    const internalLinks = linksData.filter(l => l.href && (l.href.startsWith('/') || l.href.includes('hercules.works')));
    const uniquePaths = [];
    const seenPaths = new Set();
    
    for (const link of internalLinks) {
        let cleanPath = link.href.replace('https://dev.hercules.works', '');
        if (!cleanPath.startsWith('/')) cleanPath = '/' + cleanPath;
        // Ignore auth, login, logout, home (current page)
        if (cleanPath === '/' || cleanPath.includes('login') || cleanPath.includes('logout') || cleanPath.includes('signup')) continue;
        
        if (!seenPaths.has(cleanPath)) {
            seenPaths.add(cleanPath);
            uniquePaths.push({ text: link.text || cleanPath, path: cleanPath });
        }
    }

    console.log('\nDiscovered unique internal sections to visit:', uniquePaths);

    // Visit each section, screenshot, and explore
    const crawlReport = {
        dashboard: {
            url: page.url(),
            headings,
            buttons: [...new Set(buttons.map(b => b.trim()).filter(Boolean))]
        },
        sections: []
    };

    for (const sec of uniquePaths) {
        console.log(`\nNavigating to: ${sec.text} (${sec.path})...`);
        try {
            await page.goto(`https://dev.hercules.works${sec.path}`, { timeout: 30000 });
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(3000); // Let UI settle

            const cleanName = sec.text.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            const screenshotPath = `scratch/section_${cleanName}.png`;
            await page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`Saved screenshot to: ${screenshotPath}`);

            const secHeadings = await page.locator('h1, h2, h3, h4').allInnerTexts();
            const secButtons = await page.locator('button').allInnerTexts();
            const secBodyText = await page.innerText('body');

            crawlReport.sections.push({
                name: sec.text,
                path: sec.path,
                headings: secHeadings,
                buttons: [...new Set(secButtons.map(b => b.trim()).filter(Boolean))],
                bodyTextSnippet: secBodyText.substring(0, 500).replace(/\n/g, ' ') + '...'
            });
        } catch (err) {
            console.error(`Failed to navigate to ${sec.path}:`, err.message);
        }
    }

    // Write the raw exploration results
    fs.writeFileSync('scratch/crawl_report.json', JSON.stringify(crawlReport, null, 2));
    console.log('\nCrawl completed successfully. Raw results saved to scratch/crawl_report.json');
});
