/**
 * Hercules Platform Environment Configuration
 * 
 * To switch environments, set the ENV environment variable:
 * - ENV=dev (default)
 * - ENV=preprod
 * - ENV=production
 */

const environments = {
  dev: {
    baseUrl: 'https://dev.hercules.works',
    adminUser: 'admin@hercules.works',
    adminPassword: 'Password@123'
  },
  preprod: {
    baseUrl: 'https://prod.hercules.works',
    adminUser: 'admin@hercules.works',
    adminPassword: 'Password@123'
  },
  production: {
    baseUrl: 'https://hercules.works',
    adminUser: 'admin@hercules.works',
    adminPassword: 'Password@123'
  }
};

const env = (process.env.ENV || 'dev').toLowerCase();
module.exports = environments[env] || environments.dev;
