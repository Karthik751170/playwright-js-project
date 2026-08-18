class NextButtonHandler {

    constructor(page) {
        this.page = page;
    }

    async clickNext(elements) {
        const candidates = [
            elements?.nextButton,
            this.page.locator("//span[normalize-space()='Next']"),
            this.page.locator("//button[contains(normalize-space(),'Next')]"),
            this.page.locator("//button[contains(normalize-space(),'Continue')]"),
            this.page.getByRole("button", { name: /next|continue/i }),
            this.page.locator("[role='button']:has-text('Next')"),
            this.page.locator("//p[normalize-space()='Next']"),
            this.page.locator("div[class*='next']").filter({ hasText: /Next/i })
        ];

        for (const candidate of candidates) {
            try {
                if (candidate && await candidate.first().isVisible().catch(() => false)) {
                    const btn = candidate.first();
                    console.log(`[NextButtonHandler] Found visible Next button candidate. Waiting for it to be enabled...`);
                    await btn.scrollIntoViewIfNeeded().catch(() => {});
                    
                    // Wait until the button is actually enabled (checking disabled attr and aria-disabled)
                    for (let i = 0; i < 20; i++) {
                        const isDisabledAttr = await btn.isDisabled().catch(() => false);
                        const isAriaDisabled = await btn.getAttribute('aria-disabled').catch(() => null) === 'true';
                        
                        if (!isDisabledAttr && !isAriaDisabled) {
                            break; // It is enabled!
                        }
                        await this.page.waitForTimeout(500);
                    }

                    await this.page.waitForTimeout(300);

                    try {
                        await btn.click({ timeout: 3000 }); // Removed force: true so Playwright waits for it to be clickable
                        console.log(`[NextButtonHandler] Clicked Next button (standard click)`);
                    } catch {
                        await btn.evaluate(el => el.click());
                        console.log(`[NextButtonHandler] Clicked Next button (JS click fallback)`);
                    }

                    await this.page.waitForTimeout(2000);
                    return true;
                }
            } catch (e) {}
        }

        console.warn(`[NextButtonHandler] Could not find or click any Next button candidate.`);
        return false;
    }
}

module.exports = NextButtonHandler;