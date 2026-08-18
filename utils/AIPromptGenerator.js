const fs = require('fs');
const path = require('path');

class AIPromptGenerator {
  /**
   * Generates a dynamic survey prompt by picking a random entry from our offline mock database.
   * This guarantees 100% reliability and speed without needing API keys!
   * @param {string} topic - (Optional) Retained for backwards compatibility, but ignored in favor of diverse mock data.
   * @returns {Promise<{title: string, description: string}>} - The generated title and description.
   */
  static async generateSurveyPrompt(topic = 'General') {
    try {
      const fixturePath = path.join(__dirname, '..', 'fixtures', 'survey_prompts.json');
      
      if (!fs.existsSync(fixturePath)) {
        throw new Error("survey_prompts.json not found!");
      }

      const rawData = fs.readFileSync(fixturePath, 'utf8');
      const prompts = JSON.parse(rawData);

      if (prompts.length === 0) {
        throw new Error("No more prompts left in survey_prompts.json! Please regenerate the file.");
      }

      // Pick a random prompt from the available ones
      const randomIndex = Math.floor(Math.random() * prompts.length);
      const selectedPrompt = prompts[randomIndex];

      // Remove the used prompt from the array
      prompts.splice(randomIndex, 1);

      // Save the updated array back to the JSON file
      fs.writeFileSync(fixturePath, JSON.stringify(prompts, null, 2));

      console.log(`[AIPromptGenerator] Randomly selected offline prompt: "${selectedPrompt.title}". (${prompts.length} prompts remaining)`);
      return selectedPrompt;

    } catch (error) {
      console.error("[AIPromptGenerator] Failed to read from offline fixtures:", error.message);
      // Absolute fallback just in case the file gets deleted
      return {
        title: `Fallback Survey: ${topic}`,
        description: `Unable to load static content due to an error. Topic is ${topic}.`
      };
    }
  }
}

module.exports = AIPromptGenerator;
