/**
 * api.config.js
 * Hercules API Testing - Central Configuration & Dual-Backend Microservice Registry
 */

const HERCULES_ENDPOINTS = require('../../config/herculesEndpoints');

module.exports = {
  projectName: 'Hercules API Testing',
  webUrl: 'https://dev.hercules.works',
  aiApiUrl: 'https://devapi-ai.hercules.works',
  coreApiUrl: 'https://devapi.hercules.works',
  timeout: 30000,
  endpoints: HERCULES_ENDPOINTS,
  defaultHeaders: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'Hercules-API-Testing-Runner/2.0',
  }
};
