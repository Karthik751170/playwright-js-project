/**
 * Highlighted evidence screenshots for the feature-wise monitor report.
 *
 * Every check gets a viewport screenshot (JPEG) with:
 *   - the element the check is about outlined (green PASS / orange WARN / red FAIL). That is the
 *     locator passed as `el`, otherwise the last element the test clicked or typed into;
 *   - a banner at the top: check name, status, expected and actual result.
 * The overlay is removed right after the screenshot and never takes pointer events.
 */
const COLORS = { PASS: '#1f8a4c', WARN: '#d97706', FAIL: '#dc2626' };

/** Remembers the last element the test interacted with (window.__qaLast), in every page and frame. */
async function installTracker(page) {
    const script = () => {
        const remember = e => { const t = e.composedPath ? e.composedPath()[0] : e.target; if (t && t.nodeType === 1) window.__qaLast = t; };
        for (const type of ['pointerdown', 'focusin', 'input', 'change']) document.addEventListener(type, remember, true);
    };
    await page.context().addInitScript(script).catch(() => {});
    await page.evaluate(script).catch(() => {}); // the page that is already open
}

/**
 * Takes the highlighted screenshot. Never throws; returns the file path or null.
 * `el` may be a Playwright locator; it is used only if it is visible within 1.5 s.
 */
async function highlightShot(page, file, { el, name, status, expected, actual }) {
    if (!page || page.isClosed()) return null;
    let handle = null;
    if (el) {
        try {
            const first = el.first();
            if (await first.isVisible({ timeout: 1500 }).catch(() => false)) handle = await first.elementHandle({ timeout: 1500 });
        } catch { handle = null; }
    }
    const color = COLORS[status] || '#2563eb';
    const text = { name, status, expected: String(expected || '').slice(0, 220), actual: String(actual || '').slice(0, 220) };
    try {
        await page.evaluate(({ target, color, text }) => {
            const el = target || (window.__qaLast && window.__qaLast.isConnected ? window.__qaLast : null);
            const root = document.createElement('div');
            root.id = '__qa_overlay';
            root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;font:13px/1.35 system-ui,sans-serif';
            const banner = document.createElement('div');
            banner.style.cssText = `position:absolute;left:8px;right:8px;top:8px;background:rgba(17,24,39,.92);color:#fff;border-left:6px solid ${color};border-radius:6px;padding:7px 10px;max-height:110px;overflow:hidden`;
            const line = (label, value, bold) => { const d = document.createElement('div'); d.textContent = `${label}${value}`; if (bold) d.style.fontWeight = '700'; return d; };
            banner.append(line(`${text.status} · `, text.name, true), line('Expected: ', text.expected), line('Actual: ', text.actual));
            root.append(banner);
            if (el && el.getBoundingClientRect) {
                el.scrollIntoView({ block: 'center', inline: 'nearest' });
                const r = el.getBoundingClientRect();
                if (r.width && r.height) {
                    const box = document.createElement('div');
                    box.style.cssText = `position:absolute;left:${r.left - 4}px;top:${r.top - 4}px;width:${r.width + 8}px;height:${r.height + 8}px;border:3px solid ${color};border-radius:6px;box-shadow:0 0 0 4px ${color}40`;
                    root.append(box);
                }
            }
            document.documentElement.append(root);
        }, { target: handle, color, text });
        await page.screenshot({ path: file, type: 'jpeg', quality: 62, timeout: 15_000 });
        return file;
    } catch {
        return null;
    } finally {
        await page.evaluate(() => document.getElementById('__qa_overlay')?.remove()).catch(() => {});
        await handle?.dispose().catch(() => {});
    }
}

module.exports = { installTracker, highlightShot };
