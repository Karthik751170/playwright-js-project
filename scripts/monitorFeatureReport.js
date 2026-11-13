#!/usr/bin/env node
/**
 * Feature-wise monitor report: one section per feature (Sign-up, Login, Rename, …), each check
 * with its expected result, actual result, status and highlighted screenshot.
 *
 *   node scripts/monitorFeatureReport.js <run dir>     (default: newest dir in reports/monitor)
 * Writes <run dir>/feature-report.html. Screenshots are linked relative to the run dir.
 */
const fs = require('fs');
const path = require('path');
const { FEATURES, describeCheck } = require('../tests/monitor/lib/expectations');

const MON = path.resolve('reports/monitor');
const runDir = path.resolve(process.argv[2] || fs.readdirSync(MON).filter(d => /^\d{4}-/.test(d)).sort().map(d => path.join(MON, d)).pop());
const GROUP_LABEL = { auth: 'Sign-up & login', basic: 'Basic flow', core: 'Survey & audience', logic: 'Logic & preview', manage: 'Share & manage', quickq: 'Quick Question' };

const groups = fs.readdirSync(runDir, { withFileTypes: true }).filter(d => d.isDirectory() && fs.existsSync(path.join(runDir, d.name, 'result.json')))
    .map(d => ({ group: d.name, ...JSON.parse(fs.readFileSync(path.join(runDir, d.name, 'result.json'), 'utf8')) }));
const rows = groups.flatMap(g => g.checks.map((c, i) => {
    const d = describeCheck(c.name);
    // Screenshot paths are absolute on the machine that ran the monitor; keep the part from the group folder on.
    const abs = c.screenshot && (fs.existsSync(c.screenshot) ? c.screenshot : path.join(runDir, g.group, 'evidence', path.basename(c.screenshot)));
    const shot = abs && fs.existsSync(abs) ? path.relative(runDir, abs).split(path.sep).join('/') : null;
    return {
        id: `${g.group}-${i + 1}`, group: g.group, name: c.name, status: c.status,
        type: c.kind === 'test' ? 'Test' : 'Product',
        feature: c.feature || d.feature, expected: c.expected || d.expected,
        actual: c.actual || c.detail || (c.status === 'PASS' ? 'Matches the expected result' : ''), shot,
    };
}));
const ORDER = { FAIL: 0, WARN: 1, PASS: 2, SKIP: 3 };
const features = [...FEATURES, 'Other'].map(f => ({ name: f, rows: rows.filter(r => r.feature === f).sort((a, b) => ORDER[a.status] - ORDER[b.status]) })).filter(f => f.rows.length);
const n = (list, s) => list.filter(r => r.status === s).length;
const worst = list => ['FAIL', 'WARN', 'PASS', 'SKIP'].find(s => list.some(r => r.status === s)) || 'SKIP';
const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const started = groups.map(g => g.startedAt).filter(Boolean).sort()[0];
const productFails = rows.filter(r => r.status === 'FAIL' && r.type === 'Product');
const testFails = rows.filter(r => r.status === 'FAIL' && r.type === 'Test');

const bar = list => {
    const t = list.length || 1;
    return `<span class="bar" aria-hidden="true">${['PASS', 'WARN', 'FAIL', 'SKIP'].map(s => n(list, s) ? `<i class="${s}" style="width:${(n(list, s) / t * 100).toFixed(1)}%"></i>` : '').join('')}</span>`;
};
const chip = s => `<span class="chip ${s}">${s === 'PASS' ? 'Pass' : s === 'WARN' ? 'Warning' : s === 'FAIL' ? 'Fail' : 'Skipped'}</span>`;
const row = r => `
<tr class="r" data-status="${r.status}" id="${esc(r.id)}">
  <td class="check"><span class="name">${esc(r.name)}</span><span class="meta">${esc(GROUP_LABEL[r.group] || r.group)} · ${r.type === 'Test' ? 'test script' : 'product'}</span></td>
  <td class="exp"><span class="lbl">Expected</span>${esc(r.expected) || '<span class="muted">—</span>'}</td>
  <td class="act"><span class="lbl">Actual</span>${esc(r.actual) || '<span class="muted">—</span>'}</td>
  <td class="st">${chip(r.status)}</td>
  <td class="ev">${r.shot ? `<button class="thumb" type="button" data-src="${esc(r.shot)}" data-cap="${esc(`${r.status} · ${r.name}`)}" aria-label="Open screenshot for ${esc(r.name)}"><img loading="lazy" src="${esc(r.shot)}" alt=""></button>` : `<span class="muted">${r.status === 'SKIP' ? 'Not run' : 'No screenshot'}</span>`}</td>
</tr>`;

