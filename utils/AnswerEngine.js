const UploadUtil = require("./UploadUtil");

class AnswerEngine {

    constructor(page, surveyLogics = []) {
        this.page = page;
        this.surveyLogics = surveyLogics;
        this.uploadedQuestions = new Set();
    }

    getAiContext() {
        let baseContext = "I am a consumer taking a market research survey.";
        if (this.surveyLogics && this.surveyLogics.length > 0) {
            const logicsText = this.surveyLogics.map(l => l.text).join('\n\n');
            baseContext += `\n\nCRITICAL INSTRUCTION: DO NOT select answers that would trigger any of the following early termination or skip logics! Avoid them at all costs:\n${logicsText}`;
        }
        return baseContext;
    }

    async dumpActiveQuestionDOM(elements) {
        try {
            const container = elements.activeQuestion;
            if (!container) return;

            const fs = require('fs');
            const path = require('path');
            
            const html = await container.innerHTML().catch(() => "");
            
            const scratchDir = '/Users/karthiku/playwright-js-project/scratch';
            if (!fs.existsSync(scratchDir)) {
                fs.mkdirSync(scratchDir, { recursive: true });
            }
            
            fs.writeFileSync(path.join(scratchDir, 'active_question_dom.html'), html);
            console.log(`[AnswerEngine] Dumped HTML of active question to: scratch/active_question_dom.html`);
        } catch (err) {
            console.error("[AnswerEngine] Failed to dump active question DOM:", err.message);
        }
    }

    async answer(elements, isLastQuestion = false) {
        const activeQ = elements.activeQuestion;
        if (activeQ) {
            const text = await activeQ.innerText().catch(() => "");
            console.log(`[AnswerEngine] Inspecting Active Question: "${text.substring(0, 150).replace(/\s+/g, ' ')}..."`);
            await this.dumpActiveQuestionDOM(elements);
        }

        await this.handleMoreOptions(elements);
        const playedVideo = await this.handleVideo(elements);
        if (playedVideo) {
            const ActiveQuestionFinder = require("./ActiveQuestionFinder");
            const finder = new ActiveQuestionFinder(this.page);
            const activeData = await finder.getActiveQuestion(5000);
            if (activeData && activeData.container) {
                elements.activeQuestion = activeData.container;
                console.log("[AnswerEngine] Active question re-fetched post-video to avoid stale element reference.");
                await this.dumpActiveQuestionDOM(elements);
            }
        }

        const handlers = [
            this.answerRanking?.bind(this),
            this.answerFileUpload?.bind(this),
            this.answerCustomOptionCard?.bind(this),
            this.answerTextbox?.bind(this),
            this.answerDropdown?.bind(this), // Move Dropdown BEFORE SingleChoice/Checkbox
            this.answerRating?.bind(this),
            this.answerYesNo?.bind(this),
            this.answerCheckbox?.bind(this),
            this.answerMultiSelect?.bind(this),
            this.answerSingleChoice?.bind(this),
            this.answerRadio?.bind(this),
            this.answerGenericOption?.bind(this)
        ].filter(Boolean);

        for (const handler of handlers) {

            const handled = await handler(elements);

            if (handled) {
                return true;
            }
        }

        return false;
    }

    // ============================================
    // More Options
    // ============================================

    async handleMoreOptions(elements) {
        try {
            let maxAttempts = 10;
            while (maxAttempts > 0) {
                maxAttempts--;
                const candidates = this.page.locator("//p[contains(text(), 'More options') or contains(text(), 'more options')] | //span[contains(text(), 'More options') or contains(text(), 'more options')] | //button[contains(., 'More options') or contains(., 'more options')] | //div[contains(text(), 'More options') or contains(text(), 'more options')]");

                const count = await candidates.count();
                let clickedAny = false;

                for (let i = 0; i < count; i++) {
                    const btn = candidates.nth(i);
                    if (await btn.isVisible().catch(() => false)) {
                        const text = ((await btn.innerText().catch(() => "")) || "").trim();
                        if (/more options/i.test(text) && text.length < 40) {
                            console.log(`[AnswerEngine] Found 'More options' button ("${text.replace(/\s+/g, ' ')}")! Expanding options...`);
                            await btn.scrollIntoViewIfNeeded().catch(() => {});
                            await this.page.waitForTimeout(500);
                            await btn.click({ force: true, timeout: 5000 }).catch(async () => {
                                await btn.evaluate(el => el.click()).catch(() => {});
                            });
                            await this.page.waitForTimeout(1500); // Allow DOM options to expand
                            clickedAny = true;
                            break;
                        }
                    }
                }

                if (!clickedAny) {
                    break;
                }
            }
        } catch (e) {
            console.log("[AnswerEngine] Error in handleMoreOptions loop:", e.message);
        }
    }

