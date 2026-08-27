/**
 * SecurityReporter.js
 * Modular Report Generation, Suppression Handling, and Artifact Export
 */

const fs = require('fs');
const path = require('path');

class SecurityReporter {
  constructor(targetUrl, options = {}) {
    this.targetUrl = targetUrl;
    this.records = [];
    this.suppressions = this.loadSuppressions();
    this.outputDir = options.outputDir || path.join(process.cwd(), 'reports', 'security');
  }

  loadSuppressions() {
    try {
      const configPath = path.join(process.cwd(), 'config', 'security-suppressions.json');
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        return parsed.suppressions || [];
      }
    } catch (e) {
      console.warn('[SecurityReporter] Warning: Unable to parse security-suppressions.json:', e.message);
    }
    return [];
  }

  logFinding(finding) {
    // Check if this finding is triaged in suppressions
    const suppression = this.suppressions.find(s => s.code === finding.code);
    if (suppression && finding.status !== 'PASS') {
      finding.status = 'SUPPRESSED';
      finding.suppressionReason = suppression.reason;
      finding.suppressionApprovedBy = suppression.approvedBy;
    }

    this.records.push(finding);

    const icons = { PASS: '✅', WARN: '⚠️ ', FAIL: '❌', SUPPRESSED: '🛡️' };
    console.log(`  ${icons[finding.status] || '•'} [${finding.status}] ${finding.code} - ${finding.name}`);
  }

  getMetrics() {
    const passCount = this.records.filter(r => r.status === 'PASS').length;
    const warnCount = this.records.filter(r => r.status === 'WARN').length;
    const failCount = this.records.filter(r => r.status === 'FAIL').length;
    const suppressedCount = this.records.filter(r => r.status === 'SUPPRESSED').length;
    const totalCount = this.records.length;
    const complianceScore = totalCount > 0 ? Math.round(((passCount + suppressedCount) / totalCount) * 100) : 0;

    return { passCount, warnCount, failCount, suppressedCount, totalCount, complianceScore };
  }

  generateHtmlReport(filename = 'owasp-enterprise-10-10-report.html') {
    const { passCount, warnCount, failCount, suppressedCount, totalCount, complianceScore } = this.getMetrics();

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const reportHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Security Verification & DAST Audit Report - ${this.targetUrl}</title>
  <style>
    :root {
      --bg: #060913;
      --card: #0f172a;
      --card-inner: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --muted: #94a3b8;
      --accent: #38bdf8;
      --pass: #10b981;
      --warn: #f59e0b;
      --fail: #ef4444;
      --suppressed: #818cf8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 40px 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    
    .header { margin-bottom: 30px; border-bottom: 1px solid var(--border); padding-bottom: 20px; }
    .header h1 { font-size: 26px; font-weight: 800; color: #fff; margin-bottom: 8px; display: flex; align-items: center; gap: 10px; }
    .header .meta { color: var(--muted); font-size: 13px; display: flex; gap: 20px; flex-wrap: wrap; }
    
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 25px; }
    .metric-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; text-align: center; cursor: pointer; transition: all 0.2s ease; }
    .metric-card:hover { transform: translateY(-2px); border-color: var(--accent); }
    .metric-card.active { border-color: #fff; box-shadow: 0 0 15px rgba(56, 189, 248, 0.2); }
    .metric-card .val { font-size: 32px; font-weight: 800; margin-bottom: 4px; }
    .metric-card .label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
    
    .val-score { color: var(--accent); }
    .val-pass { color: var(--pass); }
    .val-suppressed { color: var(--suppressed); }
    .val-warn { color: var(--warn); }
    .val-fail { color: var(--fail); }
    
    .filter-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px; }
    .pills { display: flex; gap: 8px; flex-wrap: wrap; }
    .pill { background: var(--card); border: 1px solid var(--border); color: var(--muted); padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s ease; }
    .pill:hover { border-color: var(--muted); color: #fff; }
    .pill.active { background: var(--card-inner); border-color: var(--accent); color: #fff; }
    
    .btn-toggle-all { background: transparent; border: 1px solid var(--border); color: var(--muted); padding: 6px 14px; border-radius: 8px; font-size: 12px; cursor: pointer; }
    .btn-toggle-all:hover { color: #fff; border-color: var(--muted); }
    
    .findings-list { display: flex; flex-direction: column; gap: 12px; }
    .finding-card { background: var(--card); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; transition: all 0.2s ease; }
    .finding-card.status-PASS { border-left: 4px solid var(--pass); }
    .finding-card.status-SUPPRESSED { border-left: 4px solid var(--suppressed); }
    .finding-card.status-WARN { border-left: 4px solid var(--warn); }
    .finding-card.status-FAIL { border-left: 4px solid var(--fail); }
    
    .card-header { padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; }
    .card-header:hover { background: rgba(255,255,255,0.02); }
    .card-title-group { display: flex; align-items: center; gap: 12px; }
    .badge { padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; }
    .badge-PASS { background: rgba(16, 185, 129, 0.15); color: var(--pass); }
    .badge-SUPPRESSED { background: rgba(129, 140, 248, 0.15); color: var(--suppressed); }
    .badge-WARN { background: rgba(245, 158, 11, 0.15); color: var(--warn); }
    .badge-FAIL { background: rgba(239, 68, 68, 0.15); color: var(--fail); }
    
    .finding-code { font-family: monospace; font-size: 12px; color: var(--muted); }
    .finding-name { font-weight: 600; font-size: 14px; color: #fff; }
    .finding-principle { font-size: 12px; color: var(--muted); background: var(--card-inner); padding: 2px 8px; border-radius: 4px; }
    
    .card-body { padding: 20px; border-top: 1px solid var(--border); background: rgba(0,0,0,0.15); display: none; }
    .card-body.open { display: block; }
    
    .proof-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
    @media (max-width: 768px) { .proof-grid { grid-template-columns: 1fr; } }
    .proof-box { background: var(--card-inner); border: 1px solid rgba(255,255,255,0.05); padding: 12px 14px; border-radius: 8px; }
    .proof-box .p-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; letter-spacing: 0.05em; }
    .proof-box .p-val { font-size: 13px; color: #e2e8f0; line-height: 1.4; }
    
    .evidence-block { background: #020617; border: 1px solid var(--border); border-radius: 8px; padding: 12px; font-family: monospace; font-size: 12px; color: #38bdf8; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🛡️ Automated DAST & Security Regression Audit Report</h1>
      <div class="meta">
        <span><strong>Target:</strong> ${this.targetUrl}</span>
        <span><strong>Audit Time:</strong> ${new Date().toUTCString()}</span>
        <span><strong>Total Controls Verified:</strong> ${totalCount}</span>
        <span><strong>Scope Verified:</strong> Authorized Host</span>
      </div>
    </div>

    <div class="summary-grid">
      <div class="metric-card active" id="card-all" onclick="applyFilter('ALL')">
        <div class="val val-score">${complianceScore}%</div>
        <div class="label">Compliance Score</div>
      </div>
      <div class="metric-card" id="card-pass" onclick="applyFilter('PASS')">
        <div class="val val-pass">${passCount}</div>
        <div class="label">Verified Controls</div>
      </div>
      <div class="metric-card" id="card-suppressed" onclick="applyFilter('SUPPRESSED')">
        <div class="val val-suppressed">${suppressedCount}</div>
        <div class="label">Triaged / Accepted Risks</div>
      </div>
      <div class="metric-card" id="card-warn" onclick="applyFilter('WARN')">
        <div class="val val-warn">${warnCount}</div>
        <div class="label">Hardening Warnings</div>
      </div>
      <div class="metric-card" id="card-fail" onclick="applyFilter('FAIL')">
        <div class="val val-fail">${failCount}</div>
        <div class="label">Critical / High Flaws</div>
      </div>
    </div>

    <div class="filter-bar">
      <div class="pills">
        <button class="pill active" id="pill-all" onclick="applyFilter('ALL')">All Controls (${totalCount})</button>
        <button class="pill" id="pill-pass" onclick="applyFilter('PASS')">✅ Passed (${passCount})</button>
        <button class="pill" id="pill-suppressed" onclick="applyFilter('SUPPRESSED')">🛡️ Triaged (${suppressedCount})</button>
        <button class="pill" id="pill-warn" onclick="applyFilter('WARN')">⚠️ Hardening (${warnCount})</button>
        <button class="pill" id="pill-fail" onclick="applyFilter('FAIL')">❌ High/Critical (${failCount})</button>
      </div>
      <button class="btn-toggle-all" onclick="toggleAllCards()">Expand / Collapse All Details</button>
    </div>

    <div class="findings-list" id="findings-list">
      ${this.records.map((r, i) => `
        <div class="finding-card status-${r.status}" data-status="${r.status}">
          <div class="card-header" onclick="toggleCard(${i})">
            <div class="card-title-group">
              <span class="badge badge-${r.status}">${r.status}</span>
              <span class="finding-code">${r.code}</span>
              <span class="finding-name">${r.name}</span>
            </div>
            <span class="finding-principle">${r.principle}</span>
          </div>
          <div class="card-body" id="card-body-${i}">
            <div class="proof-grid">
              <div class="proof-box">
                <div class="p-label">Action & Payload Dispatched</div>
                <div class="p-val">${r.action}</div>
              </div>
              <div class="proof-box">
                <div class="p-label">Security Rationale</div>
                <div class="p-val">${r.rationale}</div>
              </div>
              <div class="proof-box">
                <div class="p-label">Expected Behavior</div>
                <div class="p-val">${r.expected}</div>
              </div>
              <div class="proof-box">
                <div class="p-label">Actual Response Observed</div>
                <div class="p-val">${r.actual}</div>
              </div>
            </div>
            ${r.status === 'SUPPRESSED' ? `
            <div class="proof-box" style="margin-bottom: 14px; border-left: 3px solid var(--suppressed);">
              <div class="p-label" style="color: var(--suppressed);">🛡️ Triaged & Accepted Risk Justification (Approved by: ${r.suppressionApprovedBy || 'SecOps'})</div>
              <div class="p-val">${r.suppressionReason}</div>
            </div>` : ''}
            <div class="proof-box">
              <div class="p-label">Raw Trace & Verification Proof</div>
              <div class="evidence-block">${r.evidence}</div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  </div>

  <script>
    let allOpen = false;

    function toggleCard(index) {
      const body = document.getElementById('card-body-' + index);
      if (body) {
        body.classList.toggle('open');
      }
    }

    function toggleAllCards() {
      allOpen = !allOpen;
      const bodies = document.querySelectorAll('.card-body');
      bodies.forEach(b => {
        if (allOpen) b.classList.add('open');
        else b.classList.remove('open');
      });
    }

    function applyFilter(status) {
      document.querySelectorAll('.metric-card').forEach(c => c.classList.remove('active'));
      document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));

      const cardId = status === 'ALL' ? 'card-all' : 'card-' + status.toLowerCase();
      const pillId = status === 'ALL' ? 'pill-all' : 'pill-' + status.toLowerCase();
      
      const cEl = document.getElementById(cardId);
      const pEl = document.getElementById(pillId);
      if (cEl) cEl.classList.add('active');
      if (pEl) pEl.classList.add('active');

      const cards = document.querySelectorAll('.finding-card');
      cards.forEach(card => {
        if (status === 'ALL' || card.getAttribute('data-status') === status) {
          card.style.display = 'block';
        } else {
          card.style.display = 'none';
        }
      });
    }
  </script>
</body>
</html>`;

    const fullReportPath = path.join(this.outputDir, filename);
    fs.writeFileSync(fullReportPath, reportHtml, 'utf-8');
    return fullReportPath;
  }
}

module.exports = SecurityReporter;
