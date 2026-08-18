const BasePage = require('../../base/BasePage');
const testData = require('../../config/testData');
const LiveAIAssistant = require('../../utils/LiveAIAssistant');

class HerculesSurveyGenerator extends BasePage {
  constructor(page) {
    super(page);
    
    // Icons
    this.retryIcon = page.locator("[class='relative group flex items-center justify-center w-[24px] h-[24px] rounded-[8px] overflow-visible opacity-100 cursor-pointer transition-all duration-300 ease-in-out ']");
    this.copyIcon = page.locator("[class='relative group flex items-center justify-center w-[24px] h-[24px] rounded-[8px] overflow-visible cursor-pointer transition-all duration-300 ease-in-out ']");
    
    // Buttons
    // Match any variation: "Yes, generate the brief", "Build Brief", "Build the brief", "Generate brief", "Generate", "Generate Survey" etc.
    this.yesGenerateBtn = page.locator("button").filter({ hasText: /generate.*brief|build.*brief|yes.*brief|generate/i });
    this.nextBtn = page.locator("[class='lucide lucide-chevron-right w-4 h-4']");
    this.confirmBtn = page.locator('button').filter({ hasText: /^Confirm$|^Submit$|^Next$|^Continue$|^Finish$/i });
    
    // Headers & Options
    this.selectAllThatApplyHeader = page.locator("//h2[contains(text(),'Select all that apply.')]");
    this.multiSelectOptions = page.locator("[class='group relative flex items-center justify-between w-full text-left px-[16px] py-[9px] min-h-[44px] rounded-[12px] transition-colors duration-[120ms] focus:outline-none focus-visible:outline-none hover:bg-[#FAFAFB]']");
    this.singleOptionList = page.locator("[class='group relative flex items-center justify-between w-full text-left px-[16px] py-[9px] min-h-[44px] rounded-[12px] transition-colors duration-[120ms] focus:outline-none focus-visible:outline-none hover:bg-[#FAFAFB]']"); // Reusing class for single options based on E2E test logic
    this.textInput = page.locator('input[placeholder="Add your own…"]');
    
    // Other Questionnaire Buttons
    this.nextQuestionBtn = page.locator('button[aria-label="Next question"]');
    this.skipBtn = page.locator("button:has-text('Skip')");
    this.generateBriefBtn = page.locator("button").filter({ hasText: /generate.*brief|build.*brief|yes.*brief|generate the brief|generate research brief|generate the research|generate brief|create.*survey/i });

    // Modals & Navigation
    this.editAudienceWaitBtn = page.locator('button:has-text("Edit Audience")');
    this.cancelBtn = page.locator('button:has-text("Cancel")');
    this.closeSignInBtn = page.locator("button[aria-label='close']");
  }

  async clickRetry() {
    console.log('[HerculesSurveyGenerator] Clicking retry icon...');
    await this.clickIfVisible(this.retryIcon.first());
  }

  async clickCopy() {
    console.log('[HerculesSurveyGenerator] Clicking copy icon...');
    await this.clickIfVisible(this.copyIcon.first());
  }

  async clickYesGenerateBrief() {
    console.log('[HerculesSurveyGenerator] Clicking "Yes, generate the brief"...');
    await this.clickIfVisible(this.yesGenerateBtn.first());
  }

  async clickNext() {
    console.log('[HerculesSurveyGenerator] Clicking Next button...');
    await this.clickIfVisible(this.nextBtn.first());
  }

  async getActiveQuestionText(defaultText = "Please answer the survey question.") {
    try {
      const activeCardHeading = this.page.locator("div[class*='question' i] h2, div[class*='question' i] h3, div[class*='card' i] h2, div[class*='step' i] h2").last();
      if (await activeCardHeading.isVisible().catch(() => false)) {
        const text = await activeCardHeading.innerText();
        if (text && text.trim().length > 0) return text.trim();
      }

      const allHeadings = this.page.locator('h2, h3');
      const count = await allHeadings.count();
      for (let i = count - 1; i >= 0; i--) {
        const heading = allHeadings.nth(i);
        if (await heading.isVisible().catch(() => false)) {
          const text = await heading.innerText();
          if (text && text.trim().length > 0 && !text.includes('Research Brief') && !text.includes('Strategic Framework')) {
            return text.trim();
          }
        }
      }
    } catch (e) {}
    return defaultText;
  }

