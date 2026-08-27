/**
 * ScopeGuard.js
 * Authorization and Target Scope Enforcement for DAST and Security Auditing
 */

const ALLOWED_TARGET_PATTERNS = [
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  /^https?:\/\/([a-zA-Z0-9-]+\.)*hercules\.works$/,
  /^https?:\/\/([a-zA-Z0-9-]+\.)*superj\.app$/
];

class ScopeGuard {
  /**
   * Validates whether a target URL is in scope for security fuzzing/DAST testing.
   * @param {string} targetUrl
   * @param {object} options - { allowInsecureOverride: boolean }
   * @returns {{ inScope: boolean, hostname: string, message: string }}
   */
  static validateScope(targetUrl, options = {}) {
    if (!targetUrl || typeof targetUrl !== 'string') {
      throw new Error(`[ScopeGuard] Invalid target URL provided: ${targetUrl}`);
    }

    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (e) {
      throw new Error(`[ScopeGuard] Malformed target URL: ${targetUrl}`);
    }

    const origin = parsed.origin;
    const isAllowed = ALLOWED_TARGET_PATTERNS.some(pattern => pattern.test(origin));

    if (!isAllowed) {
      if (options.allowInsecureOverride || process.env.ALLOW_OUT_OF_SCOPE_TARGET === 'true') {
        console.warn(`\n⚠️  [ScopeGuard WARNING] Target ${origin} is outside default allowlist but explicitly overridden by environment variable.\n`);
        return { inScope: true, hostname: parsed.hostname, origin, overridden: true };
      }

      const errorMsg = `[ScopeGuard ABORT] Target "${origin}" is not in the authorized test scope allowlist.\n` +
        `Authorized Patterns: localhost, 127.0.0.1, *.hercules.works, *.superj.app\n` +
        `To run against custom staging targets, set ALLOW_OUT_OF_SCOPE_TARGET=true explicitly.`;
      
      throw new Error(errorMsg);
    }

    return { inScope: true, hostname: parsed.hostname, origin, overridden: false };
  }
}

module.exports = ScopeGuard;