    // ============================================
    // Video
    // ============================================

    async handleVideo(elements) {
        try {
            const play =
                elements.activeQuestion
                    .locator("div")
                    .filter({ hasText: /^▶ Play$/ })
                    .first();

            if (await play.count()) {
                console.log("Playing video");
                await play.click();
                await this.page.waitForTimeout(60000);
                return true;
            }
        } catch (e) {}
        return false;
    }

    // ============================================
    // Custom React Option Cards (ImageCombo / Flex Cards)
    // ============================================

    async answerCustomOptionCard(elements) {
        try {
            const container = elements.activeQuestion;

            // Target option cards with cursor: pointer or inside optionContainer / optionSection
            const cards = container.locator('div[style*="cursor: pointer"], div[class*="optionContainer"] div[style*="cursor: pointer"], div[class*="optionSection"] p');
            const count = await cards.count();

            if (count > 0) {
                const candidates = [];
                for (let i = 0; i < count; i++) {
                    const card = cards.nth(i);
                    const text = ((await card.innerText().catch(() => "")) || "").trim();

                    if (text && !/Next|Continue|More options|^\d+\/\d+$/i.test(text)) {
                        candidates.push({ card, text });
                    }
                }

                if (candidates.length > 0) {
                    const questionText = ((await elements.activeQuestion.innerText().catch(()=>"")) || "");
                    const isMulti = /select all|choose all|multiple|all that apply/i.test(questionText);
                    const aiContext = this.getAiContext();
                    
                    const optionsText = candidates.map(c => c.text);
                    let indicesToClick = [];

                    try {
                        const LiveAIAssistant = require('./LiveAIAssistant');
                        const type = isMulti ? 'multi' : 'single';
                        const response = await LiveAIAssistant.answerQuestion(aiContext, questionText, type, optionsText, 'consumer');
                        
                        if (isMulti && response && response.indices) {
                            indicesToClick = response.indices;
                        } else if (!isMulti && response && response.index !== undefined) {
                            indicesToClick = [response.index];
                        }
                    } catch (err) {
                        console.log("[AnswerEngine] AI generation failed for option cards, falling back to random.");
                    }
 
                    // Fallback to random if AI fails
                    if (indicesToClick.length === 0) {
                        const numToSelect = isMulti ? Math.min(candidates.length, Math.floor(Math.random() * 3) + 2) : 1;
                        // Shuffle candidates and pick first `numToSelect`
                        const shuffled = [...Array(candidates.length).keys()].sort(() => 0.5 - Math.random());
                        indicesToClick = shuffled.slice(0, numToSelect);
                    }
                    
                    for (const idx of indicesToClick) {
                        if (idx >= 0 && idx < candidates.length) {
                            const selected = candidates[idx];
                            console.log(`[AnswerEngine] React Option Card selected: "${selected.text.substring(0, 40)}"`);
                            await selected.card.scrollIntoViewIfNeeded().catch(() => {});
                            await selected.card.click({ force: true }).catch(async () => {
                                await selected.card.evaluate(el => el.click()).catch(()=>{});
                            });
                            await this.page.waitForTimeout(500);
                        }
                    }
                    return true;
                }
            }
        } catch (e) {
            console.error("Error in answerCustomOptionCard:", e.message);
        }
        return false;
    }

    // ============================================
    // Upload
    // ============================================

    async answerFileUpload(elements) {
        try {
            const container = elements.activeQuestion;
            if (!container) return false;

            const uploadElement = container.locator('input[type="file"], [class*="upload" i], [class*="Upload" i], button:has-text("Upload"), label:has-text("Upload")');
            if (await uploadElement.count() > 0) {
                console.log("[AnswerEngine] File upload element detected in active question container.");
                const uploaded = await UploadUtil.upload(this.page, container);
                if (uploaded) {
                    console.log("[AnswerEngine] File upload completed successfully.");
                    return true;
                }
            }
        } catch (e) {
            console.error("Error in answerFileUpload:", e.message);
        }
        return false;
    }

    // ============================================
    // Rating
    // ============================================

