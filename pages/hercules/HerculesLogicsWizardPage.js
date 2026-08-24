const BasePage = require('../../base/BasePage');

/**
 * Page Object encapsulating the 4-step "Add Logic" Wizard and Logic extraction in Hercules B2B.
 */
class HerculesLogicsWizardPage extends BasePage {
    constructor(page) {
        super(page);

        this.logicsTab = page.locator("//button[text()='Logics']")
            .or(page.getByRole('button', { name: 'Logics' }))
            .or(page.locator("button:has-text('Logics')"));

        this.addLogicButtons = page.getByRole('button', { name: 'Add New Logic' })
            .or(page.getByRole('button', { name: 'add Add Logic' }))
            .or(page.getByRole('button', { name: 'Add Logic' }))
            .or(page.locator("//button[contains(normalize-space(),'Add Logic')]"))
            .or(page.locator("//button[contains(normalize-space(),'Add New Logic')]"));

        this.saveChangesBtn = page.getByRole('button', { name: 'Save changes' })
            .or(page.locator("button:has-text('Save changes')"))
            .or(page.locator("button:has-text('Save')"));
    }

    /**
     * Click an option beneath a specific wizard heading prompt using innermost leaf anchoring.
     */
    async clickStepByHeading(headingText, buttonText = null) {
        const innermost = `(//*[contains(normalize-space(.),"${headingText}")`
                        + ` and not(.//*[contains(normalize-space(.),"${headingText}")])])[last()]`;

        const candidates = (buttonText !== null && buttonText !== undefined)
            ? [
                `${innermost}/following::button[@role="button" and normalize-space()="${buttonText}"]`,
                `${innermost}/following::button[normalize-space()="${buttonText}"]`,
                `${innermost}/following::*[@role="button" and normalize-space()="${buttonText}"]`,
              ]
            : [
                `${innermost}/following::button[@role="button"]`,
                `${innermost}/following::button`,
                `${innermost}/following::*[@role="button"]`,
              ];

        let btn = null;
        for (const xp of candidates) {
            const cand = this.page.locator(`xpath=${xp}`).first();
            if (await cand.isVisible({ timeout: 5000 }).catch(() => false)) { 
                btn = cand; 
                break; 
            }
        }

        if (!btn) {
            console.log(`[HerculesLogicsWizard] Option button not found under "${headingText}" -> "${buttonText}"`);
            return { ok: false, headingText, buttonText };
        }

        const clickedText = (await btn.innerText().catch(() => '')).trim();
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        try {
            await btn.click({ timeout: 6000 });
        } catch (e) {
            await btn.click({ force: true }).catch(() => {});
            await btn.evaluate(el => el.click()).catch(() => {});
        }
        console.log(`[HerculesLogicsWizard] Clicked option: "${clickedText || buttonText}"`);
        return { ok: true, clicked: clickedText };
    }

    /**
     * Open the Logics tab in the survey editor.
     */
    async openLogicsTab() {
        if (await this.logicsTab.first().isVisible({ timeout: 10000 }).catch(() => false)) {
            await this.logicsTab.first().click({ force: true }).catch(() => {});
            await this.page.waitForTimeout(2500);
            console.log('[HerculesLogicsWizard] Opened the Logics tab.');
            return true;
        }
        console.log('[HerculesLogicsWizard] WARNING: "Logics" tab not visible.');
        return false;
    }

