const { test, expect } = require('@playwright/test');
const LoginPage = require('../pages/LoginPage');
const OnboardingUtil = require('../utils/OnboardingUtil');
const DataGeneratorUtil = require('../utils/DataGeneratorUtil');
const path = require('path');
const fs = require('fs');

test('Super J - Edit Profile Validation: Gender/DOB/City Restricted via Contact Us & Direct Email Edit', async ({ page }) => {
    test.setTimeout(240000); // 4 minutes

    const scratchDir = path.join(process.cwd(), 'scratch');
    if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

    const loginPage = new LoginPage(page);
    const onboardingUtil = new OnboardingUtil(page);

    console.log('\n======================================================');
    console.log(' STEP 1: SUPER J LOGIN & ONBOARDING                    ');
    console.log('======================================================');
    const randomPhone = process.env.TEST_PHONE || DataGeneratorUtil.generateRandomPhoneNumber();
    console.log(`[SuperJ EditProfile] Using phone number: ${randomPhone}`);
    await loginPage.login(randomPhone, '777777');

    console.log('[SuperJ EditProfile] Waiting 12 seconds for post-OTP redirect...');
    await page.waitForTimeout(12000);

    let bodyText = await page.innerText('body');
    let isOnDashboard = bodyText.includes('Profile') || bodyText.includes('Wallet');

    if (isOnDashboard) {
        console.log('[SuperJ EditProfile] Navigating to OnBoarding if needed...');
        await page.goto('https://dev.superj.app/OnBoarding');
        await page.waitForTimeout(3000);
    }

    let newBodyText = await page.innerText('body');
    if (!newBodyText.includes('Profile') && !newBodyText.includes('Copy DID')) {
        console.log('[SuperJ EditProfile] Completing onboarding flow...');
        await onboardingUtil.completeOnboarding('1997', 'Pune', 'Male');
        await page.waitForTimeout(3000);
    }

    console.log('\n======================================================');
    console.log(' STEP 2: NAVIGATE TO PROFILE & CLICK EDIT               ');
    console.log('======================================================');
    if (!page.url().includes('dev.superj.app')) {
        await page.goto('https://dev.superj.app/');
        await page.waitForTimeout(3000);
    }

    console.log('[SuperJ EditProfile] Clicking Profile link/button...');
    const profileBtn = page.locator('a, button, p, span').getByText(/^Profile$/i).first();
    await profileBtn.waitFor({ state: 'visible', timeout: 15000 });
    await profileBtn.click({ force: true });
    await page.waitForTimeout(3000);

    console.log('[SuperJ EditProfile] Clicking Edit button on profile...');
    const editBtn = page.locator('button:has-text("Edit"), a:has-text("Edit"), span:has-text("Edit")').first();
    await editBtn.waitFor({ state: 'visible', timeout: 15000 });
    await editBtn.click({ force: true });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: path.join(scratchDir, 'edit_profile_screen.png'), fullPage: true });
    console.log('[SuperJ EditProfile] Edit profile screen loaded!');

    console.log('\n======================================================');
    console.log(' STEP 3 & 4: TEST ALL 3 RESTRICTED FIELDS (GENDER, DOB, CITY) WITH CONTACT US & SEND ');
    console.log('======================================================');
    
    const restrictedFields = page.locator("div[class*='border-[#E3E3E3]'], div[class*='rounded-[10px]'], div[class*='shadow-inner'], div[class*='capitalize leading-tight']");

    const fieldsToTest = [
        { name: 'Gender', text: 'Hello Super J Team, I would like to request an update to my registered Gender. Thank you!' },
        { name: 'Birth Year', text: 'Hello Super J Team, I would like to request an update to my Date of Birth / Year of Birth. Thank you!' },
        { name: 'City', text: 'Hello Super J Team, I would like to request an update to my registered City to Mumbai. Thank you!' }
    ];

    for (let i = 0; i < fieldsToTest.length; i++) {
        const fieldInfo = fieldsToTest[i];
        console.log(`\n--- Testing Restricted Field #${i + 1}: ${fieldInfo.name} ---`);

        let fieldLocator = restrictedFields.nth(i);
        if (!await fieldLocator.isVisible().catch(() => false)) {
            fieldLocator = page.locator(`text='${fieldInfo.name}'`).or(page.getByText(fieldInfo.name, { exact: false })).first();
        }

        await fieldLocator.scrollIntoViewIfNeeded().catch(() => {});
        await fieldLocator.click({ force: true });
        await page.waitForTimeout(1500);

        console.log(`[SuperJ EditProfile] Checking for Popup on ${fieldInfo.name}...`);
        const contactUsBtn = page.locator("//button[text()='Contact Us']").or(page.locator("button:has-text('Contact Us'), a:has-text('Contact Us')")).first();
        const popupModal = page.locator("[class*='Popup-module__0eFQPW__popup']")
            .or(page.locator("[class*='Popup-module']"))
            .or(page.locator("div[class*='popup']"))
            .or(page.locator("div:has-text('Contact Us')"))
            .first();

        await Promise.race([
            popupModal.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {}),
            contactUsBtn.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
        ]);

        const isPopupVisible = (await popupModal.isVisible().catch(() => false)) || (await contactUsBtn.isVisible().catch(() => false));
        console.log(`✅ ASSERTION for ${fieldInfo.name}: Restricted popup displayed? ${isPopupVisible}`);
        expect(isPopupVisible).toBe(true);

        if (await contactUsBtn.isVisible().catch(() => false)) {
            console.log(`[SuperJ EditProfile] Clicking "Contact Us" for ${fieldInfo.name}...`);
            await contactUsBtn.click({ force: true });
            await page.waitForTimeout(2000);
        }

        console.log(`[SuperJ EditProfile] Locating textarea for ${fieldInfo.name}...`);
        const textareaField = page.locator("//textarea[@placeholder='Enter your question here']").or(page.locator("textarea")).first();
        await textareaField.waitFor({ state: 'visible', timeout: 15000 });
        await textareaField.fill(fieldInfo.text);
        await page.waitForTimeout(1000);

        console.log(`[SuperJ EditProfile] Clicking "Send" button for ${fieldInfo.name}...`);
        const sendBtn = page.locator("//button[text()='Send']").or(page.locator("button:has-text('Send')")).first();
        await sendBtn.waitFor({ state: 'visible', timeout: 10000 });
        await sendBtn.click({ force: true });
        await page.waitForTimeout(3000);

        await page.screenshot({ path: path.join(scratchDir, `restricted_field_${i + 1}_${fieldInfo.name.replace(/\s+/g, '_')}.png`), fullPage: true });
        console.log(`✅ Contact Us for ${fieldInfo.name} completed successfully!`);

        // Dismiss popup if present before next field test
        const closeBtn = page.locator("button:has-text('Close'), img[alt*='close' i], [class*='close' i]").first();
        if (await closeBtn.isVisible().catch(() => false)) {
            await closeBtn.click({ force: true }).catch(() => {});
            await page.waitForTimeout(1500);
        }
    }

    console.log('\n======================================================');
    console.log(' STEP 5: EDIT EMAIL ID FIELD (NO POPUP EXPECTED)       ');
    console.log('======================================================');
    console.log('[SuperJ EditProfile] Editing Email ID field...');
    const emailField = page.getByRole('textbox', { name: 'Email ID' })
        .or(page.locator("input[placeholder*='Email' i]"))
        .or(page.locator("input[type='email']"))
        .first();

    await emailField.waitFor({ state: 'visible', timeout: 10000 });
    await emailField.click({ force: true });
    await emailField.fill('');
    const newEmail = `superj_test_${Date.now()}@gmail.com`;
    await emailField.fill(newEmail);
    console.log(`[SuperJ EditProfile] Email ID updated to: ${newEmail}`);

    const popupModal = page.locator("[class*='Popup-module__0eFQPW__popup']").first();
    const popupIsPresent = await popupModal.isVisible().catch(() => false);
    console.log(`[SuperJ EditProfile] Popup present during Email edit? ${popupIsPresent}`);
    expect(popupIsPresent).toBe(false);
    console.log('✅ ASSERTION PASSED: Editing Email ID field did NOT trigger any restricted popup!');

    const saveBtn = page.locator("button:has-text('Save'), button:has-text('Update')").first();
    if (await saveBtn.isVisible().catch(() => false) && await saveBtn.isEnabled().catch(() => false)) {
        console.log('[SuperJ EditProfile] Clicking Save button...');
        await saveBtn.click({ force: true });
        await page.waitForTimeout(3000);
    }

    await page.screenshot({ path: path.join(scratchDir, 'email_edit_success.png'), fullPage: true });
    console.log('\n======================================================');
    console.log(' EDIT PROFILE TEST SUITE COMPLETED SUCCESSFULLY!       ');
    console.log('======================================================\n');
});