    async answerRating(elements) {

        const buttons =
            elements.activeQuestion.getByRole("button");

        const ratings = [];

        const count = await buttons.count();

        for (let i = 0; i < count; i++) {

            const button = buttons.nth(i);

            const text =
                ((await button.textContent()) || "").trim();

            if (/^\d+$/.test(text))
                ratings.push(button);
        }

        if (!ratings.length)
            return false;

        const selectIdx = ratings.length > 1
            ? (Math.random() > 0.5 ? ratings.length - 1 : ratings.length - 2)
            : 0;

        await ratings[selectIdx].click();

        console.log(
            "Rating:",
            await ratings[selectIdx].textContent()
        );

        return true;
    }

    // ============================================
    // Yes / No
    // ============================================

    async answerYesNo(elements) {

        const buttons =
            elements.activeQuestion.getByRole("button");

        const options = [];

        const count = await buttons.count();

        for (let i = 0; i < count; i++) {

            const button = buttons.nth(i);

            const text =
                ((await button.textContent()) || "").trim();

            if (/^(yes|no)$/i.test(text))
                options.push(button);
        }

        if (!options.length)
            return false;

        const random =
            Math.floor(Math.random() * options.length);

        await options[random].click();

        return true;
    }

    // ============================================
    // Checkbox & Multi Select
    // ============================================

    async answerCheckbox(elements) {
        try {
            const container = elements.activeQuestion;
            const checkboxes = container.locator('input[type="checkbox"], [role="checkbox"], label:has(input[type="checkbox"])');
            const count = await checkboxes.count();
            if (count > 0) {
                const random = Math.floor(Math.random() * count);
                const target = checkboxes.nth(random);
                await target.click({ force: true }).catch(async () => {
                    await target.evaluate(el => el.click());
                });
                console.log(`Checked checkbox option ${random + 1} of ${count}`);
                return true;
            }
        } catch (e) {}
        return false;
    }

    async answerMultiSelect(elements) {
        return await this.answerCheckbox(elements);
    }

    // ============================================
    // Single Choice & Radio
    // ============================================

    async answerSingleChoice(elements) {
        try {
            const container = elements.activeQuestion;

            // 1. Radio inputs
            const radios = container.locator('input[type="radio"], [role="radio"]');
            if (await radios.count() > 0) {
                const count = await radios.count();
                const random = Math.floor(Math.random() * count);
                const target = radios.nth(random);
                await target.scrollIntoViewIfNeeded().catch(() => {});
                await target.click({ force: true }).catch(async () => {
                    await target.evaluate(el => el.click());
                });
                console.log(`Selected radio option ${random + 1} of ${count}`);
                return true;
            }

            // 2. Buttons representing options (excluding Next/Continue/More/Submit/Save buttons)
            const optionButtons = container.locator('button').filter({
                hasNotText: /Next|Continue|More|Submit|Save|Play|Options/i
            });
            if (await optionButtons.count() > 0) {
                const count = await optionButtons.count();
                
                // If it looks like a 5-point rating grid (e.g. 5, 10, 15, 20 buttons)
                if (count % 5 === 0 && count > 0) {
                    console.log(`[AnswerEngine] Grid rating detected with ${count} buttons. Clicking positive options...`);
                    const rows = count / 5;
                    for (let r = 0; r < rows; r++) {
                        const col = Math.random() > 0.5 ? 4 : 3; // 4 or 5 star
                        const selectIdx = r * 5 + col;
                        const target = optionButtons.nth(selectIdx);
                        await target.scrollIntoViewIfNeeded().catch(() => {});
                        await target.click({ force: true }).catch(async () => {
                            await target.evaluate(el => el.click());
                        });
                        console.log(`Selected positive rating button ${selectIdx + 1} of ${count}`);
                    }
                    return true;
                }
                
                let selectIdx = Math.floor(Math.random() * count);
                
                // If buttons represent numeric ratings (digits), select a high positive rating (4 or 5)
                let allDigits = true;
                const buttonTexts = [];
                for (let j = 0; j < count; j++) {
                    const txt = ((await optionButtons.nth(j).innerText().catch(() => "")) || "").trim();
                    buttonTexts.push(txt);
                    if (!/^\d+$/.test(txt)) {
                        allDigits = false;
                    }
                }
                if (allDigits && count > 1) {
                    selectIdx = count > 1 ? (Math.random() > 0.5 ? count - 1 : count - 2) : 0;
                    console.log(`[AnswerEngine] Option buttons look like ratings: ${buttonTexts.join(', ')}. Selecting high rating index ${selectIdx}`);
                }

                const target = optionButtons.nth(selectIdx);
                await target.click({ force: true }).catch(async () => {
                    await target.evaluate(el => el.click());
                });
                console.log(`Selected option button ${selectIdx + 1} of ${count}`);
                return true;
            }

            // 3. Option labels or option item elements
            const optionItems = container.locator('label, div[class*="option"], div[class*="choice"], div[class*="answer"], div[class*="item"], div[class*="card"], [data-option]');
            if (await optionItems.count() > 0) {
                const count = await optionItems.count();
                // Pick a candidate that isn't the outer question container or Next button
                for (let i = 0; i < count; i++) {
                    const item = optionItems.nth(i);
                    const text = ((await item.innerText().catch(() => "")) || "").trim();
                    if (text && !/Next|Continue|More options/i.test(text)) {
                        await item.click({ force: true }).catch(async () => {
                            await item.evaluate(el => el.click());
                        });
                        console.log(`Selected option item ${i + 1} ("${text.substring(0, 30)}")`);
                        return true;
                    }
                }
            }
        } catch (e) {
            console.error("Error in answerSingleChoice:", e.message);
        }
        return false;
    }