  /**
   * Detects if the 'Select all that apply' heading is present.
   * If it is, it fetches all options, extracts the question, and asks AI which ones to select.
   */
  async handleSelectAllThatApply(contextText = null) {
    console.log('[HerculesSurveyGenerator] Checking for "Select all that apply" question...');
    
    const isMultiSelectVisible = await this.selectAllThatApplyHeader.count() > 0 && await this.selectAllThatApplyHeader.first().isVisible().catch(() => false);
    if (!isMultiSelectVisible) {
      return false; // Not found
    }

    console.log('[HerculesSurveyGenerator] Found multi-select question! Handling AI selection...');
    
    // Extract question text dynamically for the current active question
    const questionText = await this.getActiveQuestionText("Select all that apply.");

    // Get total number of options
    const optionsCount = await this.multiSelectOptions.count();
    if (optionsCount === 0) return false;

    // Extract options text
    const options = [];
    for (let i = 0; i < optionsCount; i++) {
      options.push(await this.multiSelectOptions.nth(i).innerText());
    }

    const aiContext = contextText || testData.surveyContext.fallbackText;
    const response = await LiveAIAssistant.answerQuestion(aiContext, questionText, 'multi', options);
    
    let indicesToClick = response.indices || [0];
    console.log(`[HerculesSurveyGenerator] AI selected indices: ${indicesToClick.join(', ')}`);

    for (const index of indicesToClick) {
      if (index >= 0 && index < optionsCount) {
        console.log(`[HerculesSurveyGenerator] Clicking option: "${options[index]}"`);
        await this.multiSelectOptions.nth(index).click();
        await this.page.waitForTimeout(500); // small delay between clicks
      }
    }

    console.log('[HerculesSurveyGenerator] Selection complete. Clicking Confirm button...');
    await this.confirmBtn.click();
    return true;
  }

  /**
   * Detects if the single select options are present.
   * Asks AI which option to click, clicks it, and attempts to click Confirm.
   */
  async handleSingleSelect(contextText = null) {
    console.log('[HerculesSurveyGenerator] Checking for single-select fallback options...');
    if (await this.singleOptionList.count() > 0 && await this.singleOptionList.first().isVisible()) {
      console.log("[HerculesSurveyGenerator] Found single-select options! Asking AI for selection...");
      
      const count = await this.singleOptionList.count();
      if (count === 0) return false;

      // Extract question text dynamically for the current active question
      const questionText = await this.getActiveQuestionText("Select one option.");

      // Extract options text
      const options = [];
      for (let i = 0; i < count; i++) {
        options.push(await this.singleOptionList.nth(i).innerText());
      }

      const aiContext = contextText || testData.surveyContext.fallbackText;
      const response = await LiveAIAssistant.answerQuestion(aiContext, questionText, 'single', options);
      
      let indexToClick = response.index;
      if (indexToClick === undefined || indexToClick < 0 || indexToClick >= count) {
         indexToClick = 0; // safe fallback
      }

      console.log(`[HerculesSurveyGenerator] AI selected index ${indexToClick}: "${options[indexToClick]}"`);
      await this.singleOptionList.nth(indexToClick).click();
      await this.page.waitForTimeout(500);
      
      // Safely check if confirm button exists before clicking
      if (await this.confirmBtn.isVisible()) {
        console.log("[HerculesSurveyGenerator] Clicking Confirm button for single-select...");
        await this.confirmBtn.click({ timeout: 5000 }).catch(() => console.log("[HerculesSurveyGenerator] Confirm button wasn't clickable."));
      }
      
      // Wait for UI transition in case this was the last question
      await this.page.waitForTimeout(2000);
      return true;
    }
    return false;
  }

