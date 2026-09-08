/**
 * securityTargets.js
 * Origin routing for the security suites.
 *
 * dev.hercules.works serves only the Next.js front end -- it hosts NO API. Every
 * /V2/* and /api/* path returns the SPA's HTML 404 page there. Probing API paths
 * against the web origin therefore tests nothing, which is how the previous
 * suite manufactured passes: a 404 from a host with no API looks identical to a
 * hardened endpoint.
 *
 * Verified 2026-09-07 against dev:
 *   /V2/*   -> devapi.hercules.works      (401 JSON when protected, 200 when public)
 *   /api/*  -> devapi-ai.hercules.works   (401 JSON when protected, 200 when public)
 *   pages   -> dev.hercules.works
 */

const herculesConfig = require('./hercules.config');

const WEB_BASE = (process.env.TARGET_URL || herculesConfig.baseUrl || 'https://dev.hercules.works').replace(/\/$/, '');

/**
 * Derives the sibling API origins from the web origin so ENV=preprod/production
 * do not silently keep pointing at dev. Both are overridable.
 */
function deriveApiBases(webBase) {
  const { protocol, hostname } = new URL(webBase);
  // dev.hercules.works -> devapi / devapi-ai .hercules.works
  const labels = hostname.split('.');
  const envPrefix = labels.length > 2 ? labels[0] : '';
  const rootDomain = labels.length > 2 ? labels.slice(1).join('.') : hostname;

  return {
    core: `${protocol}//${envPrefix ? `${envPrefix}api` : 'api'}.${rootDomain}`,
    ai: `${protocol}//${envPrefix ? `${envPrefix}api-ai` : 'api-ai'}.${rootDomain}`,
    data: `${protocol}//${envPrefix ? `${envPrefix}api-data` : 'api-data'}.${rootDomain}`,
  };
}

const derived = deriveApiBases(WEB_BASE);
const CORE_API_BASE = (process.env.CORE_API_URL || derived.core).replace(/\/$/, '');
const AI_API_BASE = (process.env.AI_API_URL || derived.ai).replace(/\/$/, '');
const DATA_API_BASE = (process.env.DATA_API_URL || derived.data).replace(/\/$/, '');

/**
 * The front end does not call the API origins directly from the browser: it goes
 * through Next.js proxy routes on its own origin. Discovered 2026-09-08 in the
 * production bundles and verified live:
 *   /api/backend/<V2 path>      -> core API
 *   /api/ai-backend/<api path>  -> AI API
 *   /api/data-backend/<V2 path> -> data API
 *
 * This matters for security testing: the same resource is reachable by two
 * different paths, and a proxy is a classic place for authorization to diverge
 * from the origin it fronts (headers added, stripped, or trusted). Both paths
 * must be probed -- see tests/security/ApiPathParity.spec.js.
 */
const PROXY_PREFIXES = {
  core: '/api/backend',
  ai: '/api/ai-backend',
  data: '/api/data-backend',
};

/** Which backend a path belongs to. */
function backendFor(pathname) {
  if (pathname.startsWith('/V2/')) return 'core';
  if (pathname.startsWith('/api/') || pathname.startsWith('/analysis/')) return 'ai';
  return 'web';
}

/** Which origin owns a given path. */
function originFor(pathname) {
  const backend = backendFor(pathname);
  if (backend === 'core') return CORE_API_BASE;
  if (backend === 'ai') return AI_API_BASE;
  return WEB_BASE;
}

/**
 * The same endpoint addressed through the front end's Next.js proxy instead of
 * the API origin directly. Returns null for paths that are not proxied.
 */
function resolveViaProxy(pathname) {
  const backend = backendFor(pathname);
  if (backend === 'web') return null;
  return `${WEB_BASE}${PROXY_PREFIXES[backend]}${pathname}`;
}

/** Absolute URL for an endpoint path from config/herculesEndpoints. */
function resolveUrl(pathname) {
  if (/^https?:\/\//i.test(pathname)) return pathname;
  return `${originFor(pathname)}${pathname}`;
}

/** Human label for report evidence. */
function originLabel(pathname) {
  const origin = originFor(pathname);
  if (origin === CORE_API_BASE) return 'core-api';
  if (origin === AI_API_BASE) return 'ai-api';
  return 'web';
}

module.exports = {
  WEB_BASE,
  CORE_API_BASE,
  AI_API_BASE,
  DATA_API_BASE,
  PROXY_PREFIXES,
  ALL_ORIGINS: [WEB_BASE, CORE_API_BASE, AI_API_BASE, DATA_API_BASE],
  backendFor,
  originFor,
  resolveUrl,
  resolveViaProxy,
  originLabel,
};
