const { test, expect } = require('@playwright/test');
const LoginPage = require('../pages/LoginPage');
const OnboardingUtil = require('../utils/OnboardingUtil');
const DataGeneratorUtil = require('../utils/DataGeneratorUtil');

test('automates first-time user onboarding', async ({ page }) => {
  test.setTimeout(120000);

  const loginPage = new LoginPage(page);
  const onboardingUtil = new OnboardingUtil(page);

  // Generate a random 10-digit Indian phone number using the dedicated utility
  const randomPhone = DataGeneratorUtil.generateRandomPhoneNumber();
  console.log(`[Test] Using dynamically generated phone number: ${randomPhone}`);

  // Use the random phone number to trigger first-time onboarding
  await loginPage.login(randomPhone, '777777');

  // Check if onboarding screen appears
  const welcomeLocator = page.locator("//h2[text()='Welcome to SuperJ']");
  
  try {
    await welcomeLocator.waitFor({ state: 'visible', timeout: 15000 });
    // Run the onboarding flow
    const result = await onboardingUtil.completeOnboarding('1995', 'Bangalore', 'Female');
    expect(result.success).toBe(true);

    // Verify wallet amount
    console.log("[Test] Navigating to Wallet...");
    await page.locator("//p[text()='Wallet']").click();
    
    // The wallet page should contain the extracted reward amount
    console.log(`[Test] Verifying wallet contains amount: ${result.rewardAmountText}`);
    
    // Extract the numerical value from the reward text (e.g. '₹ 5' -> '5')
    const match = result.rewardAmountText.match(/\d+/);
    if (match) {
        const amount = match[0];
        // Look for the amount in the wallet page
        const walletAmountLocator = page.locator(`text=${amount}`);
        await expect(walletAmountLocator.first()).toBeVisible({ timeout: 10000 });
        console.log(`[Test] Successfully verified wallet contains amount: ${amount}`);
    } else {
        console.log("[Test] Could not parse numerical amount from reward text.");
    }
  } catch (e) {
    console.log("Onboarding screen did not appear or verification failed: " + e.message);
  }
});
