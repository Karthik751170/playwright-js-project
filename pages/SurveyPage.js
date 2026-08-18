const BasePage = require('../base/BasePage');
const QuestionElements = require('../models/QuestionElements');

class SurveyPage extends BasePage {

    constructor(page) {
        super(page);
    }

    async fetchCurrentQuestion() {

        const activeQuestion = await this._findCurrentQuestionContainer();

        if (!activeQuestion)
            return null;

        const elements = new QuestionElements();

        elements.activeQuestion = activeQuestion;
        elements.currentQuestionContainer = activeQuestion;

        // Generic question text
        elements.questionText =
            activeQuestion.locator("p,h1,h2,h3,h4,span").first();

        // Generic answer elements
        elements.answerElements =
            activeQuestion.locator("button,input,textarea,select");

        // Generic controls
        elements.nextButton =
            this.page.getByRole("button", { name: /next/i }).first();

        elements.continueButton =
            this.page.getByRole("button", { name: /continue/i }).first();

        elements.uploadButton =
            activeQuestion.locator("input[type='file']").first();

        elements.videoElement =
            activeQuestion.locator("video").first();

        return elements;
    }

    async _findCurrentQuestionContainer() {

        const carouselItems =
            this.page.locator("div[class*='carouselItem']");

        const count = await carouselItems.count();

        for (let i = 0; i < count; i++) {

            const item = carouselItems.nth(i);

            const visible = await item.evaluate(el => {

                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();

                return (
                    rect.width > 0 &&
                    rect.height > 0 &&
                    style.display !== "none" &&
                    style.visibility !== "hidden" &&
                    style.opacity === "1"
                );

            }).catch(() => false);

            if (visible) {

                console.log(`Active Carousel : ${i}`);

                return item;
            }
        }

        return null;
    }
}

module.exports = SurveyPage;