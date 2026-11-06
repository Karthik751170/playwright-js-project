#!/usr/bin/env node
/**
 * One-time: authorise the monitor to send alert emails from your Gmail account via the Gmail API.
 *
 * Prerequisites (Google Cloud console, once):
 *   1. Enable the Gmail API for a project.
 *   2. OAuth consent screen (Internal for a Workspace domain, or External + add yourself as a test user).
 *   3. Credentials → Create OAuth client ID → type "Desktop app".
 *   4. Put GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env.
 *
 * Then run:  node scripts/gmailAuthorize.js
 * It opens Google's consent page (scope: gmail.send only), catches the redirect on 127.0.0.1 and
 * writes GMAIL_REFRESH_TOKEN into .env. The token is never printed.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { execFile } = require('child_process');

const ENV = path.resolve(__dirname, '..', '.env');
require('dotenv').config({ path: ENV, quiet: true });
const { GMAIL_CLIENT_ID: clientId, GMAIL_CLIENT_SECRET: clientSecret } = process.env;
if (!clientId || !clientSecret) {
    console.error('Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env first (Desktop-app OAuth client).');
    process.exit(1);
}

const PORT = 53682;
const redirectUri = `http://127.0.0.1:${PORT}/`;
const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.send', access_type: 'offline', prompt: 'consent',
});

const server = http.createServer(async (req, res) => {
    const code = new URL(req.url, redirectUri).searchParams.get('code');
    if (!code) { res.end('Waiting for Google...'); return; }
    try {
        const r = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
        });
        const json = await r.json();
        if (!json.refresh_token) throw new Error(`${json.error || 'no refresh_token'} ${json.error_description || ''}`);
        let env = fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8') : '';
        env = env.replace(/^GMAIL_REFRESH_TOKEN=.*\n?/m, '');
        fs.writeFileSync(ENV, `${env.replace(/\n?$/, '\n')}GMAIL_REFRESH_TOKEN=${json.refresh_token}\n`, { mode: 0o600 });
        res.end('Done. Gmail alerts authorised; you can close this tab.');
        console.log('Saved GMAIL_REFRESH_TOKEN to .env');
    } catch (e) {
        res.end(`Failed: ${e.message}`);
        console.error('Failed:', e.message);
        process.exitCode = 1;
    }
    server.close();
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`Opening Google consent page (gmail.send only). If it doesn't open, visit:\n${authUrl}`);
    if (process.platform === 'darwin') execFile('open', [authUrl]);
});
