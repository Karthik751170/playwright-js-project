const Groq = require("groq-sdk");
require('dotenv').config();

class LiveAIAssistant {
  constructor() {
    this.apiKey = process.env.GROQ_API_KEY;
    if (!this.apiKey) {
      console.warn("\n⚠️ [LiveAIAssistant] GROQ_API_KEY is not set in .env! Will fallback to random/hardcoded answers.");
    } else {
      this.groq = new Groq({ apiKey: this.apiKey });
    }
  }

  /**
   * Generates a contextual answer for the survey questionnaire.
   * @param {string} context - Background information.
   * @param {string} question - The actual question text from the UI.
   * @param {string} type - 'text', 'single', or 'multi'.
   * @param {string[]} options - Array of available options.
   * @param {string} mode - 'hercules' (builder) or 'consumer' (respondent).
   */
  async answerQuestion(context, question, type, options = [], mode = 'hercules', logicRules = [], isLastQuestion = false) {
    if (!this.apiKey) {
      return this._getFallbackAnswer(type, options);
    }

    try {
      let prompt = '';
      if (mode === 'consumer') {
          const isNumeric = /spend|cost|price|amount|INR|rupees|money|number|how many|how much|\bage\b|\byear\b/i.test(question);
          prompt = `You are a human consumer answering a market research survey. 
Answer naturally, honestly, and decisively as a real person matching the persona described below.
Do NOT mention that you are an AI.${isNumeric ? '\n\nCRITICAL: The question asks for a numeric value or amount. You MUST output ONLY a raw integer number (e.g. 500) with no characters, no text, no currency symbols, and no explanation.' : ''}

Crucially, for this specific survey, you must answer POSITIVELY to all questions (e.g. select highly positive feedback, high satisfaction ratings, agreement cards, or write optimistic and supportive comments about the topics).

Persona/Context:
${context}

The survey question on the screen is:
"${question}"
${(!isLastQuestion && logicRules && logicRules.length > 0) ? `\nCRITICAL LOGIC RULES AVOIDANCE:\nThe survey has hidden screen-out logic. To successfully complete the survey without being disqualified, you MUST AVOID answering in a way that triggers any of the following logic conditions:\n${logicRules.map((rule, i) => `(Logic ${i + 1}) ${rule.text}`).join('\n')}\nMake absolutely sure your answer DOES NOT match or trigger these conditions!` : ''}
`;
      } else {
          prompt = `You are a Hercules Survey Analyst. You represent Hercules (the AI-powered survey creator platform), and your client is the user/company described in the context below.
Your goal is to help your client build a highly effective and professional market research survey on their concepts.
Answer the adaptive survey questionnaire questions on behalf of your client to design their survey.
Crucially, you MUST maintain consistent context of the topic throughout all questions. Always provide highly detailed, expert, and comprehensive survey design answers so Hercules has enough rich context to finalize the survey quickly. Do NOT leave any field blank or give short/generic answers.
Do NOT mention that you are an AI, a language model, or an AI assistant. Speak as a professional Survey Analyst.

Background context about your client and their concept/survey needs:
${context}

The question on the screen is:
"${question}"
`;
      }

      if (type === 'text') {
        prompt += `
CRITICAL INSTRUCTIONS FOR TEXT RESPONSE:
1. Carefully analyze the EXACT question asked: "${question}"
2. Provide a completely unique, highly relevant answer specifically addressing the details, concepts, and choices requested in "${question}".
3. Do NOT mention generic workflow streamlining or repeat answers from previous questions. Make this answer distinctly tailored ONLY to "${question}".
4. Write 2-3 informative, professional sentences.

Output ONLY valid JSON in this exact format:
{ "answer": "your unique, question-tailored response here" }
`;
      } else if (type === 'single') {
        prompt += `
Available options:
${options.map((opt, i) => `${i}. ${opt}`).join('\n')}

Select exactly ONE option that best fits the context.
Output ONLY valid JSON in this exact format, where index is the integer of the selected option:
{ "index": 0 }
`;
      } else if (type === 'multi') {
        prompt += `
Available options:
${options.map((opt, i) => `${i}. ${opt}`).join('\n')}

Select ALL relevant options that fit the context. You should select the MAXIMUM number of options possible that make logical sense. Providing more options gives the system better context to build the survey without asking more questions.
Output ONLY valid JSON in this exact format, where indices is an array of integers matching the options:
{ "indices": [0, 1, 2, 3] }
`;
      }

      console.log(`[LiveAIAssistant] Requesting Groq AI answer for: "${question.substring(0, 50)}..."`);
      
      const chatCompletion = await this.groq.chat.completions.create({
        messages: [
          { role: 'user', content: prompt }
        ],
        model: 'openai/gpt-oss-20b',
        temperature: 0.3
      });
      
      const responseText = chatCompletion.choices[0]?.message?.content;
      return JSON.parse(responseText);

    } catch (error) {
      console.error("[LiveAIAssistant] AI generation failed, using fallback:", error.message);
      return this._getFallbackAnswer(type, options);
    }
  }

  _getFallbackAnswer(type, options) {
    if (type === 'text') {
      const dynamicTopics = [
        "Our study aims to collect detailed consumer feedback to guide product development and strategic decisions.",
        "We are evaluating user satisfaction, feature expectations, and pricing acceptance across key demographics.",
        "This research focuses on identifying unmet needs, purchase motivators, and improvement opportunities.",
        "The objective is to gather actionable data to optimize positioning, pricing, and user engagement."
      ];
      return { answer: dynamicTopics[Math.floor(Math.random() * dynamicTopics.length)] };
    } else if (type === 'single') {
      return { index: Math.floor(Math.random() * (options.length || 1)) };
    } else if (type === 'multi') {
      const len = options.length || 1;
      const numToSelect = Math.min(len, Math.floor(Math.random() * 3) + 1);
      const indices = Array.from({ length: len }, (_, i) => i);
      return { indices: indices.sort(() => 0.5 - Math.random()).slice(0, numToSelect) };
    }
  }
}

module.exports = new LiveAIAssistant();
