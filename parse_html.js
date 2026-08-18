const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    const html = fs.readFileSync('/Users/karthiku/playwright-js-project/scratch/slide19_before_dropdown.html', 'utf-8');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent(html);
    
    const dropdowns = await page.locator("img[alt='Dropdown']").all();
    console.log(`Found ${dropdowns.length} dropdowns`);
    
    for (let i = 0; i < dropdowns.length; i++) {
        const d = dropdowns[i];
        // find closest button
        const button = d.locator('xpath=ancestor::button').first();
        if (await button.count() > 0) {
            console.log(`Dropdown ${i+1} parent button:`);
            console.log(await button.evaluate(node => node.outerHTML));
        } else {
            console.log(`Dropdown ${i+1} has no parent button`);
        }
    }
    
    await browser.close();
})();
