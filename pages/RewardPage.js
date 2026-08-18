const BasePage = require('../base/BasePage');
const { expect } = require('@playwright/test');

class RewardPage extends BasePage {
  constructor(page) {
    super(page);
  }

  /**
   * Verify reward screen based on the reward information extracted before starting the survey.
   * @param {Object} rewardInfo - { type: 'CASH' | 'COUPON', amount?: number, rawAmount?: string }
   */
  async verifyReward(rewardInfo = { type: 'UNKNOWN' }) {
    console.log("\n==================================");
    console.log(`[RewardPage] Verifying Reward Screen... Expected Type: ${rewardInfo.type || 'UNKNOWN'}`);
    console.log("==================================");

    // Pause execution here to let the user inspect the screen using Playwright Inspector
    console.log("[RewardPage] Pausing execution for manual inspection. Click Resume in Playwright Inspector to proceed.");
    await this.page.pause();

    // Allow reward screen transition to complete
    await this.page.waitForTimeout(3000);
    const currentUrl = this.page.url();
    console.log(`[RewardPage] Current Reward Page URL: ${currentUrl}`);

    // Read full page text content to log exactly what is visible
    const pageText = await this.page.innerText('body').catch(() => '');
    console.log("\n==================================");
    console.log("[RewardPage] EXACT REWARD SCREEN TEXT CONTENT:");
    console.log(pageText.trim());
    console.log("==================================\n");

    // Use page.evaluate to check visibility/text without generating locator step clutter in the HTML report
    const pageData = await this.page.evaluate(() => {
      const text = document.body.innerText || "";
      const hasEarnMore = !!Array.from(document.querySelectorAll('button, a, p, div')).find(el => el.innerText && el.innerText.includes('Earn more Rewards!'));
      return { text, hasEarnMore };
    }).catch(() => ({ text: "", hasEarnMore: false }));

    if (rewardInfo.type === 'CASH') {
      console.log(`[RewardPage] Asserting Cash Reward...`);

      const hasCashText = pageData.text.includes('Cash Balance') || 
                          pageData.text.includes('credited to your wallet');
      
      expect(hasCashText, "Expected 'Cash Balance' or 'credited to your wallet' to be present on screen.").toBe(true);

      if (rewardInfo.amount) {
        const hasAmount = pageData.text.includes(`₹ ${rewardInfo.amount}`) ||
                          pageData.text.includes(`₹${rewardInfo.amount}`) ||
                          pageData.text.includes(`${rewardInfo.amount} credited`);

        expect(hasAmount, `Expected reward amount ₹${rewardInfo.amount} to be credited.`).toBe(true);
        console.log(`✅ [RewardPage] Verified Cash Reward of ₹${rewardInfo.amount} successfully!`);
      }

    } else if (rewardInfo.type === 'COUPON') {
      console.log(`[RewardPage] Asserting Coupon / Gift Card Reward...`);

      const hasCouponText = pageData.text.includes('Instant GiftCard') || 
                            pageData.text.includes('Instant Gift Card!') || 
                            pageData.text.includes('Read Instructions');

      expect(hasCouponText, "Expected 'Instant GiftCard' or 'Read Instructions' to be present on screen.").toBe(true);
      console.log(`✅ [RewardPage] Verified Instant GiftCard / Coupon Reward screen!`);
    } else {
      console.log(`[RewardPage] Asserting general reward completion...`);
      expect(pageData.hasEarnMore, "Expected 'Earn more Rewards!' to be present on reward page.").toBe(true);
      console.log(`✅ [RewardPage] Verified general reward page.`);
    }

    return true;
  }
}

module.exports = RewardPage;
