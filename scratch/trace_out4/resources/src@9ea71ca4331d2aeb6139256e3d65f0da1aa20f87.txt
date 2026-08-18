class OnboardingUtil {
  constructor(page) {
    this.page = page;
  }

  async completeOnboarding(yearOfBirth = '1990', city = 'Bangalore', gender = 'Male') {
    try {
        console.log("[OnboardingUtil] Starting Onboarding flow...");

        // 1. Wait for Onboarding page to load
        await this.page.waitForSelector("h2", { state: 'visible', timeout: 15000 }).catch(() => console.log("[OnboardingUtil] Welcome h2 not found, continuing..."));
        console.log("[OnboardingUtil] Welcome screen loaded.");

        // 2. Year of birth
        console.log(`[OnboardingUtil] Entering Year of Birth: ${yearOfBirth}`);
        const yobInput = this.page.locator("//input[@placeholder='Please select your year of birth']");
        // Add a strict timeout so it doesn't hang forever
        await yobInput.fill(yearOfBirth.toString(), { timeout: 10000 });

        // 3. Gender
        console.log(`[OnboardingUtil] Selecting Gender: ${gender}`);
        if (gender.toLowerCase() === 'female') {
          await this.page.locator("//span[text()='Female']").click({ timeout: 5000 });
        } else {
          await this.page.locator("//span[text()='Male']").click({ timeout: 5000 });
        }

        // 4. City
        console.log(`[OnboardingUtil] Searching for City: ${city}`);
        const cityInput = this.page.locator("//input[@placeholder='Search for a City or Town']");
        await cityInput.fill('', { timeout: 5000 });
        // Type slowly to ensure the search event is triggered in the framework
        await cityInput.pressSequentially(city, { delay: 100 });
        
        // Select option from dropdown
        console.log(`[OnboardingUtil] Clicking dropdown option for ${city}...`);
        // Wait a brief moment for the network search to return
        await this.page.waitForTimeout(2000); 
        
        const dropdownOption = this.page.getByText(city, { exact: false }).first();
        await dropdownOption.click({ timeout: 5000 }).catch(async () => {
            console.log("[OnboardingUtil] Direct click failed, trying keyboard fallback...");
            await cityInput.press('ArrowDown');
            await this.page.waitForTimeout(500);
            await cityInput.press('Enter');
        });
        await this.page.waitForTimeout(1000);

        // 5. Next Button
        console.log("[OnboardingUtil] Clicking Next button...");
        await this.page.locator("//span[text()='Next']").click({ timeout: 5000 });

        // 6. Super J Logo before Congratulations
        console.log("[OnboardingUtil] Waiting for Super J logo to appear before congratulations...");
        const logo = this.page.locator("//img[@alt='Super J'] | //p[text()='Super J']");
        await logo.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {
            console.log("[OnboardingUtil] Logo wait timed out, proceeding...");
        });

        // 7. Congratulations Screen
        console.log("[OnboardingUtil] Waiting for Congratulations pop-up...");
        await this.page.waitForSelector("//h3[text()='Congratulations!']", { state: 'visible', timeout: 15000 });
        
        // Reward amount extraction
        let rewardAmountText = "";
        const rewardComponent = this.page.locator("[class*='CashComponent-module__Mkx23a__gradientBorder']");
        if (await rewardComponent.isVisible().catch(() => false)) {
           console.log("[OnboardingUtil] Reward amount component is visible.");
           rewardAmountText = await rewardComponent.innerText();
           console.log(`[OnboardingUtil] Extracted Reward: ${rewardAmountText}`);
        }

        // Earn More Rewards Button
        console.log("[OnboardingUtil] Clicking 'Earn More Rewards' button...");
        const earnMoreBtn = this.page.locator("//button[text()='Earn More Rewards']");
        await earnMoreBtn.click({ timeout: 5000 }).catch(e => console.log('Click failed:', e.message));
        
        console.log("[OnboardingUtil] Onboarding completed successfully.");
        return { success: true, rewardAmountText };
    } catch (e) {
        console.log(`[OnboardingUtil] ERROR: ${e.message}`);
        return { success: false, error: e };
    }
  }
}

module.exports = OnboardingUtil;
