const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://dev.hercules.works/');
  await page.waitForTimeout(5000); // let it load

  // Find textareas, inputs, and buttons
  const elements = await page.evaluate(() => {
    const interactables = Array.from(document.querySelectorAll('textarea, input, button, [role="button"]'));
    return interactables.map(el => {
      return {
        tag: el.tagName,
        type: el.type,
        placeholder: el.placeholder || '',
        text: el.innerText || el.value || '',
        id: el.id,
        className: el.className,
        name: el.name
      };
    }).filter(e => e.placeholder.toLowerCase().includes('prompt') || e.text.toLowerCase().includes('submit') || e.text.toLowerCase().includes('generate') || e.tag === 'TEXTAREA');
  });

  console.log(JSON.stringify(elements, null, 2));
  await browser.close();
})();
