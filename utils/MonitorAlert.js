/**
 * MonitorAlert.js — sends a monitor alert to every channel that is configured:
 *   - Email via the Gmail API (users.messages.send) from your own Gmail / Google Workspace account:
 *       GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN  (get the token once with
 *       `node scripts/gmailAuthorize.js`), recipient ALERT_EMAIL_TO (defaults to the sender).
 *   - Slack incoming webhook: SLACK_WEBHOOK_URL
 *   - macOS notification (local runs on a Mac)
 * Set ALERT_EMAIL=off to disable email. Returns [{ channel, ok, error? }]. Never throws.
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

async function gmailAccessToken() {
    const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env;
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: GMAIL_CLIENT_ID, client_secret: GMAIL_CLIENT_SECRET,
            refresh_token: GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token',
        }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`token refresh HTTP ${res.status}: ${json.error} ${json.error_description || ''}`.trim());
    return json.access_token;
}

async function gmailApiEmail(subject, text) {
    const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, ALERT_EMAIL_TO, ALERT_EMAIL } = process.env;
    if (ALERT_EMAIL === 'off' || !GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
        return { channel: 'gmail-api', ok: false, error: 'not configured' };
    }
    try {
        const token = await gmailAccessToken();
        const auth = { Authorization: `Bearer ${token}` };
        // "me" sends from the authorised account; default recipient is that same account.
        const to = ALERT_EMAIL_TO || (await (await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: auth })).json()).emailAddress;
        const mime = [
            `To: ${to}`,
            `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            Buffer.from(text).toString('base64'),
        ].join('\r\n');
        const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: { ...auth, 'Content-Type': 'application/json' },
            body: JSON.stringify({ raw: Buffer.from(mime).toString('base64url') }),
        });
        return { channel: 'gmail-api', ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status} ${(await res.text()).slice(0, 200)}` };
    } catch (e) {
        return { channel: 'gmail-api', ok: false, error: e.message };
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
        gmailApiEmail(title, `${summary}\n\n${details}`),
        slack(`*${title}*\n${summary}\n\`\`\`${details.slice(0, 3500)}\`\`\``),
    ]);
}

module.exports = { sendAlert };
