const { test, expect } = require('@playwright/test');
const { setupMailosaurAccount } = require('./utils/MailosaurSetup');
const path = require('path');
const fs = require('fs');

test('Comprehensive Hercules B2B Platform Feature & Scenario Crawler', async ({ browser }) => {
    test.setTimeout(10800000); // 3-hour timeout limit

    const scratchDir = path.join(process.cwd(), 'scratch');
    if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

    console.log('\n======================================================');
    console.log(' 🚀 CRAWLER STEP 1: AUTHENTICATION & DASHBOARD      ');
    console.log('======================================================');
    const { page } = await setupMailosaurAccount(browser);
    await page.waitForTimeout(3000);

    console.log(`Current Dashboard URL: ${page.url()}`);
    await page.screenshot({ path: path.join(scratchDir, 'crawler_1_dashboard.png'), fullPage: true });

    console.log('\n======================================================');
    console.log(' 🚀 CRAWLER STEP 2: SIDEBAR & NAVIGATION DISCOVERY ');
    console.log('======================================================');
    
    // Discover all interactive buttons, links, and navigation items
    const navLinks = page.locator('nav a, nav button, aside a, aside button, header a, header button');
    const navCount = await navLinks.count();
    console.log(`Found ${navCount} navigation items in sidebar and header.`);

    for (let i = 0; i < navCount; i++) {
        const text = await navLinks.nth(i).innerText().catch(() => '');
        const href = await navLinks.nth(i).getAttribute('href').catch(() => '');
        console.log(` Navigation Item ${i + 1}: "${text.trim()}" | Href: ${href}`);
    }

    console.log('\n======================================================');
    console.log(' 🚀 CRAWLER STEP 3: DOCUMENT ATTACHMENT PROMPT TEST  ');
    console.log('======================================================');
    
    const fileInput = page.locator('input[type="file"]').first();
    const isFileInputAvailable = await fileInput.count() > 0;
    console.log(`Is Document/File Upload Input Available? ${isFileInputAvailable}`);

    if (isFileInputAvailable) {
        // Create a dummy document for attachment testing
        const sampleDocPath = path.join(scratchDir, 'sample_research_brief.txt');
        fs.writeFileSync(sampleDocPath, 'Research Brief: Customer satisfaction study for Indian electric vehicle buyers.');
        
        console.log(`Attaching sample document: ${sampleDocPath}...`);
        await fileInput.setInputFiles(sampleDocPath).catch(err => console.log(`Attachment notice: ${err.message}`));
        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(scratchDir, 'crawler_2_document_attached.png') });
    }

    console.log('\n======================================================');
    console.log(' 🚀 CRAWLER STEP 4: CAMPAIGN SEARCH & FILTERING       ');
    console.log('======================================================');
    
    const searchInput = page.locator('input[placeholder*="search" i], input[type="search"]').first();
    if (await searchInput.isVisible().catch(() => false)) {
        console.log('Search input found! Testing campaign keyword search...');
        await searchInput.fill('electric vehicle');
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(scratchDir, 'crawler_3_search_results.png') });
        await searchInput.fill('');
    } else {
        console.log('No top-level search input visible on current view.');
    }

    console.log('\n======================================================');
    console.log(' 🚀 CRAWLER STEP 5: USER PROFILE & ACCOUNT SETTINGS   ');
    console.log('======================================================');
    
    const profileBtn = page.locator('[aria-label*="profile" i], [aria-label*="account" i], img[alt*="avatar" i], button:has-text("Profile"), button:has-text("Settings")').first();
    if (await profileBtn.isVisible().catch(() => false)) {
        console.log('Clicking Profile/Settings button...');
        await profileBtn.click({ force: true });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(scratchDir, 'crawler_4_profile_settings.png') });
    } else {
        console.log('Profile button not visible in header.');
    }

    console.log('\n======================================================');
    console.log(' 🚀 CRAWLER STEP 6: SURVEY EDITOR & DEPLOY CRAWL     ');
    console.log('======================================================');
    
    const textarea = page.locator("textarea[aria-label='Ask Hercules a question'], [class='w-full pb-[36.821px] pl-[24px] pr-[24.547px] pt-[24px] sm:h-[93px]'] textarea, [class='w-full pb-[36.821px] pl-[24px] pr-[24.547px] pt-[24px] sm:h-[93px]'] input").or(page.getByRole('textbox', { name: 'Describe the research you' })).first();
    if (await textarea.isVisible().catch(() => false)) {
        console.log('Submitting prompt to generate a new survey for crawler inspection...');
        await textarea.fill('Create a 10-question market research survey on online grocery shopping habits in metro cities.');
        const submitBtn = page.locator('button[aria-label="submit button"]').or(page.getByRole('button', { name: 'Send' })).first();
        await submitBtn.click({ force: true });
        await page.waitForTimeout(5000);
    }

    console.log('\n======================================================');
    console.log(' 🏁 CRAWLER REPORT: DISCOVERED SCENARIOS & STATUS    ');
    console.log('======================================================\n');
    console.log('Crawler run completed! Discovered areas logged and cataloged.');
});
