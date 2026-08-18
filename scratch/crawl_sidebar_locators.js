const { chromium } = require('@playwright/test');
const { setupMailosaurAccount } = require('../tests/utils/MailosaurSetup');
const fs = require('fs');
const path = require('path');

(async () => {
    console.log('Starting Hercules Sidebar DOM Crawler...');
    const browser = await chromium.launch({ headless: false });
    const { page } = await setupMailosaurAccount(browser);

    console.log('Navigated to Hercules Dashboard/Chat.');
    await page.waitForTimeout(5000);

    // Inspect all buttons on page
    const buttons = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button')).map((b, index) => ({
            index,
            text: b.innerText.trim(),
            ariaLabel: b.getAttribute('aria-label'),
            className: b.className,
            outerHTML: b.outerHTML.slice(0, 150)
        }));
    });
    console.log('Discovered Buttons:', JSON.stringify(buttons, null, 2));

    // Inspect links in sidebar
    const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a')).map((a, index) => ({
            index,
            text: a.innerText.trim(),
            href: a.getAttribute('href'),
            outerHTML: a.outerHTML.slice(0, 150)
        }));
    });
    console.log('Discovered Links:', JSON.stringify(links, null, 2));

    const scratchDir = path.join(process.cwd(), 'scratch');
    if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
    
    fs.writeFileSync(
        path.join(scratchDir, 'sidebar_dom_dump.json'),
        JSON.stringify({ buttons, links }, null, 2)
    );
    await page.screenshot({ path: path.join(scratchDir, 'sidebar_crawler_snap.png'), fullPage: true });
    console.log('Crawler complete! Screenshots and DOM dump saved.');

    await browser.close();
})();
