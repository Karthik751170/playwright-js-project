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

function createHarness(page, { group, outDir, budgetMin }) {
    fs.mkdirSync(outDir, { recursive: true });
    const t0 = Date.now();
    const deadline = t0 + budgetMin * 60_000;
    const result = { group, startedAt: new Date(t0).toISOString(), checks: [], defects: [], facts: {}, screenshots: [], conversations: [] };

    const record = (name, status, detail, kind) => {
        const entry = { name, status, kind, detail: detail == null ? '' : String(detail).slice(0, 600) };
        result.checks.push(entry);
        if (status === 'FAIL' && kind === 'defect') result.defects.push(entry);
        console.log(`[${group}] ${status}${kind === 'defect' && status !== 'PASS' ? ' (DEFECT)' : ''} ${name}${detail ? ` — ${String(detail).slice(0, 300)}` : ''}`);
        save();
    };
    /** Product behaviour check: a FAIL is a Hercules defect. severity 'warn' downgrades to WARN. */
    const expectProduct = (name, ok, detail, severity = 'fail') => { record(name, ok ? 'PASS' : severity === 'warn' ? 'WARN' : 'FAIL', detail, 'defect'); return ok; };
    /** Script/test check: a FAIL means the monitor itself couldn't do something. */
    const expectTest = (name, ok, detail, severity = 'fail') => { record(name, ok ? 'PASS' : severity === 'warn' ? 'WARN' : 'FAIL', detail, 'test'); return ok; };
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
            expectTest(name, false, `error: ${(e.message || String(e)).split('\n')[0]}`);
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

    return { result, expectProduct, expectTest, skip, scenario, shot, left, mins, save, finish, t0 };
}

module.exports = { createHarness };
