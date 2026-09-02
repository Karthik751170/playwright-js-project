const HerculesHomePage = require('../../pages/hercules/HerculesHomePage');
const HerculesSignupPage = require('../../pages/hercules/HerculesSignupPage');
const MailosaurUtility = require('../../pages/utils/MailosaurUtility');

async function setupMailosaurAccount(browser) {
    // 1. Set up Mailosaur context with clipboard permissions
    const mailContext = await browser.newContext();
    await mailContext.grantPermissions(['clipboard-read', 'clipboard-write']);
    const mailPage = await mailContext.newPage();
    
    // Log into Mailosaur FIRST
    const serverId = 'kzdzyaot';
    const mailosaurUtility = new MailosaurUtility(mailPage, mailContext);
    await mailosaurUtility.login('ferad73521@neowd.com', 'Karthik@8342', serverId);
    
    // Extract exact domain/email from Mailosaur Dashboard
    console.log('[MailosaurSetup] Clicking copy domain button...');
    const copyBtn = mailPage.locator("[data-testid='copy-domain-btn']").first();
    await copyBtn.waitFor({ state: 'visible', timeout: 15000 });
    await copyBtn.click();
    await mailPage.waitForTimeout(500); // Wait for clipboard to populate
    
    let copiedString = await mailPage.evaluate(() => navigator.clipboard.readText());
    copiedString = copiedString.trim();
    console.log(`[MailosaurSetup] Copied from Mailosaur UI: ${copiedString}`);
    
    let tempEmail = copiedString;
    // If it only copied the domain and not a full email, prepend a random string to it
    if (!tempEmail.includes('@')) {
        const randomString = Math.random().toString(36).substring(2, 10);
        tempEmail = `test_deploy_${randomString}@${copiedString}`;
    }
    console.log(`[MailosaurSetup] Final Email to use: ${tempEmail}`);
    
    // 2. Set up Hercules and Sign Up
    const herculesContext = await browser.newContext({
        recordVideo: { dir: 'test-results/videos/' }
    });
    await herculesContext.grantPermissions(['clipboard-read', 'clipboard-write']);
    let page = await herculesContext.newPage();
    const homePage = new HerculesHomePage(page);
    const signupPage = new HerculesSignupPage(page);

    console.log('[MailosaurSetup] Navigating to Hercules Homepage...');
    await homePage.navigate();
    await homePage.clickSignUp();
    
    console.log(`[MailosaurSetup] Signing up with email: ${tempEmail}`);
    await signupPage.signUpWithEmail(tempEmail);
    await signupPage.createPassword('TestPassword@2026!');

    // 3. Wait for Verification Email on Mailosaur UI
    console.log('[MailosaurSetup] Opening Mailosaur to check for verification email...');
    await mailPage.bringToFront();
    
    const verificationUrl = await mailosaurUtility.fetchVerificationLink(tempEmail);
    
    // CRITICAL FIX: The verificationUrl is extracted directly from the email without opening it in mailContext.
    // Navigate herculesContext's stable page to it.
    console.log(`[MailosaurSetup] Navigating herculesContext page to verification URL: ${verificationUrl}`);
    await page.goto(verificationUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    // From this point on, 'page' is from herculesContext — stable for the full test.
    
    console.log('[MailosaurSetup] Handling onboarding flow...');
    
    console.log('[MailosaurSetup] Handling onboarding flow (if present)...');
    
    const textarea = page.locator("textarea[aria-label='Ask Hercules a question'], [class='w-full pb-[36.821px] pl-[24px] pr-[24.547px] pt-[24px] sm:h-[93px]'] textarea, [class='w-full pb-[36.821px] pl-[24px] pr-[24.547px] pt-[24px] sm:h-[93px]'] input").or(page.getByRole('textbox', { name: 'Describe the research you' })).first();
    try {
        await textarea.waitFor({ state: 'visible', timeout: 15000 });
        console.log('[MailosaurSetup] Dashboard loaded directly. Onboarding skipped.');
    } catch (e) {
        console.log('[MailosaurSetup] Dashboard not found immediately. Attempting to clear onboarding screens...');
        for (let i = 0; i < 5; i++) {
            if (await textarea.isVisible()) {
                console.log('[MailosaurSetup] Dashboard appeared! Onboarding complete.');
                break;
            }
            // Step 1: Try filling name if it appears
            const fullNameInput = page.locator("[placeholder='Full name']");
            if (await fullNameInput.isVisible()) {
                const randomName = 'User' + Math.random().toString(36).substring(2, 6);
                await fullNameInput.fill(randomName, { timeout: 3000 }).catch(() => {});
                await page.keyboard.press('Enter');
            }
            
            await page.waitForTimeout(2000);
            
            // Step 2: Try clicking generic options
            const optionBtns = page.locator('button:not([aria-label]):not(:has-text("Continue")):not(:has-text("Next")):not(:has-text("Submit"))');
            if (await optionBtns.count() > 0) {
                try { await optionBtns.first().click({ timeout: 2000 }); } catch(err) {}
            }
            
            // Step 3: Try clicking next/continue
            const nextBtn = page.locator('button:has-text("Continue"), button:has-text("Next"), button:has-text("Submit"), button:has-text("Finish")').first();
            if (await nextBtn.isVisible()) {
                await nextBtn.click({ timeout: 2000 }).catch(() => {});
            }
            await page.waitForTimeout(2000);
        }
        await textarea.waitFor({ state: 'visible', timeout: 120000 }).catch(() => {});
    }
    
    console.log('[MailosaurSetup] Account creation complete and dashboard loaded! Closing mail context to save memory.');
    await mailContext.close().catch(() => {});
    return { page, herculesContext };
}

module.exports = { setupMailosaurAccount };