    async answerRadio(elements) {
        return await this.answerSingleChoice(elements);
    }

    // ============================================
    // Dropdown
    // ============================================
    async answerDropdown(elements) {
        const question = elements.activeQuestion;
        
        // Find dropdowns within the question to avoid scoping issues with previous slides
        let dropdown = question.locator("button[data-testid^='ranking-option-']:not([data-testid*='-rank-'])");
        let numDropdowns = await dropdown.count();

        if (numDropdowns === 0) {
            dropdown = question.locator("img[alt='Dropdown']");
            numDropdowns = await dropdown.count();
        }

        if (numDropdowns === 0) {
            return false;
        }

        console.log(`Dropdown question detected with ${numDropdowns} dropdowns.`);

        for (let d = 0; d < numDropdowns; d++) {
            // Open dropdown
            await dropdown.nth(d).click({ force: true });

            await this.page.waitForTimeout(1500);

            const modal = this.page.locator("//div[@role='dialog']").first();
            const buttons = modal.getByRole("button").filter({ hasNotText: 'Save' });
            const options = [];

            const count = await buttons.count();

            for (let i = 0; i < count; i++) {
                const button = buttons.nth(i);

                if (!(await button.isVisible().catch(() => false))) {
                    continue;
                }

                const text = ((await button.textContent()) || "").trim();

                if (!text) {
                    continue;
                }

                // Ignore action buttons
                if (/^(next|save|close|cancel|back|continue|submit)$/i.test(text)) {
                    continue;
                }

                options.push(button);
            }

            if (options.length === 0) {
                console.log(`No dropdown options found for dropdown ${d + 1}.`);
                continue;
            }

            // Random option
            const randomIndex = Math.floor(Math.random() * options.length);
            const selectedText = ((await options[randomIndex].textContent()) || "").trim();

            await options[randomIndex].click();
            console.log(`Selected dropdown option for dropdown ${d + 1}:`, selectedText);

            await this.page.waitForTimeout(500);

            // Click Save if it appears
            const save = this.page
                .locator("p")
                .filter({ hasText: /^Save$/ })
                .first();

            if (
                await save.count() > 0 &&
                await save.isVisible().catch(() => false)
            ) {
                await save.click();
                console.log(`Dropdown ${d + 1} saved.`);
                await this.page.waitForTimeout(500);
            }
        }

        return true;
    }

    // ============================================
    // Textbox
    // ============================================

    async answerTextbox(elements) {
        try {
            const container = elements.activeQuestion;
            const textbox = container.locator('input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="range"]):not([type="file"]), textarea, [role="textbox"]').first();
            if (!(await textbox.count()) || !(await textbox.isVisible().catch(() => false))) return false;

            const questionText = ((await container.innerText().catch(()=>"")) || "Please provide an answer.").trim();
            const aiContext = this.getAiContext();
            const isNumericQuestion = /spend|cost|price|amount|INR|rupees|money|number|how many|how much|\bage\b|\byear\b/i.test(questionText);
            let answerText = isNumericQuestion ? "500" : "Automation Test Answer";
            
            try {
                const LiveAIAssistant = require('./LiveAIAssistant');
                const response = await LiveAIAssistant.answerQuestion(aiContext, questionText, 'text', [], 'consumer');
                if (response && response.answer) {
                    answerText = response.answer;
                }
            } catch (err) {
                console.log("[AnswerEngine] AI generation failed for textbox, falling back to static text.");
            }

            if (isNumericQuestion) {
                // Extract only the first contiguous sequence of digits (e.g. "800" from "800 or 500")
                const match = answerText.match(/\d+/);
                answerText = match ? match[0] : "500";
            }

            await textbox.fill(answerText);
            console.log(`[AnswerEngine] Filled textbox with AI answer: "${answerText.substring(0, 50)}..."`);
            return true;
        } catch (e) {
            console.log("[AnswerEngine] Error in answerTextbox:", e.message);
        }
        return false;
    }