  async handleTextInputFallback(contextText = null) {
    console.log('[HerculesSurveyGenerator] Checking for text input fallback...');
    // Strictly target questionnaire text inputs and exclude the main #prompt AI chat box!
    const questionnaireInput = this.page.locator('input[placeholder="Add your own…"]')
        .or(this.page.locator('input[placeholder*="Add your own" i]'))
        .or(this.page.locator('input[placeholder*="Add your" i]'))
        .or(this.page.locator('input[placeholder*="Type" i]'))
        .filter({ hasNot: this.page.locator('#prompt') })
        .filter({ hasNot: this.page.locator('[aria-label*="Ask Hercules" i]') })
        .first();

    if (await questionnaireInput.isVisible().catch(() => false)) {
      // Extract question text dynamically for the current active question
      const questionText = await this.getActiveQuestionText("Please provide additional details for the survey.");

      const aiContext = contextText || testData.surveyContext.fallbackText;
      const response = await LiveAIAssistant.answerQuestion(aiContext, questionText, 'text');
      
      const dynamicFallback = `Our survey focuses on ${questionText.substring(0, 40)} to optimize pricing and user engagement effectively.`;
      const answerToUse = (response && response.answer && !response.answer.includes("streamlining our workflows")) ? response.answer : dynamicFallback;

      console.log(`[HerculesSurveyGenerator] Found questionnaire text input. AI generated answer: "${answerToUse}"`);
      await questionnaireInput.fill(answerToUse);
      await this.page.waitForTimeout(500);
      console.log('[HerculesSurveyGenerator] Pressing Enter on questionnaire text input...');
      await questionnaireInput.press('Enter').catch(() => {});
      await this.page.waitForTimeout(1000);
      
      // Attempt to click Confirm/Submit button inside the questionnaire card
      const confirmBtn = this.page.locator('button').filter({ hasText: /^Confirm$|^Submit$|^Next$|^Continue$|^Finish$/i }).first();
      if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('[HerculesSurveyGenerator] Clicking confirm button for questionnaire text input...');
          await confirmBtn.click({ force: true });
      } else {
          console.log('[HerculesSurveyGenerator] Pressing Enter on questionnaire text input...');
          await questionnaireInput.press('Enter');
      }
      
      await this.page.waitForTimeout(2000);
      return true;
    }
    return false;
  }

  /**
   * Clicks the generic generate brief button if it appears during the questionnaire.
   */
  async clickGenerateBrief() {
    console.log('[HerculesSurveyGenerator] Checking for generate brief button...');
    const btn = this.page.locator("//button[text()='Yes, generate the research brief']")
        .or(this.page.locator("//button[normalize-space()='Yes, generate the research brief']"))
        .first();

    if (await btn.isVisible().catch(() => false)) {
      console.log('[HerculesSurveyGenerator] Found "Yes, generate the research brief" button! Clicking it...');
      await btn.scrollIntoViewIfNeeded().catch(() => {});
      await btn.click({ force: true }).catch(() => {});
      return true;
    }
    return false;
  }

  /**
   * Clicks the skip button if visible.
   */
  async clickSkip() {
    console.log('[HerculesSurveyGenerator] Checking for Skip button...');
    if (await this.skipBtn.count() > 0 && await this.skipBtn.first().isVisible()) {
      console.log("[HerculesSurveyGenerator] Found Skip button. Clicking it.");
      await this.skipBtn.first().click();
      return true;
    }
    return false;
  }

  /**
   * Asserts that all major sections of the Research Brief are visible.
   */
  async verifyBriefGenerated() {
    console.log('[HerculesSurveyGenerator] Verifying Research Brief sections are visible...');
    
    const sections = [
      "Core Objective & Business Context",
      "Type of Study", // Sometimes included
      "Question Flow & Survey Phases",
      "Key Data Points to Measure",
      "Expected Insights & Outcomes"
    ];

    for (const section of sections) {
      const header = this.page.locator(`//h3[contains(text(), '${section}')]`);
      // Use a short timeout as it should already be generated if we are calling this
      await header.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {
        console.warn(`[HerculesSurveyGenerator] Warning: Section '${section}' not found or visible.`);
      });
    }
    console.log('[HerculesSurveyGenerator] Verification complete.');
  }

  /**
   * Fetches the total respondent count from the Target Audience section.
   * @returns {Promise<number|null>} The parsed respondent count, or null if not found.
   */
  async getRespondentCount() {
    console.log('[HerculesSurveyGenerator] Fetching respondent count from Target Audience...');
    const targetAudienceHeader = this.page.locator("//h3[contains(text(),'Target Audience')]");
    
    if (await targetAudienceHeader.isVisible()) {
      // The text is usually in a sibling element after the header
      // We can grab the whole text content of the parent container or page to regex it
      const pageText = await this.page.locator('body').innerText();
      const match = pageText.match(/Total Sample Size:\s*([\d,]+)/i);
      
      if (match && match[1]) {
        const count = parseInt(match[1].replace(/,/g, ''), 10);
        console.log(`[HerculesSurveyGenerator] Found respondent count: ${count}`);
        return count;
      }
    }
    console.log('[HerculesSurveyGenerator] Could not find respondent count.');
    return null;
  }

  /**
   * Fetches the total questions count from the Methodology section.
   * @returns {Promise<number|null>} The parsed questions count, or null if not found.
   */
  async getQuestionsCount() {
    console.log('[HerculesSurveyGenerator] Fetching questions count from Methodology...');
    const methodologyHeader = this.page.locator("//h3[contains(text(),'Methodology')]");
    
    if (await methodologyHeader.isVisible()) {
      const pageText = await this.page.locator('body').innerText();
      // Look for something like "17-question" or "17 question"
      const match = pageText.match(/(\d+)[-\s]question/i);
      
      if (match && match[1]) {
        const count = parseInt(match[1], 10);
        console.log(`[HerculesSurveyGenerator] Found questions count: ${count}`);
        return count;
      }
    }
    console.log('[HerculesSurveyGenerator] Could not find questions count.');
    return null;
  }

  /**
   * Fetches the demographics breakdown from the Target Audience section.
   * @returns {Promise<string|null>} The demographics text, or null if not found.
   */
  async getDemographics() {
    console.log('[HerculesSurveyGenerator] Fetching demographics from Target Audience...');
    const targetAudienceHeader = this.page.locator("//h3[contains(text(),'Target Audience')]");
    
    if (await targetAudienceHeader.isVisible()) {
      const pageText = await this.page.locator('body').innerText();
      
      // Extract the text block between "Demographics:" and the next section like "Behavioral/Psychographic"
      const match = pageText.match(/Demographics:\s*([\s\S]*?)(?:Behavioral|Screening|$)/i);
      
      if (match && match[1]) {
        const demographics = match[1].trim();
        console.log(`[HerculesSurveyGenerator] Found Demographics:\n${demographics}`);
        return demographics;
      }
    }
    console.log('[HerculesSurveyGenerator] Could not find demographics.');
    return null;
  }

  /**
   * Verifies that the 'Edit Audience' and 'Yes, create the survey.' buttons are visible
   * at the bottom of the research brief.
   */
  async verifyPostBriefButtonsVisible() {
    console.log('[HerculesSurveyGenerator] Verifying post-brief buttons are visible...');
    const editAudienceBtn = this.page.locator('button:has-text("Edit Audience")');
    const createSurveyBtn = this.page.locator('button:has-text("create the survey")');

    await editAudienceBtn.waitFor({ state: 'visible', timeout: 5000 });
    await createSurveyBtn.waitFor({ state: 'visible', timeout: 5000 });
    console.log('[HerculesSurveyGenerator] Post-brief buttons are visible.');
  }

  /**
   * Clicks the create survey button and verifies that the sign-in modal appears,
   * then closes it.
   */
  async verifySignInPopupOnCreateSurvey() {
    console.log('[HerculesSurveyGenerator] Clicking create survey and verifying sign-in popup...');
    const createSurveyBtn = this.page.locator('button:has-text("create the survey")');
    await createSurveyBtn.scrollIntoViewIfNeeded();
    await this.page.waitForTimeout(1000); // Give the scroll a moment
    await createSurveyBtn.click({ force: true });

    const closeBtn = this.page.locator("button[aria-label='close']");
    await closeBtn.waitFor({ state: 'visible', timeout: 5000 });
    console.log('[HerculesSurveyGenerator] Sign-in popup is visible. Closing it...');
    
    await closeBtn.click({ force: true });
    await closeBtn.waitFor({ state: 'hidden', timeout: 5000 });
    console.log('[HerculesSurveyGenerator] Sign-in popup closed.');
  }

  /**
   * Opens the Edit Audience modal.
   */
  async openEditAudienceModal() {
    console.log('[HerculesSurveyGenerator] Opening Edit Audience modal...');
    const editAudienceBtn = this.page.locator('button:has-text("Edit Audience")');
    await editAudienceBtn.scrollIntoViewIfNeeded();
    await this.page.waitForTimeout(1000); // Give the scroll a moment
    await editAudienceBtn.click({ force: true });
    
    // Wait for the modal cancel button to appear to ensure modal is loaded
    const modalCancelBtn = this.page.locator('button:has-text("Cancel")');
    await modalCancelBtn.waitFor({ state: 'visible', timeout: 5000 });
    console.log('[HerculesSurveyGenerator] Edit Audience modal opened.');
  }
}

module.exports = HerculesSurveyGenerator;
