const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://dev.hercules.works/');
  await page.waitForTimeout(3000); // let it load

  // Click the 'Write a prompt' button
  console.log("Clicking 'Write a prompt'...");
  await page.locator('button:has-text("Write a prompt")').first().click();
  
  // Wait a couple seconds for animation/DOM updates
  await page.waitForTimeout(2000);

  // Find textareas, inputs, and buttons that appeared
  const elements = await page.evaluate(() => {
    const interactables = Array.from(document.querySelectorAll('textarea, input, [contenteditable="true"]'));
    return interactables.map(el => {
      return {
        tag: el.tagName,
        type: el.type,
        placeholder: el.placeholder || el.getAttribute('placeholder') || '',
        id: el.id,
        className: el.className,
        name: el.name,
        role: el.getAttribute('role'),
        ariaLabel: el.getAttribute('aria-label')
      };
    });
  });

  console.log(JSON.stringify(elements, null, 2));
  await browser.close();
})();
