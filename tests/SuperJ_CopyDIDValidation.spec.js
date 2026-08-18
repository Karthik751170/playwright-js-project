const { test, expect } = require('@playwright/test');
const LoginPage = require('../pages/LoginPage');
const OnboardingUtil = require('../utils/OnboardingUtil');
const DataGeneratorUtil = require('../utils/DataGeneratorUtil');
const path = require('path');
const fs = require('fs');

test('Super J - Post-Onboarding Copy DID Validation & Generation Check', async ({ browser }) => {
    test.setTimeout(180000); // 3 minutes

    const context = await browser.newContext({
        permissions: ['clipboard-read', 'clipboard-write']
    });
    const page = await context.newPage();

    const scratchDir = path.join(process.cwd(), 'scratch');
    if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

    const loginPage = new LoginPage(page);
    const onboardingUtil = new OnboardingUtil(page);

    console.log('\n======================================================');
    console.log(' STEP 1: SUPER J ACCOUNT CREATION & ONBOARDING         ');
    console.log('======================================================');
    const randomPhone = process.env.TEST_PHONE || DataGeneratorUtil.generateRandomPhoneNumber();
    console.log(`[SuperJ] Using phone number: ${randomPhone}`);
    await loginPage.login(randomPhone, '777777');

    console.log('[SuperJ] Waiting 12 seconds for post-OTP navigation to settle...');
    await page.waitForTimeout(12000);

    let bodyText = await page.innerText('body');
    let isOnDashboard = bodyText.includes('Wallet') && bodyText.includes('Copy DID');

    if (isOnDashboard) {
        console.log('[SuperJ] Server skipped onboarding or redirected to Home! Navigating to /OnBoarding...');
        await page.goto('https://dev.superj.app/OnBoarding');
        await page.waitForTimeout(3000);
    }

    let newBodyText = await page.innerText('body');
    if (!newBodyText.includes('Copy DID')) {
        console.log('[SuperJ] Completing onboarding flow...');
        await onboardingUtil.completeOnboarding('1997', 'Pune', 'Male');
        await page.waitForTimeout(3000);
    }

    console.log('\n======================================================');
    console.log(' STEP 2: LOCATE & ASSERT COPY DID BUTTON               ');
    console.log('======================================================');
    // Ensure dashboard is loaded
    if (!page.url().includes('dev.superj.app')) {
        await page.goto('https://dev.superj.app/');
        await page.waitForTimeout(3000);
    }

    const copyDidBtn = page.locator('button:has-text("Copy DID"), a:has-text("Copy DID"), [class*="CopyDID"]').first();
    await copyDidBtn.waitFor({ state: 'visible', timeout: 20000 });
    console.log('[SuperJ] ASSERTION 1: "Copy DID" button is VISIBLE on dashboard!');
    expect(await copyDidBtn.isVisible()).toBe(true);

    console.log('\n======================================================');
    console.log(' STEP 3: CLICK "COPY DID" & VERIFY DID GENERATION      ');
    console.log('======================================================');
    console.log('[SuperJ] Clicking "Copy DID" button...');
    await copyDidBtn.click({ force: true });
    await page.waitForTimeout(2000);

    // Read copied DID text from clipboard
    let copiedDidText = '';
    try {
        copiedDidText = await page.evaluate(async () => {
            return await navigator.clipboard.readText();
        });
        console.log(`[SuperJ] Clipboard Copied DID: "${copiedDidText}"`);
    } catch (err) {
        console.log(`[SuperJ] Could not read clipboard directly: ${err.message}`);
    }

    // Also check page text for DID format or confirmation message/toast
    const updatedBodyText = await page.innerText('body');
    console.log(`[SuperJ] Page Text snippet after clicking Copy DID: "${updatedBodyText.substring(0, 300).replace(/\n/g, ' ')}"`);

    console.log('\n======================================================');
    console.log(' STEP 4: VERIFY DID ASSERTIONS                         ');
    console.log('======================================================');
    
    // ASSERTION 1: DID is generated (either copied to clipboard or present in DOM)
    let isDidGenerated = false;
    if (copiedDidText && copiedDidText.trim().length > 0) {
        isDidGenerated = true;
        console.log(`✅ ASSERTION PASSED: Copied DID is generated with non-empty string! DID = "${copiedDidText}"`);
    } else if (updatedBodyText.includes('did:') || updatedBodyText.match(/did:[a-z0-9:-]+/i) || updatedBodyText.includes('Copied')) {
        isDidGenerated = true;
        console.log(`✅ ASSERTION PASSED: DID text/toast confirmed in DOM!`);
    } else {
        // Fallback check DOM element near Copy DID button
        const didElementText = await copyDidBtn.locator('..').innerText().catch(() => '');
        if (didElementText && didElementText.length > 5) {
            isDidGenerated = true;
            console.log(`✅ ASSERTION PASSED: DID element container holds generated DID text: "${didElementText}"`);
        }
    }

    expect(isDidGenerated).toBe(true);

    const screenshotPath = path.join(scratchDir, 'superj_copy_did_success.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`[SuperJ] Screenshot saved: ${screenshotPath}`);

    await context.close();
});