    // ============================================
    // Ranking
    // ============================================

    async answerRanking(elements) {
        try {
            const container = elements.activeQuestion;
            const questionText = ((await container.innerText().catch(()=>"")) || "");
            const isRanking = /rank|order|arrange|reorder/i.test(questionText);
            
            if (!isRanking) return false;

            console.log("[AnswerEngine] Ranking question detected! Matching options...");
            
            // Fetch potential ranking option cards using same classes as custom options & general choices
            const cards = container.locator('div[style*="cursor: pointer"], div[class*="optionContainer"] div[style*="cursor: pointer"], div[class*="optionSection"] p, [data-ranking], .rank-option, [aria-label*="rank" i]');
            const count = await cards.count();
            
            if (count > 0) {
                // Determine how many options to rank (e.g. "top three" -> 3; default to a random subset between 3 and count)
                let numToRank = count;
                const match = questionText.match(/top\s+(one|two|three|four|five|six|seven|eight|nine|\d+)/i);
                if (match) {
                    const numWord = match[1].toLowerCase();
                    const wordMap = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
                    numToRank = parseInt(numWord, 10) || wordMap[numWord] || count;
                } else {
                    // Random number of items between 3 and count
                    numToRank = Math.min(count, Math.floor(Math.random() * (count - 2)) + 3);
                }
                numToRank = Math.max(1, Math.min(count, numToRank));

                // Generate array of indices and shuffle them
                let indices = [...Array(count).keys()];
                for (let i = indices.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [indices[i], indices[j]] = [indices[j], indices[i]];
                }
                
                // Take only the subset to click
                const selectedIndices = indices.slice(0, numToRank);
                console.log(`[AnswerEngine] Ranking ${numToRank} of ${count} options in random order: ${selectedIndices.join(', ')}...`);

                for (const idx of selectedIndices) {
                    const card = cards.nth(idx);
                    const text = ((await card.innerText().catch(() => "")) || "").trim();
                    if (text && !/Next|Continue|More options|^\d+\/\d+$/i.test(text)) {
                        console.log(`[AnswerEngine] Ranking option ${idx + 1}: Clicking "${text.substring(0, 30)}"`);
                        await card.scrollIntoViewIfNeeded().catch(() => {});
                        await card.click({ force: true, timeout: 5000 }).catch(async () => {
                            await card.evaluate(el => el.click()).catch(() => {});
                        });
                        await this.page.waitForTimeout(500);
                    }
                }
                return true;
            }
        } catch (e) {
            console.error("Error in answerRanking:", e.message);
        }
        return false;
    }

    // ============================================
    // Universal Fallback for any Option Element
    // ============================================

    async answerGenericOption(elements) {
        try {
            const container = elements.activeQuestion;
            const candidates = container.locator('button, label, input, select, textarea, div[class*="option"], div[class*="choice"], div[class*="answer"], div[class*="item"], div[class*="card"], span[class*="option"]');
            const count = await candidates.count();
            console.log(`[AnswerEngine] Universal fallback inspecting ${count} element candidate(s)...`);

            for (let i = 0; i < count; i++) {
                const item = candidates.nth(i);
                const text = ((await item.innerText().catch(() => "")) || "").trim();

                // Skip Next, Continue, Back, or parent containers containing Next
                if (/Next|Continue|Back|Previous|More options|▶ Play/i.test(text)) {
                    continue;
                }

                if (await item.isVisible().catch(() => false)) {
                    console.log(`[AnswerEngine] Universal fallback clicking element ${i + 1} ("${text.substring(0, 30)}")`);
                    await item.scrollIntoViewIfNeeded().catch(() => {});
                    await item.click({ force: true }).catch(async () => {
                        await item.evaluate(el => el.click());
                    });
                    return true;
                }
            }
        } catch (e) {
            console.error("Error in answerGenericOption:", e.message);
        }
        return false;
    }

    // ============================================
    // Next Button
    // ============================================

    async clickNext() {

        const next =
            this.page
                .getByRole("button", { name: /Next|Continue/i })
                .first();

        if (!(await next.count()))
            return false;

        await next.click();

        await this.page.waitForTimeout(1500);

        return true;
    }
}

module.exports = AnswerEngine;