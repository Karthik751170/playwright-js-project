const fs = require('fs');
const path = require('path');

class ZapClient {
  /**
   * @param {Object} [options]
   * @param {string} [options.zapUrl='http://127.0.0.1:8080'] - Base URL of the ZAP API / Proxy
   * @param {string} [options.apiKey=''] - Optional ZAP API key (if enabled)
   */
  constructor({ zapUrl = process.env.ZAP_URL || 'http://127.0.0.1:8080', apiKey = process.env.ZAP_API_KEY || '' } = {}) {
    this.zapUrl = zapUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  /**
   * Helper to make requests to the ZAP REST API
   * @param {string} endpoint - API path (e.g., '/JSON/core/view/version/')
   * @param {Object} [params={}] - Query parameters
   * @param {string} [format='json'] - Expected response format ('json' or 'text')
   */
  async _request(endpoint, params = {}, format = 'json') {
    const url = new URL(`${this.zapUrl}${endpoint}`);
    if (this.apiKey) {
      url.searchParams.set('apikey', this.apiKey);
    }
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    try {
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`ZAP API error (${response.status} ${response.statusText}) at ${endpoint}`);
      }
      if (format === 'json') {
        return await response.json();
      }
      return await response.text();
    } catch (error) {
      throw new Error(`Failed to connect to OWASP ZAP at ${url.origin}: ${error.message}`);
    }
  }

  /**
   * Checks whether ZAP API is reachable and responding.
   * @returns {Promise<boolean>}
   */
  async isReady() {
    try {
      const data = await this._request('/JSON/core/view/version/');
      return Boolean(data && data.version);
    } catch {
      return false;
    }
  }

  /**
   * Cleans / creates a new ZAP session.
   * @param {string} [name=''] - Session name
   * @param {boolean} [overwrite=true]
   */
  async newSession(name = '', overwrite = true) {
    return await this._request('/JSON/core/action/newSession/', {
      name,
      overwrite: overwrite ? 'true' : 'false',
    });
  }

  /**
   * Returns the count of remaining records in the passive scan queue.
   * @returns {Promise<number>}
   */
  async getRecordsToScan() {
    const data = await this._request('/JSON/pscan/view/recordsToScan/');
    return parseInt(data.recordsToScan, 10) || 0;
  }

  /**
   * Polls until all passive scan records have been processed.
   * @param {number} [timeoutMs=60000] - Max wait time in ms
   * @param {number} [intervalMs=1500] - Polling interval
   */
  async waitForPassiveScan(timeoutMs = 60000, intervalMs = 1500) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const records = await this.getRecordsToScan();
      if (records === 0) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    const remaining = await this.getRecordsToScan();
    throw new Error(`Passive scan timed out after ${timeoutMs}ms. Remaining records: ${remaining}`);
  }

  /**
   * Disables all active scan rules.
   */
  async disableAllActiveScanners() {
    return await this._request('/JSON/ascan/action/disableAllScanners/');
  }

  /**
   * Enables specific active scan rule IDs.
   * @param {string|Array<number|string>} ruleIds - Comma separated or array of rule IDs
   */
  async enableActiveScanners(ruleIds) {
    const ids = Array.isArray(ruleIds) ? ruleIds.join(',') : String(ruleIds);
    return await this._request('/JSON/ascan/action/enableScanners/', { ids });
  }

  /**
   * Configures ZAP Active Scanner to focus specifically on SQL Injection & SSRF rules.
   * - SQL Injection: 40018, 40019, 40020, 40021, 40022, 40024, 40027
   * - SSRF: 40046
   */
  async enableSqlInjectionAndSsrfOnly() {
    await this.disableAllActiveScanners();
    const sqliAndSsrfIds = '40018,40019,40020,40021,40022,40024,40027,40046';
    await this.enableActiveScanners(sqliAndSsrfIds);
    return sqliAndSsrfIds;
  }

  /**
   * Starts an active scan on a target URL.
   * @param {string} targetUrl - Target URL to actively scan
   * @param {boolean} [recurse=true] - Scan sub-paths
   * @returns {Promise<string>} scanId
   */
  async startActiveScan(targetUrl, recurse = true) {
    const data = await this._request('/JSON/ascan/action/scan/', {
      url: targetUrl,
      recurse: recurse ? 'true' : 'false',
      inScopeOnly: 'false',
    });
    return data.scan;
  }

  /**
   * Polls active scan progress until 100% complete.
   * @param {string} scanId - ID returned from startActiveScan
   * @param {number} [timeoutMs=300000]
   * @param {number} [intervalMs=3000]
   */
  async waitForActiveScan(scanId, timeoutMs = 300000, intervalMs = 3000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const data = await this._request('/JSON/ascan/view/status/', { scanId });
      const progress = parseInt(data.status, 10) || 0;
      if (progress >= 100) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error(`Active scan ${scanId} timed out after ${timeoutMs}ms`);
  }

  /**
   * Retrieves security alerts identified by ZAP.
   * @param {Object} [filter]
   * @param {string} [filter.baseUrl] - Target URL filter
   * @param {string} [filter.riskId] - 0: Informational, 1: Low, 2: Medium, 3: High
   * @returns {Promise<Array<Object>>}
   */
  async getAlerts({ baseUrl, riskId } = {}) {
    const params = {};
    if (baseUrl) params.baseurl = baseUrl;
    if (riskId !== undefined) params.riskId = riskId;

    const data = await this._request('/JSON/core/view/alerts/', params);
    return data.alerts || [];
  }

  /**
   * Generates a summary count of alerts grouped by severity.
   * @param {string} [baseUrl]
   * @returns {Promise<{High: number, Medium: number, Low: number, Informational: number, total: number}>}
   */
  async getAlertSummary(baseUrl) {
    const alerts = await this.getAlerts({ baseUrl });
    const summary = { High: 0, Medium: 0, Low: 0, Informational: 0, total: alerts.length };
    for (const alert of alerts) {
      const risk = alert.risk || 'Informational';
      if (summary[risk] !== undefined) {
        summary[risk]++;
      }
    }
    return summary;
  }

  /**
   * Generates and saves an HTML or JSON report to disk.
   * @param {string} outputPath - Filepath where the report should be saved
   * @param {'html'|'json'|'md'|'xml'} [format='html']
   * @param {string} [title='OWASP ZAP Security Report']
   */
  async saveReport(outputPath, format = 'html', title = 'OWASP ZAP Security Report') {
    const endpoint = `/OTHER/core/other/${format}report/`;
    const reportData = await this._request(endpoint, { title }, 'text');

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, reportData, 'utf-8');
    return outputPath;
  }

  /**
   * Asserts that discovered alerts do not exceed acceptable risk thresholds.
   * @param {Object} [options]
   * @param {string} [options.baseUrl]
   * @param {number} [options.maxHigh=0]
   * @param {number} [options.maxMedium=0]
   * @param {number} [options.maxLow=10]
   */
  async assertThresholds({ baseUrl, maxHigh = 0, maxMedium = 0, maxLow = 10 } = {}) {
    const summary = await this.getAlertSummary(baseUrl);
    const failures = [];

    if (summary.High > maxHigh) {
      failures.push(`High Risk Alerts: found ${summary.High} (allowed max: ${maxHigh})`);
    }
    if (summary.Medium > maxMedium) {
      failures.push(`Medium Risk Alerts: found ${summary.Medium} (allowed max: ${maxMedium})`);
    }
    if (summary.Low > maxLow) {
      failures.push(`Low Risk Alerts: found ${summary.Low} (allowed max: ${maxLow})`);
    }

    if (failures.length > 0) {
      const alerts = await this.getAlerts({ baseUrl });
      const topAlerts = alerts
        .filter((a) => ['High', 'Medium'].includes(a.risk))
        .map((a) => `[${a.risk}] ${a.alert} - ${a.url}`)
        .slice(0, 10)
        .join('\n');

      throw new Error(
        `ZAP Security Quality Gate Failed:\n- ${failures.join('\n- ')}\n\nCritical Findings:\n${topAlerts || 'None'}`
      );
    }
  }
}

module.exports = ZapClient;
