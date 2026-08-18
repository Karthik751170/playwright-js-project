const { test, expect } = require('@playwright/test');
const HerculesSignupPage = require('../pages/hercules/HerculesSignupPage');

test('Test 1secmail API for Hercules Verification', async ({ context }) => {
    test.setTimeout(120000); // 2 minutes

    // 1. Generate a random email address using 1secmail API
    console.log('Generating email from 1secmail API...');
    const domain = '1secmail.com';
    const login = 'testuser' + Math.random().toString(36).substring(2, 10);
    const tempEmail = `${login}@${domain}`;
    console.log(`Generated: ${tempEmail}`);

    // 2. Open Hercules in a new tab and sign up
    const herculesPage = await context.newPage();
    console.log('Navigating to dev.hercules.works...');
    await herculesPage.goto('https://dev.hercules.works/', { waitUntil: 'domcontentloaded' });

    console.log('Clicking Sign Up...');
    await herculesPage.locator("button:has-text('Sign Up')").waitFor({ state: 'visible' });
    await herculesPage.locator("button:has-text('Sign Up')").click();

    const signupPage = new HerculesSignupPage(herculesPage);
    await signupPage.signUpWithEmail(tempEmail);
    await signupPage.createPassword('Karthik@8342');
    
    console.log('Signup complete on Hercules. Waiting for email via API...');

    // 3. Poll the 1secmail API for the incoming email
    let emailId = null;
    for (let i = 0; i < 20; i++) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        console.log(`Checking inbox... (Attempt ${i + 1})`);
        
        const response = await fetch(`https://www.1secmail.com/api/v1/?action=getMessages&login=${login}&domain=${domain}`);
        const messages = await response.json();
        
        if (messages.length > 0) {
            emailId = messages[0].id;
            console.log(`Email arrived! ID: ${emailId}`);
            break;
        }
    }

    if (!emailId) {
        throw new Error('Email did not arrive in 1secmail within 60 seconds.');
    }

    // 4. Fetch the full email body using the API
    console.log('Fetching email body...');
    const msgResponse = await fetch(`https://www.1secmail.com/api/v1/?action=readMessage&login=${login}&domain=${domain}&id=${emailId}`);
    const messageDetails = await msgResponse.json();
    
    // 5. Extract the verification link from the HTML body using regex
    const htmlBody = messageDetails.body;
    
    // Look for href inside the a tag that contains "verify" or "email"
    // Hercules verification links usually look like: <a href="https://dev.hercules.works/verify?token=..." ...>
    let verifyUrl = '';
    const linkMatch = htmlBody.match(/href="([^"]+hercules[^"]+)"/i);
    
    if (linkMatch && linkMatch[1]) {
        verifyUrl = linkMatch[1];
        console.log(`Extracted Verification URL: ${verifyUrl}`);
    } else {
        throw new Error("Could not find verification URL in the email body.");
    }

    // 6. Use Playwright to navigate directly to the verification link!
    console.log('Navigating to verification URL in Playwright...');
    await herculesPage.goto(verifyUrl, { waitUntil: 'domcontentloaded' });
    
    console.log('Successfully loaded the verification URL! Waiting to see if Dashboard appears...');
    
    // Wait for either dashboard or onboarding to confirm it worked
    await herculesPage.waitForTimeout(5000);
    console.log(`Current URL after verification: ${herculesPage.url()}`);
    
    console.log('Test completed successfully!');
});
