const AnswerEngine = require("./AnswerEngine");
const ActiveQuestionFinder = require("./ActiveQuestionFinder");
const NextButtonHandler = require("./NextButtonHandler");

class SurveyEngine {

    constructor(page, config = {}) {
        this.page = page;
        this.config = config;
        this.surveyPage = config.surveyPage || null;
        this.answerEngine = new AnswerEngine(page, this.config.surveyLogics || []);
        this.activeQuestionFinder = new ActiveQuestionFinder(page);
        this.nextButtonHandler = new NextButtonHandler(page);
    }

    async handleModalPopups() {
        try {
            // Check for completion or termination/disqualification popups
            const modalText = this.page.locator("text=/Thank you|Thank you for|You have successfully completed|Finished|Earn more Rewards|Disqualified|Screened out|Survey ended|Not eligible/i");
            if (await modalText.first().isVisible().catch(() => false)) {
                const textContent = await modalText.first().innerText().catch(() => "");
                console.log(`[SurveyEngine] 🛑 Termination / Completion Modal Popup detected! Text: "${textContent.replace(/\s+/g, ' ')}"`);
                
                const dismissBtn = this.page.locator("button:has-text('Okay'), button:has-text('Okay!'), button:has-text('Dismiss'), button:has-text('Close'), button:has-text('Go to my wallet'), button:has-text('Done')").first();
                if (await dismissBtn.isVisible().catch(() => false)) {
                    await dismissBtn.click({ force: true }).catch(() => {});
                    console.log("[SurveyEngine] Dismissed Termination / Completion Popup.");
                }
                return true;
            }
            return false;
        } catch (e) {
            console.error("Error handling modal popups:", e.message);
            return false;
        }
    }

    async run() {
        const engine = this.answerEngine;
        let questionsAnswered = 0;
        let lastAnsweredSlide = null;

        while (true) {
            // Check and dismiss any visible "Okay!" / "Thank you" modal popups
            const popupDismissed = await this.handleModalPopups();
            if (popupDismissed && questionsAnswered > 0) {
                console.log("Completion popup dismissed. Survey flow finished successfully.");
                break;
            }

            // Locate the currently active slide container
            const activeData = await this.activeQuestionFinder.getActiveQuestion(10000);

            if (!activeData || !activeData.container) {
                console.log("No active question slide found. Survey finished or ended.");
                break;
            }

            const currentSlide = activeData.slideNumber;
            const totalSlides = activeData.totalSlides;

            console.log("\n==============================");
            console.log(`Processing Slide ${currentSlide} / ${totalSlides}`);
            console.log("==============================");

            // Log matching survey logic rules if present for this slide
            const matchingLogic = (this.config.surveyLogics || []).find(l => l.slideIndex === currentSlide - 1);
            if (matchingLogic) {
                console.log(`[LogicLogger] 🎯 Active Logic Rule on Question ${currentSlide}: "${matchingLogic.text.replace(/\s+/g, ' ')}"`);
            }

            // If we are on the same slide as previously answered, wait for slide transition
            if (lastAnsweredSlide === currentSlide) {
                console.log(`Waiting for Slide ${currentSlide} to transition...`);
                await this.page.waitForTimeout(1000);
                continue;
            }

            const elements = {
                activeQuestion: activeData.container,
                nextButton: null
            };

            // Answer current question with a retry loop
            let answered = false;
            const maxAnswerRetries = 3;

            for (let attempt = 1; attempt <= maxAnswerRetries; attempt++) {
                answered = await engine.answer(elements, currentSlide === totalSlides);

                if (answered) {
                    console.log(`Slide ${currentSlide}/${totalSlides} answered successfully on attempt ${attempt}.`);
                    lastAnsweredSlide = currentSlide;
                    questionsAnswered++;
                    await this.page.waitForTimeout(1000); // Allow DOM to register selection
                    if (currentSlide === totalSlides) {
                        console.log("Answered final slide. Clicking Submit/Next button to finalize survey...");
                        await this.nextButtonHandler.clickNext(elements);
                        console.log("Final slide submitted successfully. Survey complete!");
                        await this.page.waitForTimeout(5000); // Wait for the final submission to go through
                        return { completed: true, questionsAnswered, reason: "Reached end slide" };
                    }
                    break;
                }

                console.log(`Slide ${currentSlide}: Answering attempt ${attempt}/${maxAnswerRetries} failed. Retrying...`);
                await this.page.waitForTimeout(1000);
            }

            if (!answered) {
                console.warn(`Slide ${currentSlide} could not be answered after ${maxAnswerRetries} attempts.`);
                break;
            }

            // Click Next button using NextButtonHandler
            const nextClicked = await this.nextButtonHandler.clickNext(elements);

            // Check if clicking Next triggered an "Okay!" completion popup
            const modalDismissed = await this.handleModalPopups();
            if (modalDismissed) {
                console.log("Completion popup dismissed post-Next click. Survey flow finished successfully.");
                break;
            }

            if (!nextClicked) {
                console.log("Next button not found. Assuming survey completed.");
                break;
            }

            console.log(`Clicked Next for Slide ${currentSlide}/${totalSlides}. Waiting for transition...`);

            // If we just answered the final slide, exit loop
            if (currentSlide >= totalSlides) {
                console.log(`All ${totalSlides} slides answered! Survey flow finished.`);
                await this.page.waitForTimeout(2000);
                await this.handleModalPopups();
                break;
            }

            // Wait for slide number to increment
            const transitionStartTime = Date.now();
            while (Date.now() - transitionStartTime < 5000) {
                const nextCheck = await this.activeQuestionFinder.getActiveQuestion(1000);
                if (nextCheck && nextCheck.slideNumber !== currentSlide) {
                    console.log(`Transitioned to Slide ${nextCheck.slideNumber}`);
                    break;
                }
                await this.page.waitForTimeout(400);
            }
        }

        const isSuccess = questionsAnswered > 0;
        return {
            completed: isSuccess,
            questionsAnswered: questionsAnswered,
            reason: isSuccess ? `Finished survey successfully (${questionsAnswered} question(s) answered)` : "No questions were answered"
        };
    }
}

module.exports = SurveyEngine;