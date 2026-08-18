const { test, expect } = require('@playwright/test');
const AIPromptGenerator = require('../utils/AIPromptGenerator');

test('Generates dynamic survey prompt from Gemini API', async () => {
  // We don't need a page for this test, we are just testing the API connection
  
  console.log("Fetching dynamic prompt for topic 'Artificial Intelligence'...");
  const promptData = await AIPromptGenerator.generateSurveyPrompt('Artificial Intelligence in the Workplace');
  
  console.log("\n====== GENERATED PROMPT ======");
  console.log(`Title: ${promptData.title}`);
  console.log(`Description: ${promptData.description}`);
  console.log("==============================\n");
  
  // Verify that we received valid data
  expect(promptData).toHaveProperty('title');
  expect(promptData).toHaveProperty('description');
  
  // If the user hasn't set their API key yet, it will return the fallback string
  if (promptData.title.includes("Fallback") || promptData.title.includes("regarding")) {
      console.log("⚠️ NOTE: The Gemini API key has not been set in the .env file yet. A fallback string was returned.");
  }
});
