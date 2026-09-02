const Groq = require("groq-sdk");
require('dotenv').config();

class LiveAIAssistant {
  constructor() {
    const keys = [
      process.env.GROQ_API_KEY,
      process.env.GROQ_API_KEY_2
    ].filter(k => k && typeof k === 'string' && k.trim() !== '');

    this.apiKeys = [...new Set(keys)];

    this.models = [
      process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'qwen/qwen3.6-27b',
      'qwen/qwen3.8-27b',
      'groq/compound'
    ];

    if (this.apiKeys.length === 0) {
      console.warn("\n⚠️ [LiveAIAssistant] No GROQ_API_KEY found in environment! Will fallback to heuristic/random answers.");
    } else {
      console.log(`[LiveAIAssistant] Groq AI engine active with ${this.apiKeys.length} key(s) configured.`);
    }
  }

  getGroqClient(keyIndex = 0) {
    const key = this.apiKeys[keyIndex % this.apiKeys.length];
    return key ? new Groq({ apiKey: key }) : null;
  }

  /**
   * Generates a contextual answer for the survey questionnaire.
   * @param {string} context - Background information.
   * @param {string} question - The actual question text from the UI (including any visual/image metadata).
   * @param {string} type - 'text', 'single', or 'multi'.
   * @param {string[]} options - Array of available options.
   * @param {string} mode - 'hercules' (builder) or 'consumer' (respondent).
   * @param {Array} logicRules - Survey logic rules to avoid/trigger.
   * @param {boolean} isLastQuestion - Flag for final question.
   */
  async answerQuestion(context, question, type, options = [], mode = 'hercules', logicRules = [], isLastQuestion = false) {
    if (this.apiKeys.length === 0) {
      return this._getFallbackAnswer(question, type, options);
    }

    const isNumeric = /spend|cost|price|amount|INR|rupees|money|number|how many|how much|\bage\b|\byear\b/i.test(question);
    const isAudioQuestion = /audio|sound|hear|listen|voice|clip|track|played|caw|roar|chirp|bark|meow/i.test(question) || /ATTACHED QUESTION.*AUDIO/i.test(question);
    const isVisualQuestion = /photo|picture|image|animal|bird|look at|shown in|matching|visual|identify|what is this|select the matching/i.test(question) || /ATTACHED QUESTION.*IMAGE/i.test(question);

    // Audio sound-to-picture matching is strictly a single-select question
    if ((isAudioQuestion || isVisualQuestion) && type !== 'text') {
      type = 'single';
    }

    let prompt = '';
    if (mode === 'consumer') {
      prompt = `You are a human consumer answering a market research survey. 
Answer naturally, enthusiastically, and positively as an eligible, active participant.
Do NOT mention that you are an AI.${isNumeric ? '\n\nCRITICAL NUMERIC REQUIREMENT: The question asks for a numeric value or amount. You MUST output ONLY a raw integer number (e.g. 500) with no characters, no text, no currency symbols, and no explanation.' : ''}
${isAudioQuestion ? `
CRITICAL AUDIO & SOUND RECOGNITION INSTRUCTIONS (SINGLE-SELECT ONLY):
- The question is asking you to listen to an AUDIO / SOUND (such as an animal call, bird chirp, voice, product sound, or audio clip) and select the single matching picture option that you heard.
- Carefully inspect the "ATTACHED QUESTION AUDIO / SOUND DETAILS", sound filenames (e.g., crow_caw.mp3, lion_roar.wav, sparrow.mp3), sound descriptions, and the option picture labels.
- You MUST choose exactly ONE picture option that accurately corresponds to the animal, bird, or object that produces the heard sound (e.g. if the audio is a lion roar or lion sound, select the Lion picture option; if it is a crow caw, select the Crow picture option).
- Audio and picture identification questions are strict single-choice attention checks: DO NOT guess randomly!
` : isVisualQuestion ? `
CRITICAL VISUAL & IMAGE RECOGNITION INSTRUCTIONS:
- The question is asking you to identify or match a PHOTO / PICTURE / IMAGE (such as an animal, bird, product, object, or icon).
- Carefully inspect the question text, especially any "ATTACHED QUESTION VISUAL / IMAGE DETAILS", image filenames (e.g., crow.jpg, lion.png, sparrow.jpg), and alt descriptions.
- You MUST choose the option that ACCURATELY matches what the image/photo depicts (e.g., if the image is a crow/bird, choose 'Crow'; if it depicts a lion, choose 'Lion').
- Visual identification questions are attention/quality checks: DO NOT guess randomly or choose an unrelated item!
` : `
CRITICAL PARTICIPATION & COMPLETION INSTRUCTIONS:
- You want to complete the ENTIRE survey from start to finish.
- ALWAYS choose active, positive, and qualifying answers (e.g. "I currently use this", "Very interested", "Frequently", "Yes, definitely", high satisfaction ratings 4 or 5 stars).
- NEVER choose options that disqualify, screen out, or end the survey early (e.g., do NOT choose "I have never used this", "None of the above", "Not interested", "Never", "Not applicable").
`}

Persona/Context:
${context}

The survey question on the screen is:
"${question}"
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
2. If this is a visual / picture question asking what you see in the photo, state the exact subject (e.g., "A crow sitting on a branch" or "Crow").
3. Otherwise, provide a completely unique, highly relevant answer specifically addressing the details, concepts, and choices requested in "${question}".
4. Output ONLY valid JSON in this exact format:
{ "answer": "your unique, question-tailored response here" }
`;
    } else if (type === 'single') {
      prompt += `
Available options:
${options.map((opt, i) => `${i}. ${opt}`).join('\n')}

Select exactly ONE option that best fits the context or accurately matches the image/photo/audio. If this is a shape counting question ("how many shapes are there in total"), count the distinct shapes in the main row/group of shapes shown in the image and match the exact count with the option.
Output ONLY valid JSON in this exact format, where index is the integer of the selected option:
{ "index": 0 }
`;
    } else if (type === 'multi') {
      const rankCountMatch = question.match(/(?:rank\s*(?:from)?\s*\d+\s*(?:to|-)\s*|1\s*(?:to|-)\s*|top\s+|rank\s*(?:top\s*)?|select\s*(?:up\s*to)?\s*|choose\s*(?:up\s*to)?\s*|rank\s*(?:up\s*to)?\s*)(\d+|one|two|three|four|five|six|seven|eight|nine|ten)/i);
      const wordMap = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
      const explicitCount = rankCountMatch ? (parseInt(rankCountMatch[1], 10) || wordMap[rankCountMatch[1].toLowerCase()] || 0) : 0;
      const targetCount = explicitCount > 0 ? explicitCount : (/rank/i.test(question) ? 3 : 0);

      prompt += `
Available options:
${options.map((opt, i) => `${i}. ${opt}`).join('\n')}

${targetCount > 0 ? `CRITICAL RANKING / TOP CHOICE INSTRUCTIONS:
- The question asks to rank from 1 to ${targetCount} (or select top ${targetCount} items).
- You MUST provide EXACTLY ${targetCount} distinct option indices in the 'indices' array in order of preference (e.g. [0, 1, 2]).
- NEVER return only 1 index for a 'Rank 1 to ${targetCount}' question! You must output all ${targetCount} ranked choices.` : 'Select ALL relevant options that fit the context or match the image/photo.'}
Output ONLY valid JSON in this exact format, where indices is an array of integers matching the options:
{ "indices": [0, 1, 2] }
`;
    }

    console.log(`[LiveAIAssistant] Requesting Groq AI answer for: "${question.substring(0, 70).replace(/\s+/g, ' ')}..." (Type: ${type}, Visual: ${isVisualQuestion})`);

    // Extract image URL if present for multimodal vision
    const imgUrlMatch = question.match(/https?:\/\/[^\s\)"']+\.(?:png|jpg|jpeg|webp)/i);
    const imageUrl = imgUrlMatch ? imgUrlMatch[0] : null;

    const orderedModels = isVisualQuestion && imageUrl
      ? ['qwen/qwen3.6-27b', ...this.models.filter(m => m !== 'qwen/qwen3.6-27b')]
      : this.models;

    // Try available models and keys
    for (let keyIdx = 0; keyIdx < this.apiKeys.length; keyIdx++) {
      const groqClient = this.getGroqClient(keyIdx);
      if (!groqClient) continue;

      for (const modelName of orderedModels) {
        try {
          let userContent = prompt;
          if (imageUrl && modelName === 'qwen/qwen3.6-27b') {
            userContent = [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageUrl } }
            ];
          }

          const chatCompletion = await groqClient.chat.completions.create({
            messages: [{ role: 'user', content: userContent }],
            model: modelName,
            max_tokens: 2048,
            temperature: isVisualQuestion ? 0.0 : 0.3
          });

          const responseText = (chatCompletion.choices[0]?.message?.content || '').trim();
          const parsed = this._parseJsonResponse(responseText);
          if (parsed) {
            return parsed;
          }
        } catch (err) {
          console.warn(`[LiveAIAssistant] Request failed with model ${modelName} (key #${keyIdx + 1}): ${err.message}`);
        }
      }
    }

