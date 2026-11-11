/**
 * Doc 1 design payloads on DEV, headless.
 * Source: config/devDesigns.json, extracted from the "Doc 1 design payloads" artifact (PR #46).
 *
 * For each design (DESIGNS=003,007,... picks a subset), with a brand-new dev account:
 *   1. sign up on dev.hercules.works with a Mailosaur address (HerculesEmailAuth, fresh mode)
 *   2. send the design's prompt (attaching its stimulus images/videos), answer Hercules'
 *      clarifications, create the survey
 *   3. Hercules POV: read the Super J payload Hercules builds (GET /api/chats/<id>/versions/N/preview)
 *      and check the design and its payload keys are there; read the audience and logic rules
 *   4. deploy with the free balance only ("Deploy to N"; never Pay/Buy) and Launch Survey
 *   5. copy the superj.app link, switch it to dev.superj.app, log in with a random phone + OTP 777777,
 *      fill the profile with a gender / birth year / city that fit the survey's audience, and answer
 *
 * Writes reports/dev-design-payloads/<run>/sd<id>/result.json (+ screenshots, payload.json) per design.
 */
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { createHarness } = require('../monitor/lib/harness');
const { parseTargetAudience } = require('../../utils/HerculesBriefParser');
const F = require('./lib/devflow');
const SJ = require('./lib/superj');

const BASE = process.env.HERCULES_URL || 'https://dev.hercules.works';
if (!/dev\.hercules\.works/.test(BASE)) throw new Error(`This test only runs against dev (got ${BASE}).`);
const RUN_DIR = process.env.DESIGNS_OUT_DIR || path.resolve('reports/dev-design-payloads', new Date().toISOString().replace(/[:.]/g, '-'));
const CONFIG = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../config/devDesigns.json'), 'utf8'));
const pick = (process.env.DESIGNS || '').split(',').map(s => s.trim().replace(/^sd/i, '')).filter(Boolean);
const DESIGNS = CONFIG.designs.filter(d => !pick.length || pick.includes(d.sd));
const PER_DESIGN_MIN = Number(process.env.PER_DESIGN_MINUTES || 55);

// The design key that must be in the payload for the design to count as applied.
const DESIGN_KEY = { '003': 'monadic', '004': 'monadic', '005': 'pairs', '009': 'blockRotation', '012': 'psm', '013': 'gaborGranger',
    '014': 'monadic', '015': 'maxDiff', '016': 'kano', '017': 'nps', '018': 'semanticDifferential', '024': 'optionLoopSource',
    '026': 'dynamicQuotas', '036': 'monadic', '037': 'shelf', '040': 'cardSort', '042': 'swipe' };
const KNOWN_DESIGNS = ['monadic', 'pairs', 'blockRotation', 'psm', 'gaborGranger', 'maxDiff', 'kano', 'nps', 'semanticDifferential', 'dynamicQuotas', 'shelf', 'cardSort', 'swipe', 'allAds', 'monadicRotation'];

/** Extra, design-specific payload checks (beyond "the keys are there"). */
function designChecks(d, data) {
    const qs = data.preview_payloads || [];
    const out = [];
    if (d.sd === '007') {
        const q = qs.find(x => (x.choice || []).length === 2 && /zesto|fizzo/i.test(JSON.stringify(x.choice)));
        out.push(['forced choice: one question with exactly the 2 names', !!q, q ? `"${q.question.slice(0, 80)}": ${q.choice.map(c => c.option).join(' / ')}` : 'no 2-option Zesto/Fizzo question']);
        if (q) out.push(['forced choice: no both / neither option', !q.choice.some(c => /both|neither|none|no preference/i.test(c.option)), q.choice.map(c => c.option).join(' / ')]);
    }
    if (d.sd === '006') {
        const q = qs.find(x => x.answerType === 'image' || (x.choice || []).some(c => c.image || c.optionImage || c.choiceImage));
        out.push(['side-by-side: a question with image options', !!q, q ? q.question.slice(0, 100) : 'no question whose options are images']);
    }
    if (d.sd === '019') {
        const n = qs.filter(x => x.subHeading).length;
        out.push(['conjoint: choice screens carry a subHeading', n >= 4, `${n} questions with subHeading (example had 8)`]);
    }
    if (d.sd === '012') {
        const n = qs.filter(x => /too cheap|bargain|expensive|too expensive/i.test(x.question)).length;
        out.push(['PSM: the four price questions', n >= 4, `${n} price questions`]);
    }
    if (d.sd === '017') {
        const q = qs.find(x => /recommend/i.test(x.question));
        out.push(['NPS: a "how likely to recommend" question', !!q, q ? q.question.slice(0, 100) : 'none']);
    }
    return out;
}