const html = `<title>Hercules Monitor Report</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: a test ledger. Summary first, then one section per feature; each row is a check (expected | actual | status | evidence). */
:root{
  --bg:#f5f6f8; --surface:#ffffff; --ink:#151a23; --muted:#5d6676; --rule:#dfe3ea; --accent:#2f5bd3;
  --pass:#17804a; --pass-bg:#e4f4ea; --warn:#a85a00; --warn-bg:#fdf0dc; --fail:#c4291c; --fail-bg:#fde6e3; --skip:#6b7280; --skip-bg:#eceef2;
  --scrim:rgba(8,10,14,.82); --on-scrim:#ffffff;
  --sans:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif; --mono:"IBM Plex Mono",ui-monospace,Menlo,monospace;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){
  --bg:#0f1218; --surface:#171b23; --ink:#e7eaf0; --muted:#9aa3b2; --rule:#2a303b; --accent:#7ea0ff;
  --pass:#4cc488; --pass-bg:#173326; --warn:#f0a948; --warn-bg:#3a2a12; --fail:#ff7b6e; --fail-bg:#3d1c19; --skip:#a3aab6; --skip-bg:#252a33; color-scheme:dark}}
:root[data-theme="dark"]{
  --bg:#0f1218; --surface:#171b23; --ink:#e7eaf0; --muted:#9aa3b2; --rule:#2a303b; --accent:#7ea0ff;
  --pass:#4cc488; --pass-bg:#173326; --warn:#f0a948; --warn-bg:#3a2a12; --fail:#ff7b6e; --fail-bg:#3d1c19; --skip:#a3aab6; --skip-bg:#252a33; color-scheme:dark}
body{background:var(--bg);color:var(--ink);font:15px/1.5 var(--sans)}
.wrap{max-width:1240px;margin:0 auto;padding-block:28px 64px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:grid;gap:24px}
h1{font-size:28px;line-height:1.2;margin:0;text-wrap:balance;letter-spacing:-.01em}
h2{font-size:19px;margin:0;text-wrap:balance}
.muted{color:var(--muted)}
.eyebrow{font:500 12px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
header{display:grid;gap:10px}
.meta-line{display:flex;flex-wrap:wrap;gap:6px 18px;color:var(--muted);font-size:13px}
.meta-line b{color:var(--ink);font-weight:600}
.totals{display:flex;flex-wrap:wrap;gap:10px}
.total{display:flex;align-items:baseline;gap:8px;padding:8px 14px;border-radius:8px;background:var(--surface);border:1px solid var(--rule);font-variant-numeric:tabular-nums}
.total strong{font:600 22px/1 var(--mono)}
.total.FAIL strong{color:var(--fail)}.total.WARN strong{color:var(--warn)}.total.PASS strong{color:var(--pass)}.total.SKIP strong{color:var(--skip)}
.panel{background:var(--surface);border:1px solid var(--rule);border-radius:10px;padding:18px;display:grid;gap:12px;min-width:0}
.issues{margin:4px 0 0;padding-left:20px;display:grid;gap:6px}
.issues a{color:var(--ink);text-decoration-color:var(--rule)}
.issues a:hover{text-decoration-color:var(--accent)}
.scroll{overflow-x:auto;min-width:0}
table{border-collapse:collapse;width:100%}
th{font:500 12px/1.2 var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--muted);text-align:left;padding:8px 10px;border-bottom:1px solid var(--rule)}
td{padding:10px;border-bottom:1px solid var(--rule);vertical-align:top}
.summary td{vertical-align:middle;font-variant-numeric:tabular-nums}
.summary a{color:var(--ink);font-weight:600;text-decoration:none}.summary a:hover{color:var(--accent)}
.num{font-family:var(--mono);text-align:right;width:56px}
.bar{display:flex;height:8px;width:160px;max-width:100%;border-radius:4px;overflow:hidden;background:var(--skip-bg)}
.bar i{display:block;height:100%}.bar .PASS{background:var(--pass)}.bar .WARN{background:var(--warn)}.bar .FAIL{background:var(--fail)}.bar .SKIP{background:var(--skip)}
.chip{display:inline-block;font:600 12px/1 var(--sans);padding:5px 9px;border-radius:999px;white-space:nowrap}
.chip.PASS{color:var(--pass);background:var(--pass-bg)}.chip.WARN{color:var(--warn);background:var(--warn-bg)}.chip.FAIL{color:var(--fail);background:var(--fail-bg)}.chip.SKIP{color:var(--skip);background:var(--skip-bg)}
.filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;position:sticky;top:env(safe-area-inset-top,0px);z-index:5;background:var(--bg);padding-block:10px}
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:10;background:var(--bg)}
.filters button{font:500 13px var(--sans);color:var(--ink);background:var(--surface);border:1px solid var(--rule);border-radius:999px;padding:6px 12px;cursor:pointer}
.filters button[aria-pressed="true"]{border-color:var(--accent);color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.filters button:focus-visible,.thumb:focus-visible,details summary:focus-visible,#viewer-close:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
details.feature{background:var(--surface);border:1px solid var(--rule);border-radius:10px;min-width:0}
details.feature>summary{list-style:none;cursor:pointer;display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;padding:14px 18px}
details.feature>summary::-webkit-details-marker{display:none}
details.feature>summary::before{content:"▸";color:var(--muted);transition:transform .15s}
details.feature[open]>summary::before{transform:rotate(90deg)}
.counts{font:13px var(--mono);color:var(--muted);font-variant-numeric:tabular-nums;margin-left:auto}
.checks{border-top:1px solid var(--rule)}
.checks td.check{width:22%}.checks td.exp,.checks td.act{width:27%}.checks td.st{width:8%}.checks td.ev{width:16%}
.name{display:block;font-weight:600}.meta{display:block;color:var(--muted);font-size:12px;margin-top:2px}
.lbl{display:none}
.act,.exp{overflow-wrap:anywhere}
tr.r[data-status="FAIL"] td:first-child{box-shadow:inset 3px 0 0 var(--fail)}
tr.r[data-status="WARN"] td:first-child{box-shadow:inset 3px 0 0 var(--warn)}
.thumb{display:block;padding:0;border:1px solid var(--rule);border-radius:6px;overflow:hidden;background:var(--bg);cursor:zoom-in;width:100%;max-width:200px}
.thumb img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;object-position:top}
dialog{border:none;padding:0;background:transparent;max-width:min(1400px,96vw);width:96vw}
dialog::backdrop{background:var(--scrim)}
dialog figure{margin:0;display:grid;gap:8px}
dialog img{width:100%;max-height:82vh;object-fit:contain;border-radius:8px;background:var(--scrim)}
dialog figcaption{color:var(--on-scrim);font-size:14px;display:flex;justify-content:space-between;gap:12px;align-items:center}
#viewer-close{font:600 13px var(--sans);background:var(--surface);color:var(--ink);border:0;border-radius:6px;padding:7px 12px;cursor:pointer}
.note{font-size:13px;color:var(--muted);margin:0}
@media (max-width:760px){
  .checks thead{display:none}
  .checks table,.checks tbody{display:block}
  .checks tr.r{display:grid;grid-template-columns:1fr auto;gap:8px 12px;padding:14px 16px;border-bottom:1px solid var(--rule)}
  .checks tr.r[hidden]{display:none}
  .checks td{border:0;padding:0;width:auto!important;min-width:0}
  .checks td.check{grid-column:1}.checks td.st{grid-column:2;grid-row:1}
  .checks td.exp,.checks td.act,.checks td.ev{grid-column:1/-1}
  .lbl{display:block;font:500 11px/1.4 var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
  .thumb{max-width:100%}
  tr.r[data-status] td:first-child{box-shadow:none}
  tr.r[data-status="FAIL"]{box-shadow:inset 3px 0 0 var(--fail)}tr.r[data-status="WARN"]{box-shadow:inset 3px 0 0 var(--warn)}
  .counts{margin-left:0}
}
@media (prefers-reduced-motion:reduce){details.feature>summary::before{transition:none}}
</style>
<div class="wrap">
<header>
  <span class="eyebrow">Production monitor · feature report</span>
  <h1>Hercules Monitor Report</h1>
  <div class="meta-line">
    <span>Run <b>${esc(started ? new Date(started).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '-')}</b></span>
    <span>Site <b>hercules.works</b> (production)</span>
    <span>Account <b>existing monitor account</b>, no sign-up</span>
    <span>Groups <b>${groups.map(g => esc(GROUP_LABEL[g.group] || g.group)).join(', ')}</b></span>
  </div>
  <div class="totals">
    <span class="total FAIL"><strong>${n(rows, 'FAIL')}</strong> failed</span>
    <span class="total WARN"><strong>${n(rows, 'WARN')}</strong> warnings</span>
    <span class="total PASS"><strong>${n(rows, 'PASS')}</strong> passed</span>
    <span class="total SKIP"><strong>${n(rows, 'SKIP')}</strong> skipped</span>
  </div>
</header>

${productFails.length || testFails.length ? `<section class="panel" aria-labelledby="issues-h">
  <h2 id="issues-h">What failed</h2>
  ${productFails.length ? `<div><strong>Product: Hercules did not behave as expected</strong><ol class="issues">${productFails.map(r => `<li><a href="#${esc(r.id)}">${esc(r.feature)}: ${esc(r.name)}</a> <span class="muted">${esc(r.actual)}</span></li>`).join('')}</ol></div>` : ''}
  ${testFails.length ? `<div><strong>Test script: the monitor could not complete a step</strong><ol class="issues">${testFails.map(r => `<li><a href="#${esc(r.id)}">${esc(r.feature)}: ${esc(r.name)}</a> <span class="muted">${esc(r.actual)}</span></li>`).join('')}</ol></div>` : ''}
