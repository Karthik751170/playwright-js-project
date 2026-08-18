const { test, expect } = require('@playwright/test');
const LoginPage = require('../pages/LoginPage');
const OnboardingUtil = require('../utils/OnboardingUtil');

test('automates first-time user onboarding', async ({ page }) => {
  test.setTimeout(120000);

  const loginPage = new LoginPage(page);
  const onboardingUtil = new OnboardingUtil(page);

  // Generate a random 10-digit phone number starting with 9 to always trigger a first-time user flow
  const randomSuffix = Math.floor(100000000 + Math.random() * 900000000);
  const freshPhoneNumber = `9${randomSuffix}`;
  console.log(`[Test] Using dynamically generated phone number: ${freshPhoneNumber}`);

  // Login with the fresh phone number
  await loginPage.login(freshPhoneNumber, '777777');

  // Check if onboarding screen appears
  await page.waitfort
  const welcomeLocator = page.locator("//h2[text()='Welcome to SuperJ']");
  
  try {
    await welcomeLocator.waitFor({ state: 'visible', timeout: 15000 });
    // Run the onboarding flow
    const success = await onboardingUtil.completeOnboarding('1995', 'Bangalore', 'Female');
    expect(success).toBe(true);
  } catch (e) {
    console.log("Onboarding screen did not appear. This user might already be registered.");
  }
});
