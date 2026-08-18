const { test, expect } = require('@playwright/test');
const { setupMailosaurAccount } = require('./utils/MailosaurSetup');
const HerculesPaymentModal = require('../pages/hercules/HerculesPaymentModal');
const path = require('path');
const fs = require('fs');

test.use({ storageState: { cookies: [], origins: [] } });

test('Upgrade to Starter (Monthly & Annual) and Pro (Quarterly & Annual) Automation', async ({ browser }) => {
    test.setTimeout(600000); // 10 mins for 4 plan upgrades

    const scratchDir = path.join(process.cwd(), 'scratch');
    if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

    console.log('\n======================================================');
    console.log(' STEP 1: SETUP FRESH MAILOSAUR & HERCULES ACCOUNT     ');
    console.log('======================================================');
    const { page } = await setupMailosaurAccount(browser);
    const paymentModal = new HerculesPaymentModal(page);

    const goToPricing = async () => {
        const pricingLink = page.locator('a:has-text("Pricing"), button:has-text("Pricing"), a[href*="pricing"]').first();
        if (await pricingLink.isVisible().catch(() => false)) {
            await pricingLink.click({ force: true });
            await page.waitForTimeout(3000);
        }
    };

    console.log('\n======================================================');
    console.log(' STEP 2: NAVIGATE TO PRICING / BILLING                ');
    console.log('======================================================');
    await goToPricing();

    // ------------------------------------------------------------------
    // STEP 3: UPGRADE TO STARTER MONTHLY
    // ------------------------------------------------------------------
    console.log('\n======================================================');
    console.log(' STEP 3: UPGRADE TO STARTER MONTHLY                   ');
    console.log('======================================================');
    const monthlyToggle = page.locator("button:has-text('Monthly')").first();
    if (await monthlyToggle.isVisible().catch(() => false)) {
        await monthlyToggle.click({ force: true });
        await page.waitForTimeout(1000);
    }

    const upgradeStarterBtn = page.locator("button:has-text('Upgrade to Starter')").or(page.getByText('Upgrade to Starter', { exact: false })).first();
    await upgradeStarterBtn.waitFor({ state: 'visible', timeout: 15000 });
    await upgradeStarterBtn.click({ force: true });
    await page.waitForTimeout(2000);

    const modalStarterBtn = page.locator("button:has-text('Upgrade to Starter')").or(page.getByText('Upgrade to Starter', { exact: false })).last();
    if (await modalStarterBtn.isVisible().catch(() => false)) {
        await modalStarterBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(2000);
    }

    console.log('Initiating Razorpay payment for Starter Monthly...');
    await paymentModal.handleRazorpaySuccess();
    console.log('Razorpay payment for Starter Monthly SUCCESS!');
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(scratchDir, '1_starter_monthly_success.png'), fullPage: true });

    // ------------------------------------------------------------------
    // STEP 4: STARTER -> CLICK ANNUAL TOGGLE -> SWITCH TO ANNUAL
    // ------------------------------------------------------------------
    console.log('\n======================================================');
    console.log(' STEP 4: STARTER -> ANNUAL TOGGLE -> SWITCH TO ANNUAL ');
    console.log('======================================================');
    await goToPricing();

    console.log('Clicking Annual Toggle Button ("Annual 20% off")...');
    const annualToggle = page.locator("button:has-text('Annual 20% off'), button:has-text('Annual')").first();
    if (await annualToggle.isVisible().catch(() => false)) {
        await annualToggle.click({ force: true });
        await page.waitForTimeout(2000);
    }

    console.log('Clicking "Switch to annual"...');
    const switchToAnnualStarterBtn = page.locator("text=/Switch to annual/i")
        .or(page.getByText('Switch to annual', { exact: false }))
        .or(page.locator("button:has-text('Switch to annual')"))
        .or(page.locator("button:has-text('Upgrade to Starter')"))
        .first();

    await switchToAnnualStarterBtn.waitFor({ state: 'visible', timeout: 15000 });
    await switchToAnnualStarterBtn.click({ force: true });
    await page.waitForTimeout(2000);

    const modalStarterAnnualBtn = page.locator("button:has-text('Upgrade'), button:has-text('Switch')").last();
    if (await modalStarterAnnualBtn.isVisible().catch(() => false)) {
        await modalStarterAnnualBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(2000);
    }

    console.log('Initiating Razorpay payment for Starter Annual...');
    await paymentModal.handleRazorpaySuccess();
    console.log('Razorpay payment for Starter Annual SUCCESS!');
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(scratchDir, '2_starter_annual_success.png'), fullPage: true });

    // ------------------------------------------------------------------
    // STEP 5: UPGRADE TO PRO (QUARTERLY/MONTHLY)
    // ------------------------------------------------------------------
    console.log('\n======================================================');
    console.log(' STEP 5: UPGRADE TO PRO                               ');
    console.log('======================================================');
    await goToPricing();

    if (await monthlyToggle.isVisible().catch(() => false)) {
        await monthlyToggle.click({ force: true }).catch(() => {});
        await page.waitForTimeout(1000);
    }

    const upgradeProBtn = page.locator("button:has-text('Upgrade to Pro Quarterly'), button:has-text('Upgrade to Pro')").or(page.getByText('Upgrade to Pro', { exact: false })).first();
    await upgradeProBtn.waitFor({ state: 'visible', timeout: 15000 });
    await upgradeProBtn.click({ force: true });
    await page.waitForTimeout(2000);

    const modalProBtn = page.locator("button:has-text('Upgrade to Pro')").last();
    if (await modalProBtn.isVisible().catch(() => false)) {
        await modalProBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(2000);
    }

    console.log('Initiating Razorpay payment for Pro...');
    await paymentModal.handleRazorpaySuccess();
    console.log('Razorpay payment for Pro SUCCESS!');
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(scratchDir, '3_pro_quarterly_success.png'), fullPage: true });

    // ------------------------------------------------------------------
    // STEP 6: PRO -> CLICK ANNUAL TOGGLE -> SWITCH TO ANNUAL
    // ------------------------------------------------------------------
    console.log('\n======================================================');
    console.log(' STEP 6: PRO -> ANNUAL TOGGLE -> SWITCH TO ANNUAL     ');
    console.log('======================================================');
    await goToPricing();

    console.log('Clicking Annual Toggle Button ("Annual 20% off")...');
    if (await annualToggle.isVisible().catch(() => false)) {
        await annualToggle.click({ force: true });
        await page.waitForTimeout(2000);
    }

    console.log('Clicking "Switch to annual" on Pro card...');
    const switchToAnnualProBtn = page.locator("text=/Switch to annual/i")
        .or(page.getByText('Switch to annual', { exact: false }))
        .or(page.locator("button:has-text('Switch to annual')"))
        .or(page.locator("button:has-text('Upgrade to Pro')"))
        .first();

    await switchToAnnualProBtn.waitFor({ state: 'visible', timeout: 15000 });
    await switchToAnnualProBtn.click({ force: true });
    await page.waitForTimeout(2000);

    const modalProAnnualBtn = page.locator("button:has-text('Upgrade'), button:has-text('Switch')").last();
    if (await modalProAnnualBtn.isVisible().catch(() => false)) {
        await modalProAnnualBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(2000);
    }

    console.log('Initiating Razorpay payment for Pro Annual...');
    await paymentModal.handleRazorpaySuccess();
    console.log('Razorpay payment for Pro Annual SUCCESS!');
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(scratchDir, '4_pro_annual_success.png'), fullPage: true });

    console.log('\n======================================================');
    console.log(' ALL 4 PLAN UPGRADES (STARTER/PRO + ANNUAL TOGGLE + SWITCH TO ANNUAL) SUCCESS! ');
    console.log('======================================================\n');
});
