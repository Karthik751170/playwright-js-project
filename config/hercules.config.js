/**
 * Hercules Platform Environment Configuration
 * 
 * To switch environments, set the ENV environment variable:
 * - ENV=dev (default)
 * - ENV=preprod
 * - ENV=production
 */

// Admin credentials come from the environment: HERCULES_ADMIN_USER /
// HERCULES_ADMIN_PASSWORD. They were previously hardcoded here, which committed
// a live admin password to git history -- rotate it if that has not been done.
const adminUser = process.env.HERCULES_ADMIN_USER || null;
const adminPassword = process.env.HERCULES_ADMIN_PASSWORD || null;

const environments = {
  dev: {
    baseUrl: 'https://dev.hercules.works',
    adminUser,
    adminPassword
  },
  preprod: {
    baseUrl: 'https://prod.hercules.works',
    adminUser,
    adminPassword
  },
  production: {
    baseUrl: 'https://hercules.works',
    adminUser,
    adminPassword
  }
};

const env = (process.env.ENV || 'dev').toLowerCase();
module.exports = environments[env] || environments.dev;
