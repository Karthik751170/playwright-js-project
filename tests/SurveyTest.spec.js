const { test, expect } = require('@playwright/test');
const LoginPage = require('../pages/LoginPage');
const LandingPage = require('../pages/LandingPage');
const SurveyPage = require('../pages/SurveyPage');
const SurveyEngine = require('../utils/SurveyEngine');

test('automates the survey flow', async ({ page }) => {
  test.setTimeout(120000);

  const loginPage = new LoginPage(page);
  const landingPage = new LandingPage(page);
  const surveyPage = new SurveyPage(page);
  const surveyEngine = new SurveyEngine(page, surveyPage);

  await loginPage.login('9700089199', '777777');
  await landingPage.clickStartSurvey(1);
  await page.waitForTimeout(5000); // Wait for 5 seconds to ensure the survey page is fully loaded
  await landingPage.clickStartSurvey(2);

  await page.waitForTimeout(5000); // Wait for 5 seconds to ensure the survey page is fully loaded

  // Check all open browser tabs/pages
  const contextPages = page.context().pages();
  console.log(`\n==================================`);
  console.log(`TOTAL OPEN TABS: ${contextPages.length}`);
  contextPages.forEach((p, idx) => {
    console.log(`Tab ${idx}: ${p.url()}`);
  });
  console.log(`==================================\n`);

  // Target the latest tab (where survey usually opens if a new window/tab was triggered)
  const activeSurveyPage = contextPages[contextPages.length - 1];
  await activeSurveyPage.bringToFront().catch(() => {});

  // Print HTML content snippet of active survey page for DOM inspection
  const activeHtml = await activeSurveyPage.content();
  console.log("=== ACTIVE PAGE HTML (first 3000 chars) ===");
  console.log(activeHtml.substring(0, 3000));
  console.log("=== ACTIVE PAGE HTML END ===\n");

  const activeSurveyPageObj = new SurveyPage(activeSurveyPage);
  const activeSurveyEngine = new SurveyEngine(activeSurveyPage, activeSurveyPageObj);

  const result = await activeSurveyEngine.run();
  console.log(`Survey completed with status: ${result.reason}, answered ${result.questionsAnswered} question(s).`);

  expect(result.questionsAnswered, `Expected at least 1 question to be answered, but got ${result.questionsAnswered}`).toBeGreaterThan(0);
  expect(result.completed, `Survey run failed: ${result.reason}`).toBe(true);
});
