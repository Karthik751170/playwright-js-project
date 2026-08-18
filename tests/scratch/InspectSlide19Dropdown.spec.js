const { test } = require('@playwright/test');
const fs = require('fs');
const LoginPage = require('../../pages/LoginPage');
const OnboardingUtil = require('../../utils/OnboardingUtil');
const DataGeneratorUtil = require('../../utils/DataGeneratorUtil');
const SurveyEngine = require('../../utils/SurveyEngine');

test('Inspect Slide 19 Dropdown HTML', async ({ browser }) => {
    test.setTimeout(600000); // 10 minutes max

    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(300000);

    const surveyUrl = 'https://dev.superj.app/survey/6a7ddad6d60747ced10adb82';
    console.log(`Navigating to survey URL: ${surveyUrl}`);
    await page.goto(surveyUrl);
    await page.waitForTimeout(5000);

    // Login with a new random number
    const randomPhone = DataGeneratorUtil.generateRandomPhoneNumber();
    console.log(`[Test] Performing login with new number: ${randomPhone} and OTP 777777...`);
    const loginPage = new LoginPage(page);
    await loginPage.login(randomPhone, '777777');
    await page.waitForTimeout(15000);

    // Complete onboarding
    const onboarding = new OnboardingUtil(page);
    try {
        await onboarding.completeOnboarding();
        await page.waitForTimeout(5000);
    } catch (e) {
        console.log('[Test] Onboarding skipped or failed:', e.message);
    }

    // Return to survey
    console.log(`Redirecting back to survey: ${surveyUrl}`);
    await page.goto(surveyUrl);
    await page.waitForTimeout(5000);

    // Click Start Survey
    const startBtn = page.getByRole('button', { name: /start survey/i }).first();
    if (await startBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log('Clicking Start Survey...');
        await startBtn.click({ force: true });
        await page.waitForTimeout(3000);
    }

    // Auto-answer slides until slide 19 is active
    const surveyEngine = new SurveyEngine(page);

    let currentSlide = 0;
    const targetSlide = 19;

    console.log(`\nAuto-answering slides 1 to ${targetSlide - 1}, then pausing at slide ${targetSlide}...`);

    while (currentSlide < targetSlide) {
        // Find active slide number
        const activeSlideEl = page.locator('[class*="active"], [data-active="true"]').filter({ hasText: /^\d+\/\d+/ }).first();
        const slideText = await activeSlideEl.innerText().catch(() => '');
        const match = slideText.match(/^(\d+)\/(\d+)/);
        if (match) {
            currentSlide = parseInt(match[1]);
            const totalSlides = parseInt(match[2]);
            console.log(`\nActive Slide: ${currentSlide}/${totalSlides}`);
        } else {
            // Try to detect from slide DOM
            const activeSlide = page.locator('[data-slide-index]').filter({ hasAttribute: 'data-active' }).first();
            if (!await activeSlide.isVisible({ timeout: 3000 }).catch(() => false)) {
                break;
            }
        }

        if (currentSlide >= targetSlide) {
            console.log(`\n✅ Reached Slide ${targetSlide}! Stopping auto-answer.`);
            break;
        }

        // Answer the current slide
        const result = await surveyEngine.answerCurrentSlide();
        if (!result) {
            console.log(`[Test] Could not answer slide ${currentSlide}, skipping...`);
        }

        // Click Next
        await surveyEngine.clickNextButton();
        await page.waitForTimeout(2000);
    }

    // --- AT SLIDE 19 ---
    console.log('\n📸 Capturing HTML BEFORE clicking dropdown...');
    const htmlBefore = await page.content();
    fs.writeFileSync('scratch/slide19_before_dropdown.html', htmlBefore);
    console.log('✅ Saved: scratch/slide19_before_dropdown.html');

    await page.screenshot({ path: 'scratch/slide19_before_dropdown.png', fullPage: true });
    console.log('✅ Saved screenshot: scratch/slide19_before_dropdown.png');

    // Click first dropdown trigger
    const dropdown = page.locator("img[alt='Dropdown']").first();
    const dropdownVisible = await dropdown.isVisible({ timeout: 5000 }).catch(() => false);

    if (dropdownVisible) {
        console.log('\n🖱️ Clicking first dropdown trigger...');
        await dropdown.scrollIntoViewIfNeeded().catch(() => {});
        await dropdown.click({ force: true }).catch(async () => {
            await dropdown.evaluate(el => el.click()).catch(() => {});
        });
        console.log('✅ Dropdown clicked! Waiting 2 seconds...');
        await page.waitForTimeout(2000);

        // Capture HTML AFTER clicking dropdown
        console.log('\n📸 Capturing HTML AFTER clicking dropdown...');
        const htmlAfter = await page.content();
        fs.writeFileSync('scratch/slide19_after_dropdown.html', htmlAfter);
        console.log('✅ Saved: scratch/slide19_after_dropdown.html');

        await page.screenshot({ path: 'scratch/slide19_after_dropdown.png', fullPage: true });
        console.log('✅ Saved screenshot: scratch/slide19_after_dropdown.png');

        console.log('\n⏸️ PAUSING for inspection - check the saved HTML files!');
        await page.pause();
    } else {
        console.log('⚠️ No img[alt="Dropdown"] found on Slide 19. Saving current page HTML...');
        const html = await page.content();
        fs.writeFileSync('scratch/slide19_no_dropdown.html', html);
        await page.screenshot({ path: 'scratch/slide19_no_dropdown.png', fullPage: true });
    }
});
