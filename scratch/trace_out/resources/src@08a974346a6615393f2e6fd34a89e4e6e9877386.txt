class ActiveQuestionFinder {

    constructor(page) {
        this.page = page;
    }

    async getActiveQuestion(timeout = 10000) {
        if (this.page.context) {
            const pages = this.page.context().pages();
            if (pages.length > 0) {
                this.page = pages[pages.length - 1];
            }
        }

        const selectors = [
            "div.min-w-full.shrink-0",
            "div[class*='carouselItem']",
            "div[class*='question']",
            "div[class*='slide']"
        ];

        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            for (const selector of selectors) {
                const containers = this.page.locator(selector);
                const count = await containers.count().catch(() => 0);

                if (count > 0) {
                    for (let i = 0; i < count; i++) {
                        const item = containers.nth(i);

                        const isStrictlyVisible = await item.evaluate(el => {
                            const style = window.getComputedStyle(el);
                            const rect = el.getBoundingClientRect();
                            const opacityVal = parseFloat(style.opacity);

                            return rect.width > 0 &&
                                   rect.height > 0 &&
                                   style.display !== "none" &&
                                   style.visibility !== "hidden" &&
                                   (opacityVal >= 0.85 || style.opacity === "1");
                        }).catch(() => false);

                        if (isStrictlyVisible) {
                            const slideText = await item.innerText().catch(() => "");
                            const slideMatch = slideText.match(/(\d+)\/(\d+)/);
                            const slideNum = slideMatch ? parseInt(slideMatch[1], 10) : i + 1;
                            const totalNum = slideMatch ? parseInt(slideMatch[2], 10) : 15;

                            console.log(`Active Slide ${slideNum}/${totalNum} found (DOM Index ${i})`);
                            return {
                                container: item,
                                slideNumber: slideNum,
                                totalSlides: totalNum
                            };
                        }
                    }
                }
            }

            await this.page.waitForTimeout(400);
        }

        console.log(`No active question container found within ${timeout}ms timeout.`);
        return null;
    }
}

module.exports = ActiveQuestionFinder;