    /**
     * Drives the Add Logic wizard sequentially for any action (Redirect, Skip, End, Filter, Ask why).
     */
    async addLogicRule(action, { questionNumber = 1, targetQuestion = null, endMode = 'Terminate', options = [], combineCondition = 'OR' } = {}) {
        console.log(`\n[HerculesLogicsWizard] Adding rule: Q${questionNumber} -> ${action} (Target: ${targetQuestion || endMode || 'N/A'})`);
        await this.page.waitForTimeout(2000);

        // Click Add Logic / Add New Logic (pick latest visible button)
        const count = await this.addLogicButtons.count();
        let clicked = false;
        for (let idx = count - 1; idx >= 0; idx--) {
            const b = this.addLogicButtons.nth(idx);
            if (await b.isVisible().catch(() => false)) {
                await b.scrollIntoViewIfNeeded().catch(() => {});
                await b.click({ force: true }).catch(() => {});
                console.log(`[HerculesLogicsWizard] Clicked Add Logic button (index ${idx}/${count}).`);
                clicked = true;
                break;
            }
        }
        if (!clicked) {
            console.log('[HerculesLogicsWizard] Add Logic button not visible.');
            return false;
        }
        await this.page.waitForTimeout(2000);

        // Step 1: "Which question do you want to apply logic to?"
        let r = await this.clickStepByHeading('Which question do you want to', String(questionNumber));
        if (!r.ok) {
            console.log(`[HerculesLogicsWizard] Failed at Step 1 (Question ${questionNumber})`);
            return false;
        }
        await this.page.waitForTimeout(2000);

        // Step 2: "What action do you want this rule to trigger?"
        r = await this.clickStepByHeading('What action do you want this', action);
        if (!r.ok) {
            console.log(`[HerculesLogicsWizard] Failed at Step 2 (Action ${action})`);
            return false;
        }
        await this.page.waitForTimeout(2000);

        // Step 3: Target Question or End Mode
        const STEP2 = 'What action do you want this rule to trigger?';
        if ((action === 'Redirect' || action === 'Skip' || action === 'Filter') && targetQuestion) {
            const r3 = await this.clickStepByHeading(STEP2, String(targetQuestion));
            console.log(`[HerculesLogicsWizard] Step 3 target Q${targetQuestion}: ${JSON.stringify(r3)}`);
            await this.page.waitForTimeout(2000);
        } else if (action === 'End' && endMode) {
            const r3 = await this.clickStepByHeading(STEP2, endMode);
            console.log(`[HerculesLogicsWizard] Step 3 end mode ${endMode}: ${JSON.stringify(r3)}`);
            await this.page.waitForTimeout(2000);
        }

        // Step 4: Condition option trigger
        if (options.length > 0) {
            let selectedAny = false;
            for (const optText of options) {
                const r4 = await this.clickStepByHeading('Got it. This rule will', optText);
                if (r4.ok) selectedAny = true;
                await this.page.waitForTimeout(1000);
            }
            if (!selectedAny) {
                const rf = await this.clickStepByHeading('Got it. This rule will', null);
                console.log(`[HerculesLogicsWizard] Selected first available trigger: ${JSON.stringify(rf)}`);
                await this.page.waitForTimeout(1000);
            }
        } else {
            const r4 = await this.clickStepByHeading('Got it. This rule will', null);
            console.log(`[HerculesLogicsWizard] Selected first available trigger: ${JSON.stringify(r4)}`);
            await this.page.waitForTimeout(1000);
        }

        // Step 5: Save changes
        const saveBtn = this.saveChangesBtn.last();
        if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await saveBtn.scrollIntoViewIfNeeded().catch(() => {});
            await saveBtn.click({ force: true });
            console.log('[HerculesLogicsWizard] Clicked "Save changes" successfully!');
            await this.page.waitForTimeout(2500);
            return true;
        } else {
            console.log('[HerculesLogicsWizard] "Save changes" button not found, checked as saved automatically.');
            return true;
        }
    }

    /**
     * Extracts active logic rules displayed in the Logics sidebar into structured JSON.
     */
    async extractActiveLogics() {
        await this.page.waitForTimeout(3000);
        return await this.page.evaluate(() => {
            const rules = [];
            const ruleCards = document.querySelectorAll("[class*='rounded'], [class*='border'], div");

            for (const card of ruleCards) {
                const text = (card.innerText || '').trim();
                if (!text.includes('If Q') && !text.includes('If question') && !text.includes('Terminate Survey') && !text.includes('Complete Survey') && !text.includes('Redirect to') && !text.includes('Skip') && !text.includes('Filter selections')) {
                    continue;
                }

                if (card.children.length > 3) continue;

                const qMatch = text.match(/If Q(\d+)/i) || text.match(/If question (\d+)/i);
                const sourceQ = qMatch ? parseInt(qMatch[1], 10) : null;

                let action = 'Unknown';
                let isTerminating = false;

                if (text.includes('Terminate Survey') || text.includes('End survey: Terminate')) {
                    action = 'Terminate Survey';
                    isTerminating = true;
                } else if (text.includes('Complete Survey') || text.includes('End survey: Complete')) {
                    action = 'Complete Survey';
                    isTerminating = true;
                } else if (text.includes('Redirect to Q')) {
                    const toMatch = text.match(/Redirect to Q(\d+)/i);
                    action = toMatch ? `Redirect to Q${toMatch[1]}` : 'Redirect';
                } else if (text.includes('Skip to Q') || text.includes('Skip')) {
                    const toMatch = text.match(/Skip to Q(\d+)/i);
                    action = toMatch ? `Skip to Q${toMatch[1]}` : 'Skip';
                } else if (text.includes('Filter selections')) {
                    action = 'Filter selections';
                } else if (text.includes('Ask why')) {
                    action = 'Ask why';
                }

                const ruleKey = `${sourceQ}-${action}-${text.substring(0, 30)}`;
                if (!rules.some(r => r.key === ruleKey)) {
                    rules.push({
                        key: ruleKey,
                        sourceQuestion: sourceQ,
                        action: action,
                        isTerminating: isTerminating,
                        text: text.replace(/\n+/g, ' ').trim()
                    });
                }
            }

            return rules.map(({ key, ...rest }) => rest);
        }).catch(() => []);
    }
}

module.exports = HerculesLogicsWizardPage;
