const https = require('https');
const http = require('http');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const herculesConfig = require('../config/hercules.config');
const ScopeGuard = require('../utils/security/ScopeGuard');
const SecurityReporter = require('../utils/security/SecurityReporter');
const FindingsBaseline = require('../utils/security/FindingsBaseline');
const HERCULES_ENDPOINTS = require('../config/herculesEndpoints');
const TARGETS = require('../config/securityTargets');
const { resolveUrl, originLabel } = TARGETS;

const TARGET_URL = process.env.TARGET_URL || herculesConfig.baseUrl || 'https://dev.hercules.works';

/**
 * Universal HTTP/HTTPS request helper with deep latency & trace capture
 */
async function requestUrl(urlStr, options = {}) {
  const parsed = new URL(urlStr);
  const client = parsed.protocol === 'https:' ? https : http;
  const startTime = Date.now();

  return new Promise((resolve) => {
    const reqHeaders = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) HerculesAppSecDAST/4.0',
      ...(options.headers || {}),
    };

    const req = client.request(
      urlStr,
      {
        method: options.method || 'GET',
        headers: reqHeaders,
        timeout: 12000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            statusMessage: res.statusMessage,
            headers: res.headers,
            body,
            url: urlStr,
            method: options.method || 'GET',
            reqHeaders,
            latencyMs: Date.now() - startTime,
          });
        });
      }
    );

    req.on('error', (err) => {
      resolve({
        statusCode: 0,
        statusMessage: 'Connection Error',
        error: err.message,
        headers: {},
        body: '',
        url: urlStr,
        method: options.method || 'GET',
        reqHeaders,
        latencyMs: Date.now() - startTime,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        statusCode: 0,
        statusMessage: 'Timeout',
        error: 'Request timed out after 12000ms',
        headers: {},
        body: '',
        url: urlStr,
        method: options.method || 'GET',
        reqHeaders,
        latencyMs: Date.now() - startTime,
      });
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

/**
 * TLS / SSL Certificate & Protocol Deep Inspection
 */
async function inspectTlsCertificate(hostname) {
  return new Promise((resolve) => {
    const socket = tls.connect(443, hostname, { servername: hostname }, () => {
      const cert = socket.getPeerCertificate(true);
      const protocol = socket.getProtocol();
      const cipher = socket.getCipher();
      socket.end();

      if (!cert || !cert.valid_to) {
        resolve({ valid: false, error: 'Unable to retrieve peer certificate' });
        return;
      }

      const validTo = new Date(cert.valid_to);
      const daysRemaining = Math.floor((validTo - new Date()) / (1000 * 60 * 60 * 24));

      resolve({
        valid: true,
        protocol,
        cipherName: cipher ? cipher.name : 'Unknown',
        issuer: cert.issuer ? cert.issuer.O || cert.issuer.CN : 'Unknown',
        subject: cert.subject ? cert.subject.CN : 'Unknown',
        validFrom: cert.valid_from,
        validTo: cert.valid_to,
        daysRemaining,
        san: cert.subjectaltname || '',
      });
    });

    socket.on('error', (err) => {
      resolve({ valid: false, error: err.message });
    });
    socket.setTimeout(8000, () => {
      socket.destroy();
      resolve({ valid: false, error: 'TLS handshake timed out' });
    });
  });
}

/**
 * Secret & Token Scraper in Frontend JavaScript Bundles (100% of discovered bundles)
 */
async function scanJsBundlesForLeakedSecrets(baseUrl, htmlBody) {
  const scriptSrcs = [];
  const scriptRegex = /<script[^>]+src=["']([^"']+)["']/gi;
  let match;
  while ((match = scriptRegex.exec(htmlBody)) !== null) {
    let src = match[1];
    if (src.startsWith('/')) {
      src = `${baseUrl}${src}`;
    }
    if (src.startsWith('http') && src.includes('/_next/static/chunks/')) {
      scriptSrcs.push(src);
    }
  }

  const secretPatterns = [
    { name: 'AWS Access Key ID', regex: /AKIA[0-9A-Z]{16}/g },
    { name: 'Stripe Secret/Live Key', regex: /sk_live_[0-9a-zA-Z]{24}/g },
    { name: 'GCP API Key', regex: /AIza[0-9A-Za-z-_]{35}/g },
    { name: 'GitHub Personal Token', regex: /gh[pousr]_[0-9a-zA-Z]{36}/g },
    { name: 'Firebase Server Key', regex: /AAAA[a-zA-Z0-9_-]{7}:[a-zA-Z0-9_-]{140}/g },
    { name: 'Generic Secret Token Key', regex: /(?:api_key|apikey|secret_key|private_key)\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}['"]/gi },
    { name: 'Private RSA/EC Key', regex: /-----BEGIN (?:RSA )?PRIVATE KEY-----/g },
    { name: 'Slack Webhook URL', regex: /https:\/\/hooks\.slack\.com\/services\/T[0-9a-zA-Z_]+\/B[0-9a-zA-Z_]+\/[0-9a-zA-Z_]+/g },
  ];

  const leaksFound = [];
  // Scan 100% of discovered Next.js JS bundles for complete coverage
  const allBundles = Array.from(new Set(scriptSrcs));

  for (const bundleUrl of allBundles) {
    try {
      const res = await requestUrl(bundleUrl);
      if (res.statusCode === 200) {
        for (const pattern of secretPatterns) {
          const found = res.body.match(pattern.regex);
          if (found && found.length > 0) {
            leaksFound.push({
              bundle: path.basename(bundleUrl),
              pattern: pattern.name,
              match: found[0].slice(0, 30) + '...',
            });
          }
        }
      }
    } catch (e) {
      // Ignored
    }
  }

  return {
    scannedCount: allBundles.length,
    leaksFound,
  };
}


/**
 * Loads a Cookie header for TARGET_URL from a Playwright storage state, when one
 * exists. Without it every probe below is stopped at the auth boundary and can
 * only ever report INCONCLUSIVE -- an unauthenticated scan cannot reach the
 * authorated code paths where injection and authorization bugs actually live.
 */
function loadAuthCookieHeader(targetUrl) {
  const candidates = [
    process.env.SECURITY_STORAGE_STATE,
    path.join(process.cwd(), '.auth', 'apple-user.json'),
    path.join(process.cwd(), '.auth', 'google-user.json'),
  ].filter(Boolean);

  for (const authPath of candidates) {
    try {
      if (!fs.existsSync(authPath)) continue;
      const state = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
      const host = new URL(targetUrl).hostname;
      const scoped = (state.cookies || []).filter((c) => {
        const domain = (c.domain || '').replace(/^\./, '');
        return host === domain || host.endsWith(`.${domain}`);
      });
      if (scoped.length > 0) {
        // The Hercules APIs authenticate with a bearer token; the browser keeps
        // it in the dragonAccessToken cookie. Send both so the probes work
        // whether the endpoint reads the cookie or the Authorization header.
        const accessToken = (scoped.find((c) => c.name === 'dragonAccessToken') || {}).value;
        return {
          header: scoped.map((c) => `${c.name}=${c.value}`).join('; '),
          bearer: accessToken || null,
          source: path.relative(process.cwd(), authPath),
          count: scoped.length,
        };
      }
    } catch (e) {
      console.warn(`[Auth] Could not read storage state ${authPath}: ${e.message}`);
    }
  }
  return null;
}

const AUTH = loadAuthCookieHeader(TARGET_URL);
const AUTH_HEADERS = AUTH
  ? { Cookie: AUTH.header, ...(AUTH.bearer ? { Authorization: `Bearer ${AUTH.bearer}` } : {}) }
  : {};
const HAS_AUTH = Boolean(AUTH);

/**
 * Confirms up front whether the supplied session is actually live. A stale
 * storage state produces a scan where every authenticated control is
 * INCONCLUSIVE, and that needs to be stated loudly rather than discovered by
 * reading 40 findings.
 */
async function verifySessionIsLive() {
  if (!HAS_AUTH) return { live: false, reason: 'no storage state supplied' };
  const res = await requestUrl(resolveUrl(HERCULES_ENDPOINTS.ACCOUNT.GET_DETAILS), {
    headers: { ...AUTH_HEADERS, Accept: 'application/json' },
  });
  if (res.statusCode === 200) return { live: true, reason: 'account details returned HTTP 200' };
  return { live: false, reason: `account details returned HTTP ${res.statusCode || 'no response'} - the stored session is expired or invalid` };
}

/**
 * High-confidence indicators of private data in a response body. Deliberately
 * narrow: a false FAIL destroys trust in the gate faster than a missed finding.
 */
const PRIVATE_DATA_PATTERNS = [
  { name: 'JWT / bearer token', regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/ },
  { name: 'Credential field', regex: /"(?:access_?token|refresh_?token|id_?token|password|passwd|secret|api_?key|private_?key)"\s*:\s*"[^"]+"/i },
  { name: 'Session cookie value', regex: /"(?:dragonAccessToken|dragonRefreshToken)"\s*:\s*"[^"]+"/i },
];

const PII_PATTERNS = [
  { name: 'Email address', regex: /"[^"]*(?:email|mail)[^"]*"\s*:\s*"[^"@]+@[^"]+"/i },
  { name: 'Phone number', regex: /"(?:phone|mobile|contact_?number)"\s*:\s*"\+?\d[\d\s-]{6,}"/i },
];

/**
 * @param {string} body
 * @param {boolean} includePii - only enable for structured (JSON) bodies; marketing
 *   HTML legitimately contains contact addresses and would false-positive.
 */
function findPrivateData(body, includePii = false) {
  const patterns = includePii ? [...PRIVATE_DATA_PATTERNS, ...PII_PATTERNS] : PRIVATE_DATA_PATTERNS;
  return patterns.filter((p) => p.regex.test(body || '')).map((p) => p.name);
}

function isJsonResponse(res) {
  return ((res.headers && res.headers['content-type']) || '').toLowerCase().includes('application/json');
}

function isHtmlResponse(res) {
  return ((res.headers && res.headers['content-type']) || '').toLowerCase().includes('text/html');
}

/**
 * Did the payload actually reach code that could act on it?
 *
 * This is the single most important function in this file. The previous version
 * of this suite fired injection payloads at the marketing root and reported PASS
 * when nothing happened -- but nothing could ever have happened, because no
 * backend read the parameter. Anything that did not demonstrably reach an
 * exercisable sink is UNREACHABLE and must be reported INCONCLUSIVE, never PASS.
 */
function classifyProbe(res) {
  if (!res.statusCode) return 'TRANSPORT_ERROR';
  if (res.statusCode === 401 || res.statusCode === 403) return 'UNREACHABLE_AUTH';
  if (res.statusCode === 404 || res.statusCode === 405) return 'UNREACHABLE_ROUTE';
  // An API path answering with the SPA HTML shell means no API handler ran.
  if (res.statusCode === 200 && isHtmlResponse(res)) return 'UNREACHABLE_SHELL';
  return 'EXERCISED';
}

const PROBE_STATE_LABEL = {
  TRANSPORT_ERROR: 'transport error - no response',
  UNREACHABLE_AUTH: 'blocked at auth boundary (401/403) - payload never parsed',
  UNREACHABLE_ROUTE: 'route/resource absent (404/405) - payload never parsed',
  UNREACHABLE_SHELL: 'served static SPA shell - no API handler ran',
  EXERCISED: 'reached application code - payload evaluated',
};

/**
 * Real parameterized API endpoints. Injection probes target these rather than
 * the marketing root, because these are the ones that carry an identifier into
 * a backend query.
 */
const INJECTION_TARGETS = [
  { label: 'Survey details (?surveyId)', build: (p) => `${HERCULES_ENDPOINTS.SURVEY.GET_SURVEY_DETAILS}?surveyId=${encodeURIComponent(p)}` },
  { label: 'Survey search (?query)', build: (p) => `${HERCULES_ENDPOINTS.SURVEY.SEARCH_SURVEY}?query=${encodeURIComponent(p)}` },
  { label: 'Audience template (?id)', build: (p) => `${HERCULES_ENDPOINTS.AUDIENCE.GET_USER_TEMPLATE}?id=${encodeURIComponent(p)}` },
  { label: 'Survey questions (?surveyId)', build: (p) => HERCULES_ENDPOINTS.DRAGON_QUESTIONS.GET_ALL_QUESTIONS(encodeURIComponent(p)) },
  { label: 'Survey audience (?surveyId)', build: (p) => HERCULES_ENDPOINTS.AUDIENCE.GET_SURVEY_AUDIENCE(encodeURIComponent(p)) },
  { label: 'Campaign chat (path id)', build: (p) => HERCULES_ENDPOINTS.CAMPAIGNS.GET_CHAT_BY_ID(encodeURIComponent(p)) },
  { label: 'Audience report (path surveyId)', build: (p) => HERCULES_ENDPOINTS.ANALYTICS.AUDIENCE_INSIGHTS(encodeURIComponent(p)) },
  { label: 'Payment history (path surveyId)', build: (p) => HERCULES_ENDPOINTS.BILLING.SURVEY_PAYMENT_HISTORY(encodeURIComponent(p)) },
];

/**
 * Fires one payload at every injection target and folds the per-target outcomes
 * into a single finding:
 *   any target shows the vulnerability signal -> FAIL
 *   at least one target was exercised, none vulnerable -> PASS
 *   nothing was exercised -> INCONCLUSIVE (proves nothing)
 */
async function runInjectionProbe({ code, principle, name, payload, rationale, expected, detect, method = 'GET', extraHeaders = {} }) {
  const results = [];

  for (const target of INJECTION_TARGETS) {
    const url = resolveUrl(target.build(payload));
    const res = await requestUrl(url, { method, headers: { ...AUTH_HEADERS, ...extraHeaders } });
    const state = classifyProbe(res);
    const signal = state === 'EXERCISED' ? detect(res) : null;
    results.push({ label: target.label, url, res, state, signal });
  }

  const exercised = results.filter((r) => r.state === 'EXERCISED');
  const vulnerable = results.filter((r) => r.signal && r.signal.vulnerable);

  let status;
  if (vulnerable.length > 0) status = 'FAIL';
  else if (exercised.length > 0) status = 'PASS';
  else status = 'INCONCLUSIVE';

  const evidence = results
    .map((r) => {
      const detail = r.signal ? ` | detector: ${r.signal.detail}` : '';
      return `[${r.state}] ${r.label}\n  HTTP ${r.res.statusCode || 'ERR'} ${r.res.statusMessage || r.res.error || ''} ` +
             `(${r.res.latencyMs}ms, ${r.res.body ? r.res.body.length : 0} bytes)${detail}`;
    })
    .join('\n');

  let actual;
  if (status === 'FAIL') {
    actual = `VULNERABLE on ${vulnerable.length}/${results.length} endpoint(s): ` +
      vulnerable.map((v) => `${v.label} (${v.signal.detail})`).join('; ');
  } else if (status === 'PASS') {
    actual = `Payload evaluated by application code on ${exercised.length}/${results.length} endpoint(s); ` +
      `no vulnerability signal on any of them.`;
  } else {
    actual = `INCONCLUSIVE: none of the ${results.length} endpoints reached an exercisable sink ` +
      `(${Array.from(new Set(results.map((r) => PROBE_STATE_LABEL[r.state]))).join('; ')}). ` +
      `${HAS_AUTH ? 'An authenticated session was supplied.' : 'No authenticated session was supplied -- set SECURITY_STORAGE_STATE or populate .auth/.'}`;
  }

  return {
    code,
    principle,
    name,
    status,
    severity: status === 'FAIL' ? 'Critical' : status === 'INCONCLUSIVE' ? 'Info' : 'High',
    action: `Sent payload [${payload}] to ${results.length} parameterized API endpoint(s) ` +
            `${HAS_AUTH ? 'with an authenticated session' : 'unauthenticated'}.`,
    rationale,
    expected,
    actual,
    evidence,
    analysis: status === 'FAIL'
      ? `Confirmed ${name}: the payload changed backend behaviour on a live endpoint. Remediate before release.`
      : status === 'PASS'
        ? `Payload was evaluated by real application code on ${exercised.length} endpoint(s) without triggering the vulnerability signal.`
        : 'No conclusion is possible from this run: the payload never reached code that could act on it. This is NOT evidence that the application is safe.',
  };
}

/**
 * Evaluates whether a request carrying a bogus/forged credential was actually
 * rejected. Replaces the old `status === 200 && !body.includes('victim')` test,
 * which passed whenever the leaked data happened not to use the invented field
 * name the probe was grepping for.
 */
function evaluateAuthRejection(res) {
  const state = classifyProbe(res);

  if (state === 'UNREACHABLE_AUTH') {
    return { status: 'PASS', detail: `credential rejected with HTTP ${res.statusCode}` };
  }
  if (state === 'TRANSPORT_ERROR') {
    return { status: 'INCONCLUSIVE', detail: `no response (${res.error || 'transport error'})` };
  }
  if (state === 'UNREACHABLE_ROUTE') {
    return { status: 'INCONCLUSIVE', detail: `HTTP ${res.statusCode}: route/resource absent, so no authorization decision was exercised` };
  }
  if (state === 'UNREACHABLE_SHELL') {
    return { status: 'INCONCLUSIVE', detail: 'static SPA shell returned; no API authorization decision was exercised' };
  }
  if (res.statusCode >= 500) {
    return { status: 'WARN', detail: `HTTP ${res.statusCode}: forged credential reached code that crashed rather than being rejected` };
  }

  const leaks = findPrivateData(res.body, isJsonResponse(res));
  if (leaks.length > 0) {
    return { status: 'FAIL', detail: `HTTP ${res.statusCode} returned private data to a forged credential (${leaks.join(', ')})` };
  }
  return {
    status: 'WARN',
    detail: `HTTP ${res.statusCode} accepted the request instead of rejecting it, though no private data was detected in the ${res.body ? res.body.length : 0}-byte body`,
  };
}

/** Worst-first ordering so an aggregate finding takes its status from its worst probe. */
const STATUS_RANK = { FAIL: 4, WARN: 3, INCONCLUSIVE: 2, PASS: 1 };
function worstStatus(statuses) {
  return statuses.sort((a, b) => (STATUS_RANK[b] || 0) - (STATUS_RANK[a] || 0))[0] || 'INCONCLUSIVE';
}

async function runSecurityAudit() {
  // Step 0: Validate scope & authorization for EVERY origin we will probe,
  // not just the web front end.
  for (const origin of TARGETS.ALL_ORIGINS) {
    ScopeGuard.validateScope(origin);
  }

  console.log(`\n======================================================================`);
  console.log(`🛡️  AUTOMATED DAST & SECURITY REGRESSION AUDIT`);
  console.log(`🎯  Web front end: ${TARGETS.WEB_BASE}`);
  console.log(`🎯  Core API:      ${TARGETS.CORE_API_BASE}`);
  console.log(`🎯  AI API:        ${TARGETS.AI_API_BASE}`);
  console.log(`🕒  Audit Execution Time: ${new Date().toISOString()}`);
  console.log(`======================================================================\n`);

  const reporter = new SecurityReporter(TARGET_URL);
  const logFinding = (record) => reporter.logFinding(record);

  const parsedTarget = new URL(TARGET_URL);

  // -------------------------------------------------------------------------
  // 1. TLS / SSL Certificate & Protocol Deep Inspection
  // -------------------------------------------------------------------------
  // Step 0b: is the supplied session usable at all?
  const session = await verifySessionIsLive();
  console.log(`\n▶ [ENGINE 0] Session Liveness: ${session.live ? 'LIVE' : 'NOT USABLE'} - ${session.reason}`);
  logFinding({
    code: 'SESSION-00',
    principle: 'Scan Coverage',
    name: 'Authenticated Session Liveness (scan coverage precondition)',
    status: session.live ? 'PASS' : 'WARN',
    severity: session.live ? 'Info' : 'Medium',
    action: `Read ${resolveUrl(HERCULES_ENDPOINTS.ACCOUNT.GET_DETAILS)} using the supplied storage state${HAS_AUTH ? ` (${AUTH.source})` : ''}.`,
    rationale: 'Authorization, BOLA, injection and business-logic controls can only reach authenticated code paths with a live session. Without one the scan covers the public surface only, and every authenticated control is inconclusive.',
    expected: 'HTTP 200 from the account endpoint, proving the session is usable.',
    actual: session.live
      ? 'Session is live; authenticated controls below exercised real code paths.'
      : `Session is NOT usable (${session.reason}). Authenticated controls below are reported INCONCLUSIVE and this scan covers only the unauthenticated surface.`,
    evidence: `Storage state: ${HAS_AUTH ? AUTH.source : 'none'}\nCookies scoped to target: ${HAS_AUTH ? AUTH.count : 0}\nBearer token present: ${HAS_AUTH ? Boolean(AUTH.bearer) : false}\nLiveness probe: ${session.reason}`,
    analysis: session.live
      ? 'Scan coverage includes authenticated paths.'
      : 'Refresh the storage state (re-run tests/auth.setup.js or set SECURITY_STORAGE_STATE) before treating this run as a full audit.',
  });

  console.log(`\n▶ [ENGINE 1] Inspecting TLS / SSL Certificate & Ciphers...`);
  const tlsInfo = await inspectTlsCertificate(parsedTarget.hostname);
  if (tlsInfo.valid) {
    logFinding({
      code: 'TLS-01',
      principle: 'Transport Security',
      name: 'TLS Protocol & Cipher Suite',
      status: (tlsInfo.protocol === 'TLSv1.2' || tlsInfo.protocol === 'TLSv1.3') ? 'PASS' : 'WARN',
      severity: 'High',
      action: `Performed TLS handshake with ${parsedTarget.hostname}:443`,
      rationale: 'Ensure deprecated SSLv3, TLS 1.0, and TLS 1.1 are disabled and modern ciphers are negotiated.',
      expected: 'Negotiated protocol must be TLSv1.2 or TLSv1.3 with secure cipher.',
      actual: `Negotiated protocol ${tlsInfo.protocol} with cipher ${tlsInfo.cipherName}.`,
      evidence: `Protocol: ${tlsInfo.protocol}\nCipher: ${tlsInfo.cipherName}\nSNI: ${parsedTarget.hostname}`,
      analysis: (tlsInfo.protocol === 'TLSv1.2' || tlsInfo.protocol === 'TLSv1.3')
        ? `Negotiated ${tlsInfo.protocol}, which is current. Scope: this records what the server chose for a modern client; it does not prove TLS 1.0/1.1 or weak ciphers are refused. Use the ZAP scan or testssl.sh to enumerate the accepted suites.`
        : `Negotiated ${tlsInfo.protocol}, which is deprecated. Disable TLS versions below 1.2.`,
    });

    logFinding({
      code: 'TLS-02',
      principle: 'Transport Security',
      name: 'SSL Certificate Validity & Expiration',
      status: tlsInfo.daysRemaining > 15 ? 'PASS' : 'WARN',
      severity: 'High',
      action: `Inspected peer SSL certificate chain on ${parsedTarget.hostname}`,
      rationale: 'Verify SSL certificate is trusted, valid, and not nearing expiration.',
      expected: 'Certificate is valid with > 15 days remaining before expiration.',
      actual: `Valid certificate issued by "${tlsInfo.issuer}". Expires in ${tlsInfo.daysRemaining} days (${tlsInfo.validTo}).`,
      evidence: `Subject: ${tlsInfo.subject}\nIssuer: ${tlsInfo.issuer}\nValid Until: ${tlsInfo.validTo}\nDays Remaining: ${tlsInfo.daysRemaining}\nSAN: ${tlsInfo.san.slice(0, 100)}...`,
      analysis: tlsInfo.daysRemaining > 15
        ? `Certificate chain validated and expires in ${tlsInfo.daysRemaining} days.`
        : `Certificate expires in ${tlsInfo.daysRemaining} days: renew now to avoid an outage.`,
    });
  } else {
    logFinding({
      code: 'TLS-01',
      principle: 'Transport Security',
      name: 'TLS Handshake Validation',
      status: 'FAIL',
      severity: 'Critical',
      action: `Attempted TLS handshake with ${parsedTarget.hostname}`,
      rationale: 'Verify TLS service is operational.',
      expected: 'Successful TLS handshake.',
      actual: `TLS Handshake Error: ${tlsInfo.error}`,
      evidence: `Error: ${tlsInfo.error}`,
      analysis: 'Failed to negotiate secure TLS connection.',
    });
  }

  // -------------------------------------------------------------------------
  // 2. Front-End JavaScript Secret & API Key Token Scanner
  // -------------------------------------------------------------------------
  console.log(`\n▶ [ENGINE 2] Scanning Frontend JavaScript Bundles for Leaked Secrets...`);
  const baseRes = await requestUrl(TARGET_URL);
  const secretScan = await scanJsBundlesForLeakedSecrets(TARGET_URL, baseRes.body);

  logFinding({
    code: 'SEC-01',
    principle: 'Secret Exposure',
    name: 'Frontend JS Bundles Secrets & Key Scanner',
    status: secretScan.leaksFound.length === 0 ? 'PASS' : 'FAIL',
    severity: secretScan.leaksFound.length === 0 ? 'High' : 'Critical',
    action: `Downloaded and scanned ${secretScan.scannedCount} production Next.js JavaScript chunk bundles using secret regex detectors (AWS keys, Stripe keys, Private tokens, Slack webhooks).`,
    rationale: 'Developers often accidentally bundle private backend API keys, database credentials, or third-party secret tokens into public frontend React chunks.',
    expected: 'Zero private API keys or hardcoded secret credentials in public JavaScript bundles.',
    actual: secretScan.leaksFound.length === 0
      ? `Scanned ${secretScan.scannedCount} production JS chunks: Zero hardcoded credentials or secret tokens leaked.`
      : `CRITICAL: Leaked ${secretScan.leaksFound.length} secrets in frontend JS: ${JSON.stringify(secretScan.leaksFound)}`,
    evidence: `Scanned Chunks Count: ${secretScan.scannedCount}\nFindings: ${secretScan.leaksFound.length === 0 ? 'None (Clean)' : JSON.stringify(secretScan.leaksFound, null, 2)}`,
    analysis: secretScan.leaksFound.length === 0 ? 'No secret keys or credentials leaked in client bundles.' : 'Immediate revocation required for leaked keys!',
  });

  // -------------------------------------------------------------------------
  // 3. Multi-Vector Fuzzing against real parameterized API endpoints
  //    (Blind/Boolean/UNION SQLi, NoSQL operators, CRLF)
  // -------------------------------------------------------------------------
  console.log(`\n▶ [ENGINE 3] Multi-Vector Injection Fuzzing on parameterized API endpoints...`);
  console.log(`   Session: ${HAS_AUTH ? `authenticated (${AUTH.count} cookies from ${AUTH.source})` : 'UNAUTHENTICATED - results will likely be INCONCLUSIVE'}`);

  // A. Boolean / syntax-error SQL injection
  logFinding(await runInjectionProbe({
    code: 'A03-SQLI-BOOL',
    principle: 'Injection',
    name: 'Boolean & Syntax-Error SQL Injection',
    payload: "1' OR '1'='1",
    rationale: 'Backend identifier lookups must be parameterized so quoted input cannot alter query logic or surface database syntax errors.',
    expected: 'Identifier treated as an opaque string; no SQL error text and no widened result set.',
    detect: (res) => {
      const keywords = ['syntax error', 'unclosed quotation mark', 'sqlstate', 'pg_query', 'mysql_fetch',
                        'ora-0', 'sqlite3', 'psycopg', 'unterminated quoted string', 'sequelize'];
      const hit = keywords.find((k) => (res.body || '').toLowerCase().includes(k));
      return hit
        ? { vulnerable: true, detail: `SQL error disclosed in body ("${hit}")` }
        : { vulnerable: false, detail: 'no SQL error signature in body' };
    },
  }));

  // B. UNION-based SQL injection
  logFinding(await runInjectionProbe({
    code: 'A03-SQLI-UNION',
    principle: 'Injection',
    name: 'UNION SELECT SQL Injection',
    payload: "1' UNION SELECT null,username,password FROM users--",
    rationale: 'Verify queries cannot be chained with UNION to append rows from unrelated tables.',
    expected: 'Payload rejected or treated as a literal; no credential-shaped rows appended to the response.',
    detect: (res) => {
      const leaks = findPrivateData(res.body, isJsonResponse(res));
      if (leaks.length > 0) return { vulnerable: true, detail: `credential/PII shaped data returned (${leaks.join(', ')})` };
      if (/"(?:username|user_name)"\s*:\s*"[^"]+"\s*,\s*"(?:password|passwd|hash)"/i.test(res.body || '')) {
        return { vulnerable: true, detail: 'username/password column pair returned' };
      }
      return { vulnerable: false, detail: 'no appended credential rows' };
    },
  }));

  // C. Time-based blind SQL injection.
  //    Needs a per-endpoint baseline, so it does not use runInjectionProbe.
  const SLEEP_SECONDS = 5;
  const timePayload = `1' OR SLEEP(${SLEEP_SECONDS}) OR pg_sleep(${SLEEP_SECONDS})--`;
  const timeResults = [];

  for (const target of INJECTION_TARGETS) {
    // Two baseline samples, keep the slower one, so ordinary jitter does not read as a delay.
    const b1 = await requestUrl(resolveUrl(target.build('baseline_probe_id')), { headers: AUTH_HEADERS });
    const b2 = await requestUrl(resolveUrl(target.build('baseline_probe_id')), { headers: AUTH_HEADERS });
    const baseline = Math.max(b1.latencyMs, b2.latencyMs);

    const probe = await requestUrl(resolveUrl(target.build(timePayload)), { headers: AUTH_HEADERS });
    const state = classifyProbe(probe);
    // Require most of the injected sleep to show up, and confirm with a repeat.
    let delayed = state === 'EXERCISED' && (probe.latencyMs - baseline) > (SLEEP_SECONDS * 1000 * 0.8);
    if (delayed) {
      const confirm = await requestUrl(resolveUrl(target.build(timePayload)), { headers: AUTH_HEADERS });
      delayed = (confirm.latencyMs - baseline) > (SLEEP_SECONDS * 1000 * 0.8);
    }
    timeResults.push({ label: target.label, baseline, probeLatency: probe.latencyMs, state, delayed, status: probe.statusCode });
  }

  const timeExercised = timeResults.filter((r) => r.state === 'EXERCISED');
  const timeVulnerable = timeResults.filter((r) => r.delayed);

  logFinding({
    code: 'A03-SQLI-BLIND',
    principle: 'Injection',
    name: 'Time-Based Blind SQL Injection',
    status: timeVulnerable.length > 0 ? 'FAIL' : timeExercised.length > 0 ? 'PASS' : 'INCONCLUSIVE',
    severity: timeVulnerable.length > 0 ? 'Critical' : timeExercised.length > 0 ? 'High' : 'Info',
    action: `Sent [SLEEP(${SLEEP_SECONDS})/pg_sleep(${SLEEP_SECONDS})] against ${INJECTION_TARGETS.length} parameterized endpoints, each with a two-sample latency baseline and a confirmation request on any hit.`,
    rationale: 'A blind injection point executes an injected sleep even when it returns no data, so a reproducible latency delta is the signal.',
    expected: `No endpoint shows a reproducible delay approaching ${SLEEP_SECONDS}s over its own baseline.`,
    actual: timeVulnerable.length > 0
      ? `VULNERABLE: reproducible sleep executed on ${timeVulnerable.map((r) => r.label).join('; ')}`
      : timeExercised.length > 0
        ? `Payload evaluated on ${timeExercised.length}/${timeResults.length} endpoint(s); no reproducible delay observed.`
        : `INCONCLUSIVE: no endpoint reached an exercisable sink. ${HAS_AUTH ? '' : 'No authenticated session was supplied.'}`,
    evidence: timeResults
      .map((r) => `[${r.state}] ${r.label}\n  baseline ${r.baseline}ms -> probe ${r.probeLatency}ms (HTTP ${r.status || 'ERR'}) delayed=${r.delayed ? 'YES' : 'no'}`)
      .join('\n'),
    analysis: timeVulnerable.length > 0
      ? 'Backend executed an injected sleep: a blind SQL injection sink is reachable.'
      : timeExercised.length > 0
        ? 'No timing side channel observed on the endpoints that evaluated the payload.'
        : 'No conclusion possible: the payload never reached code that could act on it.',
  });

  // D. NoSQL operator injection
  logFinding(await runInjectionProbe({
    code: 'A03-NOSQL',
    principle: 'Injection',
    name: 'NoSQL Operator Injection',
    payload: '{"$ne":null}',
    rationale: 'Document-store operators ($ne/$gt/$regex) must not be interpolated into filter expressions, which would widen a scoped query to every document.',
    expected: 'Operator object rejected or treated as a literal id; no unscoped result set and no 5xx.',
    detect: (res) => {
      if (res.statusCode >= 500) return { vulnerable: true, detail: `operator reached the query layer and crashed it (HTTP ${res.statusCode})` };
      const leaks = findPrivateData(res.body, isJsonResponse(res));
      if (leaks.length > 0) return { vulnerable: true, detail: `unscoped data returned (${leaks.join(', ')})` };
      // A large JSON array back from an id lookup suggests the filter was widened.
      if (isJsonResponse(res) && /^\s*\[/.test(res.body || '') && (res.body || '').length > 5000) {
        return { vulnerable: true, detail: `id lookup returned a ${res.body.length}-byte collection` };
      }
      return { vulnerable: false, detail: 'operator not interpreted' };
    },
  }));

  // E. CRLF / HTTP response header injection
  const crlfPayload = 'en\r\nSet-Cookie: injected_probe=malicious_token';
  const crlfResults = [];
  for (const target of INJECTION_TARGETS) {
    const url = resolveUrl(target.build(crlfPayload));
    const res = await requestUrl(url, { headers: AUTH_HEADERS });
    const raw = res.headers['set-cookie'] || [];
    const cookies = Array.isArray(raw) ? raw : [raw];
    crlfResults.push({
      label: target.label,
      state: classifyProbe(res),
      injected: cookies.some((c) => (c || '').includes('injected_probe')),
      status: res.statusCode,
      setCookie: JSON.stringify(cookies),
    });
  }
  const crlfInjected = crlfResults.filter((r) => r.injected);
  // A CRLF payload is reflected into headers by the edge before any handler runs,
  // so a clean result here is meaningful regardless of the body's reachability.
  logFinding({
    code: 'A03-CRLF',
    principle: 'Injection',
    name: 'CRLF / HTTP Response Header Injection',
    status: crlfInjected.length > 0 ? 'FAIL' : 'PASS',
    severity: crlfInjected.length > 0 ? 'Critical' : 'High',
    action: `Sent a CR/LF-bearing value into ${INJECTION_TARGETS.length} endpoint parameters and inspected the response headers for an attacker-controlled Set-Cookie.`,
    rationale: 'Unescaped CR/LF in a reflected value lets an attacker append arbitrary response headers, including session cookies.',
    expected: 'CR/LF escaped or stripped; no injected_probe cookie in any response.',
    actual: crlfInjected.length > 0
      ? `VULNERABLE: attacker-controlled Set-Cookie injected via ${crlfInjected.map((r) => r.label).join('; ')}`
      : `No injected header returned by any of the ${crlfResults.length} endpoints probed.`,
    evidence: crlfResults.map((r) => `[${r.state}] ${r.label}\n  HTTP ${r.status || 'ERR'} | Set-Cookie: ${r.setCookie}`).join('\n'),
    analysis: crlfInjected.length > 0
      ? 'Response splitting is possible: an attacker can set cookies and forge headers on this origin.'
      : 'CR/LF sequences are neutralized before reaching the response headers.',
  });

  // -------------------------------------------------------------------------
  // 4. Broken Access Control & Protected Endpoints (A01)
  // -------------------------------------------------------------------------
  console.log(`\n▶ [ENGINE 4] Testing Access Control & Internal Endpoints...`);
  const protectedRoutes = [
    { path: '/ai', label: 'AI Workspace (/ai)' },
    { path: '/dashboard', label: 'Dashboard (/dashboard)' },
    { path: '/settings', label: 'Settings (/settings)' },
    // Real API endpoints, resolved to the origin that actually serves them.
    { path: HERCULES_ENDPOINTS.ACCOUNT.GET_DETAILS, label: 'Account details API' },
    { path: HERCULES_ENDPOINTS.CAMPAIGNS.GET_HISTORY, label: 'Chat history API' },
    { path: HERCULES_ENDPOINTS.AUDIENCE.GET_MY_TEMPLATES, label: 'My audience templates API' },
    { path: HERCULES_ENDPOINTS.BILLING.ACCOUNT_CREDITS, label: 'Account credits API' },
    { path: HERCULES_ENDPOINTS.ADMIN.GET_ADMIN_SURVEYS, label: 'Admin surveys API' },
  ];

  for (const route of protectedRoutes) {
    const target = resolveUrl(route.path);
    const res = await requestUrl(target);
    const denied = [401, 403, 302, 307, 308].includes(res.statusCode);

    if (denied) {
      logFinding({
        code: 'A01',
        principle: 'Broken Access Control',
        name: `Restricted Access: ${route.label}`,
        status: 'PASS',
        severity: 'High',
        action: `Sent unauthenticated GET to protected endpoint: ${target} [${originLabel(route.path)}]`,
        rationale: 'Unauthenticated callers must not reach private dashboards or APIs.',
        expected: 'HTTP 401, 403, or a 30x redirect to login.',
        actual: `Received HTTP ${res.statusCode} ${res.statusMessage} (Location: ${res.headers['location'] || 'none'}).`,
        evidence: `HTTP/${res.statusCode}\nLocation: ${res.headers['location'] || 'N/A'}\nLatency: ${res.latencyMs}ms`,
        analysis: 'Endpoint denies unauthenticated access at the server.',
      });
      continue;
    }

    if (res.statusCode === 404) {
      logFinding({
        code: 'A01',
        principle: 'Broken Access Control',
        name: `Absent Route: ${route.label}`,
        status: 'INCONCLUSIVE',
        severity: 'Info',
        action: `Sent unauthenticated GET to: ${target}`,
        rationale: 'A 404 means the route does not exist on this deployment, so its authorization behaviour was not tested.',
        expected: 'A deployed protected route returning 401/403/30x.',
        actual: `Received HTTP 404 Not Found - route absent, nothing to authorize.`,
        evidence: `HTTP/404 Not Found\nLatency: ${res.latencyMs}ms`,
        analysis: 'Not a finding either way: absence of a route is not evidence of working access control. Remove it from the probe list or point it at the real path.',
      });
      continue;
    }

    if (res.statusCode === 200) {
      // The decisive question: did the server hand private data to an
      // unauthenticated caller, or just the generic client-side app shell?
      const json = isJsonResponse(res);
      const leaks = findPrivateData(res.body, json);

      if (leaks.length > 0) {
        logFinding({
          code: 'A01',
          principle: 'Broken Access Control',
          name: `Unauthenticated Data Exposure: ${route.label}`,
          status: 'FAIL',
          severity: 'Critical',
          action: `Sent unauthenticated GET to: ${target}`,
          rationale: 'A protected endpoint must never return user or credential data without a session.',
          expected: 'No private data in an unauthenticated response.',
          actual: `HTTP 200 returned private data to an unauthenticated caller: ${leaks.join(', ')}.`,
          evidence: `HTTP/200\nContent-Type: ${res.headers['content-type']}\nIndicators: ${leaks.join(', ')}\nBody preview: ${(res.body || '').slice(0, 300).replace(/\s+/g, ' ')}`,
          analysis: 'Broken access control confirmed: private data is served without authentication.',
        });
      } else if (json) {
        logFinding({
          code: 'A01',
          principle: 'Broken Access Control',
          name: `Unauthenticated JSON Response: ${route.label}`,
          status: 'WARN',
          severity: 'Medium',
          action: `Sent unauthenticated GET to: ${target}`,
          rationale: 'An API answering 200 with JSON to an unauthenticated caller should be returning an error, not a payload.',
          expected: 'HTTP 401/403 rather than a 200 JSON body.',
          actual: `HTTP 200 with a ${res.body.length}-byte JSON body and no private-data indicators. Verify manually that this response is genuinely public.`,
          evidence: `HTTP/200\nContent-Type: ${res.headers['content-type']}\nBody preview: ${(res.body || '').slice(0, 300).replace(/\s+/g, ' ')}`,
          analysis: 'No leak detected by pattern matching, but a 200 JSON response on a protected route warrants manual review.',
        });
      } else {
        logFinding({
          code: 'A01',
          principle: 'Broken Access Control',
          name: `Client-Side Route Guard: ${route.label}`,
          status: 'PASS',
          severity: 'Medium',
          action: `Sent unauthenticated GET to: ${target} and scanned the returned shell for embedded user data.`,
          rationale: 'An SPA may serve a generic cacheable shell to everyone and gate data at the API. That is acceptable only if the shell itself carries no private data.',
          expected: 'Generic app shell with no embedded user data, tokens, or PII.',
          actual: `HTTP 200 served a ${res.body.length}-byte ${res.headers['content-type'] || 'unknown'} shell with no private-data indicators.`,
          evidence: `HTTP/200\nContent-Type: ${res.headers['content-type']}\nHTML length: ${res.body.length} bytes\nPrivate-data indicators: none\nLatency: ${res.latencyMs}ms`,
          analysis: 'Scope of this PASS: it proves the unauthenticated shell leaks no data. It does NOT prove the API enforces authorization - that is covered by the A01 API checks and the BOLA engine.',
        });
      }
      continue;
    }

    // Anything else (5xx, 429, odd codes) previously fell through and logged nothing.
    logFinding({
      code: 'A01',
      principle: 'Broken Access Control',
      name: `Unexpected Response: ${route.label}`,
      status: res.statusCode >= 500 ? 'FAIL' : 'WARN',
      severity: res.statusCode >= 500 ? 'High' : 'Low',
      action: `Sent unauthenticated GET to: ${target}`,
      rationale: 'Protected routes should deny cleanly; a server error on an unauthenticated request suggests the handler ran before the auth check.',
      expected: 'HTTP 401, 403, or a 30x redirect.',
      actual: `Received unexpected HTTP ${res.statusCode} ${res.statusMessage || res.error || ''}.`,
      evidence: `HTTP/${res.statusCode}\nLatency: ${res.latencyMs}ms\nBody preview: ${(res.body || '').slice(0, 200).replace(/\s+/g, ' ')}`,
      analysis: res.statusCode >= 500
        ? 'Unauthenticated request reached code that crashed: review the ordering of the auth middleware.'
        : 'Unexpected status on a protected route; confirm the intended behaviour.',
    });
  }

  // -------------------------------------------------------------------------
  // 5. Cryptographic Transport & HSTS (A02)
  // -------------------------------------------------------------------------
  console.log(`\n▶ [ENGINE 5] Cryptographic Transport & HSTS...`);
  const httpUrl = TARGET_URL.replace('https://', 'http://');
  const httpRes = await requestUrl(httpUrl);
  const hsts = baseRes.headers['strict-transport-security'];

  const MIN_HSTS_MAX_AGE = 31536000; // 1 year, per the stated expectation
  const hstsMaxAgeMatch = /max-age\s*=\s*(\d+)/i.exec(hsts || '');
  const hstsMaxAge = hstsMaxAgeMatch ? parseInt(hstsMaxAgeMatch[1], 10) : null;
  const hstsSubdomains = /includeSubDomains/i.test(hsts || '');
  const hstsPreload = /preload/i.test(hsts || '');
  const hstsIssues = [];
  if (!hsts) hstsIssues.push('header absent');
  else {
    if (hstsMaxAge === null) hstsIssues.push('no max-age directive');
    else if (hstsMaxAge < MIN_HSTS_MAX_AGE) hstsIssues.push(`max-age ${hstsMaxAge} is below the required ${MIN_HSTS_MAX_AGE}`);
    if (!hstsSubdomains) hstsIssues.push('missing includeSubDomains');
  }
  // Absent header or an ineffective max-age is a real failure; a valid year-plus
  // policy that merely omits includeSubDomains is a hardening warning.
  const hstsStatus = (!hsts || hstsMaxAge === null || hstsMaxAge < MIN_HSTS_MAX_AGE)
    ? 'FAIL'
    : hstsIssues.length > 0 ? 'WARN' : 'PASS';

  logFinding({
    code: 'A02-HSTS',
    principle: 'Cryptographic Failures',
    name: 'HSTS (HTTP Strict Transport Security)',
    status: hstsStatus,
    severity: 'High',
    action: `Inspected and parsed the Strict-Transport-Security header on: ${TARGET_URL}`,
    rationale: 'HSTS instructs browsers to communicate only over HTTPS, preventing SSL-stripping attacks. A max-age shorter than a year leaves a wide downgrade window.',
    expected: `Strict-Transport-Security with max-age >= ${MIN_HSTS_MAX_AGE} and includeSubDomains.`,
    actual: hstsIssues.length === 0
      ? `Compliant: max-age=${hstsMaxAge}${hstsSubdomains ? ', includeSubDomains' : ''}${hstsPreload ? ', preload' : ''}.`
      : `Non-compliant (${hstsIssues.join('; ')}). Raw header: "${hsts || 'Missing'}".`,
    evidence: `strict-transport-security: ${hsts || 'None'}\nParsed max-age: ${hstsMaxAge === null ? 'none' : hstsMaxAge}\nincludeSubDomains: ${hstsSubdomains}\npreload: ${hstsPreload}\nHTTP->HTTPS probe status: ${httpRes.statusCode || 'no response'}`,
    analysis: hstsStatus === 'PASS'
      ? `HSTS enforced with max-age=${hstsMaxAge}s and includeSubDomains.`
      : hstsStatus === 'WARN'
        ? `HSTS is active with max-age=${hstsMaxAge}s but incomplete: ${hstsIssues.join('; ')}.`
        : `HSTS does not meet the minimum policy: ${hstsIssues.join('; ')}. Browsers remain exposed to protocol downgrade.`,
  });

  // -------------------------------------------------------------------------
  // 6. Security Misconfigurations & Defensive Headers (A05)
  // -------------------------------------------------------------------------
  console.log(`\n▶ [ENGINE 6] Security Misconfigurations & Defensive Headers...`);
  const headers = baseRes.headers;

  // CSP
  const csp = headers['content-security-policy'];
  logFinding({
    code: 'A05-CSP',
    principle: 'Security Misconfiguration',
    name: 'Content-Security-Policy (CSP)',
    status: !csp ? 'WARN' : /unsafe-inline|unsafe-eval|script-src[^;]*\*/i.test(csp) ? 'WARN' : 'PASS',
    severity: 'High',
    action: `Inspected and parsed the Content-Security-Policy header on: ${TARGET_URL}`,
    rationale: 'CSP restricts where scripts, images and styles may load from. A policy containing unsafe-inline, unsafe-eval or a wildcard script-src does not meaningfully constrain XSS.',
    expected: 'Content-Security-Policy present, without unsafe-inline/unsafe-eval and without a wildcard script-src.',
    actual: !csp
      ? 'CSP header is missing.'
      : /unsafe-inline|unsafe-eval|script-src[^;]*\*/i.test(csp)
        ? `CSP present but permissive: contains ${[/unsafe-inline/i.test(csp) && 'unsafe-inline', /unsafe-eval/i.test(csp) && 'unsafe-eval', /script-src[^;]*\*/i.test(csp) && 'wildcard script-src'].filter(Boolean).join(', ')}.`
        : 'CSP present with no unsafe-inline, unsafe-eval, or wildcard script-src.',
    evidence: `content-security-policy: ${csp || 'None'}`,
    analysis: !csp
      ? 'Add a Content-Security-Policy header.'
      : /unsafe-inline|unsafe-eval|script-src[^;]*\*/i.test(csp)
        ? 'The header is present but its directives permit inline/eval or arbitrary script origins, so it should not be counted as XSS mitigation.'
        : 'CSP constrains script sources.',
  });

  // XFO
  const xfo = headers['x-frame-options'];
  const hasFrameAncestors = (csp || '').includes('frame-ancestors');
  logFinding({
    code: 'A05-XFO',
    principle: 'Security Misconfiguration',
    name: 'Clickjacking Protection (X-Frame-Options)',
    status: (xfo || hasFrameAncestors) ? 'PASS' : 'WARN',
    severity: 'Medium',
    action: `Checked for X-Frame-Options and CSP frame-ancestors headers.`,
    rationale: 'Clickjacking attacks embed transparent iframes of your application to trick users into unauthorized clicks.',
    expected: 'X-Frame-Options: DENY or SAMEORIGIN.',
    actual: (xfo || hasFrameAncestors)
      ? `Framing controlled by: ${xfo ? `X-Frame-Options: ${xfo}` : 'CSP frame-ancestors'}.`
      : 'Neither X-Frame-Options nor a CSP frame-ancestors directive is present.',
    evidence: `x-frame-options: ${xfo || 'N/A'}\nCSP frame-ancestors: ${hasFrameAncestors ? 'Present' : 'N/A'}`,
    analysis: (xfo || hasFrameAncestors)
      ? 'A framing policy is declared, so the app cannot be silently embedded by third-party sites.'
      : 'No framing policy declared: the application can be embedded in a third-party iframe for clickjacking.',
  });

  // MIME Sniffing
  const xcto = headers['x-content-type-options'];
  logFinding({
    code: 'A05-MIME',
    principle: 'Security Misconfiguration',
    name: 'MIME Sniffing (X-Content-Type-Options)',
    status: (xcto && xcto.toLowerCase().includes('nosniff')) ? 'PASS' : 'WARN',
    severity: 'Low',
    action: `Checked for X-Content-Type-Options header on: ${TARGET_URL}`,
    rationale: 'Prevents browsers from MIME-sniffing a response away from the declared content-type.',
    expected: 'X-Content-Type-Options: nosniff',
    actual: (xcto && xcto.toLowerCase().includes('nosniff'))
      ? `nosniff is set (header: "${xcto}").`
      : `Header ${xcto ? `present but not nosniff ("${xcto}")` : 'missing'}.`,
    evidence: `x-content-type-options: ${xcto || 'undefined'}`,
    analysis: (xcto && xcto.toLowerCase().includes('nosniff'))
      ? 'nosniff prevents the browser from reinterpreting a response away from its declared content-type.'
      : 'Add X-Content-Type-Options: nosniff to prevent MIME confusion.',
  });

  // HTTP TRACE Method Tampering
  const traceRes = await requestUrl(TARGET_URL, { method: 'TRACE' });
  const traceDisabled = [400, 403, 405, 501].includes(traceRes.statusCode);
  logFinding({
    code: 'A05-TRACE',
    principle: 'Security Misconfiguration',
    name: 'HTTP TRACE / TRACK Method Hardening',
    status: traceDisabled ? 'PASS' : 'WARN',
    severity: 'Medium',
    action: `Sent HTTP TRACE request to: ${TARGET_URL}`,
    rationale: 'HTTP TRACE reflects the request back to the client, which can be leveraged in Cross-Site Tracing (XST) attacks to steal cookies.',
    expected: 'HTTP 405 (Method Not Allowed) or 501 (Not Implemented).',
    actual: `Server returned HTTP ${traceRes.statusCode} ${traceRes.statusMessage}.`,
    evidence: `HTTP/${traceRes.statusCode} ${traceRes.statusMessage}\nLatency: ${traceRes.latencyMs}ms`,
    analysis: traceDisabled ? 'TRACE method is disabled.' : 'Server returned 500 on TRACE instead of 405. Recommended to explicitly disable TRACE in cloud load balancer/ingress config.',
  });

  // Sensitive Files & Configuration Leakage (Expanded Fuzzing)
  const sensitiveFiles = [
    { file: '/.env', desc: 'Environment Config' },
    { file: '/.env.local', desc: 'Local Environment Config' },
    { file: '/.env.production', desc: 'Production Environment Secrets' },
    { file: '/.git/HEAD', desc: 'Git Branch Metadata' },
    { file: '/.git/config', desc: 'Git Remote & Repo Config' },
    { file: '/wp-config.php', desc: 'Legacy CMS DB Credentials' },
    { file: '/config.json', desc: 'Application Configuration' },
    { file: '/server.js', desc: 'Backend Source File' },
    { file: '/docker-compose.yml', desc: 'Container Orchestration Secrets' },
    { file: '/.dockerignore', desc: 'Container Build File' },
    { file: '/phpinfo.php', desc: 'PHP Diagnostic Dump' },
    { file: '/.aws/credentials', desc: 'Cloud Provider Credentials' },
  ];

  for (const s of sensitiveFiles) {
    const sUrl = `${TARGET_URL}${s.file}`;
    const sRes = await requestUrl(sUrl);
    const blocked = sRes.statusCode === 404 || sRes.statusCode === 403;

    logFinding({
      code: 'A05-FILE',
      principle: 'Security Misconfiguration',
      name: `Exposed File Protection (${s.file})`,
      status: blocked ? 'PASS' : 'FAIL',
      severity: blocked ? 'High' : 'Critical',
      action: `Attempted direct access to sensitive configuration path: ${sUrl}`,
      rationale: `Ensure private server configuration files (${s.desc}) are not publicly downloadable.`,
      expected: 'HTTP 404 Not Found or HTTP 403 Forbidden.',
      actual: `Received HTTP ${sRes.statusCode} ${sRes.statusMessage}.`,
      evidence: `Target: ${s.file}\nStatus: HTTP ${sRes.statusCode}\nContent-Length: ${sRes.body.length} bytes\nLatency: ${sRes.latencyMs}ms`,
      analysis: blocked ? `Path ${s.file} is inaccessible.` : `CRITICAL: Sensitive file ${s.file} is publicly exposed!`,
    });
  }

  // -------------------------------------------------------------------------
  // 7. Software Composition Analysis (A06)
  // -------------------------------------------------------------------------
  console.log(`\n▶ [ENGINE 7] Dependency Vulnerability SCA...`);
  try {
    const auditOutput = execSync('npm audit --json', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    const auditData = JSON.parse(auditOutput);
    const vulns = auditData.metadata ? auditData.metadata.vulnerabilities : {};
    const total = vulns.total || 0;
    const highCrit = (vulns.high || 0) + (vulns.critical || 0);

    logFinding({
      code: 'HARNESS-SCA',
      principle: 'Test Harness Hygiene',
      name: 'Test Harness Dependency Audit (CVE Scan)',
      status: highCrit === 0 ? 'PASS' : 'WARN',
      severity: 'Medium',
      action: `Executed npm audit against THIS TEST REPOSITORY's package.json and package-lock.json.`,
      rationale: 'Scope note: this audits the Playwright harness, NOT the Hercules application. It was previously reported as an A06 finding about the target, which was misleading -- the target\'s dependency risk needs a scan in the application repository. Kept because a compromised test harness runs with credentials and CI access.',
      expected: '0 High and 0 Critical severity vulnerabilities in installed packages.',
      actual: `Found ${total} total vulnerabilities (${vulns.critical || 0} Critical, ${vulns.high || 0} High, ${vulns.moderate || 0} Moderate, ${vulns.low || 0} Low).`,
      evidence: JSON.stringify(vulns, null, 2),
      analysis: highCrit === 0 ? 'No high or critical CVE vulnerabilities found in dependencies.' : 'Run `npm audit fix` to patch high/critical dependency CVEs.',
    });
  } catch (e) {
    // An audit that could not run tells us nothing about the dependency tree.
    // Reporting PASS here previously turned every scanner malfunction into a
    // clean bill of health.
    logFinding({
      code: 'HARNESS-SCA',
      principle: 'Test Harness Hygiene',
      name: 'Test Harness Dependency Audit (CVE Scan)',
      status: 'FAIL',
      severity: 'Medium',
      action: `Attempted npm audit against THIS TEST REPOSITORY's package.json and package-lock.json.`,
      rationale: 'Scope note: audits the test harness, not the Hercules application. If the audit cannot run, the harness dependency tree is unverified and must not be treated as clean.',
      expected: 'npm audit completes and reports 0 High/Critical vulnerabilities.',
      actual: `Audit could not be completed: ${e.message}. Dependency risk is UNVERIFIED.`,
      evidence: `npm audit failure: ${e.message}\nStdout/stderr: ${(e.stdout || e.stderr || 'none').toString().slice(0, 500)}`,
      analysis: 'Fix the audit invocation (lockfile present? registry reachable?) and re-run. This is reported as a failure because an unverified dependency tree cannot be certified.',
    });
  }

  // -------------------------------------------------------------------------
  // 8. Identification and Cookie Security (A07)
  // -------------------------------------------------------------------------
  console.log(`\n▶ [ENGINE 8] Identification & Cookie Hardening...`);
  const rawSetCookie = baseRes.headers['set-cookie'] || [];
  const cookieList = Array.isArray(rawSetCookie) ? rawSetCookie : [rawSetCookie];

  if (cookieList.length === 0 || !cookieList[0]) {
    logFinding({
      code: 'A07-COOKIE',
      principle: 'Identification & Auth',
      name: 'Public Session State Protection',
      status: 'PASS',
      severity: 'Medium',
      action: `Inspected Set-Cookie response headers on root visit: ${TARGET_URL}`,
      rationale: 'Unauthenticated public landing visits should not set insecure or unencrypted session tracking cookies.',
      expected: 'No insecure tracking cookies on initial visit.',
      actual: 'No insecure cookies returned on root request.',
      evidence: `Set-Cookie header: None on /`,
      analysis: 'Clean session boundaries on unauthenticated entry points.',
    });
  } else {
    for (const c of cookieList) {
      const parts = c.split(';').map((s) => s.trim());
      const name = parts[0].split('=')[0];
      const isSecure = parts.some((p) => p.toLowerCase() === 'secure');
      const isHttpOnly = parts.some((p) => p.toLowerCase() === 'httponly');
      const sameSite = parts.find((p) => p.toLowerCase().startsWith('samesite='));

      const issues = [];
      if (!isSecure) issues.push('Missing Secure');
      if (!isHttpOnly) issues.push('Missing HttpOnly');
      if (!sameSite) issues.push('Missing SameSite');

      logFinding({
        code: 'A07-COOKIE',
        principle: 'Identification & Auth',
        name: `Cookie Security Flags (${name})`,
        status: issues.length === 0 ? 'PASS' : 'WARN',
        severity: 'High',
        action: `Analyzed cookie attributes for: ${name}`,
        rationale: 'Session cookies must have Secure (HTTPS only), HttpOnly (prevent XSS theft), and SameSite (prevent CSRF).',
        expected: 'Secure; HttpOnly; SameSite=Lax/Strict',
        actual: issues.length === 0 ? 'Cookie is fully hardened.' : `Missing recommended flags: ${issues.join(', ')}`,
        evidence: `Raw Set-Cookie: ${c}`,
        analysis: issues.length === 0 ? 'Cookie is protected against interception and XSS theft.' : 'Add missing cookie flags in session config.',
      });
    }
  }

  // -------------------------------------------------------------------------
  // 9. Error Handling & Exception Masking (A09)
  // -------------------------------------------------------------------------
  console.log(`\n▶ [ENGINE 9] Error Handling & Exception Masking...`);
  const malformedUrl = `${TARGET_URL}/%c0%ae%c0%ae/error_probe_nonexistent`;
  const errorRes = await requestUrl(malformedUrl);
  const errorBody = errorRes.body.toLowerCase();
  const hasStackTrace = errorBody.includes('stack trace') || errorBody.includes('at function') || errorBody.includes('node_modules') || errorBody.includes('traceback');

  logFinding({
    code: 'A09-ERR',
    principle: 'Security Logging & Errors',
    name: 'Unhandled Exception & Stack Trace Masking',
    status: hasStackTrace ? 'FAIL' : 'PASS',
    severity: 'Medium',
    action: `Sent malformed non-UTF8 directory traversal URI: ${malformedUrl}`,
    rationale: 'Web applications should catch invalid requests and return clean error pages without revealing internal server paths, file names, or stack traces.',
    expected: 'HTTP 400 or 404 without internal server stack traces in response body.',
    actual: `Received HTTP ${errorRes.statusCode} ${errorRes.statusMessage}. Stack trace leaked: ${hasStackTrace ? 'YES' : 'NO'}.`,
    evidence: `HTTP/${errorRes.statusCode}\nContent-Length: ${errorRes.body.length} bytes\nBody Preview: ${errorRes.body.slice(0, 120).replace(/\s+/g, ' ')}`,
    analysis: hasStackTrace ? 'Sensitive error disclosure: Internal code structure exposed.' : 'Error is masked safely with no diagnostic stack trace disclosure.',
  });

  // -------------------------------------------------------------------------
  // 10. SSRF & Open Redirects (A10)
  // -------------------------------------------------------------------------
  console.log(`\n▶ [ENGINE 10] SSRF & Open Redirects...`);
  const redirectProbes = [
    { name: '?redirect parameter', query: '?redirect=https://evil-attacker-site.com', key: 'evil-attacker-site.com' },
    { name: '?url parameter', query: '?url=https://evil-attacker-site.com', key: 'evil-attacker-site.com' },
    { name: '?next parameter', query: '?next=//evil-attacker-site.com', key: 'evil-attacker-site.com' },
    { name: 'SSRF AWS Metadata IP callback', query: '?callback=http://169.254.169.254/latest/meta-data/', key: '169.254.169.254' },
  ];

  for (const p of redirectProbes) {
    const pUrl = `${TARGET_URL}/${p.query}`;
    const pRes = await requestUrl(pUrl);
    const loc = pRes.headers['location'] || '';
    const isOpenRedirect = loc.includes(p.key);

    logFinding({
      code: 'A10-SSRF',
      principle: 'SSRF & Open Redirects',
      name: `Untrusted Destination Handling (${p.name})`,
      status: isOpenRedirect ? 'FAIL' : 'PASS',
      severity: isOpenRedirect ? 'Critical' : 'High',
      action: `Sent request with untrusted destination parameter: ${pUrl}`,
      rationale: 'Verify that arbitrary external domains or cloud metadata IP addresses (169.254.169.254) cannot be targeted via callback/redirect parameters.',
      expected: 'Untrusted URL ignored, sanitized, or rejected with HTTP 400. Location header must NOT point to attacker domain.',
      actual: isOpenRedirect ? `VULNERABILITY: Location header redirects to ${loc}` : `Safe: Received HTTP ${pRes.statusCode} without redirection to ${p.key}.`,
      evidence: `HTTP Status: ${pRes.statusCode}\nLocation Header: ${loc || 'None'}\nLatency: ${pRes.latencyMs}ms`,
      analysis: isOpenRedirect ? 'Critical Open Redirect vulnerability!' : 'Untrusted external redirection is blocked.',
    });
  }

  // -------------------------------------------------------------------------
  // 11. CORS Security
  // -------------------------------------------------------------------------
  console.log(`\n▶ [ENGINE 11] Cross-Origin Resource Sharing (CORS)...`);
  const attackerOrigin = 'https://evil-attacker-website.com';
  const corsRes = await requestUrl(TARGET_URL, {
    headers: { Origin: attackerOrigin },
  });

  const acao = corsRes.headers['access-control-allow-origin'];
  const acac = corsRes.headers['access-control-allow-credentials'];
  const isVulnerableCors = acao === attackerOrigin && acac === 'true';

  logFinding({
    code: 'CORS-01',
    principle: 'Cross-Origin Security',
    name: 'Arbitrary Origin Reflection & Credentials Check',
    status: isVulnerableCors ? 'FAIL' : 'PASS',
    severity: isVulnerableCors ? 'Critical' : 'High',
    action: `Sent request with header [Origin: ${attackerOrigin}] to ${TARGET_URL}`,
    rationale: 'Verify the server does not blindly reflect arbitrary untrusted Origins while permitting authenticated credentials (cookies/tokens).',
    expected: 'Access-Control-Allow-Origin should NOT reflect untrusted origin with Allow-Credentials: true.',
    actual: isVulnerableCors ? `CRITICAL VULNERABILITY: Reflected ${acao} with Access-Control-Allow-Credentials: true!` : `Safe: Server returned ACAO="${acao || 'None'}", ACAC="${acac || 'None'}".`,
    evidence: `Request Origin: ${attackerOrigin}\nResponse ACAO: ${acao || 'None'}\nResponse ACAC: ${acac || 'None'}\nLatency: ${corsRes.latencyMs}ms`,
    analysis: isVulnerableCors ? 'CORS misconfiguration allows malicious websites to steal authenticated user data.' : 'CORS policy correctly prevents unauthorized cross-origin data theft.',
  });

  // -------------------------------------------------------------------------
  // 12. Broken Object-Level Authorization (BOLA / IDOR) & Multi-Tenant Isolation
  // -------------------------------------------------------------------------
  console.log(`\n▶ [ENGINE 12] Broken Object-Level Authorization (BOLA / IDOR)...`);

  // Probing a randomly-invented id only ever proves "404 on a nonexistent row".
  // Instead: use the authenticated session to find a REAL object, confirm the
  // owner can read it (positive control), then try to reach that same real
  // object with broken credentials.
  let realObjectId = null;
  let ownerCanRead = false;

  if (HAS_AUTH) {
    const listRes = await requestUrl(resolveUrl(HERCULES_ENDPOINTS.CAMPAIGNS.GET_HISTORY), { headers: AUTH_HEADERS });
    if (listRes.statusCode === 200 && isJsonResponse(listRes)) {
      try {
        const parsed = JSON.parse(listRes.body);
        const rows = Array.isArray(parsed) ? parsed : (parsed.chats || parsed.data || parsed.results || []);
        const first = rows.find((r) => r && (r.id || r.chatId || r._id));
        if (first) realObjectId = first.id || first.chatId || first._id;
      } catch (e) {
        console.warn(`[Engine 12] Could not parse chat list: ${e.message}`);
      }
    }

    if (realObjectId) {
      const ownerRes = await requestUrl(resolveUrl(HERCULES_ENDPOINTS.CAMPAIGNS.GET_CHAT_BY_ID(realObjectId)), { headers: AUTH_HEADERS });
      ownerCanRead = ownerRes.statusCode === 200;
      logFinding({
        code: 'BOLA-00',
        principle: 'Broken Object Level Auth (IDOR)',
        name: 'Positive Control: Owner Can Read Their Own Object',
        status: ownerCanRead ? 'PASS' : 'INCONCLUSIVE',
        severity: 'Info',
        action: `Read the authenticated user's own object: ${HERCULES_ENDPOINTS.CAMPAIGNS.GET_CHAT_BY_ID(realObjectId)}`,
        rationale: 'The cross-tenant checks below are only meaningful if the object id is real and the endpoint serves it to its owner. Without this control, a 404 to an attacker is indistinguishable from a 404 to everyone.',
        expected: 'HTTP 200 for the legitimate owner.',
        actual: ownerCanRead
          ? `Owner read their own object successfully (HTTP 200). Cross-tenant probes below are therefore meaningful.`
          : `Owner received HTTP ${ownerRes.statusCode}; the object id could not be confirmed as live, so the probes below prove little.`,
        evidence: `Object id: ${realObjectId}\nOwner request status: HTTP ${ownerRes.statusCode}\nLatency: ${ownerRes.latencyMs}ms`,
        analysis: ownerCanRead ? 'Positive control established.' : 'Positive control failed: treat the BOLA results below as unverified.',
      });
    }
  }

  const forgedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhdHRhY2tlciIsInRlbmFudElkIjoidW5hdXRob3JpemVkX29yZyJ9.invalid_signature_probe';

  if (realObjectId && ownerCanRead) {
    // The real test: same real object, broken credentials.
    const attackVectors = [
      { name: 'No credentials at all', headers: {} },
      { name: 'Forged/unsigned bearer token', headers: { Authorization: `Bearer ${forgedToken}` } },
      { name: 'Valid session + tampered tenant header', headers: { ...AUTH_HEADERS, 'X-Tenant-ID': 'unauthorized_tenant_probe' } },
    ];

    for (const vector of attackVectors) {
      const url = resolveUrl(HERCULES_ENDPOINTS.CAMPAIGNS.GET_CHAT_BY_ID(realObjectId));
      const res = await requestUrl(url, { headers: { ...vector.headers, Accept: 'application/json' } });
      const verdict = evaluateAuthRejection(res);
      // A tampered tenant header on an otherwise valid session is expected to
      // succeed for the session's own object; the header must simply be ignored.
      const isOwnSessionVector = vector.name.startsWith('Valid session');
      const status = isOwnSessionVector && res.statusCode === 200 ? 'PASS' : verdict.status;

      logFinding({
        code: 'BOLA-01',
        principle: 'Broken Object Level Auth (IDOR)',
        name: `Object Authorization: ${vector.name}`,
        status,
        severity: status === 'FAIL' ? 'Critical' : status === 'WARN' ? 'High' : 'Info',
        action: `Requested the real object ${realObjectId} (owned by the authenticated test user) using: ${vector.name}.`,
        rationale: 'Object-level authorization must be re-checked on every request against the caller identity, not inferred from a client-supplied tenant hint (OWASP API #1).',
        expected: isOwnSessionVector
          ? 'HTTP 200 for the true owner, with the client-supplied X-Tenant-ID hint ignored.'
          : 'HTTP 401 or 403; the object must not be returned.',
        actual: isOwnSessionVector && res.statusCode === 200
          ? 'Owner served their own object; the tampered tenant header did not change the outcome.'
          : verdict.detail,
        evidence: `Object id: ${realObjectId} (confirmed live via positive control)\nVector: ${vector.name}\nStatus: HTTP ${res.statusCode}\nContent-Type: ${res.headers['content-type'] || 'none'}\nBody bytes: ${res.body ? res.body.length : 0}\nLatency: ${res.latencyMs}ms`,
        analysis: status === 'FAIL'
          ? 'BOLA/IDOR confirmed against a real object: authorization is not enforced per request.'
          : status === 'PASS'
            ? 'Object access was correctly denied to a broken credential (verified against a real, live object).'
            : verdict.detail,
      });
    }
  } else {
    logFinding({
      code: 'BOLA-01',
      principle: 'Broken Object Level Auth (IDOR)',
      name: 'Cross-Tenant Object Isolation',
      status: 'INCONCLUSIVE',
      severity: 'Info',
      action: HAS_AUTH
        ? `Attempted to enumerate a real object via ${HERCULES_ENDPOINTS.CAMPAIGNS.GET_HISTORY} to probe against.`
        : 'No authenticated session available, so no real object could be identified.',
      rationale: 'A BOLA test requires a real object owned by a known principal. Firing at invented ids only measures 404 behaviour.',
      expected: 'A live object id plus a confirmed owner read, then denial for broken credentials.',
      actual: HAS_AUTH
        ? `Could not identify a real object id${realObjectId ? ` (id ${realObjectId} found but the owner read returned non-200)` : ' from the chat history endpoint'}. No cross-tenant conclusion drawn.`
        : 'No authenticated session: supply SECURITY_STORAGE_STATE or .auth/apple-user.json, or run tests/security/StatefulSessionSecurity.spec.js which provisions two real tenants.',
      evidence: `HAS_AUTH: ${HAS_AUTH}\nReal object id: ${realObjectId || 'none'}\nOwner could read: ${ownerCanRead}`,
      analysis: 'Reported as inconclusive rather than passing. For a true two-tenant test see SEC-AUTH-01 in tests/security/StatefulSessionSecurity.spec.js.',
    });
  }

  // -------------------------------------------------------------------------
  // 13. Rate Limiting & Anti-Brute-Force Abuse Controls
  // -------------------------------------------------------------------------
  console.log(`\n▶ [ENGINE 13] Rate Limiting & Anti-Brute-Force Controls...`);
  const rateLimitTargets = [
    { 
      name: 'Email Signup & Verification OTP Rate Guard', 
      path: HERCULES_ENDPOINTS.AUTH.SIGNUP_OTP, 
      method: 'POST', 
      body: JSON.stringify({ email: 'rate_limit_probe@kzdzyaot.mailosaur.net' }) 
    },
    { 
      name: 'AI Workspace Prompt & Chat Stream Rate Guard', 
      path: HERCULES_ENDPOINTS.AI_CHAT.CHAT, 
      method: 'POST', 
      body: JSON.stringify({ message: 'Create survey burst probe' }) 
    },
    { 
      name: 'AI Question Generation Rate Guard', 
      path: HERCULES_ENDPOINTS.SURVEY.GENERATE_QUESTIONS, 
      method: 'POST', 
      body: JSON.stringify({ prompt: 'probe_test_rate_limit' }) 
    },
  ];

  for (const r of rateLimitTargets) {
    const burstCount = 15;
    const rUrl = resolveUrl(r.path);
    const burstPromises = Array.from({ length: burstCount }, () =>
      requestUrl(rUrl, {
        method: r.method,
        headers: { 'Content-Type': 'application/json' },
        body: r.body,
      })
    );

    const burstResults = await Promise.all(burstPromises);
    const has429 = burstResults.some((res) => res.statusCode === 429);
    const hasRateHeaders = burstResults.some((res) =>
      Object.keys(res.headers).some((h) => h.toLowerCase().includes('ratelimit') || h.toLowerCase().includes('retry-after'))
    );
    const avgLatency = Math.round(burstResults.reduce((acc, c) => acc + c.latencyMs, 0) / burstCount);

    const has500 = burstResults.some((res) => res.statusCode >= 500);
    const codes = Array.from(new Set(burstResults.map((b) => b.statusCode)));
    const acceptedCount = burstResults.filter((res) => res.statusCode === 200).length;
    const throttled = has429 || hasRateHeaders;
    // Endpoints that reject every request (401/404) never exercised a limiter.
    const everyRequestRejected = burstResults.every((res) => [401, 403, 404, 405].includes(res.statusCode));

    let rateStatus;
    let rateDetail;
    if (has500) {
      rateStatus = 'FAIL';
      rateDetail = `Burst caused server errors (${codes.join(', ')}): the endpoint degrades under concurrency instead of shedding load.`;
    } else if (throttled) {
      rateStatus = 'PASS';
      rateDetail = `Throttling observed: ${has429 ? 'HTTP 429 returned' : 'no 429'}${hasRateHeaders ? ', rate-limit/retry-after headers present' : ''}.`;
    } else if (everyRequestRejected) {
      rateStatus = 'INCONCLUSIVE';
      rateDetail = `Every request was rejected upfront (${codes.join(', ')}), so no rate limiter was exercised. This measures nothing about abuse control.`;
    } else {
      // The important correction: absorbing the burst is the ABSENCE of a limit.
      rateStatus = 'WARN';
      rateDetail = `No throttling signal: ${acceptedCount}/${burstCount} concurrent requests were accepted (statuses ${codes.join(', ')}) with no 429 and no rate-limit headers. Either the threshold exceeds ${burstCount} concurrent requests or no limit is enforced.`;
    }

    logFinding({
      code: 'RATE-01',
      principle: 'Rate Limiting & Anti-Automation',
      name: `Abuse Prevention: ${r.name}`,
      status: rateStatus,
      severity: rateStatus === 'FAIL' ? 'High' : rateStatus === 'WARN' ? 'Medium' : 'Info',
      action: `Dispatched a burst of ${burstCount} concurrent ${r.method} requests to: ${rUrl}`,
      rationale: 'Authentication and submission APIs need enforced rate limits against brute force, credential stuffing and bot spam. Absorbing a burst without complaint is evidence of a missing limit, not of resilience.',
      expected: `HTTP 429 or rate-limit/retry-after headers once the burst exceeds the threshold, and no 5xx.`,
      actual: rateDetail,
      evidence: `Burst size: ${burstCount}\nStatus codes: ${codes.join(', ')}\n200 responses: ${acceptedCount}\n429 observed: ${has429}\nRate-limit headers: ${hasRateHeaders}\nAvg latency: ${avgLatency}ms`,
      analysis: rateStatus === 'PASS'
        ? 'Rate limiting is enforced and observable on this endpoint.'
        : rateStatus === 'WARN'
          ? `Raise the burst size to locate the threshold, or add a limiter. ${acceptedCount} accepted requests in one burst is an abuse path for OTP/email endpoints.`
          : rateDetail,
    });
  }

  // -------------------------------------------------------------------------
  // 14. JWT Security & Session Lifecycle Cryptography
  // -------------------------------------------------------------------------
  console.log(`\n▶ [ENGINE 14] JWT Security & Session Lifecycle Cryptography...`);
  
  // Helper for base64url
  const b64Url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  // A. alg: none signature bypass token
  const algNoneToken = `${b64Url({ alg: 'none', typ: 'JWT' })}.${b64Url({ sub: 'admin', role: 'superuser', exp: Math.floor(Date.now() / 1000) + 3600 })}.`;
  const algNoneRes = await requestUrl(resolveUrl(HERCULES_ENDPOINTS.ACCOUNT.GET_DETAILS), {
    headers: { 'Authorization': `Bearer ${algNoneToken}` },
  });
  const algNoneVerdict = evaluateAuthRejection(algNoneRes);
  // An unsigned token must never elevate: also check the claimed role is not echoed back.
  const algNoneEcho = /"(?:role|isAdmin|is_admin|superuser)"\s*:\s*(?:"superuser"|true)/i.test(algNoneRes.body || '');
  const algNoneStatus = algNoneEcho ? 'FAIL' : algNoneVerdict.status;

  logFinding({
    code: 'JWT-01',
    principle: 'Cryptographic Session Security',
    name: 'JWT Algorithm Confusion (alg: none) Bypass',
    status: algNoneStatus,
    severity: algNoneStatus === 'FAIL' ? 'Critical' : algNoneStatus === 'WARN' ? 'High' : 'Info',
    action: `Sent an unsigned JWT (alg:none, role=superuser) to: ${resolveUrl(HERCULES_ENDPOINTS.ACCOUNT.GET_DETAILS)}`,
    rationale: 'JWT verification must enforce the expected signing algorithm and reject unsigned tokens, rather than trusting the header supplied by the caller.',
    expected: 'HTTP 401 or 403, with no account data and no elevated claims echoed back.',
    actual: algNoneEcho
      ? 'CRITICAL: the forged superuser/admin claim was reflected in the response body.'
      : algNoneVerdict.detail,
    evidence: `Token header: {"alg":"none","typ":"JWT"}\nStatus: HTTP ${algNoneRes.statusCode}\nContent-Type: ${algNoneRes.headers['content-type'] || 'none'}\nElevated claim echoed: ${algNoneEcho}\nPrivate-data indicators: ${findPrivateData(algNoneRes.body, isJsonResponse(algNoneRes)).join(', ') || 'none'}\nLatency: ${algNoneRes.latencyMs}ms`,
    analysis: algNoneStatus === 'PASS'
      ? 'Unsigned tokens are rejected at the auth boundary.'
      : algNoneStatus === 'FAIL'
        ? 'Signature verification is not enforced: an attacker can mint arbitrary identities.'
        : algNoneVerdict.detail,
  });

  // B. Expired Token Validation
  const expiredToken = `${b64Url({ alg: 'HS256', typ: 'JWT' })}.${b64Url({ sub: 'user_test', exp: Math.floor(Date.now() / 1000) - 7200 })}.tampered_signature_payload`;
  // /api/auth/sync is POST-only; a GET returns 405 and the probe would never
  // reach the expiry check.
  const expRes = await requestUrl(resolveUrl(HERCULES_ENDPOINTS.AUTH.SYNC), {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${expiredToken}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const expVerdict = evaluateAuthRejection(expRes);
  const expLoggedIn = /"(?:isLoggedIn|authenticated|isAuthenticated)"\s*:\s*true/i.test(expRes.body || '');
  const expStatus = expLoggedIn ? 'FAIL' : expVerdict.status;

  logFinding({
    code: 'JWT-02',
    principle: 'Cryptographic Session Security',
    name: 'Expired Session Token Rejection',
    status: expStatus,
    severity: expStatus === 'FAIL' ? 'Critical' : expStatus === 'WARN' ? 'High' : 'Info',
    action: `Sent an expired JWT (exp 7200s in the past) to: ${resolveUrl(HERCULES_ENDPOINTS.AUTH.SYNC)}`,
    rationale: 'Expired tokens must be rejected on every request; accepting them makes session revocation impossible.',
    expected: 'HTTP 401/403 and no authenticated session state in the body.',
    actual: expLoggedIn
      ? 'CRITICAL: the response reports an authenticated session for an expired token.'
      : expVerdict.detail,
    evidence: `Token exp: -7200s (past)\nStatus: HTTP ${expRes.statusCode}\nContent-Type: ${expRes.headers['content-type'] || 'none'}\nSession asserted in body: ${expLoggedIn}\nLatency: ${expRes.latencyMs}ms`,
    analysis: expStatus === 'PASS'
      ? 'Token expiry is enforced at the auth boundary.'
      : expStatus === 'FAIL'
        ? 'Expired tokens are honoured: sessions cannot be reliably expired or revoked.'
        : expVerdict.detail,
  });

  // -------------------------------------------------------------------------
  // 15. Business Logic & State Manipulation Integrity
  // -------------------------------------------------------------------------
  console.log(`\n▶ [ENGINE 15] Business Logic & State Manipulation Integrity...`);
  
  // A. Mass Assignment & Parameter Pollution.
  //    Probing the marketing root with ?isAdmin=true proves nothing: no backend
  //    reads it. This compares the authenticated account state returned with and
  //    without injected privilege parameters, which is a read-only test that can
  //    actually fail. Nothing here mutates account state.
  if (HAS_AUTH) {
    const accountUrl = resolveUrl(HERCULES_ENDPOINTS.ACCOUNT.GET_DETAILS);
    const baselineRes = await requestUrl(accountUrl, { headers: { ...AUTH_HEADERS, Accept: 'application/json' } });
    const pollutedRes = await requestUrl(
      `${accountUrl}?isAdmin=true&role=superuser&plan=enterprise_unlimited&quota=999999&credits=999999`,
      { headers: { ...AUTH_HEADERS, Accept: 'application/json' } }
    );

    const baselineState = classifyProbe(baselineRes);
    const pollutedElevated = /"(?:role|isAdmin|is_admin)"\s*:\s*(?:"superuser"|true)/i.test(pollutedRes.body || '')
      && !/"(?:role|isAdmin|is_admin)"\s*:\s*(?:"superuser"|true)/i.test(baselineRes.body || '');
    const bodiesDiffer = (baselineRes.body || '') !== (pollutedRes.body || '');

    let bizStatus;
    let bizDetail;
    if (baselineState !== 'EXERCISED') {
      bizStatus = 'INCONCLUSIVE';
      bizDetail = `Baseline account read did not reach the API (${PROBE_STATE_LABEL[baselineState]}); the stored session may be expired. No conclusion drawn.`;
    } else if (pollutedElevated) {
      bizStatus = 'FAIL';
      bizDetail = 'Injected privilege parameters changed the returned account role/admin flag: mass assignment is possible via the query string.';
    } else if (bodiesDiffer) {
      bizStatus = 'WARN';
      bizDetail = 'Injected parameters altered the response body without granting an obvious privilege. Review which fields the query string can influence.';
    } else {
      bizStatus = 'PASS';
      bizDetail = 'Account state was byte-identical with and without the injected privilege parameters: the query string does not bind to the account model.';
    }

    logFinding({
      code: 'BIZ-01',
      principle: 'Business Logic Security',
      name: 'Mass Assignment & Parameter Pollution (authenticated read-back)',
      status: bizStatus,
      severity: bizStatus === 'FAIL' ? 'Critical' : bizStatus === 'WARN' ? 'Medium' : 'Info',
      action: `Read ${HERCULES_ENDPOINTS.ACCOUNT.GET_DETAILS} with an authenticated session, then re-read it with [?isAdmin=true&role=superuser&plan=enterprise_unlimited] and compared the two responses.`,
      rationale: 'Request parameters must not bind to privileged model fields such as role, admin flags, plan tier, or credit balance.',
      expected: 'Identical account state regardless of injected privilege parameters.',
      actual: bizDetail,
      evidence: `Baseline: HTTP ${baselineRes.statusCode} (${baselineRes.body ? baselineRes.body.length : 0} bytes)\nPolluted: HTTP ${pollutedRes.statusCode} (${pollutedRes.body ? pollutedRes.body.length : 0} bytes)\nBodies differ: ${bodiesDiffer}\nElevated claim appeared: ${pollutedElevated}`,
      analysis: bizStatus === 'PASS'
        ? 'No parameter-to-model binding observed on the account read path.'
        : bizDetail,
    });
  } else {
    logFinding({
      code: 'BIZ-01',
      principle: 'Business Logic Security',
      name: 'Mass Assignment & Parameter Pollution',
      status: 'INCONCLUSIVE',
      severity: 'Info',
      action: 'Mass-assignment probe requires an authenticated session to read account state back.',
      rationale: 'Privilege escalation via parameter binding can only be observed against real account state.',
      expected: 'An authenticated baseline read to compare against.',
      actual: 'No authenticated session supplied, so no read-back comparison was possible. Set SECURITY_STORAGE_STATE or populate .auth/.',
      evidence: 'HAS_AUTH: false',
      analysis: 'Reported inconclusive rather than passing: sending privilege parameters to an unauthenticated static page tests nothing.',
    });
  }

  // B. Negative / out-of-bounds numeric integrity against the real cost estimator.
  //    Read-only: this asks for an estimate and never deducts credits.
  const estimateBody = JSON.stringify({ sampleSize: -100, reward: -5000, credits: 'NaN', price: -99.99 });
  const estimateRes = await requestUrl(resolveUrl(HERCULES_ENDPOINTS.BILLING.ESTIMATE_COST), {
    method: 'POST',
    headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: estimateBody,
  });
  const estimateState = classifyProbe(estimateRes);
  const negativeCost = /"(?:cost|total|amount|credits|price)"\s*:\s*-\d/i.test(estimateRes.body || '');
  const nanCost = /"(?:cost|total|amount|credits|price)"\s*:\s*(?:"?NaN"?|null)/i.test(estimateRes.body || '');

  let oobStatus;
  let oobDetail;
  if (estimateState !== 'EXERCISED') {
    oobStatus = 'INCONCLUSIVE';
    oobDetail = `Estimator did not evaluate the payload (${PROBE_STATE_LABEL[estimateState]}).`;
  } else if (negativeCost || nanCost) {
    oobStatus = 'FAIL';
    oobDetail = `Estimator returned a ${negativeCost ? 'negative' : 'NaN/null'} monetary value for negative inputs: pricing logic accepts out-of-bounds values.`;
  } else if (estimateRes.statusCode >= 500) {
    oobStatus = 'WARN';
    oobDetail = `Estimator returned HTTP ${estimateRes.statusCode} instead of validating the input and rejecting it with 400/422.`;
  } else {
    oobStatus = 'PASS';
    oobDetail = `Estimator handled negative/NaN inputs with HTTP ${estimateRes.statusCode} and produced no negative or NaN monetary value.`;
  }

  logFinding({
    code: 'BIZ-02',
    principle: 'Business Logic Security',
    name: 'Negative & Out-of-Bounds Numeric Integrity (cost estimator)',
    status: oobStatus,
    severity: oobStatus === 'FAIL' ? 'High' : oobStatus === 'WARN' ? 'Low' : 'Info',
    action: `POSTed [sampleSize=-100, reward=-5000, credits=NaN, price=-99.99] to the read-only estimator ${resolveUrl(HERCULES_ENDPOINTS.BILLING.ESTIMATE_COST)}.`,
    rationale: 'Pricing and reward maths must reject negative and non-numeric inputs; a negative cost can invert a charge into a credit.',
    expected: 'HTTP 400/422 rejection, or a non-negative numeric result. Never a negative or NaN monetary value.',
    actual: oobDetail,
    evidence: `Payload: ${estimateBody}\nStatus: HTTP ${estimateRes.statusCode}\nProbe state: ${estimateState}\nNegative value returned: ${negativeCost}\nNaN/null value returned: ${nanCost}\nBody preview: ${(estimateRes.body || '').slice(0, 250).replace(/\s+/g, ' ')}`,
    analysis: oobStatus === 'PASS' ? 'Numeric validation holds on the cost estimation path.' : oobDetail,
  });

  // -------------------------------------------------------------------------
  // 16. File Upload & Media Payload Validation Defenses
  // -------------------------------------------------------------------------
  console.log(`\n▶ [ENGINE 16] File Upload & Media Payload Validation Defenses...`);
  
  // A. Oversized payload protection. A 404/405 here means there is no upload
  //    endpoint at this path, so no body-size limit was exercised.
  const oversizedData = 'X'.repeat(5 * 1024 * 1024); // 5 MB payload
  const oversizeRes = await requestUrl(resolveUrl('/api/upload'), {
    method: 'POST',
    headers: { ...AUTH_HEADERS, 'Content-Type': 'application/octet-stream' },
    body: oversizedData,
  });
  const oversizeBounded = [413, 400, 422, 429].includes(oversizeRes.statusCode);
  const oversizeAbsent = [404, 405].includes(oversizeRes.statusCode);

  logFinding({
    code: 'FILE-01',
    principle: 'Input Validation & DoS Defense',
    name: 'Oversized Payload Body-Size Limit',
    status: oversizeBounded ? 'PASS' : oversizeAbsent ? 'INCONCLUSIVE' : oversizeRes.statusCode >= 500 ? 'FAIL' : 'WARN',
    severity: oversizeRes.statusCode >= 500 ? 'High' : oversizeAbsent ? 'Info' : 'Medium',
    action: `POSTed a 5MB body to ${resolveUrl('/api/upload')}.`,
    rationale: 'The gateway should bound request entity size (HTTP 413) so a large body cannot exhaust backend memory.',
    expected: 'HTTP 413 Payload Too Large, or another explicit rejection (400/422/429).',
    actual: oversizeBounded
      ? `Gateway bounded the request with HTTP ${oversizeRes.statusCode}.`
      : oversizeAbsent
        ? `HTTP ${oversizeRes.statusCode}: no upload handler at this path, so no body-size limit was exercised. Point this probe at the real upload endpoint to test it.`
        : oversizeRes.statusCode >= 500
          ? `HTTP ${oversizeRes.statusCode}: the oversized body reached code that failed instead of being rejected at the edge.`
          : `HTTP ${oversizeRes.statusCode}: the 5MB body was accepted without an explicit size rejection.`,
    evidence: `Payload size: 5,242,880 bytes\nStatus: HTTP ${oversizeRes.statusCode}\nProbe state: ${classifyProbe(oversizeRes)}\nLatency: ${oversizeRes.latencyMs}ms`,
    analysis: oversizeBounded
      ? 'Request entity size is bounded before reaching application code.'
      : oversizeAbsent
        ? 'Not a finding: nothing was tested because the endpoint does not exist on this deployment.'
        : 'Review the reverse-proxy client_max_body_size / gateway request limit.',
  });

  // B. Reflected SVG/script payload. Checked across the real parameterized
  //    endpoints; a payload that is never reflected anywhere is inconclusive,
  //    not a pass. Stored-SVG XSS needs the authenticated upload endpoint and
  //    is out of scope for this HTTP-only engine.
  const maliciousSvg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(\'XSS\')"><script>alert(1)</script></svg>';
  logFinding(await runInjectionProbe({
    code: 'FILE-02',
    principle: 'Input Validation & Reflected XSS',
    name: 'Reflected SVG / Script Payload Sanitisation',
    payload: maliciousSvg,
    rationale: 'A reflected value containing markup must be escaped; unescaped <script> or an svg onload handler in an HTML response is executable XSS.',
    expected: 'Payload escaped or dropped; no executable markup echoed into an HTML response.',
    detect: (res) => {
      const body = res.body || '';
      if (!isHtmlResponse(res)) {
        // Reflected inside JSON is not directly executable.
        return { vulnerable: false, detail: 'payload not reflected into an HTML context' };
      }
      if (body.includes('<script>alert(1)</script>')) {
        return { vulnerable: true, detail: 'raw <script> tag reflected unescaped into HTML' };
      }
      if (/<svg[^>]+onload\s*=/i.test(body)) {
        return { vulnerable: true, detail: 'svg onload handler reflected unescaped into HTML' };
      }
      return { vulnerable: false, detail: 'markup escaped or dropped' };
    },
  }));

  // -------------------------------------------------------------------------
  // Generate & Export Standardized Report, then gate the build
  // -------------------------------------------------------------------------
  const reportPath = reporter.generateHtmlReport('dast-security-audit-report.html');
  const metrics = reporter.getMetrics();
  const blocking = reporter.getBlockingFindings();

  console.log(`\n======================================================================`);
  console.log(`  SECURITY AUDIT COMPLETED`);
  console.log(`   Web / Core API / AI API: ${TARGETS.WEB_BASE} | ${TARGETS.CORE_API_BASE} | ${TARGETS.AI_API_BASE}`);
  console.log(`   Session:                ${HAS_AUTH ? `authenticated (${AUTH.source})` : 'UNAUTHENTICATED'}`);
  console.log(`   Controls executed:      ${metrics.totalCount}`);
  console.log(`   Reached a verdict:      ${metrics.assessedCount}`);
  console.log(`   Pass rate (assessed):   ${metrics.complianceScore}%  (${metrics.passCount}/${metrics.assessedCount})`);
  console.log(`   Hardening warnings:     ${metrics.warnCount}`);
  console.log(`   Inconclusive (no sink): ${metrics.inconclusiveCount}`);
  console.log(`   Triaged / suppressed:   ${metrics.suppressedCount}`);
  console.log(`   Expired suppressions:   ${metrics.expiredSuppressionCount}`);
  console.log(`   FAILURES:               ${metrics.failCount}`);
  console.log(`   Report:                 ${reportPath}`);
  console.log(`======================================================================`);

  if (!session.live) {
    console.log(
      `\n  COVERAGE WARNING: ${session.reason}.\n` +
      `  Authenticated authorization, BOLA, injection and business-logic controls could\n` +
      `  not reach authenticated code paths and are reported INCONCLUSIVE, not PASS.\n` +
      `  Refresh the session (npx playwright test tests/auth.setup.js) or set\n` +
      `  SECURITY_STORAGE_STATE=/path/to/storage-state.json, then re-run.`
    );
  }

  if (blocking.length > 0) {
    console.error(`\n  BLOCKING FINDINGS (${blocking.length}) — failing the build:`);
    for (const f of blocking) {
      const why = f.suppressionExpired ? `${f.status}, suppression expired ${f.suppressionExpiresAt}` : f.status;
      console.error(`   • [${why}] ${f.code} — ${f.name}`);
      console.error(`     ${f.actual}`);
    }
    console.error('');
  }

  // The gate. Previously this function returned normally no matter what was
  // found, so a FAIL finding printed an X and the CI step still went green.
  // ---- Regression baseline -------------------------------------------------
  // Without this the suite reports state but not change: a control degrading
  // from PASS to WARN is invisible unless somebody reads the HTML.
  const baseline = new FindingsBaseline();
  const diff = baseline.diff(reporter.records);
  console.log('\n  BASELINE COMPARISON');
  console.log(FindingsBaseline.formatDiff(diff));

  const baselineAccepted = process.env.UPDATE_SECURITY_BASELINE === 'true' || diff.isFirstRun;
  if (baselineAccepted) {
    const written = baseline.save(reporter.records, {
      target: TARGETS.WEB_BASE,
      sessionLive: session.live,
    });
    console.log(`  Baseline written to ${written}`);
  } else if (diff.regressions.length > 0) {
    console.log(
      '  Baseline NOT updated: regressions present. Fix them, or re-run with ' +
      'UPDATE_SECURITY_BASELINE=true to accept the new state deliberately.'
    );
  }

  const exitCode = reporter.getExitCode();
  // A control that got worse is a regression even when its new status is not
  // itself blocking (e.g. PASS -> WARN).
  // Regressions block, unless the operator explicitly accepted the new state
  // via UPDATE_SECURITY_BASELINE (or this is the first run establishing it).
  const blockOnRegression = !baselineAccepted && diff.regressions.length > 0;
  const finalExit = exitCode === 0 && blockOnRegression ? 1 : exitCode;
  if (finalExit !== exitCode) {
    console.error(`  Gate: FAILED on ${diff.regressions.length} baseline regression(s) despite no FAIL findings.`);
  } else if (baselineAccepted && diff.regressions.length > 0) {
    console.log(`  ${diff.regressions.length} regression(s) accepted into the baseline by UPDATE_SECURITY_BASELINE.`);
  }
  console.log(finalExit === 0 ? '  Gate: PASSED (no blocking findings, no regressions)\n' : `  Gate: FAILED (exit ${finalExit})\n`);
  return finalExit;
}

// Run, and propagate the gate result to the process exit code so CI can block.
runSecurityAudit()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((err) => {
    // A crashed audit is not a passing audit.
    console.error('\n  SECURITY AUDIT CRASHED — failing closed.');
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  });
