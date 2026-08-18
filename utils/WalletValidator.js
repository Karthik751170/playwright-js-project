class WalletValidator {
    constructor(page) {
        this.page = page;
    }

    async validateWalletAndTransactions(reason, isGiftCard = false) {
        console.log(`\n--- Validating Wallet & Transactions (${reason}) ---`);
        
        // Dismiss congratulations/earnings overlay if visible (to prevent obscuring navigation)
        const overlayBtn = this.page.locator('button:has-text("Earn More Rewards"), button:has-text("Earn more Rewards!"), button:has-text("Okay!"), button:has-text("Okay")').first();
        if (await overlayBtn.isVisible().catch(() => false)) {
            console.log('[WalletValidator] Dismissing congratulations/earnings overlay...');
            await overlayBtn.click({ timeout: 2000 }).catch(e => {
                console.log(`[WalletValidator] Overlay click timed out or failed (likely already dismissed): ${e.message}`);
            });
            await this.page.waitForTimeout(1000);
        }

        // 1. Go to Wallet
        console.log('[WalletValidator] Navigating to Wallet...');
        const walletBtn = this.page.locator('a, button, p, span').getByText(/^Wallet$/i).first();
        if (await walletBtn.isVisible().catch(()=>false)) {
             await walletBtn.click();
             await this.page.waitForTimeout(2000);
             
             // Check Wallet Balance
             const balanceContainer = this.page.locator("[class*='balanceContainer'], [class*='CashBalance']").first();
             if (await balanceContainer.isVisible()) {
                 const balanceText = await balanceContainer.innerText();
                 console.log(`[WalletValidator] SUCCESS: Found Wallet Balance: ${balanceText.replace(/\n/g, ' ')}`);
             } else {
                 console.log(`[WalletValidator] WARNING: Wallet Balance container not visible!`);
                 console.log(`[WalletValidator] Wallet Page Text: ${(await this.page.innerText('body')).substring(0, 200)}...`);
             }

             if (isGiftCard) {
                 console.log('[WalletValidator] Reward was a Gift Card. Checking for Gift Cards section...');
                 const giftCardTab = this.page.locator("text=/Gift Card|Voucher|Coupon/i").first();
                 if (await giftCardTab.isVisible()) {
                     console.log('[WalletValidator] Clicking Gift Cards tab/section...');
                     await giftCardTab.click();
                     await this.page.waitForTimeout(1500);
                     const gcText = await this.page.innerText('body');
                     console.log(`[WalletValidator] Gift Card view text: ${gcText.substring(0, 200)}...`);
                 } else {
                     console.log('[WalletValidator] WARNING: Could not find a specific Gift Card tab/button on Wallet screen.');
                 }
             }

         } else {
              console.log('[WalletValidator] ERROR: Could not find Wallet button on sidebar/navbar.');
         }
         
         // 2. Go to Profile
         console.log('[WalletValidator] Navigating to Profile to check Transactions...');
         const profileBtn = this.page.locator('a, button, p, span').getByText(/^Profile$/i).first();
         if (await profileBtn.isVisible().catch(()=>false)) {
             await profileBtn.click();
             await this.page.waitForTimeout(2000);
             
             // Scroll down a bit in case transactions are below the fold
             await this.page.mouse.wheel(0, 500);
             await this.page.waitForTimeout(1000);

             // Print body text to see the transaction cards
             const profileText = await this.page.innerText('body');
             console.log(`[WalletValidator] Profile Page Text (looking for transaction cards):`);
             // We just print lines that look like transaction details (dates, amounts, "credited")
             const lines = profileText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
             const transactionSnippet = lines.slice(Math.max(0, lines.length - 15)).join(' | '); // print the bottom part
             console.log(`[WalletValidator] End of Profile Page: ${transactionSnippet}`);
         } else {
             console.log('[WalletValidator] ERROR: Could not find Profile button on sidebar/navbar.');
         }
         
         // 3. Go back to Home
         console.log('[WalletValidator] Returning to Dashboard/Home...');
         const homeBtn = this.page.locator('a, button, p, span').getByText(/^Home$/i).first();
         if (await homeBtn.isVisible().catch(()=>false)) {
              await homeBtn.click();
              await this.page.waitForTimeout(2000);
         } else {
              console.log('[WalletValidator] ERROR: Could not find Home button on sidebar/navbar.');
              // Fallback: force navigation
              await this.page.goto('https://dev.superj.app/');
              await this.page.waitForTimeout(3000);
         }
    }
}

module.exports = WalletValidator;
