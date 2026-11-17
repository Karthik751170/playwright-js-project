/**
 * Content checks for the hourly monitor: validate the research brief and the created survey.
 *
 * The brief and survey are AI-generated and different every run, so nothing here compares exact
 * wording. Checks come from three stable sources:
 *   1. the prompt itself (brand, product words, cities the monitor asked for),
 *   2. structure (named brief sections, contiguous question numbers, options on choice questions),
 *   3. internal consistency (counts that must add up, references that must point at real questions).
 * Hard structural defects are severity 'fail'; fuzzy or AI-variance-prone ones are 'warn'.
 *
 * Pure functions of text: no Playwright, so they can be unit-tested against saved brief.txt / survey.txt.
 * Each check is { name, ok, detail, severity, expected }.
 */
'use strict';

const STOP = new Set(['about', 'their', 'which', 'these', 'those', 'where', 'while', 'would', 'could', 'should', 'based', 'using', 'range', 'plan', 'service', 'services']);
const NOT_A_CITY = new Set(['India', 'South', 'North', 'East', 'West', 'Tier', 'Pan', 'Metro']);
const ALIASES = { bengaluru: ['bangalore'], bangalore: ['bengaluru'], delhi: ['new delhi', 'delhi ncr', 'ncr'], mumbai: ['bombay'], kolkata: ['calcutta'], chennai: ['madras'] };
const BAD_TOKENS = /\[object\b|\bundefined\b|\bNaN\b|\bnull\b|\{\{|\}\}|lorem ipsum|\bTODO\b/i;

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const chk = (name, ok, detail, severity = 'fail', expected) => ({ name, ok: !!ok, detail, severity, expected });

/** Words (5+ letters) from the prompt's product/category, e.g. "a millet-based healthy snack range" -> millet, healthy, snack. */
function keywords(...texts) {
    const out = new Set();
    for (const t of texts) for (const m of String(t || '').toLowerCase().matchAll(/[a-z]{5,}/g)) if (!STOP.has(m[0])) out.add(m[0].replace(/s$/, ''));
    return [...out];
}

/** City names the prompt asked for. Generic areas ("pan-India urban", "tier 2 cities in South India") give []. */
function promptCities(geography) {
    const g = String(geography || '');
    const inParens = g.match(/\(([^)]+)\)/);
    const src = inParens ? inParens[1] : g;
    const found = [...src.matchAll(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\b/g)].map(m => m[0]).filter(w => !NOT_A_CITY.has(w.split(' ')[0]));
    return [...new Set(found)];
}

const cityMentioned = (text, city) => {
    const t = norm(text), c = norm(city);
    return t.includes(c) || (ALIASES[c] || []).some(a => t.includes(a));
};

/** The brief document itself: from "RESEARCH BRIEF" to the "Edit Audience" button (page chrome excluded). */
function briefBody(pageText) {
    const t = String(pageText || '');
    const start = t.search(/RESEARCH BRIEF/);
    const from = start >= 0 ? start : 0;
    const rest = t.slice(from);
    const end = rest.search(/\n\s*Edit Audience\b/);
    return end >= 0 ? rest.slice(0, end) : rest;
}

const SECTIONS = {
    core: [['Background & Context', /Background\s*(?:&|and)\s*Context/i], ['Research Objectives', /Research Objectives/i], ['Question Flow', /Question Flow/i], ['Target Audience', /Target Audience/i]],
    extra: [['Type of Study', /Type of Study/i], ['Key Data Points', /Key Data Points/i], ['Expected Insights', /Expected Insights/i], ['Assumptions & Open Items', /Assumptions\s*(?:&|and)\s*Open Items/i]],
};

/**
 * The brief's own statement of the survey length, e.g. "Estimated length: About 16-18 questions, roughly 8-11 minutes".
 * Anchored on the "Estimated length" label so other "N-M questions" phrases in the brief (per phase, per screener…)
 * are never mistaken for the total. No label -> null and the dependent checks are skipped.
 */
