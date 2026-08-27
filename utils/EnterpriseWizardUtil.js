/**
 * EnterpriseWizardUtil.js
 * Utility to optionally handle the "Select" -> "Run it this way" wizard flow if it appears across Hercules workflows.
 */
class EnterpriseWizardUtil {
    /**
     * Checks if '//button[text()=\'Select\']' is visible on the page.
     * If visible, clicks it, waits 2 seconds, and clicks '//button[text()=\'Run it this way\']'.
     * Returns true if handled, false otherwise.
     * @param {import('@playwright/test').Page} page
     * @returns {Promise<boolean>}
     */
    static async handleSelectAndRunItThisWay(page) {
        try {
            if (!page) return false;
            const selectBtn = page.locator("//button[text()='Select']").first();
            if (await selectBtn.isVisible().catch(() => false)) {
                console.log('[EnterpriseWizardUtil] Found "//button[text()=\'Select\']"! Clicking it...');
                await selectBtn.click({ force: true }).catch(() => {});
                console.log('[EnterpriseWizardUtil] Waiting 2 seconds...');
                await page.waitForTimeout(2000);

                const runItThisWayBtn = page.locator("//button[text()='Run it this way']").first();
                if (await runItThisWayBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
                    console.log('[EnterpriseWizardUtil] Found "//button[text()=\'Run it this way\']"! Clicking it...');
                    await runItThisWayBtn.click({ force: true }).catch(() => {});
                    await page.waitForTimeout(2000);
                }
                return true;
            }
        } catch (err) {
            // Optional check - fail silently without throwing
        }
        return false;
    }
}

module.exports = EnterpriseWizardUtil;
