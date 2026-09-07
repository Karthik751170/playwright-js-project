/**
 * probeHelpers.js
 * Shared primitives for the security suites: session loading, reachability
 * classification, and private-data detection.
 *
 * Single source of truth so scripts/fullSecuritySuite.js and tests/security/*
 * cannot drift into disagreeing about what counts as a pass.
 */

const fs = require('fs');
const path = require('path');
const TARGETS = require('../../config/securityTargets');

/**
 * Loads a session from a Playwright storage state. Returns both the Cookie
 * header and the bearer token, because the Hercules APIs authenticate with
 * Authorization: Bearer while the browser keeps that token in a cookie.
 */
function loadSession(targetUrl = TARGETS.WEB_BASE) {
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
      if (scoped.length === 0) continue;

      const bearer = (scoped.find((c) => c.name === 'dragonAccessToken') || {}).value || null;
      return {
        header: scoped.map((c) => `${c.name}=${c.value}`).join('; '),
        bearer,
        source: path.relative(process.cwd(), authPath),
        count: scoped.length,
      };
    } catch (e) {
      // Fall through to the next candidate; the caller reports the absence.
    }
  }
  return null;
}

function authHeaders(session) {
  if (!session) return {};
  return {
    Cookie: session.header,
    ...(session.bearer ? { Authorization: `Bearer ${session.bearer}` } : {}),
  };
}

/** High-confidence private-data indicators. Narrow by design: a false positive costs trust. */
const PRIVATE_DATA_PATTERNS = [
  { name: 'JWT / bearer token', regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/ },
  { name: 'Credential field', regex: /"(?:access_?token|refresh_?token|id_?token|password|passwd|secret|api_?key|private_?key)"\s*:\s*"[^"]+"/i },
  { name: 'Session token field', regex: /"(?:dragonAccessToken|dragonRefreshToken)"\s*:\s*"[^"]+"/i },
];

const PII_PATTERNS = [
  { name: 'Email address', regex: /"[^"]*(?:email|mail)[^"]*"\s*:\s*"[^"@]+@[^"]+"/i },
  { name: 'Phone number', regex: /"(?:phone|mobile|contact_?number)"\s*:\s*"\+?\d[\d\s-]{6,}"/i },
];

/**
 * @param {string} body
 * @param {boolean} includePii Enable only for structured bodies. Marketing HTML
 *   legitimately contains contact addresses and would false-positive.
 */
function findPrivateData(body, includePii = false) {
  const patterns = includePii ? [...PRIVATE_DATA_PATTERNS, ...PII_PATTERNS] : PRIVATE_DATA_PATTERNS;
  return patterns.filter((p) => p.regex.test(body || '')).map((p) => p.name);
}

function contentType(headers) {
  return ((headers && (headers['content-type'] || headers['Content-Type'])) || '').toLowerCase();
}

const isJson = (headers) => contentType(headers).includes('application/json');
const isHtml = (headers) => contentType(headers).includes('text/html');

/**
 * Did the payload reach code that could act on it?
 *
 * The most important function here. A probe that was stopped at the auth
 * boundary, hit an absent route, or received the static SPA shell proves
 * nothing and must never be scored as a pass.
 */
function classifyProbe({ status, headers, error }) {
  if (!status) return 'TRANSPORT_ERROR';
  if (status === 401 || status === 403) return 'UNREACHABLE_AUTH';
  if (status === 404 || status === 405) return 'UNREACHABLE_ROUTE';
  if (status === 200 && isHtml(headers)) return 'UNREACHABLE_SHELL';
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
 * Confirms a session is actually usable before tests rely on it, so a stale
 * storage state surfaces as an explicit skip rather than a suite of
 * vacuously-passing assertions.
 */
async function verifySessionIsLive(requestContext, session) {
  if (!session) return { live: false, reason: 'no storage state found (set SECURITY_STORAGE_STATE or populate .auth/)' };
  const HERCULES_ENDPOINTS = require('../../config/herculesEndpoints');
  try {
    const res = await requestContext.get(TARGETS.resolveUrl(HERCULES_ENDPOINTS.ACCOUNT.GET_DETAILS), {
      headers: { ...authHeaders(session), Accept: 'application/json' },
      failOnStatusCode: false,
    });
    if (res.status() === 200) return { live: true, reason: 'account endpoint returned HTTP 200' };
    return { live: false, reason: `account endpoint returned HTTP ${res.status()} - stored session is expired or invalid` };
  } catch (e) {
    return { live: false, reason: `liveness probe failed: ${e.message}` };
  }
}

module.exports = {
  loadSession,
  authHeaders,
  findPrivateData,
  classifyProbe,
  PROBE_STATE_LABEL,
  PRIVATE_DATA_PATTERNS,
  PII_PATTERNS,
  isJson,
  isHtml,
  contentType,
  verifySessionIsLive,
};