function statedQuestionRange(text) {
    const line = (String(text || '').match(/Estimated length[^\n]*/i) || [])[0];
    if (!line) return null;
    const r = line.match(/(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*questions/i);
    if (r) { const lo = Number(r[1]), hi = Number(r[2]); return [Math.min(lo, hi), Math.max(lo, hi)]; }
    const s1 = line.match(/(\d{1,2})\s*[-\s]?questions?\b/i);
    return s1 ? [Number(s1[1]), Number(s1[1])] : null;
}

/**
 * Brief checks. `pageText` is the whole page text, `topic` is the generated prompt's topic
 * ({ brand, product, category, geography }), `audience` is parseTargetAudience(pageText) or null.
 */
function checkBrief(pageText, topic = {}, audience = null, opts = {}) {
    const body = briefBody(pageText);
    const out = [];

    const missingCore = SECTIONS.core.filter(([, re]) => !re.test(body)).map(([n]) => n);
    out.push(chk('brief has its core sections', !missingCore.length, missingCore.length ? `missing: ${missingCore.join(', ')}` : SECTIONS.core.map(([n]) => n).join(', '), 'fail',
        'The research brief has Background & Context, Research Objectives, Question Flow and Target Audience'));
    const missingExtra = SECTIONS.extra.filter(([, re]) => !re.test(body)).map(([n]) => n);
    out.push(chk('brief has its other sections', !missingExtra.length, missingExtra.length ? `missing: ${missingExtra.join(', ')}` : SECTIONS.extra.map(([n]) => n).join(', '), 'warn',
        'The research brief also has Type of Study, Key Data Points, Expected Insights and Assumptions & Open Items'));

    if (topic.brand) out.push(chk('brief names the client from the prompt', norm(body).includes(norm(topic.brand)), `looking for "${topic.brand}"`, 'fail',
        `The brief mentions the client named in the prompt (${topic.brand})`));

    const kw = keywords(topic.product, topic.category);
    if (kw.length) {
        const hits = kw.filter(k => norm(body).includes(k));
        const need = Math.max(1, Math.ceil(kw.length / 3));
        out.push(chk('brief is about the prompt\'s product', hits.length >= need, `${hits.length}/${kw.length} product words found (${hits.join(', ') || 'none'}); need ${need}`, 'fail',
            `The brief talks about the product from the prompt (${topic.product})`));
    }

    const objectives = (body.match(/^\s*(?:Strategic\s+)?Objective:/gim) || []).length;
    out.push(chk('brief lists research objectives', objectives >= 2, `${objectives} objective line(s)`, 'fail', 'The brief lists at least 2 objectives'));

    const bad = body.match(BAD_TOKENS);
    out.push(chk('brief has no broken text', !bad, bad ? `found "${bad[0]}"` : 'no placeholder or error text', 'fail', 'The brief has no "undefined", "null", "[object", template braces or lorem ipsum'));

    const cities = promptCities(topic.geography);
    const geoLine = (body.match(/Geographic Focus:\s*([^\n]+)/i) || [])[1] || '';
    if (cities.length) {
        const missing = cities.filter(c => !cityMentioned(geoLine, c));
        const ok = missing.length === 0;
        out.push(chk('brief targets the cities in the prompt', missing.length < cities.length, ok ? `all ${cities.length}: ${cities.join(', ')}` : `missing ${missing.join(', ')} (asked for ${cities.join(', ')})`,
            missing.length === cities.length ? 'fail' : 'warn', `Geographic Focus covers the cities in the prompt (${cities.join(', ')})`));
        const each = geoLine.match(/(\d[\d,]*)\s*respondents?\s*(?:in|per)\s*(?:each|every)\s*city/i);
        if (each && audience && audience.totalSampleSize) {
            const total = Number(each[1].replace(/,/g, '')) * cities.length;
            out.push(chk('brief city split adds up to the sample', total === audience.totalSampleSize, `${each[1]} x ${cities.length} cities = ${total}; sample ${audience.totalSampleSize}`, 'warn',
                'Respondents per city times the number of cities equals the total sample size'));
        }
    } else if (topic.geography) {
        out.push(chk('brief states a geographic focus', /\S{3,}/.test(geoLine), geoLine ? geoLine.slice(0, 80) : 'no Geographic Focus line', 'warn', `The brief states where to ask (${topic.geography})`));
    }

    if (audience) {
        const n = audience.totalSampleSize;
        out.push(chk('brief sample size is plausible', Number.isInteger(n) && n >= 30 && n <= 100000, `sample ${n}`, 'fail', 'Total Sample Size is a whole number between 30 and 100,000'));
        const ageLine = (body.match(/Age(?: Range)?:\s*([^\n]+)/i) || [])[1] || '';
        const counts = [...ageLine.matchAll(/\((\d[\d,]*)\s*respondents?\)/gi)].map(m => Number(m[1].replace(/,/g, '')));
        if (counts.length >= 2 && n) {
            const sum = counts.reduce((a, b) => a + b, 0);
            out.push(chk('brief age groups add up to the sample', sum === n, `${counts.join(' + ')} = ${sum}; sample ${n}`, opts.failOnAudienceInconsistency ? 'fail' : 'warn', 'Respondents per age group add up to the total sample size'));
        }
        const rules = (audience.screeningCriteria || []).length + (audience.behavioralFilters || []).length;
        out.push(chk('brief has screening or behavioural filters', rules >= 1, `${(audience.screeningCriteria || []).length} screening, ${(audience.behavioralFilters || []).length} behavioural`, 'warn', 'The Target Audience has screening criteria or behavioural filters'));
    }

    const range = statedQuestionRange(body);
    if (range) out.push(chk('brief states a sensible question count', range[0] >= 3 && range[1] <= 60 && range[0] <= range[1], `${range[0]}-${range[1]} questions`, 'warn', 'The brief says how many questions the survey has (3 to 60)'));
    return out;
}

/** Survey page text -> [{ n, text, format, options[], hasInput }] from the "N." blocks. */
function parseSurveyQuestions(surveyText) {
    const lines = String(surveyText || '').split('\n').map(s => s.trim());
    let start = lines.findIndex(l => /^Survey Version \(\d+\)$/.test(l));
    start = start >= 0 ? start : 0;
    const questions = [];
    let cur = null;
    for (let i = start; i < lines.length; i++) {
        const l = lines[i];
        const head = l.match(/^(\d{1,3})\.$/);
        if (head) { cur = { n: Number(head[1]), text: '', format: '', options: [], hasInput: false, extra: 0 }; questions.push(cur); continue; }
        if (!cur || !l || /^\d+ Logic rules? applied$/i.test(l) || /^Attention checker$/i.test(l)) continue;
        const opt = l.match(/^(\d{1,3})\.(\S.*)$/);
        if (!cur.text) { cur.text = l; continue; }
        if (opt) cur.options.push(opt[2].trim());
        else if (/^Type your answer/i.test(l)) cur.hasInput = true;
        else if (/^(Select\b|Rate\b|A few words|Option [A-Z]\b|Please follow)/i.test(l)) { if (!cur.format) cur.format = l; }
        else cur.extra++;
    }
    return questions;
}

/**
 * Survey checks, run after the survey is created. `surveyText` is the page text, `brief` is the
 * brief page text (for its stated question count), `topic` as above.
 */
function checkSurvey(surveyText, topic = {}, briefText = '', opts = {}) {
    const qs = parseSurveyQuestions(surveyText);
    const out = [];
    const tol = opts.questionCountTolerance ?? 3;

    const seq = qs.map(q => q.n);
    const contiguous = qs.length > 0 && seq.every((n, i) => n === i + 1);
    out.push(chk('survey questions are numbered 1..N', contiguous, qs.length ? (contiguous ? `${qs.length} questions` : `numbers seen: ${seq.join(',')}`) : 'no numbered questions found', 'fail',
        'The survey lists its questions as 1, 2, 3… with no gaps or repeats'));
    if (!qs.length) return out;

    const noText = qs.filter(q => q.text.length < 8).map(q => q.n);
    out.push(chk('every survey question has text', !noText.length, noText.length ? `empty or too short: Q${noText.join(', Q')}` : `${qs.length} of ${qs.length}`, 'fail', 'Every question has its wording'));

    const unanswerable = qs.filter(q => !q.options.length && !q.hasInput && !q.format && q.extra < 1).map(q => q.n);
    out.push(chk('every survey question can be answered', !unanswerable.length, unanswerable.length ? `no options, input box or format on Q${unanswerable.join(', Q')}` : 'each has options, an input box, a rating grid or a format',
        'fail', 'Every question shows something to answer with after its wording (options, text box, rating scale, grid or any other control)'));

    const choice = qs.filter(q => /^Select\b/i.test(q.format));
    const badChoice = choice.filter(q => q.options.length < 2 || new Set(q.options.map(norm)).size !== q.options.length).map(q => q.n);
    out.push(chk('choice questions have 2+ distinct options', !badChoice.length, badChoice.length ? `fewer than 2 or duplicate options on Q${badChoice.join(', Q')}` : `${choice.length} choice questions checked`, 'fail',
        'Every "Select one / all that apply" question has at least 2 different options'));

    const bad = qs.map(q => ({ n: q.n, m: [q.text, ...q.options].join(' ').match(BAD_TOKENS) })).filter(x => x.m);
    out.push(chk('survey has no broken text', !bad.length, bad.length ? `Q${bad[0].n} has "${bad[0].m[0]}"` : 'no placeholder or error text', 'fail', 'No "undefined", "null", "[object", template braces or lorem ipsum in the questions'));

    const kw = keywords(topic.product, topic.category);
    if (kw.length) {
        const text = norm(qs.map(q => [q.text, ...q.options].join(' ')).join(' '));
        const hits = kw.filter(k => text.includes(k));
        out.push(chk('survey questions are about the prompt\'s product', hits.length >= 1, `${hits.length}/${kw.length} product words in the questions (${hits.join(', ') || 'none'})`, 'warn',
            `At least one question mentions the product or category from the prompt (${topic.category || topic.product})`));
    }

    const refs = [...new Set([...String(surveyText).matchAll(/\bQ(\d{1,3})\b/g)].map(m => Number(m[1])))];
    const dangling = refs.filter(n => n < 1 || n > qs.length);
    out.push(chk('logic only refers to real questions', !dangling.length, dangling.length ? `refers to Q${dangling.join(', Q')} but the survey has ${qs.length}` : refs.length ? `${refs.length} referenced, all within Q1-Q${qs.length}` : 'no question references', 'warn',
        'Any "Q17 is skipped if…" note points at a question that exists'));

    const range = statedQuestionRange(briefBody(briefText));
    if (range) out.push(chk('survey length matches the brief', qs.length >= range[0] - tol && qs.length <= range[1] + tol, `brief says ${range[0]}-${range[1]}, survey has ${qs.length} (tolerance ${tol})`, 'warn',
        'The number of questions is close to what the brief promised'));
    return out;
}

module.exports = { checkBrief, checkSurvey, parseSurveyQuestions, promptCities, keywords, statedQuestionRange, briefBody };
