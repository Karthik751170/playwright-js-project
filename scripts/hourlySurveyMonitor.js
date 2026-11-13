#!/usr/bin/env node
/**
 * Hourly headless Hercules monitor runner (scheduled by .github/workflows/hourly-survey-monitor.yml).
 *
 * Runs one monitor group, or all of them in parallel, headless:
 *   auth   tests/monitor/AuthAccess.spec.js            sign-up form (never submitted), wrong password, login
 *   basic  tests/monitor/HourlySurveyMonitor.spec.js      login → prompt → brief → create survey → checks
 *   core   tests/monitor/CoreSurveyAudience.spec.js     create, Edit Audience, versions, wallet
 *   logic  tests/monitor/LogicPromptingPreview.spec.js  logic prompting, all logic types, preview
 *   manage tests/monitor/ShareAndManage.spec.js         share links, rename/duplicate/delete
 *   quickq tests/monitor/QuickQuestion.spec.js          Quick Question: validation, wording checks, step 2, rename/duplicate/delete
 * reads each group's result.json and posts ONE alert (utils/MonitorAlert.js) when any check FAILs,
 * a group crashes or produces no result. Product DEFECTS are listed before test failures.
 *
 *   MONITOR_GROUP=core node scripts/hourlySurveyMonitor.js   # one group (GitHub matrix job)
 *   node scripts/hourlySurveyMonitor.js                       # all groups in parallel
 *   MONITOR_TEST_ALERT=1 node scripts/hourlySurveyMonitor.js  # only send a test alert
 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);
require('dotenv').config({ quiet: true });
const { sendAlert } = require('../utils/MonitorAlert');

const GROUPS = {
    auth: 'tests/monitor/AuthAccess.spec.js',
    basic: 'tests/monitor/HourlySurveyMonitor.spec.js',
    core: 'tests/monitor/CoreSurveyAudience.spec.js',
    logic: 'tests/monitor/LogicPromptingPreview.spec.js',
    manage: 'tests/monitor/ShareAndManage.spec.js',
    quickq: 'tests/monitor/QuickQuestion.spec.js',
};
const selected = (process.env.MONITOR_GROUP || 'all') === 'all' ? Object.keys(GROUPS) : process.env.MONITOR_GROUP.split(',');
const REPORT_ROOT = path.join(ROOT, 'reports', 'monitor');
const LOCK = path.join(REPORT_ROOT, `.lock-${selected.join('-')}`);
const LOG = path.join(REPORT_ROOT, 'monitor.log');
fs.mkdirSync(REPORT_ROOT, { recursive: true });
const log = msg => { const line = `${new Date().toISOString()} ${msg}`; console.log(line); fs.appendFileSync(LOG, line + '\n'); };

(async () => {
    if (process.env.MONITOR_TEST_ALERT) {
        const r = await sendAlert({ title: 'Hercules monitor: test alert', summary: 'This is a test alert from the hourly survey monitor.', details: 'No action needed.' });
        log(`test alert → ${JSON.stringify(r)}`);
        return;
    }
    if (fs.existsSync(LOCK) && Date.now() - fs.statSync(LOCK).mtimeMs < 75 * 60_000) { log(`previous ${selected.join(',')} run still in progress — skipping`); return; }
    fs.writeFileSync(LOCK, String(process.pid));

    const outDir = path.join(REPORT_ROOT, new Date().toISOString().replace(/[:.]/g, '-'));
    fs.mkdirSync(outDir, { recursive: true });
    try {
        log(`run start [${selected.join(', ')}] → ${outDir}`);
        const run = spawnSync('npx', ['playwright', 'test', '-c', 'playwright.monitor.config.js', `--workers=${selected.length}`, ...selected.map(g => GROUPS[g])], {
            cwd: ROOT, env: { ...process.env, MONITOR_OUT_DIR: outDir }, encoding: 'utf8', timeout: 70 * 60_000, maxBuffer: 100 * 1024 * 1024,
        });
        fs.writeFileSync(path.join(outDir, 'playwright.log'), `${run.stdout || ''}\n${run.stderr || ''}`);

        const results = selected.map(g => {
            const f = path.join(outDir, g, 'result.json');
            return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { group: g, status: 'FAIL', checks: [{ name: 'group produced no result', status: 'FAIL', kind: 'test', detail: `exit ${run.status}` }], defects: [], facts: {} };
        });
        fs.writeFileSync(path.join(REPORT_ROOT, 'latest.json'), JSON.stringify({ outDir, results }, null, 2));
        const status = results.some(r => r.status === 'FAIL') ? 'FAIL' : results.some(r => r.status === 'WARN') ? 'WARN' : 'PASS';
        log(`run end → ${status} (${results.map(r => `${r.group}:${r.status}`).join(' ')}; exit ${run.status}${run.error ? `, ${run.error.message}` : ''})`);
        if (status === 'FAIL') process.exitCode = 1;
        if (!(status === 'FAIL' || (status === 'WARN' && process.env.ALERT_ON_WARN === '1'))) return;

        const defects = results.flatMap(r => (r.defects || []).map(c => `🐞 [${r.group}] ${c.name}: ${c.detail}`));
        const testFails = results.flatMap(r => r.checks.filter(c => c.status === 'FAIL' && c.kind !== 'defect').map(c => `⚙️ [${r.group}] ${c.name}: ${c.detail}`));
        const warns = results.flatMap(r => r.checks.filter(c => c.status === 'WARN').map(c => `⚠️ [${r.group}] ${c.name}: ${c.detail}`));
        const summary = [
            defects.length ? `DEFECTS (${defects.length}):\n${defects.join('\n')}` : 'No product defects.',
            testFails.length ? `\nTest/script failures (${testFails.length}):\n${testFails.join('\n')}` : '',
        ].join('\n');
        const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : outDir;
        const details = [
            `Run: ${runUrl}`,
            ...results.map(r => `[${r.group}] ${r.status} in ${r.durationMinutes ?? '-'} min — chat ${r.facts?.chatUrl || '-'}${r.facts?.keptForDebugging ? ' (kept for debugging)' : ''}`),
            warns.length ? `\nWarnings:\n${warns.join('\n')}` : '',
        ].join('\n');
        const sent = await sendAlert({ title: `Hercules monitor: ${status}${defects.length ? ` — ${defects.length} defect(s)` : ''}`, summary, details });
        log(`alert → ${sent.map(s => `${s.channel}:${s.ok ? 'ok' : s.error}`).join(', ')}`);
    } catch (e) {
        log(`runner error: ${e.stack}`);
        await sendAlert({ title: 'Hercules monitor: runner error', summary: e.message, details: e.stack || '' });
        process.exitCode = 1;
    } finally {
        fs.rmSync(LOCK, { force: true });
    }
})();
