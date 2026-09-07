/**
 * EnterpriseWizardUtil.js
 * Utility to handle the "B2B Decision-Maker" / "Run the self-serve version" -> "Select" -> "Run it this way" flow.
 */
class EnterpriseWizardUtil {
    /**
     * Checks if the B2B Decision-Maker modal / 'Select' button / 'Run the self-serve version' is visible.
     * If visible, clicks 'Select', waits, and clicks 'Run it this way' / 'Continue'.
     * @param {import('@playwright/test').Page} page
     * @returns {Promise<boolean>}
     */
    static async handleSelectAndRunItThisWay(page) {
        try {
            if (!page) return false;

            // 1. Check for the "Run the self-serve version" card or "Select" button
            const selfServeCard = page.locator("div, [role='region'], li").filter({ hasText: /run the self-serve version/i }).first();
            let selectBtn = null;

            if (await selfServeCard.isVisible({ timeout: 1000 }).catch(() => false)) {
                console.log('[EnterpriseWizardUtil] Detected "Run the self-serve version" card!');
                selectBtn = selfServeCard.locator("button, a, [role='button']").filter({ hasText: /^select$/i }).first();
                if (!await selectBtn.isVisible().catch(() => false)) {
                    selectBtn = selfServeCard.locator("button, a, [role='button']").first();
                }
            }

            if (!selectBtn || !await selectBtn.isVisible().catch(() => false)) {
                selectBtn = page.locator("button, a, [role='button']")
                    .filter({ hasText: /^select$/i })
                    .or(page.getByRole('button', { name: /^select$/i }))
                    .or(page.locator("//button[contains(normalize-space(),'Select')]"))
                    .first();
            }

            if (await selectBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
                console.log('[EnterpriseWizardUtil] Found "Select" button! Clicking it...');
                await selectBtn.scrollIntoViewIfNeeded().catch(() => {});
                await selectBtn.click({ force: true }).catch(() => {});
                console.log('[EnterpriseWizardUtil] Clicked "Select". Waiting 2 seconds...');
                await page.waitForTimeout(2000);

                const runItThisWayBtn = page.locator("button, a, [role='button']")
                    .filter({ hasText: /run it this way|run this way|continue|proceed|confirm/i })
                    .or(page.getByRole('button', { name: /run it this way|run this way/i }))
                    .or(page.locator("//button[contains(normalize-space(),'Run it this way') or contains(normalize-space(),'Run this way')]"))
                    .first();

                if (await runItThisWayBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
                    console.log('[EnterpriseWizardUtil] Found "Run it this way" button! Clicking it...');
                    await runItThisWayBtn.scrollIntoViewIfNeeded().catch(() => {});
                    await runItThisWayBtn.click({ force: true }).catch(() => {});
                    await page.waitForTimeout(2000);
                }
                return true;
            }

            // 2. Also check if "Run it this way" button is already displayed
            const directRunBtn = page.locator("button, a, [role='button']")
                .filter({ hasText: /run it this way|run this way/i })
                .or(page.locator("//button[contains(normalize-space(),'Run it this way')]"))
                .first();

            if (await directRunBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
                console.log('[EnterpriseWizardUtil] Found direct "Run it this way" button! Clicking it...');
                await directRunBtn.click({ force: true }).catch(() => {});
                await page.waitForTimeout(2000);
                return true;
            }
        } catch (err) {
            console.log('[EnterpriseWizardUtil] Note:', err.message);
        }
        return false;
    }
}

module.exports = EnterpriseWizardUtil;
