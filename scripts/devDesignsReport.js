#!/usr/bin/env node
/**
 * Builds one report from every design's result.json under a folder (default reports/dev-design-payloads):
 *   report.html  (per-design table, defects first, screenshots linked)
 *   summary.md   (for the GitHub step summary / chat alert)
 *   node scripts/devDesignsReport.js [folder]
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] || 'reports/dev-design-payloads');
const files = [];
(function walk(dir) {
    for (const e of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p); else if (e.name === 'result.json') files.push(p);
    }
})(root);

const results = files.map(f => ({ dir: path.dirname(f), ...JSON.parse(fs.readFileSync(f, 'utf8')) }))
    .sort((a, b) => String(a.facts.sd).localeCompare(String(b.facts.sd)));
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rel = p => path.relative(root, p).split(path.sep).join('/');
const stage = r => {
    const f = r.facts;
    if (f.blockedBy === 'turnstile') return 'Super J: blocked by Turnstile';
    if (f.superjScreens) return 'Super J answered';
    if (f.superjLink) return 'deployed';
    if (f.surveyDesigns) return 'payload checked';
    if (f.chatUrl) return 'chat opened';
    return 'not started';
};
const count = s => results.reduce((n, r) => n + r.checks.filter(c => c.status === s).length, 0);
const defects = results.flatMap(r => r.defects.map(c => ({ sd: r.facts.sd, design: r.facts.design, ...c })));
const warns = results.flatMap(r => r.checks.filter(c => c.status === 'WARN').map(c => ({ sd: r.facts.sd, design: r.facts.design, ...c })));
const testFails = results.flatMap(r => r.checks.filter(c => c.status === 'FAIL' && c.kind !== 'defect').map(c => ({ sd: r.facts.sd, design: r.facts.design, ...c })));

const md = [
    `## Doc 1 design payloads on dev — ${results.length} designs`,
    `${count('PASS')} pass · ${count('WARN')} warn · ${count('FAIL')} fail (${defects.length} product defects)`,
    '',
    defects.length ? `### 🐞 Defects\n${defects.map(d => `- **SD${d.sd} ${d.design}** — ${d.name}: ${d.detail}`).join('\n')}` : '### No product defects',
    testFails.length ? `\n### ⚙️ Test could not complete\n${testFails.map(d => `- SD${d.sd} ${d.design} — ${d.name}: ${d.detail}`).join('\n')}` : '',
    '',
    '| Design | Result | Reached | Designs in payload | Qs | Chat |',
    '|---|---|---|---|---|---|',
    ...results.map(r => `| SD${r.facts.sd} ${r.facts.design} | ${r.status} | ${stage(r)} | ${(r.facts.surveyDesigns || []).join(', ') || '-'} | ${r.facts.questions ?? '-'} | ${r.facts.chatUrl || '-'} |`),
].join('\n');

const card = r => `
<section class="d ${r.status}">
  <h2><span class="id">SD${esc(r.facts.sd)}</span> ${esc(r.facts.design)} <span class="badge ${r.status}">${r.status}</span></h2>
  <p class="muted">${esc(r.facts.prompt)}</p>
  <dl>
    <dt>Reached</dt><dd>${esc(stage(r))}</dd>
    <dt>Expected keys</dt><dd><code>${esc((r.facts.expectedKeys || []).join(', '))}</code></dd>
    <dt>surveyDesigns</dt><dd><code>${esc(JSON.stringify(r.facts.surveyDesigns || []))}</code> audience designs <code>${esc(JSON.stringify(r.facts.audienceDesigns || []))}</code></dd>
    <dt>Questions</dt><dd>${esc(r.facts.questions ?? '-')} (artifact example ${esc(r.facts.exampleQuestions ?? '-')})</dd>
    <dt>Super J expected</dt><dd>${esc(r.facts.superjExpected)}</dd>
    <dt>Respondent</dt><dd>${esc(r.facts.persona ? `${r.facts.persona.gender}, born ${r.facts.persona.birthYear}, ${r.facts.persona.city}` : '-')}</dd>
    <dt>Links</dt><dd>${r.facts.chatUrl ? `<a href="${esc(r.facts.chatUrl)}">Hercules chat</a>` : '-'} ${r.facts.superjDevLink ? ` · <a href="${esc(r.facts.superjDevLink)}">dev Super J survey</a>` : ''}</dd>
    <dt>Account</dt><dd>${esc(r.facts.account || '-')}</dd>
  </dl>
  <table><thead><tr><th>Check</th><th>Status</th><th>Type</th><th>Detail</th></tr></thead><tbody>
  ${r.checks.map(c => `<tr class="${c.status}"><td>${esc(c.name)}</td><td>${c.status}</td><td>${c.kind === 'defect' ? 'product' : 'test'}</td><td>${esc(c.detail)}</td></tr>`).join('')}
  </tbody></table>
  ${(r.facts.superjScreens || []).length ? `<details><summary>Super J screens (${r.facts.superjScreens.length})</summary><ol>${r.facts.superjScreens.map(s => `<li>${esc(s)}</li>`).join('')}</ol></details>` : ''}
  ${(r.facts.logicRules || []).length ? `<details><summary>Logic rules (${r.facts.logicRules.length})</summary><ul>${r.facts.logicRules.map(s => `<li>${esc(s)}</li>`).join('')}</ul></details>` : ''}
  <div class="shots">${(r.screenshots || []).filter(p => fs.existsSync(p)).map(p => `<a href="${esc(rel(p))}"><img loading="lazy" src="${esc(rel(p))}" alt="${esc(path.basename(p))}"></a>`).join('')}</div>
</section>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dev design payloads</title><style>
:root{--bg:#f7f8f6;--card:#fff;--ink:#18231f;--muted:#5b6862;--rule:#dfe4e0;--pass:#1f6f5c;--warn:#b4530a;--fail:#b42318}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px}h1{margin:0 0 4px}.muted{color:var(--muted)}
.d{background:var(--card);border:1px solid var(--rule);border-radius:10px;padding:16px;margin:16px 0}.d h2{margin:0 0 6px;font-size:18px}
.id{font-family:ui-monospace,Menlo,monospace;color:var(--pass)}.badge{font-size:12px;padding:2px 8px;border-radius:99px;color:#fff;vertical-align:middle}
.badge.PASS{background:var(--pass)}.badge.WARN{background:var(--warn)}.badge.FAIL{background:var(--fail)}
dl{display:grid;grid-template-columns:150px 1fr;gap:2px 12px;margin:8px 0}dt{color:var(--muted)}dd{margin:0;overflow-wrap:anywhere}
table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}td,th{border-top:1px solid var(--rule);padding:5px 6px;text-align:left;vertical-align:top}
tr.FAIL td:nth-child(2){color:var(--fail);font-weight:600}tr.WARN td:nth-child(2){color:var(--warn);font-weight:600}tr.PASS td:nth-child(2){color:var(--pass)}
.shots{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.shots img{height:120px;border:1px solid var(--rule);border-radius:6px}
.sum li{margin:3px 0}@media(max-width:640px){dl{grid-template-columns:1fr}}
</style></head><body><main>
<h1>Doc 1 design payloads — dev</h1>
<p class="muted">${esc(new Date().toISOString())} · dev.hercules.works → dev.superj.app · ${results.length} designs · ${count('PASS')} pass, ${count('WARN')} warn, ${count('FAIL')} fail</p>
<h2>Defects (${defects.length})</h2>${defects.length ? `<ul class="sum">${defects.map(d => `<li><b>SD${esc(d.sd)} ${esc(d.design)}</b> — ${esc(d.name)}: ${esc(d.detail)}</li>`).join('')}</ul>` : '<p>None.</p>'}
${testFails.length ? `<h2>Test could not complete (${testFails.length})</h2><ul class="sum">${testFails.map(d => `<li>SD${esc(d.sd)} ${esc(d.design)} — ${esc(d.name)}: ${esc(d.detail)}</li>`).join('')}</ul>` : ''}
${warns.length ? `<h2>Warnings (${warns.length})</h2><ul class="sum">${warns.map(d => `<li>SD${esc(d.sd)} ${esc(d.design)} — ${esc(d.name)}: ${esc(d.detail)}</li>`).join('')}</ul>` : ''}
${results.map(card).join('')}
</main></body></html>`;

fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(path.join(root, 'report.html'), html);
fs.writeFileSync(path.join(root, 'summary.md'), md);
console.log(md);
console.log(`\n→ ${path.join(root, 'report.html')}`);
