/**
 * SuperJ Platform Environment Configuration
 * 
 * To switch environments, set the ENV environment variable:
 * - ENV=dev (default)
 * - ENV=preprod
 * - ENV=production
 */

const environments = {
  dev: {
    baseUrl: 'https://dev.superj.app',
    testUserPhone: '9700089199',
    testUserOtp: '777777'
  },
  
  production: {
    baseUrl: 'https://superj.app',
    testUserPhone: '9700089199',
    testUserOtp: '777777'
  }
};

const env = (process.env.ENV || 'dev').toLowerCase();
module.exports = environments[env] || environments.dev;
