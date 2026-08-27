const { chromium } = require('@playwright/test');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { setupMailosaurAccount } = require('../tests/utils/MailosaurSetup');
const herculesConfig = require('../config/hercules.config');
const ScopeGuard = require('../utils/security/ScopeGuard');

const TARGET_URL = process.env.TARGET_URL || herculesConfig.baseUrl || 'https://dev.hercules.works';

async function fetchUrl(urlStr) {
  const parsed = new URL(urlStr);
  const client = parsed.protocol === 'https:' ? https : http;
  return new Promise((resolve) => {
    client.get(urlStr, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ statusCode: res.statusCode, body, headers: res.headers }));
    }).on('error', () => resolve({ statusCode: 0, body: '' }));
  });
}

async function discoverAllApis() {
  ScopeGuard.validateScope(TARGET_URL);

  console.log('\n======================================================');
  console.log('🔍 HERCULES FULL API DISCOVERY & MAPPING ENGINE');
  console.log(`🎯 Target: ${TARGET_URL}`);
  console.log('======================================================\n');

  const apiCatalog = new Map(); // key: path, val: { methods: Set, sources: Set, exampleUrl: string }

  function registerApi(endpoint, method = 'UNKNOWN', source = 'Static Bundle') {
    if (!endpoint || typeof endpoint !== 'string') return;
    let clean = endpoint.trim().split('?')[0].split('#')[0];
    if (!clean.startsWith('/api/') && !clean.startsWith('/v1/') && !clean.startsWith('/v2/') && !clean.startsWith('/auth/')) return;
    if (clean.includes('.js') || clean.includes('.png') || clean.includes('.svg') || clean.includes('.css')) return;

    if (!apiCatalog.has(clean)) {
      apiCatalog.set(clean, {
        methods: new Set([method]),
        sources: new Set([source]),
      });
    } else {
      const entry = apiCatalog.get(clean);
      if (method !== 'UNKNOWN') entry.methods.add(method);
      entry.sources.add(source);
    }
  }

  // ---------------------------------------------------------
  // 1. STATIC DISCOVERY: Next.js Production Bundles
  // ---------------------------------------------------------
  console.log('▶ [PHASE 1] Scanning Next.js Client JavaScript Bundles...');
  const homeRes = await fetchUrl(TARGET_URL);
  const scriptRegex = /<script[^>]+src=["']([^"']+)["']/gi;
  const bundleUrls = [];
  let match;
  while ((match = scriptRegex.exec(homeRes.body)) !== null) {
    let src = match[1];
    if (src.startsWith('/')) src = `${TARGET_URL}${src}`;
    if (src.includes('/_next/static/chunks/')) bundleUrls.push(src);
  }

  console.log(`  Found ${bundleUrls.length} production Next.js JavaScript chunks. Analyzing route strings...`);
  const apiPatternRegex = /["'`](\/(?:api|v1|v2|auth)\/[a-zA-Z0-9_\-\/]+)["'`]/g;

  for (const bUrl of bundleUrls) {
    const res = await fetchUrl(bUrl);
    if (res.statusCode === 200) {
      let apiMatch;
      while ((apiMatch = apiPatternRegex.exec(res.body)) !== null) {
        registerApi(apiMatch[1], 'DETECTED', 'Next.js Frontend Bundle');
      }
    }
  }
  console.log(`  ✅ Extracted ${apiCatalog.size} unique API endpoints from client bundles.`);

  // ---------------------------------------------------------
  // 2. DYNAMIC DISCOVERY: Authenticated Session with Mailosaur
  // ---------------------------------------------------------
  console.log('\n▶ [PHASE 2] Launching Authenticated Session via Mailosaur to Record Live APIs...');
  const browser = await chromium.launch({ headless: false });

  try {
    const { page, herculesContext } = await setupMailosaurAccount(browser);
    console.log('  ✅ Successfully authenticated with Mailosaur temporary email.');

    // Attach Network Interceptor
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/api/') || url.includes('/v1/') || url.includes('/auth/')) {
        try {
          const parsed = new URL(url);
          registerApi(parsed.pathname, req.method(), 'Live Intercepted Network Traffic');
        } catch (e) {}
      }
    });

    // Navigate key platform sections to trigger backend APIs
    console.log('  [Action] Exploring /ai workspace...');
    await page.goto(`${TARGET_URL}/ai`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(3000);

    console.log('  [Action] Exploring /campaign-history...');
    await page.goto(`${TARGET_URL}/campaign-history`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(3000);

    console.log('  [Action] Exploring /pricing...');
    await page.goto(`${TARGET_URL}/pricing`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(3000);

    console.log('  [Action] Exploring /settings...');
    await page.goto(`${TARGET_URL}/settings`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(3000);

    await herculesContext.close();
  } catch (err) {
    console.warn(`  ⚠️ Live exploration warning: ${err.message}`);
  } finally {
    await browser.close();
  }

  // ---------------------------------------------------------
  // 3. GENERATE API CATALOG & EXPORT
  // ---------------------------------------------------------
  console.log('\n======================================================');
  console.log(`🎉 API DISCOVERY COMPLETE: FOUND ${apiCatalog.size} ENDPOINTS`);
  console.log('======================================================\n');

  const sortedApis = Array.from(apiCatalog.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  let mdOutput = `# 📡 Hercules B2B Platform — Comprehensive API Catalog\n\n`;
  mdOutput += `> **Target Host**: \`${TARGET_URL}\`  \n`;
  mdOutput += `> **Generated On**: ${new Date().toISOString()}  \n`;
  mdOutput += `> **Total Discovered APIs**: \`${apiCatalog.size}\`  \n\n`;
  mdOutput += `| # | HTTP Method(s) | API Route / Endpoint | Discovery Source | Category |\n`;
  mdOutput += `| :--- | :--- | :--- | :--- | :--- |\n`;

  sortedApis.forEach(([endpoint, data], idx) => {
    const methods = Array.from(data.methods).filter(m => m !== 'UNKNOWN').join(', ') || 'GET/POST';
    const sources = Array.from(data.sources).join(' + ');

    let category = 'Core API';
    if (endpoint.includes('/auth/')) category = 'Authentication & Identity';
    else if (endpoint.includes('/ai') || endpoint.includes('/generate') || endpoint.includes('/chat')) category = 'AI & Survey Generation';
    else if (endpoint.includes('/survey') || endpoint.includes('/campaign')) category = 'Surveys & Campaigns';
    else if (endpoint.includes('/user') || endpoint.includes('/profile') || endpoint.includes('/account')) category = 'User Profile & Settings';
    else if (endpoint.includes('/billing') || endpoint.includes('/stripe') || endpoint.includes('/subscription')) category = 'Billing & Subscriptions';
    else if (endpoint.includes('/audience') || endpoint.includes('/demographic')) category = 'Audience & Targeting';

    mdOutput += `| ${idx + 1} | \`${methods}\` | \`${endpoint}\` | ${sources} | **${category}** |\n`;
    console.log(`${idx + 1}. [${methods}] ${endpoint} (${category})`);
  });

  const catalogPath = path.join(process.cwd(), 'HERCULES_API_CATALOG.md');
  fs.writeFileSync(catalogPath, mdOutput, 'utf-8');
  console.log(`\n📄 Complete API Catalog exported to: ${catalogPath}\n`);

  return sortedApis;
}

discoverAllApis().catch((err) => {
  console.error('Fatal API Discovery error:', err);
  process.exit(1);
});
