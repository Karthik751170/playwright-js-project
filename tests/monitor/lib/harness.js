/**
 * Result harness shared by the monitor groups (core / logic / manage).
 *
 * Every check is PASS / WARN / FAIL / SKIP. A FAIL is either:
 *   - a DEFECT  — Hercules itself behaved wrongly (kind: 'defect'), or
 *   - a TEST failure — the script couldn't do or read something (kind: 'test').
 * Alerts list defects first so real product problems stand out.
 */
const fs = require('fs');
const path = require('path');
const { installTracker, highlightShot } = require('./evidence');
const { describeCheck } = require('./expectations');

function createHarness(initialPage, { group, outDir, budgetMin }) {
    let page = initialPage;
    fs.mkdirSync(outDir, { recursive: true });
    const t0 = Date.now();
    const deadline = t0 + budgetMin * 60_000;
    const result = { group, startedAt: new Date(t0).toISOString(), checks: [], defects: [], facts: {}, screenshots: [], conversations: [] };
    installTracker(page).catch(() => {});
    const evidenceDir = path.join(outDir, 'evidence');

    /**
     * Records one check with its feature area, expected and actual result. opts (all optional):
     * { el: locator to highlight, expected: text, actual: text }.
     */
    const record = (name, status, detail, kind, opts = {}) => {
        const d = describeCheck(name);
        const detailText = detail == null ? '' : String(detail).slice(0, 600);
        const entry = {
            name, status, kind, detail: detailText,
            feature: opts.feature || d.feature,
            expected: opts.expected || d.expected,
            actual: opts.actual || detailText || (status === 'PASS' ? 'Matches the expected result' : status === 'SKIP' ? 'Not run' : 'Did not match the expected result'),
            at: new Date().toISOString(),
        };
        result.checks.push(entry);
        if (status === 'FAIL' && kind === 'defect') result.defects.push(entry);
        console.log(`[${group}] ${status}${kind === 'defect' && status !== 'PASS' ? ' (DEFECT)' : ''} ${name}${detail ? ` — ${String(detail).slice(0, 300)}` : ''}`);
        save();
        return entry;
    };
    /** Highlighted screenshot for a recorded check (SKIPs get none). */
    const evidence = async (entry, el) => {
        if (entry.status === 'SKIP') return;
        fs.mkdirSync(evidenceDir, { recursive: true });
        const file = path.join(evidenceDir, `${String(result.checks.length).padStart(3, '0')}-${entry.name.replace(/\W+/g, '-').slice(0, 60)}.jpg`);
        const saved = await highlightShot(page, file, { el, name: entry.name, status: entry.status, expected: entry.expected, actual: entry.actual });
        if (saved) { entry.screenshot = saved; save(); }
    };
    /**
     * Product behaviour check: a FAIL is a Hercules defect. severity 'warn' downgrades to WARN.
     * Await it: it takes the highlighted screenshot before the test moves on. Returns `ok`.
     */
    const expectProduct = async (name, ok, detail, severity = 'fail', opts = {}) => {
        const entry = record(name, ok ? 'PASS' : severity === 'warn' ? 'WARN' : 'FAIL', detail, 'defect', opts);
        await evidence(entry, opts.el);
        return ok;
    };
    /** Script/test check: a FAIL means the monitor itself couldn't do something. Returns `ok`. */
    const expectTest = async (name, ok, detail, severity = 'fail', opts = {}) => {
        const entry = record(name, ok ? 'PASS' : severity === 'warn' ? 'WARN' : 'FAIL', detail, 'test', opts);
        await evidence(entry, opts.el);
        return ok;
    };
    const skip = (name, why) => record(name, 'SKIP', why, 'test');
    const left = () => deadline - Date.now();
    const mins = ms => Math.round(ms / 600) / 100;

    const shot = async name => {
        const p = path.join(outDir, `${String(result.screenshots.length + 1).padStart(2, '0')}-${name.replace(/\W+/g, '-')}.png`);
        await page.screenshot({ path: p, fullPage: false }).catch(() => {});
        result.screenshots.push(p);
        return p;
    };

    /** One scenario; an exception becomes a test FAIL and the group keeps going. */
    const scenario = async (name, fn, { needsMinutes = 3 } = {}) => {
        if (left() < needsMinutes * 60_000) return skip(name, `not enough time left in the ${budgetMin}-min budget`);
        try { return await fn(); } catch (e) {
            await expectTest(name, false, `error: ${(e.message || String(e)).split('\n')[0]}`);
            await shot(`${name}-error`);
            await page.keyboard.press('Escape').catch(() => {});
            return undefined;
        }
    };

    function save() {
        result.durationMinutes = mins(Date.now() - t0);
        result.status = result.checks.some(c => c.status === 'FAIL') ? 'FAIL' : result.checks.some(c => c.status === 'WARN') ? 'WARN' : 'PASS';
        fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2));
    }

    const finish = () => { result.finishedAt = new Date().toISOString(); save(); console.log(`[${group}] ${result.status} — ${outDir}/result.json`); };

    /** Switch the page that checks screenshot (e.g. a new clean browser context). */
    const setPage = p => { page = p; installTracker(p).catch(() => {}); };

    return { result, expectProduct, expectTest, skip, scenario, shot, left, mins, save, finish, setPage, t0 };
}

module.exports = { createHarness };
