const BasePage = require('../base/BasePage');

class LoginPage extends BasePage {
  constructor(page) {
    super(page);
  }

  async open() {
    console.log("[LoginPage] Navigating to https://dev.superj.app...");
    await this.page.goto('https://dev.superj.app', { waitUntil: 'domcontentloaded' });

    // Clear cookies & local/session storage to force a clean, unauthenticated login screen
    await this.page.context().clearCookies().catch(() => {});
    await this.page.evaluate(() => {
      try { localStorage.clear(); } catch(e){}
      try { sessionStorage.clear(); } catch(e){}
    }).catch(() => {});

    // Reload page to reflect unauthenticated state
    await this.page.goto('https://dev.superj.app', { waitUntil: 'domcontentloaded' });
    await this.page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  }

  async login(phoneNumber, otp) {
    await this.open();

    console.log(`Entering phone number ${phoneNumber}...`);
    await this.enterPhoneNumber(phoneNumber);

    console.log("Clicking Request OTP...");
    await this.page.locator("//button[text()='Request OTP']").click();

    console.log("Waiting for OTP field...");
    await this.page.waitForSelector('input[inputmode="numeric"], input[maxlength="6"]', {
      timeout: 10000
    });

    console.log("Entering OTP...");
    await this.enterOtp(otp);

    console.log("[LoginPage] OTP entered. Waiting for automatic redirect...");
    // No "Verify" button to click, the app auto-redirects to the onboarding page.
  }

  async enterPhoneNumber(phoneNumber) {
    console.log(`[LoginPage] Filling phone number: ${phoneNumber}`);

    // Wait for the specific messaging or logo if needed
    await this.page.waitForSelector("//p[text()='We will send you one time password (OTP) on your phone number']", { state: 'visible', timeout: 15000 }).catch(() => {});
    await this.page.waitForSelector("//img[@alt='Super J'] | //p[text()='Super J']", { state: 'visible', timeout: 5000 }).catch(() => {});

    const locators = [
      this.page.locator("//input[@aria-label='phone-number-input']"),
      this.page.locator('input[type="tel"]'),
      this.page.locator('input[name*="phone" i]'),
      this.page.locator('input[placeholder*="phone" i]'),
      this.page.locator('input[autocomplete*="tel" i]'),
      this.page.locator('input').nth(0),
    ];

    for (const locator of locators) {
      if (await locator.first().isVisible().catch(() => false)) {
        await locator.first().click().catch(() => {});
        await locator.first().fill('').catch(() => {});
        await locator.first().fill(phoneNumber);
        console.log(`[LoginPage] Phone number ${phoneNumber} successfully filled into input.`);
        return true;
      }
    }

    return await this._fillFirstVisible(locators, phoneNumber);
  }

  async enterOtp(otp) {
  console.log("[LoginPage] Waiting for specific OTP screen texts...");
  await this.page.waitForSelector("//h2[text()='Enter OTP']", { state: 'visible', timeout: 15000 }).catch(() => {});
  await this.page.waitForSelector("//*[contains(text(),'Enter the OTP sent to')]", { state: 'visible', timeout: 5000 }).catch(() => {});

  // Check if OTP is split into multiple input boxes
  const otpInputs = this.page.locator("//input[@inputmode='numeric']");

  if (await otpInputs.count() >= otp.length) {
    for (let i = 0; i < otp.length; i++) {
      await otpInputs.nth(i).fill(otp[i]);
    }
    return true;
  }

  // Fallback for a single OTP input field
  const locators = [
    this.page.locator("//input[@inputmode='numeric']"),
    this.page.locator('input[maxlength="6"]'),
    this.page.locator('input[name*="otp" i]'),
    this.page.locator('input[placeholder*="otp" i]'),
    this.page.locator('input[autocomplete="one-time-code"]'),
    this.page.locator('input').nth(1),
  ];

  await this._fillFirstVisible(locators, otp);
}

  async submitLogin() {
    const candidates = [
      this.page.getByRole('button', { name: /login|continue|verify|submit/i }),
      this.page.locator('button[type="submit"]'),
      this.page.locator('button'),
    ];

    for (const candidate of candidates) {
      const clicked = await this.clickIfVisible(candidate);
      if (clicked) {
        return true;
      }
    }

    return false;
  }

  async _fillFirstVisible(locators, value) {
    for (const locator of locators) {
      const filled = await this.fillIfVisible(locator, value);
      if (filled) {
        return true;
      }
    }

    return false;
  }
}

module.exports = LoginPage;
