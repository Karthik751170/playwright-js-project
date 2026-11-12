/**
 * Every automated visit to Hercules starts on the tagged home page, so Hercules can tell test
 * traffic (GitHub runners show up as US IPs) from real users:
 *
 *   https://<host>/?automation_test=1&test_agent=claude
 *
 * TEST_AGENT overrides the agent name (e.g. TEST_AGENT=chatgpt).
 */
const TAG = () => ({ automation_test: '1', test_agent: process.env.TEST_AGENT || 'claude' });

/** Adds the automation tag to any URL. */
function tagUrl(url) {
    const u = new URL(url);
    for (const [k, v] of Object.entries(TAG())) u.searchParams.set(k, v);
    return u.href;
}

/** Tagged home page of the site `baseUrl` belongs to. */
function landingUrl(baseUrl) {
    return tagUrl(new URL('/', baseUrl).href);
}

/** Opens the tagged home page. Call it before a test's first Hercules navigation. */
async function landOnHercules(page, baseUrl, opts = {}) {
    await page.goto(landingUrl(baseUrl), { waitUntil: 'domcontentloaded', ...opts });
}

module.exports = { tagUrl, landingUrl, landOnHercules };
