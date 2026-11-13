const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./lib/hercules');
const { createHarness } = require('./lib/harness');
const { loginAndBrief, createSurvey, cleanup, checkCreatedAudience } = require('./lib/create');
const { ensureSignedIn } = require('../../utils/HerculesEmailAuth');
const { parseTargetAudience } = require('../../utils/HerculesBriefParser');
const E = require('../../config/hourlyMonitorExpectations');

/**
 * MANAGE group — sharing and campaign management.
 *   Share (bottom-left icon): Campaign Chat / Survey / Research Brief → link, access level →
 *   open each link logged-out and check the right content shows.
 *   Rename / Duplicate / Delete from the H-icon menu, the sidebar row menu and All campaigns.
 *   Options a place doesn't offer are skipped, not failed.
 */
const BASE_URL = process.env.HERCULES_URL || 'https://hercules.works';
const OUT = path.join(process.env.MONITOR_OUT_DIR || 'reports/monitor/local', 'manage');
// Optional: run on a survey the monitor account already has (no AI tokens needed, e.g. when the
// daily limit is used up). That survey is kept: only the copies made here are deleted.
const REUSE = process.env.MONITOR_REUSE_CHAT_URL || '';

test('manage: share links, rename / duplicate / delete from every place', async ({ page, browser }) => {
    test.setTimeout((E.run.maxMinutes + 6) * 60_000);
    const h = createHarness(page, { group: 'manage', outDir: OUT, budgetMin: E.run.maxMinutes });
    let chatUrl = null;
    const back = async () => { await page.goto(chatUrl, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(8000); };
    try {
        if (REUSE) {
            const a = await ensureSignedIn(page, { baseUrl: BASE_URL, log: () => {} });
            await h.expectTest('login', true, `${a.method}; reusing the existing survey ${REUSE}`);
            chatUrl = REUSE;
            await back();
            const brief = parseTargetAudience(await page.locator('body').innerText());
            h.result.facts.briefAudience = brief && { ...brief, raw: undefined };
            h.result.facts.chatUrl = chatUrl;
            await page.getByText(/Survey is In-drafts/i).last().click().catch(() => {});
            await page.waitForTimeout(3000);
            await checkCreatedAudience(page, h, h.result.facts.briefAudience, E);
            await page.getByText(/Survey is In-drafts/i).last().click().catch(() => {});
            await page.waitForTimeout(3000);
        } else {
            const b = await loginAndBrief(page, h, { baseUrl: BASE_URL, expect: E, outDir: OUT });
            chatUrl = b.chatUrl;
            if (!b.briefOk || !(await createSurvey(page, h, { expect: E, outDir: OUT }))) return;
        }
        const questionSample = (await H.surveyState(page)).questions[0] || '';

        // ── Share ──
        const shares = {};
        for (const [option, expectRe] of [
            ['Share Campaign Chat', /QA-MONITOR/],
            ['Share Survey', questionSample ? new RegExp(questionSample.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : /Survey/],
            ['Share Research Brief', /Research Brief/i],
        ]) {
            await h.scenario(option, async () => {
                await back();
                const s = await H.shareLink(page, option);
                shares[option] = s.link;
                await h.expectProduct(`${option}: link shown`, !!s.link, s.link || 'no link in dialog');
                await h.expectProduct(`${option}: access is "anyone with the link"`, /anyone with the link/i.test(s.access || ''), s.access, 'warn');
                if (!s.link) return;
                // Checked on the logged-out (incognito-like) page itself, so the screenshots show what a
                // visitor without an account sees, with the matching content outlined.
                const v = await H.openLoggedOut(browser, s.link, {
                    videoDir: path.join(OUT, 'share-videos'),
                    beforeClose: async (p, r) => {
                        h.setPage(p);
                        try {
                            await h.expectProduct(`${option}: opens logged-out`, !r.notFound && !r.loginWall,
                                r.notFound ? `404 page at ${r.url}` : r.loginWall ? `redirected to ${r.url} although access is "${s.access}" (navigations: ${r.navigations.join(' → ')})` : `opened without login: ${r.url}`,
                                'fail', { el: p.locator('main, body').first() });
                            const ok = expectRe.test(r.text);
                            await h.expectProduct(`${option}: shows the right content`, ok,
                                ok ? `found ${expectRe} on the logged-out page` : `${expectRe} not found on the logged-out page`, 'warn', { el: ok ? p.getByText(expectRe).first() : p.locator('main, body').first() });
                        } finally { h.setPage(page); }
                    },
                });
                if (v.shotBuffer) fs.writeFileSync(path.join(OUT, `share-${option.split(' ').pop().toLowerCase()}-loggedout.png`), v.shotBuffer);
                if (v.video) h.result.facts[`shareVideo ${option}`] = v.video;
            });
        }
        if (shares['Share Survey'] && shares['Share Campaign Chat']) {
            await h.expectProduct('Share Survey link differs from Share Campaign Chat link', shares['Share Survey'] !== shares['Share Campaign Chat'],
                shares['Share Survey'] === shares['Share Campaign Chat'] ? `both are ${shares['Share Survey']}` : 'different', 'warn');
        }
        h.result.facts.shareLinks = shares;

        // ── Rename from each place ──
        const stamp = new Date().toISOString().slice(5, 16).replace(/[-:T]/g, '');
        let name = null;
        const renames = [
            ['H icon', async n => { await back(); await H.renameCampaign(page, n); return { available: true }; }],
            ['sidebar', n => H.sidebarAction(page, chatUrl, 'Rename', { newName: n })],
            ['All campaigns', n => H.allCampaignsAction(page, BASE_URL, name || 'QA-MONITOR-manage', 'Rename', { newName: n })],
        ];
        for (const [where, fn] of renames) {
            await h.scenario(`rename via ${where}`, async () => {
                const n = `QA Manage ${stamp} ${where.split(' ')[0]}`;
                const r = await fn(n);
                if (!r.available) return h.skip(`rename via ${where}`, r.reason || 'option not available here');
                await h.shot(`renamed-${where}`);
                const listed = await H.countListed(page, BASE_URL, n);
                if (await h.expectProduct(`rename via ${where}`, listed >= 1, `"${n}" listed ${listed}x in All campaigns`, 'fail', { el: page.getByText(n, { exact: false }) })) name = n;
            });
        }
        h.result.facts.finalName = name;

        // ── Duplicate ──
        // Hercules names a copy "<survey title>-copy" (seen 2026-11-13), not after the campaign name.
        // So each duplicate is made from a menu, then the copy is searched for on the dashboard
        // (All campaigns) and matched against the original.
        await back();
        const title = await H.surveyTitle(page);
        await page.getByText(/Survey is In-drafts/i).last().click().catch(() => {}); // opens the Questions panel
        await page.waitForTimeout(3000);
        const query = title ? title.slice(0, 30) : null; // the chat card can cut long titles short
        const original = query ? (await H.surveyState(page)).questions : [];
        h.result.facts.surveyTitle = title;
        const copyCard = () => page.getByText(new RegExp(`${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*-copy`, 'i')).first();
        const dupUrls = [];
        let copyName = null; // full name of the latest copy as listed
        const copyNames = [];
        // Each way of duplicating names its copy differently:
        //   3-dot menu on All campaigns → asks for a name, prefilled "<campaign name>-copy" (kept as is)
        //   sidebar row 3-dot menu     → same name dialog as the 3-dot menu
        //   H icon                     → "<survey title>-copy"
        const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const dups = [
            ['3-dot menu on All campaigns', () => `${name}-copy`, () => H.allCampaignsAction(page, BASE_URL, name, 'Duplicate')],
            ['H icon', () => query, async () => { await back(); const u = await H.duplicateCampaign(page); if (u !== chatUrl) dupUrls.push(u); return { available: true }; }],
            ['sidebar', () => `${name}-copy`, async () => { const r = await H.sidebarAction(page, chatUrl, 'Duplicate'); if (!r.available) r.reason = r.reason || 'the sidebar row menu has no Duplicate (it offers Star, Rename, Delete)'; await page.waitForTimeout(4000); if (r.available && page.url() !== chatUrl && /\/chat\/[0-9a-f-]{20,}/.test(page.url())) dupUrls.push(page.url()); return r; }],
        ];
        for (const [where, searchFor, fn] of dups) {
            await h.scenario(`duplicate via ${where}`, async () => {
                if (!query) return h.skip(`duplicate via ${where}`, 'survey title not found on the chat card');
                const q = searchFor();
                const before = await H.countListed(page, BASE_URL, q);
                const r = await fn();
                if (!r.available) return h.skip(`duplicate via ${where}`, r.reason || 'option not available here');
                await page.waitForTimeout(4000);
                const look = r.copyName || q;
                const after = await H.countListed(page, BASE_URL, look); // Campaigns tab search; page stays on the results
                const card = page.getByText(new RegExp(`${esc(look.replace(/-copy$/i, ''))}.*-copy`, 'i')).first();
                const shown = await card.isVisible().catch(() => false);
                const listed = shown ? (await card.innerText().catch(() => '')).trim() : '';
                if (listed) { copyName = listed; copyNames.push(listed); }
                await h.expectProduct(`duplicate via ${where}`, after === before + 1 && shown,
                    `searched Campaigns for "${look}": ${before}→${after} card(s)${shown ? `; copy listed as "${listed}"` : '; no "-copy" card visible'}${r.copyName ? ` (name given in the Duplicate dialog: "${r.copyName}")` : ''}`,
                    'fail', { el: card, expected: `Duplicate from the ${where} adds one copy, found by searching the Campaigns tab` });
            });
        }
        // Match the copy against the original: same survey title + "-copy", same questions.
        await h.scenario('duplicate matches the original', async () => {
            if (!query) return h.skip('duplicate matches the original', 'survey title not found');
            await H.countListed(page, BASE_URL, query);
            const card = copyCard();
            if (!(await card.isVisible().catch(() => false))) return h.skip('duplicate matches the original', 'no copy listed to compare');
            const listedName = (await card.innerText()).trim();
            await card.click();
            await page.waitForURL(u => /\/chat\/[0-9a-f-]{20,}/.test(u.toString()) && u.toString() !== chatUrl, { timeout: 30_000 }).catch(() => {});
            await page.waitForTimeout(8000);
            const copyUrl = page.url();
            if (!dupUrls.includes(copyUrl) && copyUrl !== chatUrl) dupUrls.push(copyUrl);
            await page.getByText(/Survey is In-drafts/i).last().click().catch(() => {});
            await page.waitForTimeout(3000);
            const copyQs = (await H.surveyState(page)).questions;
            const sameName = listedName.toLowerCase().startsWith(query.toLowerCase()) && /-copy$/i.test(listedName);
            const sameQs = original.length > 0 && copyQs.length === original.length && copyQs.every((q, i) => q === original[i]);
            await h.expectProduct('duplicate matches the original', sameName && sameQs,
                `copy "${listedName}" (${copyUrl}): ${copyQs.length} questions vs original ${original.length}${sameQs ? ', same wording' : copyQs.length === original.length ? ', wording differs' : ''}`,
                'fail', { el: page.getByText(/Survey is In-drafts/i).last(),
                    expected: `The copy is named "${title}-copy" and has the same ${original.length} questions as the original` });
        });
        h.result.facts.duplicateUrls = dupUrls;

        // ── Delete the copies (the original is deleted by cleanup) and confirm on the dashboard ──
        // Each copy is counted by its own name on the Campaigns tab (the original is never touched here).
        const menuCopy = copyNames.find(n => n.toLowerCase().startsWith(String(name).toLowerCase())) || `${name}-copy`; // "<campaign>-copy"
        const hIconCopy = copyNames.find(n => query && n.toLowerCase().startsWith(query.toLowerCase())) || null;
        const dels = [
            ['3-dot menu on All campaigns', menuCopy, () => H.allCampaignsAction(page, BASE_URL, menuCopy, 'Delete')],
            ['H icon', hIconCopy, async () => { if (!dupUrls[0]) return { available: false, reason: 'no copy URL captured' }; await page.goto(dupUrls[0], { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(8000); await H.deleteCampaign(page); return { available: true }; }],
            // Opens the remaining "<campaign>-copy" from the Campaigns tab, then deletes it from its sidebar row menu.
            // The sidebar menu has no Duplicate, so a copy for it is made from the 3-dot menu first (setup, not a check).
            ['sidebar', menuCopy, async () => { const u = await H.openCampaign(page, BASE_URL, menuCopy); if (!u) return { available: false, reason: `"${menuCopy}" could not be opened` }; return H.sidebarAction(page, u, 'Delete'); }],
        ];
        for (const [where, target, fn] of dels) {
            await h.scenario(`delete via ${where}`, async () => {
                if (!target) return h.skip(`delete via ${where}`, 'no copy to delete from this place');
                if (where === 'sidebar' && name && (await H.countListed(page, BASE_URL, target)) < 1) {
                    await H.allCampaignsAction(page, BASE_URL, name, 'Duplicate'); // setup: a copy to delete
                    await page.waitForTimeout(3000);
                }
                const before = await H.countListed(page, BASE_URL, target);
                if (before < 1) return h.skip(`delete via ${where}`, `"${target}" not listed`);
                const r = await fn();
                if (!r.available) return h.skip(`delete via ${where}`, r.reason || 'option not available here');
                const after = await H.countListed(page, BASE_URL, target);
                await h.expectProduct(`delete via ${where}`, after === before - 1,
                    `searched Campaigns for "${target}": ${before} card(s) before Delete, ${after} after${after === before - 1 ? " (the deleted one is gone)" : ""}`, 'fail',
                    { el: page.getByPlaceholder('Search...'), expected: `After Delete from the ${where}, "${target}" disappears from the Campaigns tab` });
            });
        }
    } finally {
        if (!REUSE) await cleanup(page, h, chatUrl, E);
        h.finish();
    }
});
