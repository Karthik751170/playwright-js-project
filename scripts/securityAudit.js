/**
 * securityAudit.js
 * Fast baseline security verification entrypoint (delegates to master suite engine)
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('⚡ Executing Baseline Security Audit...\n');

try {
  require('./fullSecuritySuite');
} catch (e) {
  console.error('Error executing security audit:', e.message);
  process.exit(1);
}