    console.error("[LiveAIAssistant] All Groq API attempts failed, using smart fallback.");
    return this._getFallbackAnswer(question, type, options);
  }

  _parseJsonResponse(text) {
    try {
      // 1. Direct parse
      return JSON.parse(text);
    } catch (e) {
      // 2. Strip markdown code fences ```json ... ```
      const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
      try {
        return JSON.parse(cleaned);
      } catch (e2) {
        // 3. Extract JSON object substring
        const jsonMatch = text.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          try {
            return JSON.parse(jsonMatch[0]);
          } catch (e3) {}
        }
      }
    }
    return null;
  }

  _getFallbackAnswer(question, type, options) {
    // Smart heuristic: check if question has audio or image details and matches any option text
    const lowerQ = (question || '').toLowerCase();
    if (options && options.length > 0) {
      for (let i = 0; i < options.length; i++) {
        const optLower = (options[i] || '').toLowerCase().trim();
        const optClean = optLower.replace(/^option\s*\d+\s*\(image:\s*|\)$/gi, '').replace(/\(image:\s*([^)]+)\)/gi, '$1').trim();
        if ((optClean && lowerQ.includes(optClean)) || (optLower && lowerQ.includes(optLower))) {
          console.log(`[LiveAIAssistant Fallback] Audio/Image heuristic matched option index ${i}: "${options[i]}"`);
          if (type === 'single') return { index: i };
          if (type === 'multi') return { indices: [i] };
        }
      }
    }

    if (type === 'text') {
      const isNumeric = /spend|cost|price|amount|INR|rupees|money|number|how many|how much|\bage\b|\byear\b/i.test(question);
      if (isNumeric) return { answer: "500" };
      const dynamicTopics = [
        "Our study aims to collect detailed consumer feedback to guide product development and strategic decisions.",
        "We are evaluating user satisfaction, feature expectations, and pricing acceptance across key demographics.",
        "This research focuses on identifying unmet needs, purchase motivators, and improvement opportunities.",
        "The objective is to gather actionable data to optimize positioning, pricing, and user engagement."
      ];
      return { answer: dynamicTopics[Math.floor(Math.random() * dynamicTopics.length)] };
    } else if (type === 'single') {
      return { index: 0 };
    } else if (type === 'multi') {
      const len = options.length || 1;
      const numToSelect = Math.min(len, Math.floor(Math.random() * 2) + 1);
      return { indices: Array.from({ length: numToSelect }, (_, i) => i) };
    }
  }

  /**
   * Directly transcribes and listens to captured audio file using Groq Whisper,
   * then classifies the acoustic sound into the matching option without relying on filenames.
   */
  async listenAndClassifyAudio(audioFilePath, questionText, options = []) {
    const fs = require('fs');
    if (!fs.existsSync(audioFilePath)) {
      console.warn(`[LiveAIAssistant] Audio file not found at ${audioFilePath}`);
      return null;
    }

    console.log(`[LiveAIAssistant] 🎧 Listening to live audio file: ${audioFilePath} via Whisper...`);
    for (let keyIdx = 0; keyIdx < this.apiKeys.length; keyIdx++) {
      const groqClient = this.getGroqClient(keyIdx);
      if (!groqClient) continue;

      try {
        const transcription = await groqClient.audio.transcriptions.create({
          file: fs.createReadStream(audioFilePath),
          model: 'whisper-large-v3',
          prompt: 'Identify the animal sound, bird call, or spoken sound (e.g. rooster crow, dog bark, cat meow, peacock call, cow moo, bee buzz, lion roar, sheep baa, owl hoot)'
        });

        const rawHeard = (transcription?.text || '').trim();
        console.log(`[LiveAIAssistant] Whisper acoustic output: "${rawHeard}"`);

        // Ask LLM to match the acoustic description with options
        const matchPrompt = `You listened to an audio recording.
Acoustic sound detected by audio model: "${rawHeard}".
Question: "${questionText}"
Available options:
${options.map((opt, i) => `${i}. ${opt}`).join('\n')}

Which option best matches the audio sound that was heard?
Output ONLY valid JSON in format:
{ "index": 0 }
`;
        for (const modelName of this.models) {
          try {
            const chat = await groqClient.chat.completions.create({
              messages: [{ role: 'user', content: matchPrompt }],
              model: modelName,
              temperature: 0.0,
              max_tokens: 500
            });
            const parsed = this._parseJsonResponse(chat.choices[0]?.message?.content || '');
            if (parsed && parsed.index !== undefined) {
              console.log(`[LiveAIAssistant] Audio directly classified as option ${parsed.index}: "${options[parsed.index]}"`);
              return parsed;
            }
          } catch (e) {}
        }
      } catch (err) {
        console.warn(`[LiveAIAssistant] Audio transcription error with key #${keyIdx + 1}: ${err.message}`);
      }
    }
    return null;
  }
}

module.exports = new LiveAIAssistant();

