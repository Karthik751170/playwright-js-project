/**
 * api.config.js
 * Hercules API Testing - Central Configuration & Endpoint Registry
 */

const herculesConfig = require('../../config/hercules.config');
const HERCULES_ENDPOINTS = require('../../config/herculesEndpoints');

module.exports = {
  projectName: 'Hercules API Testing',
  baseUrl: process.env.TARGET_URL || herculesConfig.baseUrl || 'https://dev.hercules.works',
  timeout: 30000,
  endpoints: HERCULES_ENDPOINTS,
  defaultHeaders: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'Hercules-API-Testing-Runner/1.0',
  }
};
