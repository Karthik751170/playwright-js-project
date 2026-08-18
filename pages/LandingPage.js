const BasePage = require('../base/BasePage');

class LandingPage extends BasePage {
  constructor(page) {
    super(page);
  }

  // Wrapper so your existing test doesn't need to change
  async clickStartSurvey(index) {
    if (index === 1) {
      return await this.clickFirstStartSurvey();
    }

    return await this.clickSecondStartSurvey();
  }

  async getFirstSurveyRewardInfo() {
    try {
      const firstBtn = this.page.locator("//button[contains(.,'Start Survey')]").first();
      await firstBtn.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});

      // Locate parent card element
      const card = firstBtn.locator("xpath=ancestor::div[contains(@class,'card') or contains(@class,'item') or contains(@class,'container') or contains(@class,'Card') or contains(@class,'Item')][1]");

      let cardText = "";
      if (await card.count() > 0) {
        cardText = await card.innerText().catch(() => "");
      }
      if (!cardText) {
        cardText = await this.page.innerText("body").catch(() => "");
      }

      console.log(`[LandingPage] First Survey Card Text: "${cardText.substring(0, 200).replace(/\s+/g, ' ')}"`);

      // Check for Cash / Rupees (e.g. Earn ₹1, Earn ₹2, Earn ₹3, ₹2)
      const cashMatch = cardText.match(/Earn\s*₹?\s*(\d+)|₹\s*(\d+)/i);
      if (cashMatch) {
        const amtStr = cashMatch[1] || cashMatch[2];
        const amount = parseInt(amtStr, 10);
        console.log(`[LandingPage] Detected CASH reward in survey card: ₹${amount}`);
        return { type: 'CASH', amount, rawAmount: `₹${amount}` };
      }

      // Check for Coupons / Gift Cards (e.g. Earn coupons, Coupon, Gift Card)
      if (/coupon|giftcard|gift\s*card/i.test(cardText)) {
        console.log(`[LandingPage] Detected COUPON / Gift Card reward in survey card.`);
        return { type: 'COUPON' };
      }
    } catch (e) {
      console.error("[LandingPage] Error inspecting survey card reward info:", e.message);
    }
    return { type: 'UNKNOWN' };
  }

  async clickFirstStartSurvey() {
    console.log("Screen 1: Searching for 'Start Survey' button on dashboard...");

    const buttons = this.page.locator("//button[contains(.,'Start Survey')]");

    await buttons.first().waitFor({
      state: "visible",
      timeout: 15000
    });

    const count = await buttons.count();
    console.log(`Screen 1: Found ${count} survey item(s) on dashboard`);

    // Inspect reward type before clicking
    const rewardInfo = await this.getFirstSurveyRewardInfo();

    console.log("Screen 1: Clicking 1st 'Start Survey' button to open Screen 2...");
    await buttons.first().click();

    // Wait for Screen 2 / transition animation to complete
    await this.page.waitForTimeout(2500);

    return rewardInfo;
  }

  async clickSecondStartSurvey() {
    console.log("Screen 2: Waiting for survey detail / confirmation screen to load...");

    // Wait for DOM content to settle
    await this.page.waitForLoadState("domcontentloaded").catch(() => {});
    await this.page.waitForTimeout(1500);

    const screen2Locators = [
      // Button inside dialog / modal / drawer on Screen 2
      this.page.locator("div[role='dialog'] button, [class*='modal'] button, [class*='drawer'] button, [class*='detail'] button, [class*='container'] button").filter({ hasText: /Start Survey|Start|Begin/i }),

      // Any button with text 'Start Survey' on Screen 2
      this.page.locator("//button[contains(normalize-space(),'Start Survey')]"),

      // Role button with 'Start Survey' or 'Start'
      this.page.getByRole("button", { name: /Start Survey|Start|Begin|Take Survey/i }),

      // Clickable span/div/p with text 'Start Survey'
      this.page.locator("//span[contains(text(),'Start Survey')] | //div[contains(text(),'Start Survey')] | //p[contains(text(),'Start Survey')]")
    ];

    let targetButton = null;

    // Wait up to 15 seconds for Screen 2's button to appear and be visible
    const startTime = Date.now();
    while (Date.now() - startTime < 15000) {
      for (const locator of screen2Locators) {
        const count = await locator.count().catch(() => 0);
        if (count > 0) {
          // Check from last element first (modal/screen 2 layers render on top)
          for (let i = count - 1; i >= 0; i--) {
            const btn = locator.nth(i);
            if (await btn.isVisible().catch(() => false)) {
              targetButton = btn;
              console.log(`Screen 2: Found 'Start Survey' button candidate!`);
              break;
            }
          }
        }
        if (targetButton) break;
      }

      if (targetButton) break;
      await this.page.waitForTimeout(500);
    }

    if (!targetButton) {
      console.error("Screen 2: Could not find 2nd 'Start Survey' button on Screen 2.");
      return false;
    }

    console.log("Screen 2: Clicking 2nd 'Start Survey' button to start survey questions...");
    await targetButton.scrollIntoViewIfNeeded().catch(() => {});
    await this.page.waitForTimeout(500);

    try {
      await targetButton.click({ timeout: 5000 });
      console.log("Screen 2: Clicked 2nd 'Start Survey' button (standard click)");
    } catch (err) {
      console.log("Screen 2: Standard click intercepted, triggering JS click fallback...");
      await targetButton.evaluate(el => el.click());
      console.log("Screen 2: Clicked 2nd 'Start Survey' button (JS click)");
    }

    // Wait for survey questions carousel to load on Screen 3
    await this.page.waitForTimeout(3000);
    await this.page.waitForLoadState("networkidle").catch(() => {});
    return true;
  }
}

module.exports = LandingPage;