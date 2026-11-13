/**
 * Parses the "Target Audience" section of a Hercules research brief from page text.
 *
 * The audience is AI-generated and differs every run, so callers capture it per run and assert
 * against that capture (never against hardcoded values). Fields that aren't found are null/[],
 * and `raw` always holds the section text for manual review.
 */
const NEXT_SECTION = /\n(?:Methodology|Research Methodology|Question Flow|Key Data Points|Expected Insights|Timeline|Study Design|If you're satisfied)\b/;

function sliceSection(pageText) {
    const start = pageText.search(/Target Audience/i);
    if (start < 0) return null;
    // Some headings render as "Target Audience See why"; take the occurrence followed by a sample size.
    const withSample = pageText.slice(start).search(/Total Sample Size/i);
    const from = withSample >= 0 ? start + pageText.slice(start, start + withSample).lastIndexOf('Target Audience') : start;
    const rest = pageText.slice(from);
    const end = rest.slice(20).search(NEXT_SECTION);
    return (end >= 0 ? rest.slice(0, end + 20) : rest.slice(0, 4000)).trim();
}

function listAfter(raw, heading) {
    const m = raw.match(new RegExp(`${heading}:?\\s*\\n([\\s\\S]*?)(?:\\n\\s*\\n[A-Z][^\\n]*:|$)`, 'i'));
    return m ? m[1].split('\n').map(s => s.trim()).filter(Boolean) : [];
}

function parseTargetAudience(pageText) {
    const raw = sliceSection(pageText || '');
    if (!raw) return null;
    const num = s => (s ? Number(s.replace(/,/g, '')) : null);

    const sample = raw.match(/Total Sample Size:\s*([\d,]+)/i);
    const geo = raw.match(/Geographic Focus:\s*([^\n]+)/i);
    const genderLine = raw.match(/Gender:\s*([^\n]+)/i)?.[1] || '';
    const gender = {};
    for (const m of genderLine.matchAll(/(\d+)%\s*(Male|Female|Men|Women|Non-binary|Other)[^(\d]*(?:\((\d[\d,]*)\s*respondents?\))?/gi)) {
        gender[m[2].toLowerCase()] = { pct: Number(m[1]), n: num(m[3]) };
    }
    // e.g. "Age Range: 24-55 across three bands, 24-35 (34 respondents), 35-45 (33 respondents) and 45-55 (33 respondents)".
    // The first range there is the overall span, not a band, so it is kept apart from the bands.
    const ageLine = raw.match(/Age(?: Range)?:\s*([^\n]+)/i)?.[1] || '';
    let ageBands = [...new Set([...ageLine.matchAll(/(\d{2})\s*[-–]\s*(\d{2})/g)].map(m => `${m[1]}-${m[2]}`))];
    let ageRange = null;
    if (ageBands.length > 1 && /across|bands?|split/i.test(ageLine)) {
        const [lo, hi] = ageBands[0].split('-').map(Number);
        const rest = ageBands.slice(1);
        if (rest.every(r => { const [a, b] = r.split('-').map(Number); return a >= lo && b <= hi; })) { ageRange = ageBands[0]; ageBands = rest; }
    }
    const sec = raw.match(/Socio-?economic Class:\s*([^\n(]+)/i)?.[1] || '';

    return {
        totalSampleSize: num(sample?.[1]),
        geographicFocus: geo ? geo[1].split(/,|\band\b/).map(s => s.trim()).filter(Boolean) : [],
        gender,
        ageRange,
        ageBands,
        socioeconomicClass: [...sec.matchAll(/[A-Z]{2,5}\s*[A-Z]\d|\b[A-C]\d\b/g)].map(m => m[0].trim()),
        behavioralFilters: listAfter(raw, 'Behavioral/Psychographic Filters'),
        screeningCriteria: listAfter(raw, 'Screening Criteria'),
        raw,
    };
}

/** Internal-consistency checks that hold for any generated audience. Returns failure strings. */
function audienceConsistencyIssues(a) {
    const issues = [];
    if (!a) return ['Target Audience section not found'];
    if (!a.totalSampleSize) issues.push('Total Sample Size missing');
    const g = Object.values(a.gender);
    if (g.length) {
        const pct = g.reduce((s, x) => s + x.pct, 0);
        if (pct !== 100) issues.push(`Gender percentages sum to ${pct}, not 100`);
        if (a.totalSampleSize && g.every(x => x.n != null)) {
            const n = g.reduce((s, x) => s + x.n, 0);
            if (n !== a.totalSampleSize) issues.push(`Gender counts sum to ${n}, not the sample size ${a.totalSampleSize}`);
        }
    }
    const bands = a.ageBands.map(b => b.split('-').map(Number)).sort((x, y) => x[0] - y[0]);
    for (let i = 1; i < bands.length; i++) {
        // A shared boundary (24-35, 35-45) is Hercules' normal way of writing bands, not an overlap.
        if (bands[i][0] < bands[i - 1][1]) issues.push(`Age bands overlap: ${bands[i - 1].join('-')} and ${bands[i].join('-')}`);
    }
    if (bands.some(([lo]) => lo < 18)) issues.push('Age band includes under-18s');
    return issues;
}

module.exports = { parseTargetAudience, audienceConsistencyIssues };
