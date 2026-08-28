/**
 * NetworkMonitor.js
 * Real-time HTTP Network Interceptor & UI-to-API Data Parity Reconciler
 * 
 * Features:
 * - Attaches to Playwright Page to intercept all outgoing API traffic
 * - Matches request against Hercules END_POINTS registry
 * - Captures exact request headers (Authorization, Cookie, Content-Type, etc.)
 * - Captures live JSON response payloads and status codes
 * - Performs 1-to-1 live reconciliation between API data and rendered UI DOM text
 */

class NetworkMonitor {
  constructor(endpointsMap = {}) {
    this.endpointsMap = endpointsMap;
    this.capturedTraffic = new Map(); // key: url or endpointName -> array of entries
    this.reconciliationResults = [];
    this.isMonitoring = false;
  }

  /**
   * Start listening to all network requests & responses on the Playwright page
   */
  startMonitoring(page) {
    if (this.isMonitoring) return;
    this.isMonitoring = true;

    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/api/') || url.includes('/V2/') || url.includes('/v1/')) {
        const entry = {
          id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          url: url,
          method: req.method(),
          headers: req.headers(),
          postData: req.postData(),
          timestamp: new Date().toISOString(),
          response: null
        };

        const existing = this.capturedTraffic.get(url) || [];
        existing.push(entry);
        this.capturedTraffic.set(url, existing);
      }
    });

    page.on('response', async (res) => {
      const url = res.url();
      if (url.includes('/api/') || url.includes('/V2/') || url.includes('/v1/')) {
        let body = '';
        let json = null;
        try {
          body = await res.text();
          json = JSON.parse(body);
        } catch (e) {}

        const entries = this.capturedTraffic.get(url) || [];
        if (entries.length > 0) {
          const lastEntry = entries[entries.length - 1];
          lastEntry.response = {
            status: res.status(),
            statusText: res.statusText(),
            headers: res.headers(),
            body: body,
            json: json,
            latencyMs: Date.now() - new Date(lastEntry.timestamp).getTime()
          };
        }
      }
    });
  }

  /**
   * Find captured traffic matching an endpoint substring
   */
  getCaptured(urlSubstring) {
    for (const [url, entries] of this.capturedTraffic.entries()) {
      if (url.includes(urlSubstring)) {
        return entries[entries.length - 1];
      }
    }
    return null;
  }

  /**
   * Wait for a matching API response with timeout
   */
  async waitForResponse(page, urlSubstring, timeoutMs = 15000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const captured = this.getCaptured(urlSubstring);
      if (captured && captured.response) {
        return captured;
      }
      await page.waitForTimeout(300);
    }
    return this.getCaptured(urlSubstring);
  }

  /**
   * Reconcile UI text with API JSON response value
   */
  reconcile({
    endpointKey,
    route,
    apiField,
    apiValue,
    uiSelector,
    uiValue,
    matchType = 'EXACT' // 'EXACT' | 'CONTAINS' | 'NUMERIC'
  }) {
    let isMatch = false;
    const strApi = String(apiValue ?? '').trim();
    const strUi = String(uiValue ?? '').trim();

    if (matchType === 'EXACT') {
      isMatch = strApi.toLowerCase() === strUi.toLowerCase();
    } else if (matchType === 'CONTAINS') {
      isMatch = strUi.toLowerCase().includes(strApi.toLowerCase()) || strApi.toLowerCase().includes(strUi.toLowerCase());
    } else if (matchType === 'NUMERIC') {
      const numApi = parseFloat(strApi.replace(/[^0-9.-]+/g, ''));
      const numUi = parseFloat(strUi.replace(/[^0-9.-]+/g, ''));
      isMatch = !isNaN(numApi) && !isNaN(numUi) && numApi === numUi;
    }

    const result = {
      endpointKey,
      route,
      apiField,
      apiValue: strApi,
      uiSelector,
      uiValue: strUi,
      matchType,
      isMatch,
      status: isMatch ? 'EXACT MATCH' : 'MISMATCH',
      timestamp: new Date().toISOString()
    };

    this.reconciliationResults.push(result);
    return result;
  }
}

module.exports = NetworkMonitor;
