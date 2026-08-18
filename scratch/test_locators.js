const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const html = fs.readFileSync('scratch/active_question_dom.html', 'utf8');
  await page.setContent(html);
  
  const imgCount = await page.locator("img[alt='Dropdown']").count();
  console.log("img[alt='Dropdown'] count:", imgCount);
  
  const btnCount = await page.locator("button[data-testid^='ranking-option-']").count();
  console.log("button[data-testid^='ranking-option-'] count:", btnCount);
  
  await browser.close();
})();
