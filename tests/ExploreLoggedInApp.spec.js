const { test, expect } = require('@playwright/test');
const fs = require('fs');

test.use({ storageState: '.auth/apple-user.json' });

test('Explore Logged-In App', async ({ page }) => {
    test.setTimeout(300000); // 5 minutes for exploration

    console.log('Navigating to https://dev.hercules.works...');
    await page.goto('https://dev.hercules.works');
    await page.waitForLoadState('networkidle');

    // Wait for the main dashboard to load (to confirm we are logged in)
    try {
        await page.waitForSelector('text=Dashboard', { timeout: 10000 });
    } catch (e) {
        console.log('Warning: Dashboard text not found, might have expired auth or different UI.');
    }

    const explorationResults = {};

    async function scrapeCurrentPage(pageName) {
        console.log(`Scraping components on: ${pageName}`);
        await page.waitForTimeout(2000); // give UI time to settle

        const headings = await page.locator('h1, h2, h3').allInnerTexts();
        const buttons = await page.locator('button').allInnerTexts();
        
        // Links are tricky, let's get hrefs and text
        const linksData = [];
        const linkLocators = await page.locator('a').all();
        for (const link of linkLocators) {
            const text = await link.innerText();
            const href = await link.getAttribute('href');
            if (text.trim() || href) {
                linksData.push({ text: text.trim().replace(/\n/g, ' '), href });
            }
        }

        explorationResults[pageName] = {
            url: page.url(),
            headings: headings.map(h => h.trim().replace(/\n/g, ' ')).filter(h => h),
            buttons: [...new Set(buttons.map(b => b.trim().replace(/\n/g, ' ')).filter(b => b))],
            links: linksData
        };
    }

    // 1. Scrape Dashboard
    await scrapeCurrentPage('Dashboard');

    // 2. Identify top-level navigation links
    // Often in sidebars or headers, they are 'a' tags with specific hrefs.
    // Let's grab all links that go to internal paths (starting with /)
    const allLinks = explorationResults['Dashboard'].links;
    const internalPaths = [...new Set(allLinks.filter(l => l.href && l.href.startsWith('/')).map(l => l.href))];
    
    console.log(`Found internal navigation paths: ${internalPaths.join(', ')}`);

    // Let's pick a few key paths that look like major features to visit
    // For example: /ai, /campaigns, /templates, /settings, /profile
    const excludePaths = ['/', '/pricing', '/about', '/blog', '/terms', '/privacy', '/help'];
    const featuresToVisit = internalPaths.filter(p => !excludePaths.some(ex => p.startsWith(ex) && ex !== '/ai'));

    for (const path of featuresToVisit) {
        // Prevent clicking too many random links, limit to first 10
        if (Object.keys(explorationResults).length > 10) break;

        console.log(`Navigating to feature: ${path}`);
        await page.goto(`https://dev.hercules.works${path}`);
        await page.waitForLoadState('networkidle');
        await scrapeCurrentPage(`Feature_${path.replace(/[^a-zA-Z0-9]/g, '_')}`);
    }

    fs.writeFileSync('/Users/karthiku/.gemini/antigravity/brain/96bf4951-2c59-4b13-b581-1bddbd78665c/scratch/exploration_results.json', JSON.stringify(explorationResults, null, 2));
    console.log('Exploration complete. Results saved to exploration_results.json');
});