/** Respondent profile that fits the audience: a listed city, an age inside the first band. */
function personaFor(audienceText, briefAudience, payload) {
    const text = `${audienceText || ''} ${briefAudience ? briefAudience.raw || '' : ''}`;
    const cities = ['Mumbai', 'Delhi', 'Bangalore', 'Bengaluru', 'Chennai', 'Hyderabad', 'Pune', 'Kolkata', 'Jaipur', 'Ahmedabad', 'Lucknow'];
    const city = cities.find(c => new RegExp(`\\b${c}\\b`, 'i').test(text)) || 'Mumbai';
    const band = (text.match(/\b(1[89]|[2-5]\d)\s*[-–]\s*([2-6]\d)\b/) || []);
    const age = band[1] ? Math.min(Number(band[2]) - 1, Number(band[1]) + 2) : 27;
    const female = /\b(women|female)\b/i.test(text) && !/\b(men|male)\b/i.test(text.replace(/women|female/gi, ''));
    return { gender: female ? 'Female' : 'Male', birthYear: new Date().getFullYear() - age, city: city === 'Bengaluru' ? 'Bangalore' : city, from: band[0] || 'default' };
}

test.describe.configure({ mode: 'serial' });
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

for (const d of DESIGNS) {
    test(`SD${d.sd} ${d.name}`, async ({ browser }) => {
        test.setTimeout(PER_DESIGN_MIN * 60_000 + 5 * 60_000);
        const outDir = path.join(RUN_DIR, `sd${d.sd}`);
        // A brand-new account per design: each deploy uses the account's whole free balance.
        process.env.MONITOR_FRESH_ACCOUNT = 'true';
        process.env.MONITOR_GROUP = `d${d.sd}`;
        delete require.cache[require.resolve('../../utils/HerculesEmailAuth')];
        const { ensureSignedIn } = require('../../utils/HerculesEmailAuth');

        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const page = await ctx.newPage();
        const h = createHarness(page, { group: `SD${d.sd} ${d.name}`, outDir, budgetMin: PER_DESIGN_MIN });
        const log = m => console.log(`[SD${d.sd}] ${m}`);
        const net = [];
        F.captureNetwork(page, net);
        Object.assign(h.result.facts, { sd: d.sd, design: d.name, prompt: d.prompt, uploads: d.uploads, expectedKeys: d.keys, superjExpected: d.superj, baseUrl: BASE });

        try {
            const auth = await h.scenario('dev account (Mailosaur sign-up)', async () => {
                const a = await ensureSignedIn(page, { baseUrl: BASE, log });
                h.expectTest('dev account (Mailosaur sign-up)', true, `${a.method}: ${a.email}`);
                h.result.facts.account = a.email;
                return a;
            }, { needsMinutes: 5 });
            if (!auth) return;

            const chat = await h.scenario('prompt sent', async () => {
                const url = await F.sendPrompt(page, BASE, d.prompt, d.uploads, log);
                h.expectProduct('chat opens after prompt', /\/chat\//.test(url), url);
                h.result.facts.chatUrl = url;
                return url;
            }, { needsMinutes: 5 });
            if (!chat) return;

            const made = await h.scenario('brief and survey', async () => {
                const ctxText = `${d.what} We are a consumer brand in India; please run this as described.`;
                const r = await F.briefAndCreate(page, ctxText);
                fs.writeFileSync(path.join(outDir, 'brief.txt'), r.brief);
                h.result.facts.wizard = r.wizard;
                await h.shot('brief-or-survey');
                if (!h.expectProduct('brief leads to "create the survey"', r.briefOk, `${r.wizard.steps} steps: ${r.wizard.seen.join(', ')}`)) return null;
                h.expectProduct('survey created', r.created, r.created ? `${r.createMinutes} min after "create the survey"` : 'no "Survey is In-drafts" card');
                return r.created ? r : null;
            }, { needsMinutes: 15 });
            if (!made) return;
            const briefAudience = parseTargetAudience(made.brief);
            h.result.facts.briefAudience = briefAudience && { ...briefAudience, raw: undefined };

            // ── Hercules POV: the Super J payload it will ship ─────────────────────────────
            const preview = await h.scenario('Super J payload (Hercules preview)', async () => {
                let p = F.latestPreview(net);
                if (!p) { await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(15_000); p = F.latestPreview(net); }
                if (!h.expectTest('payload preview captured', !!p, p ? p.url : 'no /versions/N/preview response')) return null;
                fs.writeFileSync(path.join(outDir, 'payload.json'), JSON.stringify(p.data, null, 2));
                const { keys, values } = F.keysAndValues(p.data);
                const has = k => keys.has(k) || values.has(k);
                const designs = (p.data.survey_settings && p.data.survey_settings.surveyDesigns) || [];
                const audDesigns = Object.keys((p.data.audience_settings && p.data.audience_settings.designs) || {});
                const qn = (p.data.preview_payloads || []).length;
                Object.assign(h.result.facts, { surveyDesigns: designs, audienceDesigns: audDesigns, questions: qn, exampleQuestions: d.example.questionsTotal });
                const key = DESIGN_KEY[d.sd];
                if (key) h.expectProduct(`design applied (${key})`, has(key), `surveyDesigns ${JSON.stringify(designs)}, audience designs ${JSON.stringify(audDesigns)}`);
                const missing = d.keys.filter(k => !has(k));
                h.expectProduct('payload carries the design keys', !missing.length, missing.length ? `missing ${missing.join(', ')} (expected ${d.keys.join(', ')})` : `all of ${d.keys.join(', ')}`, key && has(key) ? 'warn' : 'fail');
                const extra = KNOWN_DESIGNS.filter(k => has(k) && !d.keys.includes(k) && k !== key);
                if (extra.length) h.expectProduct('no unexpected extra design', false, `also has ${extra.join(', ')} — check if intended`, 'warn');
                for (const [name, ok, detail] of designChecks(d, p.data)) h.expectProduct(name, ok, detail);
                h.expectProduct('question count', qn > 0, `${qn} questions (artifact example: ${d.example.questionsTotal})`);
                return p;
            }, { needsMinutes: 3 });

            const audience = await h.scenario('audience and logic', async () => {
                const rules = await F.H.readLogicRules(page).catch(() => []);
                h.result.facts.logicRules = rules.filter(r => r.rules).map(r => `Q${r.q}: ${r.rules}`).slice(0, 40);
                const a = await F.H.readAudience(page);
                h.result.facts.audience = a;
                h.expectProduct('audience page opens', !!a.found, a.found ? `${a.count} respondents` : 'no View Audience');
                if (d.example.audience && d.example.audience.cities.length) {
                    const listed = d.example.audience.cities.filter(c => new RegExp(c, 'i').test(a.text || ''));
                    h.expectProduct('audience has the cities the design needs', listed.length > 0 || /all india|pan.?india/i.test(a.text || ''), `example cities ${d.example.audience.cities.join(', ')}; on page: ${listed.join(', ') || 'none'}`, 'warn');
                }
                return a;
            }, { needsMinutes: 3 });

            // ── Deploy (free balance only) → Super J link ───────────────────────────────────
            const deployed = await h.scenario('deploy (free balance) and launch', async () => {
                const r = await F.deployFree(page, log);
                await h.shot('launched');
                h.result.facts.deployDialog = r.modal;
                if (!h.expectProduct('Super J link after launch', !!r.link, r.link || 'no superj.app/survey link on the page')) return null;
                h.result.facts.superjLink = r.link;
                h.result.facts.superjDevLink = SJ.devLink(r.link);
                return r;
            }, { needsMinutes: 4 });
            if (!deployed) return;

            // ── Super J (dev) as a respondent ──────────────────────────────────────────────
            const sjCtx = await browser.newContext({ viewport: { width: 430, height: 900 }, isMobile: false });
            const sj = await sjCtx.newPage();
            const sjShot = async n => { const p = path.join(outDir, `${String(h.result.screenshots.length + 1).padStart(2, '0')}-${n}.png`); await sj.screenshot({ path: p }).catch(() => {}); h.result.screenshots.push(p); };
            try {
                await h.scenario('Super J respondent', async () => {
                    await SJ.login(sj, log);
                    h.expectTest('Super J login (OTP 777777)', true, 'random test phone');
                    const persona = personaFor(audience && audience.text, briefAudience, preview && preview.data);
                    h.result.facts.persona = persona;
                    await sj.goto(h.result.facts.superjDevLink, { waitUntil: 'domcontentloaded' });
                    await sj.waitForTimeout(8000);
                    const prof = await SJ.completeProfile(sj, persona, log);
                    if (prof.shown) h.expectProduct('Super J profile sheet (gender, birth year, city)', prof.done, `${prof.gender}, ${prof.birthYear}, ${prof.city} (from audience ${persona.from})`);
                    const st = await SJ.startSurvey(sj, h.result.facts.superjDevLink);
                    await sjShot('sj-start');
                    h.result.facts.superjIntro = st.intro.slice(0, 400);
                    if (st.turnstile) {
                        h.expectTest('Super J survey starts', false, 'Cloudflare Turnstile "Verify you are human" appears after Start Survey; automation does not solve CAPTCHAs. Needs Turnstile off (or the always-pass test key) on dev.superj.app.', 'warn');
                        h.result.facts.blockedBy = 'turnstile';
                        return;
                    }
                    if (!h.expectProduct('Super J survey starts', st.started, st.reason || st.url)) return;
                    const ans = await SJ.answerSurvey(sj, { shot: sjShot, log });
                    h.result.facts.superjScreens = ans.screens.map(s => `${s.i + 1}. ${s.text.slice(0, 220)}${s.picked ? ` → ${s.picked}` : ''}`);
                    h.expectProduct('Super J survey answered to the end', ans.completed, ans.completed ? `${ans.screens.length} screens` : (ans.stuck ? `stuck on: ${ans.stuck}` : ans.reason));
                }, { needsMinutes: 4 });
            } finally { await sjCtx.close().catch(() => {}); }
        } finally {
            fs.writeFileSync(path.join(outDir, 'network-index.json'), JSON.stringify(net.map(e => ({ at: e.at, method: e.method, url: e.url, status: e.status, bytes: e.body.length })), null, 1));
            h.finish();
            await ctx.close().catch(() => {});
        }
    });
}