</section>` : `<section class="panel"><h2>No failures</h2><p class="note">Every check passed or ended as a warning.</p></section>`}

<section class="panel" aria-labelledby="sum-h">
  <h2 id="sum-h">By feature</h2>
  <div class="scroll"><table class="summary">
    <thead><tr><th>Feature</th><th>Status</th><th class="num">Pass</th><th class="num">Warn</th><th class="num">Fail</th><th class="num">Skip</th><th>Result mix</th></tr></thead>
    <tbody>${features.map(f => `<tr><td><a href="#f-${slug(f.name)}">${esc(f.name)}</a></td><td>${chip(worst(f.rows))}</td><td class="num">${n(f.rows, 'PASS')}</td><td class="num">${n(f.rows, 'WARN')}</td><td class="num">${n(f.rows, 'FAIL')}</td><td class="num">${n(f.rows, 'SKIP')}</td><td>${bar(f.rows)}</td></tr>`).join('')}</tbody>
  </table></div>
  <p class="note">Each screenshot outlines the element the check is about (green pass, orange warning, red fail) and repeats the expected and actual result in a banner. Share links are checked and photographed in a separate logged-out browser, like incognito.</p>
</section>

<div class="filters" role="group" aria-label="Show checks">
  <span class="muted">Show</span>
  <button type="button" data-f="all" aria-pressed="true">All (${rows.length})</button>
  <button type="button" data-f="FAIL" aria-pressed="false">Failed (${n(rows, 'FAIL')})</button>
  <button type="button" data-f="WARN" aria-pressed="false">Warnings (${n(rows, 'WARN')})</button>
  <button type="button" data-f="PASS" aria-pressed="false">Passed (${n(rows, 'PASS')})</button>
  <button type="button" data-f="SKIP" aria-pressed="false">Skipped (${n(rows, 'SKIP')})</button>
</div>

${features.map(f => `<details class="feature" id="f-${slug(f.name)}" open>
  <summary><h2>${esc(f.name)}</h2>${chip(worst(f.rows))}<span class="counts">${n(f.rows, 'PASS')} pass · ${n(f.rows, 'WARN')} warn · ${n(f.rows, 'FAIL')} fail · ${n(f.rows, 'SKIP')} skip</span></summary>
  <div class="scroll checks"><table>
    <thead><tr><th>Check</th><th>Expected</th><th>Actual</th><th>Status</th><th>Screenshot</th></tr></thead>
    <tbody>${f.rows.map(row).join('')}</tbody>
  </table></div>
