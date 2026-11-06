/**
 * MailosaurApi.js
 * Minimal Mailosaur REST client (no SDK dependency) for fetching the emails a
 * test triggers. Uses the documented search + retrieve endpoints and polls
 * until a matching message arrives.
 *
 * Required env: MAILOSAUR_API_KEY, MAILOSAUR_SERVER_ID
 */
const BASE_URL = 'https://mailosaur.com/api';

class MailosaurApi {
  constructor(apiKey = process.env.MAILOSAUR_API_KEY, serverId = process.env.MAILOSAUR_SERVER_ID) {
    if (!apiKey || !serverId) {
      throw new Error('[MailosaurApi] MAILOSAUR_API_KEY and MAILOSAUR_SERVER_ID must both be set.');
    }
    this.serverId = serverId;
    // Mailosaur uses HTTP Basic auth with the API key as the username and an empty password.
    this.authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;
  }

  static isConfigured() {
    return Boolean(process.env.MAILOSAUR_API_KEY && process.env.MAILOSAUR_SERVER_ID);
  }

  /** A fresh, unique address on this server's domain. */
  static newAddress(prefix = 'test', serverId = process.env.MAILOSAUR_SERVER_ID) {
    const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    return `${prefix}_${unique}@${serverId}.mailosaur.net`;
  }

  async request(method, path, body) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { Authorization: this.authHeader, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`[MailosaurApi] ${method} ${path} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json();
  }

  /**
   * Polls until a message sent to `sentTo` arrives after `receivedAfter`, then
   * returns the full message (subject, from, html.links, html.codes, text...).
   */
  async waitForMessage(sentTo, { receivedAfter = new Date(Date.now() - 60_000), timeoutMs = 180_000, intervalMs = 5_000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    const query = new URLSearchParams({
      server: this.serverId,
      page: '0',
      itemsPerPage: '10',
      receivedAfter: receivedAfter.toISOString(),
    });

    while (Date.now() < deadline) {
      const { items = [] } = await this.request('POST', `/messages/search?${query}`, { sentTo });
      if (items.length > 0) {
        return this.request('GET', `/messages/${items[0].id}`);
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(`[MailosaurApi] No email to ${sentTo} within ${Math.round(timeoutMs / 1000)}s.`);
  }

  /** Picks the verification link (or code) out of a retrieved message. */
  static extractVerification(message) {
    const links = [...(message.html?.links || []), ...(message.text?.links || [])].filter((l) => l.href);
    const link =
      links.find((l) => /verif|confirm|activate/i.test(`${l.text || ''} ${l.href}`)) ||
      links.find((l) => /hercules\.works/i.test(l.href) && !/unsubscribe|privacy|terms/i.test(l.href));
    const code = message.html?.codes?.[0]?.value || message.text?.codes?.[0]?.value || null;
    return { link: link?.href || null, code };
  }
}

module.exports = MailosaurApi;
