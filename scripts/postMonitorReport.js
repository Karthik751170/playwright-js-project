#!/usr/bin/env node
/**
 * Posts the monitor's test report to the Google Chat space, once per hourly run.
 *
 *   node scripts/postMonitorReport.js <run dir>
 *
 * <run dir> holds one folder per group (<group>/result.json), the same layout monitorFeatureReport.js reads.
 *
 * When it posts:
 *   - the tests ran and PASSED, passed with WARNINGS, or FAILED  -> one report message (with the HTML report link);
 *   - a group produced no result.json (the job crashed, timed out or was cancelled before its tests finished)
 *     -> nothing is posted. That is a job failure, not a test result, and it does not go to the space.
 *
 * Env: GCHAT_WEBHOOK_URL (the space's incoming webhook), GCHAT_MENTIONS (only used when a test FAILED),
 *      EXPECTED_GROUPS (comma list, e.g. "basic,quickq"), REPORT_URL (HTML report artifact), RUN_URL.
 * Never throws; a failed post is logged and does not fail the job.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const MAX_LIST = 8;

/** results: [{ group, status, durationMinutes, checks: [{ name, status, detail, kind }], defects }] */
function summarize(results) {
    const all = results.flatMap(r => (r.checks || []).map(c => ({ ...c, group: r.group })));
    const count = s => all.filter(c => c.status === s).length;
    const status = all.some(c => c.status === 'FAIL') || results.some(r => r.status === 'FAIL') ? 'FAIL'
        : all.some(c => c.status === 'WARN') || results.some(r => r.status === 'WARN') ? 'WARN' : 'PASS';
    return { status, total: all.length, pass: count('PASS'), warn: count('WARN'), fail: count('FAIL'), skip: count('SKIP'), all };
}

/** Which expected groups have no result yet? A non-empty list means the job failed before the tests finished. */
function missingGroups(expected, found) {
    return expected.filter(g => !found.includes(g));
}

const clip = (s, n) => { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const ICON = { PASS: '✅', WARN: '⚠️', FAIL: '❌' };

/** Google Chat text (*bold*, ```code```). Report only: status, per-group line, what failed, links. */
function buildMessage(results, { reportUrl, runUrl, mentions } = {}) {
    const s = summarize(results);
    const lines = [];
    const tag = s.status === 'FAIL' && mentions ? `${mentions} ` : '';
    lines.push(`${tag}${ICON[s.status]} *Hercules monitor: ${s.status}* — ${s.total} checks: ${s.pass} passed, ${s.warn} warning(s), ${s.fail} failed${s.skip ? `, ${s.skip} skipped` : ''}`);
    for (const r of results) {
        const cs = r.checks || [];
        const n = st => cs.filter(c => c.status === st).length;
        lines.push(`• [${r.group}] ${ICON[r.status] || ''} ${r.status} — ${cs.length} checks (${n('PASS')} pass, ${n('WARN')} warn, ${n('FAIL')} fail${n('SKIP') ? `, ${n('SKIP')} skip` : ''}) in ${r.durationMinutes ?? '-'} min`);
    }
    const defects = s.all.filter(c => c.status === 'FAIL' && c.kind === 'defect');
    const testFails = s.all.filter(c => c.status === 'FAIL' && c.kind !== 'defect');
    const warns = s.all.filter(c => c.status === 'WARN');
    const list = (title, items, icon) => {
        if (!items.length) return;
        lines.push('', `*${title} (${items.length})*`);
        items.slice(0, MAX_LIST).forEach(c => lines.push(`${icon} [${c.group}] ${c.name}: ${clip(c.detail, 140)}`));
        if (items.length > MAX_LIST) lines.push(`…and ${items.length - MAX_LIST} more in the report`);
    };
    list('Product defects', defects, '🐞');
    list('Test or script failures', testFails, '⚙️');
    list('Warnings', warns, '⚠️');
    lines.push('');
    if (reportUrl) lines.push(`HTML report (open the artifact, GitHub sign-in needed): ${reportUrl}`);
    if (runUrl) lines.push(`Run: ${runUrl}`);
    return lines.join('\n').slice(0, 4000);
}

async function post(text) {
    const url = process.env.GCHAT_WEBHOOK_URL;
    if (!url) return { ok: false, error: 'GCHAT_WEBHOOK_URL not set' };
    try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify({ text }) });
        return { ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status} ${(await res.text()).slice(0, 200)}` };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

async function main() {
    const runDir = path.resolve(process.argv[2] || 'reports/monitor/run');
    const expected = (process.env.EXPECTED_GROUPS || '').split(',').map(s => s.trim()).filter(Boolean);
    const found = fs.existsSync(runDir)
        ? fs.readdirSync(runDir, { withFileTypes: true }).filter(d => d.isDirectory() && fs.existsSync(path.join(runDir, d.name, 'result.json'))).map(d => d.name)
        : [];
    const missing = missingGroups(expected, found);
    if (!found.length || missing.length) {
        console.log(`No message sent: no test result for ${missing.length ? missing.join(', ') : 'any group'}. The job failed before its tests finished, which is not reported to the space.`);
        return;
    }
    const results = found.sort().map(g => ({ group: g, ...JSON.parse(fs.readFileSync(path.join(runDir, g, 'result.json'), 'utf8')) }));
    const mentions = (process.env.GCHAT_MENTIONS || '').split(',').map(s => s.trim()).filter(Boolean).map(m => `<users/${m}>`).join(' ');
    const text = buildMessage(results, { reportUrl: process.env.REPORT_URL, runUrl: process.env.RUN_URL, mentions });
    console.log(text);
    const sent = await post(text);
    console.log(sent.ok ? 'Posted the report to Google Chat.' : `Could not post to Google Chat: ${sent.error}`);
}

module.exports = { summarize, missingGroups, buildMessage };

if (require.main === module) main().catch(e => console.log(`report post failed: ${e.message}`));
