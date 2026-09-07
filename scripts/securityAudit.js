/**
 * securityAudit.js
 * Baseline security verification entrypoint (delegates to the master suite engine).
 *
 * fullSecuritySuite sets process.exitCode itself, so requiring it here preserves
 * the CI gate: a blocking finding exits non-zero through this entrypoint too.
 */

console.log('⚡ Executing Baseline Security Audit...\n');

try {
  require('./fullSecuritySuite');
} catch (e) {
  console.error('Error executing security audit:', e.message);
  process.exit(1);
}