</details>`).join('\n')}
</div>

<dialog id="viewer" aria-label="Screenshot">
  <figure><img id="viewer-img" alt=""><figcaption><span id="viewer-cap"></span><button type="button" id="viewer-close">Close</button></figcaption></figure>
</dialog>
<script>
(() => {
  const btns = [...document.querySelectorAll('.filters button')];
  const apply = f => {
    btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === f)));
    document.querySelectorAll('tr.r').forEach(tr => { tr.hidden = f !== 'all' && tr.dataset.status !== f; });
    document.querySelectorAll('details.feature').forEach(d => { d.hidden = ![...d.querySelectorAll('tr.r')].some(tr => !tr.hidden); });
  };
  btns.forEach(b => b.addEventListener('click', () => apply(b.dataset.f)));
  const dlg = document.getElementById('viewer'), img = document.getElementById('viewer-img'), cap = document.getElementById('viewer-cap');
  document.addEventListener('click', e => {
    const t = e.target.closest('.thumb');
    if (t) { img.src = t.dataset.src; img.alt = t.dataset.cap; cap.textContent = t.dataset.cap; dlg.showModal(); }
  });
  document.getElementById('viewer-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
})();
</script>
`;

fs.writeFileSync(path.join(runDir, 'feature-report.html'), html);
console.log(`${rows.length} checks in ${features.length} features (${n(rows, 'PASS')} pass, ${n(rows, 'WARN')} warn, ${n(rows, 'FAIL')} fail, ${n(rows, 'SKIP')} skip)`);
console.log(`→ ${path.join(runDir, 'feature-report.html')}`);
