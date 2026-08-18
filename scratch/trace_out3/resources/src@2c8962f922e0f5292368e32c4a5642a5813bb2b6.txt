const BasePage = require('../../base/BasePage');

class HerculesHomePage extends BasePage {
  constructor(page) {
    super(page);
    
    // Core locators based on the fetched elements
    this.loginBtn = this.page.locator("//button[text()='Log In']");
    this.signUpBtn = this.page.locator("//button[text()='Sign Up']");
    this.tryForFreeBtn = this.page.locator("//button[text()='Try it for free']");
    this.writePromptBtn = this.page.locator("//button[text()='Write a prompt']");
    this.emailInput = this.page.locator("//input[@placeholder='Enter Email']");
    
    // Modals
    this.openAiModalBtn = this.page.locator("//button[@aria-label='Open Hercules AI modal']");
    this.openFormsModalBtn = this.page.locator("//button[@aria-label='Open Hercules Forms modal']");
  }

  async open() {
    const config = require('../../config/hercules.config.js');
    console.log(`[HerculesHomePage] Navigating to ${config.baseUrl}...`);
    await this.page.goto(config.baseUrl, { waitUntil: 'domcontentloaded' });
  }

  async navigate() {
    const config = require('../../config/hercules.config.js');
    console.log(`[HerculesHomePage] Navigating to ${config.baseUrl}...`);
    await this.page.goto(config.baseUrl, { waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(1000);
  }

  async verifyNavigation() {
    const config = require('../../config/hercules.config.js');
    await this.page.goto(config.baseUrl);
  }

  async clickWriteAPrompt() {
    console.log('[HerculesHomePage] Clicking "Write a prompt" button...');
    await this.clickIfVisible(this.page.locator('button:has-text("Write a prompt")').first());
  }

  async generateSurvey(promptText) {
    console.log('[HerculesHomePage] Entering prompt into textarea...');
    // The exact textarea ID is "prompt" based on our scrape
    const promptInput = this.page.locator('textarea#prompt');
    await promptInput.waitFor({ state: 'visible', timeout: 5000 });
    await promptInput.fill(promptText);

    console.log('[HerculesHomePage] Clicking submit button to generate survey...');
    await this.page.locator("//button[@aria-label='submit button']").first().click();
  }

  async generateSurveyFromSuggestion() {
    console.log('[HerculesHomePage] Clicking "Get suggestions" button...');
    const getSuggBtn = this.page.locator('button:has-text("Get suggestions")').first();
    await getSuggBtn.click();
    
    // Wait for the AI to auto-type the suggestion
    await this.page.waitForTimeout(2000);
    
    console.log('[HerculesHomePage] Clicking submit button to generate survey...');
    const submitBtn = this.page.locator("button[aria-label='submit button']").first();
    await submitBtn.waitFor({ state: 'visible', timeout: 5000 });
    await submitBtn.click();
  }

  async fetchGeneratedLocators() {
    console.log('[HerculesHomePage] Fetching all generated survey elements...');
    // We'll scrape all visible text fields, labels, and inputs
    const elements = await this.page.evaluate(() => {
      const interactables = Array.from(document.querySelectorAll('input, button, label, h1, h2, h3, p'));
      return interactables.map(el => ({
        tag: el.tagName,
        text: el.innerText || el.value || '',
        placeholder: el.placeholder || '',
        id: el.id
      })).filter(e => e.text.trim() !== '' || e.placeholder.trim() !== '');
    });
    return elements;
  }

  async clickLogin() {
    console.log("[HerculesHomePage] Clicking Log In button...");
    await this.clickIfVisible(this.loginBtn);
  }

  async clickSignUp() {
    console.log("[HerculesHomePage] Clicking Sign Up button...");
    await this.clickIfVisible(this.signUpBtn);
  }

  async enterEmailAndSubmit(email) {
    console.log(`[HerculesHomePage] Entering email: ${email}`);
    await this.fillIfVisible(this.emailInput.first(), email);
    // Usually submitting involves pressing enter or clicking a submit button nearby
    await this.emailInput.first().press('Enter');
  }

  async getWalletBalance() {
    console.log('[HerculesHomePage] Fetching wallet balance...');
    const walletDiv = this.page.locator("[class='flex h-[20px] items-center gap-[7px]']").first();
    await walletDiv.waitFor({ state: 'visible', timeout: 10000 });
    const balance = await walletDiv.innerText();
    console.log(`[HerculesHomePage] Wallet balance is: ${balance}`);
    return balance;
  }

  async returnToDashboard() {
    console.log('[HerculesHomePage] Returning to dashboard via Hercules Logo...');
    const logo = this.page.getByRole('img', { name: 'hercules-logo' });
    await logo.waitFor({ state: 'visible' });
    await logo.click();
    
    const goToDashboard = this.page.getByRole('heading', { name: 'Go to Dashboard' });
    await goToDashboard.waitFor({ state: 'visible', timeout: 5000 });
    await goToDashboard.click();
    
    await this.page.waitForTimeout(2000); // Wait for dashboard to load
  }
}

module.exports = HerculesHomePage;
