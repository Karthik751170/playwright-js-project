/**
 * globalSetup.js
 * Playwright Global Setup Hook for Universal Scope & Authorization Enforcement
 */

const ScopeGuard = require('./ScopeGuard');
const herculesConfig = require('../../config/hercules.config');

module.exports = async function globalSetup(config) {
  const target = process.env.TARGET_URL || herculesConfig.baseUrl || 'https://dev.hercules.works';
  console.log(`[GlobalSetup] Enforcing Target Scope Verification for: ${target}`);
  ScopeGuard.validateScope(target);
};
