#!/usr/bin/env node
/**
 * Hourly headless Hercules survey monitor runner (scheduled by .github/workflows/hourly-survey-monitor.yml).
 *
 * Runs tests/monitor/HourlySurveyMonitor.spec.js headless, reads its result.json and sends an
 * alert (utils/MonitorAlert.js) when any check FAILs, the run crashes, or no result is produced.
 * WARN-only runs do not alert unless ALERT_ON_WARN=1. A lock file stops overlapping runs.
 *
 *   node scripts/hourlySurveyMonitor.js            # one run now
 *   MONITOR_TEST_ALERT=1 node scripts/hourlySurveyMonitor.js   # only send a test alert
 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);
require('dotenv').config();
const { sendAlert } = require('../utils/MonitorAlert');

const REPORT_ROOT = path.join(ROOT, 'reports', 'monitor');
const LOCK = path.join(REPORT_ROOT, '.lock');
const LOG = path.join(REPORT_ROOT, 'monitor.log');
fs.mkdirSync(REPORT_ROOT, { recursive: true });
const log = msg => {
    const line = `${new Date().toISOString()} ${msg}`;
    console.log(line);
    fs.appendFileSync(LOG, line + '\n');
};

(async () => {
    if (process.env.MONITOR_TEST_ALERT) {
        const r = await sendAlert({ title: 'Hercules monitor: test alert', summary: 'This is a test alert from the hourly survey monitor.', details: 'No action needed.' });
        log(`test alert → ${JSON.stringify(r)}`);
        return;
    }

    // Skip if the previous run is still going (stale after 50 min).
    if (fs.existsSync(LOCK) && Date.now() - fs.statSync(LOCK).mtimeMs < 50 * 60_000) {
        log('previous run still in progress — skipping this hour');
        return;
    }
    fs.writeFileSync(LOCK, String(process.pid));

    const outDir = path.join(REPORT_ROOT, new Date().toISOString().replace(/[:.]/g, '-'));
    try {
        log(`run start → ${outDir}`);
        const run = spawnSync('npx', ['playwright', 'test', '-c', 'playwright.monitor.config.js'], {
            cwd: ROOT, env: { ...process.env, MONITOR_OUT_DIR: outDir }, encoding: 'utf8', timeout: 45 * 60_000, maxBuffer: 50 * 1024 * 1024,
        });
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, 'playwright.log'), `${run.stdout || ''}\n${run.stderr || ''}`);

        const resultFile = path.join(outDir, 'result.json');
        const result = fs.existsSync(resultFile) ? JSON.parse(fs.readFileSync(resultFile, 'utf8')) : null;
        const status = result?.status || 'FAIL';
        if (result) fs.copyFileSync(resultFile, path.join(REPORT_ROOT, 'latest.json'));
        log(`run end → ${status} (exit ${run.status}${run.error ? `, ${run.error.message}` : ''})`);

        // In GitHub Actions a FAIL also fails the job, so GitHub's own failure email/notification fires.
        if (status === 'FAIL') process.exitCode = 1;
        const shouldAlert = status === 'FAIL' || (status === 'WARN' && process.env.ALERT_ON_WARN === '1');
        if (!shouldAlert) return;

        const bad = (result?.checks || []).filter(c => c.status !== 'PASS');
        const summary = result
            ? bad.map(c => `${c.status} ${c.name}: ${c.detail || ''}`).join('\n')
            : `Monitor produced no result (exit ${run.status}). ${(run.stderr || run.error?.message || '').slice(-400)}`;
        const details = [
            `Status: ${status}`,
            `Started: ${result?.startedAt || '-'}  Duration: ${result?.durationMinutes ?? '-'} min`,
            `Chat: ${result?.facts?.chatUrl || '-'}`,
            `Survey: ${result?.facts?.surveyUrl || '-'}`,
            `Report folder: ${outDir}`,
            '',
            'All checks:',
            ...(result?.checks || []).map(c => `  ${c.status.padEnd(4)} ${c.name} — ${c.detail || ''}`),
        ].join('\n');
        const sent = await sendAlert({ title: `Hercules survey monitor: ${status}`, summary, details });
        log(`alert → ${sent.map(s => `${s.channel}:${s.ok ? 'ok' : s.error}`).join(', ')}`);
    } catch (e) {
        log(`runner error: ${e.stack}`);
        await sendAlert({ title: 'Hercules survey monitor: runner error', summary: e.message, details: e.stack || '' });
    } finally {
        fs.rmSync(LOCK, { force: true });
    }
})();
