const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const H = require('./lib/hercules');
const { createHarness } = require('./lib/harness');
const { loginAndBrief, createSurvey, cleanup } = require('./lib/create');
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

test('manage: share links, rename / duplicate / delete from every place', async ({ page, browser }) => {
    test.setTimeout((E.run.maxMinutes + 6) * 60_000);
    const h = createHarness(page, { group: 'manage', outDir: OUT, budgetMin: E.run.maxMinutes });
    let chatUrl = null;
    const back = async () => { await page.goto(chatUrl, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(8000); };
    try {
        const b = await loginAndBrief(page, h, { baseUrl: BASE_URL, expect: E, outDir: OUT });
        chatUrl = b.chatUrl;
        if (!b.briefOk || !(await createSurvey(page, h, { expect: E, outDir: OUT }))) return;
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
                h.expectProduct(`${option}: link shown`, !!s.link, s.link || 'no link in dialog');
                h.expectProduct(`${option}: access is "anyone with the link"`, /anyone with the link/i.test(s.access || ''), s.access, 'warn');
                if (!s.link) return;
                const v = await H.openLoggedOut(browser, s.link, { videoDir: path.join(OUT, 'share-videos') });
                if (v.shotBuffer) fs.writeFileSync(path.join(OUT, `share-${option.split(' ').pop().toLowerCase()}-loggedout.png`), v.shotBuffer);
                h.expectProduct(`${option}: opens logged-out`, !v.notFound && !v.loginWall,
                    v.notFound ? `404 page (video: ${v.video})` : v.loginWall ? `redirected to ${v.url} although access is "${s.access}" (video: ${v.video}; navigations: ${v.navigations.join(' → ')})` : v.url);
                h.expectProduct(`${option}: shows the right content`, expectRe.test(v.text), `looked for ${expectRe}`, 'warn');
            });
        }
        if (shares['Share Survey'] && shares['Share Campaign Chat']) {
            h.expectProduct('Share Survey link differs from Share Campaign Chat link', shares['Share Survey'] !== shares['Share Campaign Chat'],
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
                if (h.expectProduct(`rename via ${where}`, listed >= 1, `"${n}" listed ${listed}x`)) name = n;
            });
        }
        h.result.facts.finalName = name;

        // ── Duplicate from each place ──
        const dupUrls = [];
        const dups = [
            ['H icon', async () => { await back(); const u = await H.duplicateCampaign(page); if (u !== chatUrl) dupUrls.push(u); return { available: true }; }],
            ['sidebar', async () => { const r = await H.sidebarAction(page, chatUrl, 'Duplicate'); await page.waitForTimeout(4000); if (r.available && page.url() !== chatUrl && /\/chat\/[0-9a-f-]{20,}/.test(page.url())) dupUrls.push(page.url()); return r; }],
            ['All campaigns', () => H.allCampaignsAction(page, BASE_URL, name, 'Duplicate')],
        ];
        for (const [where, fn] of dups) {
            await h.scenario(`duplicate via ${where}`, async () => {
                if (!name) return h.skip(`duplicate via ${where}`, 'no unique campaign name to count copies by');
                const before = await H.countListed(page, BASE_URL, name);
                const r = await fn();
                if (!r.available) return h.skip(`duplicate via ${where}`, r.reason || 'option not available here');
                await page.waitForTimeout(4000);
                const after = await H.countListed(page, BASE_URL, name);
                h.expectProduct(`duplicate via ${where}`, after > before, `"${name}" cards ${before}→${after}`);
            });
        }
        h.result.facts.duplicateUrls = dupUrls;

        // ── Delete copies from each place (the original is deleted by cleanup only if all passed) ──
        const dels = [
            ['H icon', async () => { if (!dupUrls[0]) return { available: false, reason: 'no duplicate URL captured' }; await page.goto(dupUrls[0], { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(8000); await H.deleteCampaign(page); return { available: true }; }],
            ['sidebar', async () => { if (!dupUrls[1]) return { available: false, reason: 'no second duplicate URL captured' }; return H.sidebarAction(page, dupUrls[1], 'Delete'); }],
            ['All campaigns', () => H.allCampaignsAction(page, BASE_URL, name, 'Delete')],
        ];
        for (const [where, fn] of dels) {
            await h.scenario(`delete via ${where}`, async () => {
                if (!name) return h.skip(`delete via ${where}`, 'no unique campaign name');
                const before = await H.countListed(page, BASE_URL, name);
                if (before < 2) return h.skip(`delete via ${where}`, `only ${before} card(s) left; not deleting the original here`);
                const r = await fn();
                if (!r.available) return h.skip(`delete via ${where}`, r.reason || 'option not available here');
                const after = await H.countListed(page, BASE_URL, name);
                h.expectProduct(`delete via ${where}`, after === before - 1, `"${name}" cards ${before}→${after}`);
            });
        }
    } finally {
        await cleanup(page, h, chatUrl, E);
        h.finish();
    }
});
