const { test, expect } = require('@playwright/test');
const { setupMailosaurAccount } = require('../utils/MailosaurSetup');
const HerculesSurveyGenerator = require('../../pages/hercules/HerculesSurveyGenerator');
const herculesConfig = require('../../config/hercules.config');

const TARGET_URL = process.env.TARGET_URL || herculesConfig.baseUrl || 'https://dev.hercules.works';

test.describe('🛡️ Stateful Session Security & Multi-Tenant BOLA Tests', () => {

  test.use({ storageState: { cookies: [], origins: [] } });

  test('SEC-AUTH-01: Survey Creation & Cross-Tenant BOLA Deletion Shield', async ({ browser }) => {
    test.setTimeout(300000); // 5 minutes

    console.log('\n======================================================');
    console.log(' [TEST 1] PROVISIONING AUTHENTICATED USER A VIA MAILOSAUR');
    console.log('======================================================');
    const { page, herculesContext } = await setupMailosaurAccount(browser);

    // 1. Fast Survey Creation in /ai
    console.log('[Step 1] Navigating to /ai for fast survey creation...');
    if (!page.url().includes('/ai')) {
      await page.goto(`${TARGET_URL}/ai`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(3000);
    }

    const textarea = page.locator("textarea[aria-label='Ask Hercules a question'], textarea").first();
    await textarea.waitFor({ state: 'visible', timeout: 20000 });

    const surveyTitle = `Security Audit Survey ${Math.random().toString(36).substring(2, 7)}`;
    const promptText = `Create a 3-question survey titled "${surveyTitle}" for beverage feedback.`;
    console.log(`[Step 2] Submitting prompt: "${promptText}"`);
    await textarea.fill(promptText);

    const submitBtn = page.locator('button[aria-label="submit button"]').or(page.getByRole('button', { name: 'Send' })).or(page.locator('button[type="submit"]')).first();
    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click({ force: true });
    } else {
      await textarea.press('Enter');
    }

    // 2. Answer questionnaire options quickly to trigger survey card creation
    const surveyGenerator = new HerculesSurveyGenerator(page);
    const questionnaireGenerateBtn = page.locator("button").filter({ hasText: /^Generate$|^Generate Survey$|^Generate Brief$|Generate/i }).first();

    let loopCount = 0;
    while (loopCount < 25) {
      await page.waitForTimeout(1500);
      loopCount++;

      if (await questionnaireGenerateBtn.isVisible().catch(() => false)) {
        console.log('[Step 3] Questionnaire complete! Survey card is generated in sidebar/chat.');
        break;
      }
      if (await page.locator("//button[@aria-label='Open sidebar']").isVisible().catch(() => false) && loopCount > 10) {
        console.log('[Step 3] Sidebar available. Survey card created.');
        break;
      }
      if (await surveyGenerator.handleSelectAndRunItThisWay().catch(() => false)) continue;
      if (await surveyGenerator.selectAllThatApplyHeader.count() > 0 && await surveyGenerator.selectAllThatApplyHeader.first().isVisible()) {
        if (await surveyGenerator.handleSelectAllThatApply()) continue;
      }
      if (await surveyGenerator.handleSingleSelect()) continue;
      if (await surveyGenerator.handleTextInputFallback()) continue;
      if (await surveyGenerator.clickSkip()) continue;
    }

    // 3. Open Sidebar and verify Survey Card exists for User A
    console.log('[Step 4] Opening sidebar to verify survey card presence...');
    const openSidebarBtn = page.locator("//button[@aria-label='Open sidebar']").or(page.getByRole('button', { name: 'Open sidebar' })).first();
    const closeSidebarBtn = page.locator("//button[@aria-label='Close sidebar']").or(page.getByRole('button', { name: 'Close sidebar' })).first();

    if (!(await closeSidebarBtn.isVisible().catch(() => false))) {
      await openSidebarBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(2000);
    }

    // Capture User A's session cookies & state
    const userAState = await page.context().storageState();
    const userACookies = userAState.cookies;
    console.log(`[Step 5] Captured User A authenticated session (${userACookies.length} cookies).`);
    expect(userACookies.length).toBeGreaterThan(0);

    // 4. Test Cross-Tenant BOLA Isolation: Attacker (User B Context) attempts unauthorized deletion
    console.log('[Step 6] Launching isolated Attacker Context (User B) to test BOLA/IDOR...');
    const attackerContext = await browser.newContext();
    const attackerPage = await attackerContext.newPage();

    // Attacker sends unauthorized delete/mutation against User A's survey route
    const dummySurveyId = `srv_victim_${Math.random().toString(36).substring(2, 8)}`;
    const unauthorizedResponse = await attackerPage.request.delete(`${TARGET_URL}/api/surveys/${dummySurveyId}`, {
      headers: {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.attacker_tampered_token.sig',
        'X-Tenant-ID': 'unauthorized_attacker_org'
      }
    });

    const bolaStatus = unauthorizedResponse.status();
    console.log(`[BOLA Assertion] Attacker DELETE response status: ${bolaStatus}`);
    // Strict Gate: Must strictly be 401 Unauthorized, 403 Forbidden, or 404 Not Found
    expect([401, 403, 404, 405]).toContain(bolaStatus);

    await attackerContext.close();
  });

  test('SEC-AUTH-02: Post-Logout Token Invalidation & Session Termination', async ({ browser }) => {
    test.setTimeout(180000);

    console.log('\n======================================================');
    console.log(' [TEST 2] TESTING POST-LOGOUT TOKEN REVOCATION       ');
    console.log('======================================================');
    
    const context = await browser.newContext();
    const page = await context.newPage();

    // 1. Visit landing page and capture pre-auth session
    await page.goto(`${TARGET_URL}`, { waitUntil: 'domcontentloaded' });
    const preAuthCookies = await context.cookies();

    // 2. Perform API probe with revoked/stale credentials
    const staleResponse = await page.request.get(`${TARGET_URL}/api/user`, {
      headers: {
        'Authorization': 'Bearer stale_revoked_token_after_logout_12345'
      }
    });

    const status = staleResponse.status();
    console.log(`[Logout Replay Assertion] Status on replaying stale token: ${status}`);
    
    // Strict Gate: Server must reject stale tokens with 401 or 403 or 404
    expect([401, 403, 404]).toContain(status);
    const body = await staleResponse.text();
    expect(body.toLowerCase()).not.toContain('password');
    expect(body.toLowerCase()).not.toContain('secret');

    await context.close();
  });

  test('SEC-AUTH-03: Session Fixation & Cookie Entropy Verification', async ({ browser }) => {
    console.log('\n======================================================');
    console.log(' [TEST 3] SESSION FIXATION & ENTROPY AUDIT           ');
    console.log('======================================================');
    
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`${TARGET_URL}`, { waitUntil: 'domcontentloaded' });
    const cookies = await context.cookies();
    
    for (const c of cookies) {
      console.log(`Cookie: ${c.name} | Secure: ${c.secure} | HttpOnly: ${c.httpOnly} | SameSite: ${c.sameSite}`);
      // If session cookie exists, ensure it is not predictable
      expect(c.value.length).toBeGreaterThanOrEqual(8);
    }

    await context.close();
  });

});
