/**
 * MonitorAlert.js — sends a monitor alert to every channel that is configured:
 *   - macOS notification (always, on darwin)
 *   - Email via Gmail SMTP: GMAIL_USER + GMAIL_PASS (an app password); recipient ALERT_EMAIL_TO
 *     (defaults to GMAIL_USER). Set ALERT_EMAIL=off to disable.
 *   - Slack incoming webhook: SLACK_WEBHOOK_URL
 * Returns [{ channel, ok, error? }]. Never throws.
 */
const { execFile } = require('child_process');

function macNotify(title, body) {
    return new Promise(resolve => {
        if (process.platform !== 'darwin') return resolve({ channel: 'macos', ok: false, error: 'not macOS' });
        const esc = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').slice(0, 240);
        execFile('osascript', ['-e', `display notification "${esc(body)}" with title "${esc(title)}" sound name "Basso"`],
            err => resolve({ channel: 'macos', ok: !err, error: err?.message }));
    });
}

async function email(subject, text) {
    const { GMAIL_USER, GMAIL_PASS, ALERT_EMAIL_TO, ALERT_EMAIL } = process.env;
    if (ALERT_EMAIL === 'off' || !GMAIL_USER || !GMAIL_PASS) return { channel: 'email', ok: false, error: 'not configured' };
    try {
        const nodemailer = require('nodemailer');
        const t = nodemailer.createTransport({ service: 'gmail', auth: { user: GMAIL_USER, pass: GMAIL_PASS } });
        await t.sendMail({ from: GMAIL_USER, to: ALERT_EMAIL_TO || GMAIL_USER, subject, text });
        return { channel: 'email', ok: true };
    } catch (e) {
        return { channel: 'email', ok: false, error: e.message };
    }
}

async function slack(text) {
    const url = process.env.SLACK_WEBHOOK_URL;
    if (!url) return { channel: 'slack', ok: false, error: 'not configured' };
    try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
        return { channel: 'slack', ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
    } catch (e) {
        return { channel: 'slack', ok: false, error: e.message };
    }
}

async function sendAlert({ title, summary, details }) {
    return Promise.all([
        macNotify(title, summary),
        email(title, `${summary}\n\n${details}`),
        slack(`*${title}*\n${summary}\n\`\`\`${details.slice(0, 3500)}\`\`\``),
    ]);
}

module.exports = { sendAlert };
