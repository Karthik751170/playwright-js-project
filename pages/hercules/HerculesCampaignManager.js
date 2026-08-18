class HerculesCampaignManager {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;

    // Survey Name Header
    this.surveyNameDiv = page.locator('.opacity-100.flex.py-\\[7px\\]');

    // Launch & Pause
    this.launchSurveyBtn = page.locator("//button[text()='Launch Survey']");
    
    // The active progress div (after launching)
    this.inProgressContainer = page.locator("[class='opacity-100 flex pt-[14px] pb-[14px] px-4  border-[.8px] cursor-pointer mt-7 rounded-[14px] w-full justify-between relative transition-colors duration-200 overflow-hidden ']");
    this.inProgressText = page.locator("//p[text()='Your Research Study is in progress']");
    
    // Pause button
    this.pauseBtn = page.locator("[class='bg-[#F0DED0] rounded-[4px] h-5 w-5 flex items-center justify-center transition-colors duration-200']");

    // Edit Campaign & Survey
    this.editCampaignBtn = page.locator("//button[text()='Edit Campaign']");
    this.editSurveyBtn = page.locator("//div[text()='Edit Survey']");
    
    // Copy link
    this.copyLinkIcon = page.getByRole('img', { name: 'copy' }).nth(1);
  }

  /**
   * Fetch Survey Name
   */
  async getSurveyName() {
    await this.surveyNameDiv.waitFor({ state: 'visible' });
    const name = await this.surveyNameDiv.innerText();
    console.log(`[HerculesCampaignManager] Survey name fetched: ${name}`);
    return name;
  }

  /**
   * Clicks Edit Campaign and then Edit Survey to refund wallet
   */
  async editSurveyForRefund() {
    console.log('[HerculesCampaignManager] Clicking Edit Campaign...');
    await this.editCampaignBtn.waitFor({ state: 'visible' });
    await this.editCampaignBtn.click();
    
    console.log('[HerculesCampaignManager] Clicking Edit Survey...');
    await this.editSurveyBtn.waitFor({ state: 'visible' });
    await this.editSurveyBtn.click();
    
    // Wait for the UI to settle after refund/edit state change
    await this.page.waitForTimeout(2000);
  }
}

module.exports = HerculesCampaignManager;
