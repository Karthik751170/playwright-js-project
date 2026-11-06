/**
 * MonitorAlert.js — posts a monitor alert to:
 *   - Google Chat: incoming webhook of a Chat space, GCHAT_WEBHOOK_URL
 *     (Space → Apps & integrations → Webhooks → Add webhook)
 *   - macOS notification (local runs on a Mac)
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

async function googleChat(text) {
    const url = process.env.GCHAT_WEBHOOK_URL;
    if (!url) return { channel: 'google-chat', ok: false, error: 'not configured' };
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body: JSON.stringify({ text: text.slice(0, 4000) }),
        });
        return { channel: 'google-chat', ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status} ${(await res.text()).slice(0, 200)}` };
    } catch (e) {
        return { channel: 'google-chat', ok: false, error: e.message };
    }
}

async function sendAlert({ title, summary, details }) {
    // Google Chat text formatting: *bold*, ```code```.
    return Promise.all([
        macNotify(title, summary),
        googleChat(`*${title}*\n${summary}\n\`\`\`${details}\`\`\``),
    ]);
}

module.exports = { sendAlert };
