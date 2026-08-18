const BasePage = require('../../base/BasePage');

class HerculesLoginPage extends BasePage {
  constructor(page) {
    super(page);
    
    // Core login modal locators
    this.googleLoginBtn = this.page.locator("//button[text()='Continue with Google']");
    this.appleLoginBtn = this.page.locator("//button[text()='Continue with Apple']");
    this.emailInput = this.page.locator("//input[@id='guest-email']");
    this.continueBtn = this.page.locator("//button[text()='Continue']");
    
    // Header/Close controls
    this.closeModalBtn = this.page.locator("//button[@aria-label='close']");
    this.signUpBtn = this.page.locator("//button[text()='Sign up']");
    
    // Legal links
    this.termsLink = this.page.locator("//a[text()='Terms of Service']");
    this.privacyLink = this.page.locator("//a[text()='Privacy Policy']");
  }

  /**
   * Logs in using email
   * @param {string} email
   */
  async loginWithEmail(email) {
    console.log(`[HerculesLoginPage] Entering email: ${email}`);
    await this.fillIfVisible(this.emailInput, email);
    console.log("[HerculesLoginPage] Clicking Continue...");
    await this.clickIfVisible(this.continueBtn);
  }

  /**
   * Initiates Google SSO
   */
  async clickContinueWithGoogle() {
    console.log("[HerculesLoginPage] Clicking Continue with Google...");
    await this.clickIfVisible(this.googleLoginBtn);
  }

  /**
   * Initiates Apple SSO
   */
  async clickContinueWithApple() {
    console.log("[HerculesLoginPage] Clicking Continue with Apple...");
    await this.clickIfVisible(this.appleLoginBtn);
  }

  /**
   * Closes the login modal
   */
  async closeModal() {
    console.log("[HerculesLoginPage] Closing the login modal...");
    await this.clickIfVisible(this.closeModalBtn);
  }
}

module.exports = HerculesLoginPage;
