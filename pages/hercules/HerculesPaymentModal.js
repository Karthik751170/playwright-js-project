class HerculesPaymentModal {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;

    // The entire "Pay and deploy" pop-up div
    this.paymentModal = page.locator("[class='mb-6 flex flex-col md:gap-6 gap-[13px] bg-[#FFFFFF] border border-[#F3F4F6] rounded-[16px] md:px-6 md:py-6 px-4 py-[20px]']");
    
    // Deploy/Payment Buttons
    this.deployDeployBtn = page.getByRole('button', { name: 'Deploy Deploy' });
    this.deployCampaignBtn = page.getByRole('button', { name: 'Deploy Campaign' });
    this.payAndDeployBtn = page.locator("//button[text()='Pay and Deploy']");
    this.premiumAudienceBtn = page.getByRole('button', { name: /Deploy with Premium Audience/i });

    // Credit Extractors
    this.totalCreditsDiv = page.locator("xpath=//*[contains(@class, 'shadow-') and contains(@class, 'rounded-bl-[8px]') and contains(@class, 'flex-col')]").first();
    
    this.locationDiv = page.locator('.pb-0'); // Location credit div
    
    this.genderExpandBtn = page.getByRole('button', { name: 'gender Gender expand collapse' });
    this.genderText = page.getByText('Male%(250)0.5/UserFemale%(250');
    
    this.ageExpandBtn = page.getByRole('region', { name: 'age Age expand collapse' });
    
    this.nccsExpandBtn = page.getByRole('button', { name: 'nccs NCCS expand collapse' });
    this.nccsText = page.getByText('A1NCCS%(250)1/UserB1NCCS%(250');
  }

  /**
   * Click the final Pay and Deploy button to trigger Razorpay
   */
  async clickPayAndDeploy() {
    console.log('[HerculesPaymentModal] Clicking "Pay and Deploy"');
    await this.payAndDeployBtn.waitFor({ state: 'visible', timeout: 10000 });
    await this.payAndDeployBtn.click();
  }

  /**
   * Clicks "Deploy with Premium Audience" if the warning modal appears after clicking Deploy Deploy
   */
  async handlePremiumModal() {
    console.log('[HerculesPaymentModal] Checking for Premium Audience warning modal...');
    try {
      if (await this.premiumAudienceBtn.isVisible({ timeout: 5000 })) {
        console.log('[HerculesPaymentModal] Premium Audience modal detected. Clicking "Deploy with Premium Audience"...');
        await this.premiumAudienceBtn.click();
        await this.page.waitForTimeout(3000); // Give the actual payment modal time to slide in
      } else {
        console.log('[HerculesPaymentModal] No Premium Audience modal detected. Proceeding...');
      }
    } catch (e) {
      console.log('[HerculesPaymentModal] Error checking premium modal:', e);
    }
  }

  /**
   * Handles the entire Razorpay iframe pop-up flow
   * @param {string} contactNumber 
   */
  async handleRazorpaySuccess(contactNumber = '7026268342') {
    console.log('[HerculesPaymentModal] Waiting for Razorpay iframe...');
    const iframe = this.page.frameLocator('iframe.razorpay-checkout-frame'); // Be specific to Razorpay iframe

    console.log(`[HerculesPaymentModal] Checking for contact details screen...`);
    try {
      const contactInput = iframe.getByTestId('contactNumber');
      await contactInput.waitFor({ state: 'visible', timeout: 4000 });
      console.log(`[HerculesPaymentModal] Filling contact number: ${contactNumber}`);
      await contactInput.fill(contactNumber);

      console.log('[HerculesPaymentModal] Clicking Continue in Razorpay...');
      const continueBtn = iframe.getByRole('button', { name: 'Continue' });
      await continueBtn.click({ force: true, timeout: 5000 });
    } catch (e) {
      console.log('[HerculesPaymentModal] Contact details screen not shown, proceeding to payment options.');
    }

    console.log('[HerculesPaymentModal] Clicking Netbanking option...');
    await iframe.getByTestId('netbanking').click();

    console.log('[HerculesPaymentModal] Waiting for Bank window popup event...');
    const page2Promise = this.page.waitForEvent('popup');
    
    console.log('[HerculesPaymentModal] Clicking Bank of Baroda - Retail');
    await iframe.getByRole('button', { name: 'Bank of Baroda - Retail' }).first().click();
    
    console.log('[HerculesPaymentModal] Confirming Success in Bank Popup...');
    const page2 = await page2Promise;
    await page2.getByRole('button', { name: 'Success' }).click();

    console.log('[HerculesPaymentModal] Waiting for Success UI...');
    const successMsg = this.page.locator('div').filter({ hasText: 'Your payment wasSuccessfulYou' }).nth(4);
    await successMsg.waitFor({ state: 'visible', timeout: 60000 }); // Wait for redirect and success

    console.log('[HerculesPaymentModal] Closing Success Modal...');
    await this.page.getByRole('button', { name: 'Close' }).click();
  }

  /**
   * Retrieves the Total Credits allocation from the payment modal.
   */
  async getTotalCreditsText() {
    console.log('[HerculesPaymentModal] Looking for "Credits required to deploy campaign"...');
    // The new UI has a row: <p>Credits required to deploy campaign</p> <div> <span>679</span> </div>
    const creditsRow = this.page.locator('div').filter({ has: this.page.locator('p', { hasText: 'Credits required to deploy campaign' }) }).first();
    await creditsRow.waitFor({ state: 'visible', timeout: 15000 });
    
    // The value is in a span inside this row. Let's get the text of the span that contains numbers.
    const text = await creditsRow.locator('span').last().innerText();
    console.log(`[HerculesPaymentModal] Total Credits text: ${text}`);
    return text;
  }
}

module.exports = HerculesPaymentModal;
