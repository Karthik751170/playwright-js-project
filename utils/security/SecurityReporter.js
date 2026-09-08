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
    let raw = [];
    try {
      const configPath = path.join(process.cwd(), 'config', 'security-suppressions.json');
      if (fs.existsSync(configPath)) {
        const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        raw = parsed.suppressions || [];
      }
    } catch (e) {
      console.warn('[SecurityReporter] Warning: Unable to parse security-suppressions.json:', e.message);
      return [];
    }

    // A suppression silences a real finding, so it must be fully specified.
    // Anything missing a code, target, expiry or approver is discarded loudly
    // rather than silently granting a blanket pass.
    return raw.filter((sup) => {
      const missing = ['code', 'target', 'expiresAt', 'approvedBy'].filter((k) => !sup[k]);
      if (missing.length > 0) {
        console.warn(
          `[SecurityReporter] Ignoring malformed suppression ${sup.code || '(no code)'}: ` +
          `missing required field(s) ${missing.join(', ')}. Finding will NOT be suppressed.`
        );
        return false;
      }
      if (Number.isNaN(Date.parse(sup.expiresAt))) {
        console.warn(`[SecurityReporter] Ignoring suppression ${sup.code}: unparseable expiresAt "${sup.expiresAt}".`);
        return false;
      }
      return true;
    });
  }

  /**
   * Resolves whether a finding is covered by an in-date, in-scope suppression.
   * Matching requires the code AND the target to line up: a risk accepted on
   * one host is not accepted everywhere. Expired suppressions do not suppress —
   * they are reported as blocking so stale exceptions cannot hide a regression.
   * @returns {{ state: 'NONE' | 'ACTIVE' | 'EXPIRED', suppression?: object }}
   */
  resolveSuppression(finding) {
    const candidates = this.suppressions.filter((sup) => {
      if (sup.code !== finding.code) return false;
      if (sup.target === '*') return true;
      if (sup.target === this.targetUrl) return true;
      // Tolerate a trailing-slash mismatch between config and the live target.
      return sup.target.replace(/\/$/, '') === (this.targetUrl || '').replace(/\/$/, '');
    });

    if (candidates.length === 0) return { state: 'NONE' };

    const now = Date.now();
    const active = candidates.find((sup) => Date.parse(sup.expiresAt) >= now);
    if (active) return { state: 'ACTIVE', suppression: active };

    // Every candidate is past its review date.
    const mostRecent = candidates.sort((a, b) => Date.parse(b.expiresAt) - Date.parse(a.expiresAt))[0];
    return { state: 'EXPIRED', suppression: mostRecent };
  }

  logFinding(finding) {
    if (finding.status !== 'PASS') {
      const { state, suppression } = this.resolveSuppression(finding);

      if (state === 'ACTIVE') {
        finding.originalStatus = finding.status;
        finding.status = 'SUPPRESSED';
        finding.suppressionReason = suppression.reason;
        finding.suppressionApprovedBy = suppression.approvedBy;
        finding.suppressionExpiresAt = suppression.expiresAt;
      } else if (state === 'EXPIRED') {
        // Keep the real status and mark it blocking: the accepted-risk window closed.
        finding.suppressionExpired = true;
        finding.suppressionExpiresAt = suppression.expiresAt;
        finding.suppressionReason = suppression.reason;
        finding.suppressionApprovedBy = suppression.approvedBy;
        console.warn(
          `  ⏰ [EXPIRED SUPPRESSION] ${finding.code} — accepted risk lapsed on ${suppression.expiresAt} ` +
          `(approved by ${suppression.approvedBy}). Re-triage required; finding is now blocking.`
        );
      }
    }

    this.records.push(finding);

    const icons = { PASS: '✅', WARN: '⚠️ ', FAIL: '❌', SUPPRESSED: '🛡️', INCONCLUSIVE: '❓' };
    const suffix = finding.suppressionExpired ? ' (suppression EXPIRED)' : '';
    console.log(`  ${icons[finding.status] || '•'} [${finding.status}] ${finding.code} - ${finding.name}${suffix}`);
  }

  getMetrics() {
    const by = (status) => this.records.filter((r) => r.status === status).length;
    const passCount = by('PASS');
    const warnCount = by('WARN');
    const failCount = by('FAIL');
    const suppressedCount = by('SUPPRESSED');
    const inconclusiveCount = by('INCONCLUSIVE');
    const totalCount = this.records.length;
    const expiredSuppressionCount = this.records.filter((r) => r.suppressionExpired).length;

    // Only controls that actually reached a verdict count toward the score.
    // Suppressed (accepted risk) and INCONCLUSIVE (probe never reached the sink)
    // are excluded from BOTH sides of the ratio so neither inflates compliance.
    const assessedCount = totalCount - suppressedCount - inconclusiveCount;
    const complianceScore = assessedCount > 0 ? Math.round((passCount / assessedCount) * 100) : 0;

    return {
      passCount,
      warnCount,
      failCount,
      suppressedCount,
      inconclusiveCount,
      expiredSuppressionCount,
      assessedCount,
      totalCount,
      complianceScore,
    };
  }

  /**
   * Blocking failures for CI. FAIL findings block, and so does any finding whose
   * accepted-risk suppression has lapsed.
   */
  getBlockingFindings() {
    return this.records.filter((r) => r.status === 'FAIL' || r.suppressionExpired);
  }

  /** Process exit code for CI gating: 1 when anything blocking is present. */
  getExitCode() {
    return this.getBlockingFindings().length > 0 ? 1 : 0;
  }

  generateHtmlReport(filename = 'dast-security-audit-report.html') {
    const { passCount, warnCount, failCount, suppressedCount, inconclusiveCount,
            expiredSuppressionCount, assessedCount, totalCount, complianceScore } = this.getMetrics();

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
      --inconclusive: #64748b;
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
    .val-inconclusive { color: var(--inconclusive); }
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
    .finding-card.status-INCONCLUSIVE { border-left: 4px solid var(--inconclusive); }
    
    .card-header { padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; }
    .card-header:hover { background: rgba(255,255,255,0.02); }
    .card-title-group { display: flex; align-items: center; gap: 12px; }
    .badge { padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; }
    .badge-PASS { background: rgba(16, 185, 129, 0.15); color: var(--pass); }
    .badge-SUPPRESSED { background: rgba(129, 140, 248, 0.15); color: var(--suppressed); }
    .badge-WARN { background: rgba(245, 158, 11, 0.15); color: var(--warn); }
    .badge-FAIL { background: rgba(239, 68, 68, 0.15); color: var(--fail); }
    .badge-INCONCLUSIVE { background: rgba(100, 116, 139, 0.18); color: #cbd5e1; }
    
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
    
    .expiry-banner { background: rgba(239, 68, 68, 0.12); border: 1px solid var(--fail); border-radius: 10px; padding: 14px 18px; margin-bottom: 20px; }
    .expiry-banner .t { font-weight: 800; color: var(--fail); font-size: 14px; margin-bottom: 4px; }
    .expiry-banner .d { font-size: 13px; color: #fecaca; }
    .scope-note { font-size: 12px; color: var(--muted); margin-bottom: 18px; line-height: 1.5; }
    
    .evidence-block { background: #020617; border: 1px solid var(--border); border-radius: 8px; padding: 12px; font-family: monospace; font-size: 12px; color: #38bdf8; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🛡️ Automated DAST & Security Regression Audit Report</h1>
      <div class="scope-note" style="margin:8px 0 0;">
        This page counts <strong>security controls (findings)</strong>, not Playwright test cases.
        One test case can log several controls, and some controls are logged by the DAST script rather
        than by any test. For test pass/fail counts open <code>playwright-report/index.html</code>.
      </div>
      <div class="meta">
        <span><strong>Target:</strong> ${this.targetUrl}</span>
        <span><strong>Audit Time:</strong> ${new Date().toUTCString()}</span>
        <span><strong>Controls Executed:</strong> ${totalCount}</span>
        <span><strong>Reached A Verdict:</strong> ${assessedCount}</span>
        <span><strong>Scope Verified:</strong> Authorized Host</span>
      </div>
    </div>

    ${expiredSuppressionCount > 0 ? `
    <div class="expiry-banner">
      <div class="t">⏰ ${expiredSuppressionCount} accepted-risk suppression(s) have EXPIRED</div>
      <div class="d">These findings are no longer silenced and are counted as blocking. Re-triage them in config/security-suppressions.json or remediate the underlying issue.</div>
    </div>` : ''}

    <div class="scope-note">
      <strong>How to read this report:</strong> the score is ${passCount} passed out of ${assessedCount} controls that reached a verdict.
      ${suppressedCount} triaged and ${inconclusiveCount} inconclusive control(s) are excluded from both sides of that ratio.
      <em>Inconclusive</em> means the probe could not reach an exercisable sink (for example, an injection payload sent to a
      static page that never reads the parameter) — it is evidence of nothing and must not be read as a pass.
    </div>

    <div class="summary-grid">
      <div class="metric-card active" id="card-all" onclick="applyFilter('ALL')">
        <div class="val val-score">${complianceScore}%</div>
        <div class="label">Controls Passing (${passCount}/${assessedCount} assessed)</div>
      </div>
      <div class="metric-card" id="card-pass" onclick="applyFilter('PASS')">
        <div class="val val-pass">${passCount}</div>
        <div class="label">Controls Passed</div>
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
      <div class="metric-card" id="card-inconclusive" onclick="applyFilter('INCONCLUSIVE')">
        <div class="val val-inconclusive">${inconclusiveCount}</div>
        <div class="label">Inconclusive / No Sink</div>
      </div>
    </div>

    <div class="filter-bar">
      <div class="pills">
        <button class="pill active" id="pill-all" onclick="applyFilter('ALL')">All Controls (${totalCount})</button>
        <button class="pill" id="pill-pass" onclick="applyFilter('PASS')">✅ Passed (${passCount})</button>
        <button class="pill" id="pill-suppressed" onclick="applyFilter('SUPPRESSED')">🛡️ Triaged (${suppressedCount})</button>
        <button class="pill" id="pill-warn" onclick="applyFilter('WARN')">⚠️ Hardening (${warnCount})</button>
        <button class="pill" id="pill-fail" onclick="applyFilter('FAIL')">❌ High/Critical (${failCount})</button>
        <button class="pill" id="pill-inconclusive" onclick="applyFilter('INCONCLUSIVE')">❓ Inconclusive (${inconclusiveCount})</button>
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
              <div class="p-label" style="color: var(--suppressed);">🛡️ Triaged & Accepted Risk (Approved by: ${r.suppressionApprovedBy}, expires ${r.suppressionExpiresAt})</div>
              <div class="p-val">${r.suppressionReason}</div>
              <div class="p-val" style="margin-top: 6px; color: var(--muted);">Underlying status without this suppression: <strong>${r.originalStatus}</strong></div>
            </div>` : ''}
            ${r.suppressionExpired ? `
            <div class="proof-box" style="margin-bottom: 14px; border-left: 3px solid var(--fail);">
              <div class="p-label" style="color: var(--fail);">⏰ Suppression EXPIRED on ${r.suppressionExpiresAt} (was approved by ${r.suppressionApprovedBy})</div>
              <div class="p-val">Original justification: ${r.suppressionReason}</div>
              <div class="p-val" style="margin-top: 6px;">The accepted-risk window has closed, so this finding is reported at its real severity and blocks CI.</div>
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
