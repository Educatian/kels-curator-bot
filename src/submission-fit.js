// Submission Fit scorer -- JS port of FieldExplorer 1.0 src/services/submissionFit.ts.
//
// Ranks venues as SUBMISSION TARGETS for a pasted abstract by combining:
//   1. Topic fit       (cosine over the venue's OpenAlex TF-IDF fingerprint)
//   2. Methodology fit (research-culture share, gated so sparse signals don't saturate)
//   3. CFP readiness   (D-day from verified deadlines)
//
// `profiles` (semantic_profiles.json) is INJECTED so this stays pure/testable and
// the bot can load it from disk. Keep this in sync with the canonical TS module.

export const METHODOLOGY_MAP = {
  Experimental: ['experiment', 'experimental', 'intervention', 'randomized', 'quasi-experimental', 'quantitative', 'control group', 'regression', 'effect size'],
  Qualitative: ['qualitative', 'case study', 'ethnographic', 'ethnography', 'interview', 'narrative', 'thematic analysis', 'phenomenology', 'grounded theory', 'discourse'],
  'Design & Dev': ['design-based', 'design based', 'dbr', 'instructional design', 'prototype', 'interaction design', 'usability', 'system development', 'human-computer interaction', 'learning environment'],
  'Data & AI': ['learning analytics', 'data mining', 'machine learning', 'artificial intelligence', 'predictive', 'nlp', 'algorithm', 'clustering', 'classification', 'genai', 'generative'],
  'Review & Meta': ['systematic review', 'meta-analysis', 'evidence synthesis', 'scoping review', 'bibliometric', 'meta-synthesis', 'literature review'],
  Theory: ['theoretical framework', 'epistemological', 'epistemic', 'conceptual model', 'philosophical', 'critique', 'perspective', 'framework'],
};

const STOP = new Set([
  'the', 'and', 'of', 'in', 'to', 'for', 'with', 'on', 'as', 'by', 'at', 'an', 'be', 'this', 'that', 'from',
  'which', 'are', 'was', 'were', 'has', 'have', 'had', 'been', 'will', 'can', 'not', 'but', 'or', 'their',
  'these', 'such', 'than', 'then', 'while', 'study', 'studies', 'research', 'paper', 'results', 'data',
  'using', 'used', 'use', 'also', 'between', 'more', 'about', 'through', 'into', 'both', 'some', 'our',
  'we', 'they', 'its', 'based', 'analysis', 'findings', 'present', 'propose', 'show', 'among', 'across',
  'however', 'therefore', 'thus', 'background', 'abstract', 'aim', 'aims', 'purpose', 'method', 'methods',
]);

export function vectorizeText(text) {
  if (!text) return {};
  const cleaned = String(text).toLowerCase().replace(/<[^>]*>/g, ' ').replace(/[^a-z\s-]/g, ' ');
  const words = cleaned.split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w));
  const counts = {};
  for (const w of words) counts[w] = (counts[w] || 0) + 1;
  for (let i = 0; i < words.length - 1; i += 1) {
    const bg = `${words[i]} ${words[i + 1]}`;
    counts[bg] = (counts[bg] || 0) + 1;
  }
  return counts;
}

export function expandForTopic(vec) {
  const out = {};
  for (const key in vec) {
    const w = vec[key];
    out[key] = Math.max(out[key] || 0, w);
    const parts = key.split(/[\s-]+/).filter((p) => p.length > 3 && !STOP.has(p));
    if (parts.length > 1) for (const p of parts) out[p] = (out[p] || 0) + w * 0.5;
  }
  return out;
}

export function cosine(a, b) {
  let dot = 0; let na = 0; let nb = 0;
  for (const k in a) { na += a[k] * a[k]; if (k in b) dot += a[k] * b[k]; }
  for (const k in b) nb += b[k] * b[k];
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function methodologyDistribution(vec) {
  const scores = {};
  for (const cat of Object.keys(METHODOLOGY_MAP)) scores[cat] = 0;
  for (const term in vec) {
    const w = vec[term];
    for (const [cat, patterns] of Object.entries(METHODOLOGY_MAP)) {
      if (patterns.some((p) => term === p || term.includes(p))) scores[cat] += w;
    }
  }
  return scores;
}

export function methodologyShares(vec) {
  const dist = methodologyDistribution(vec);
  let total = 0;
  for (const c in dist) total += dist[c];
  if (total <= 0) return dist;
  const out = {};
  for (const c in dist) out[c] = dist[c] / total;
  return out;
}

export function dominantMethodology(vec) {
  const dist = methodologyDistribution(vec);
  let best = null; let bestV = 0;
  for (const c in dist) if (dist[c] > bestV) { bestV = dist[c]; best = c; }
  return bestV > 0 ? best : null;
}

export function cfpReadiness(daysUntil, verified) {
  let base;
  if (daysUntil === null || daysUntil === undefined) base = 0.3;
  else if (daysUntil < 0) base = 0.15;
  else if (daysUntil <= 14) base = 1.0;
  else if (daysUntil <= 45) base = 0.85;
  else if (daysUntil <= 90) base = 0.65;
  else if (daysUntil <= 180) base = 0.45;
  else base = 0.3;
  if (verified && base > 0.15) base = Math.min(1, base + 0.05);
  return base;
}

function hasSignal(v) {
  for (const k in v) if (v[k] > 0) return true;
  return false;
}

const WEIGHTS = { topic: 0.65, method: 0.15, cfp: 0.2 };
const METH_COVERAGE_MIN = 0.03;

/**
 * Rank venues as submission targets.
 * @param {string} abstract
 * @param {Array<{name,type,impact,cfpDaysUntil,cfpVerified}>} venues
 * @param {Record<string, {vector: Record<string,number>}>} profiles  semantic_profiles.json
 */
export function rankSubmissionFit(abstract, venues, profiles) {
  const aVec = vectorizeText(abstract);
  if (!hasSignal(aVec)) return [];
  const aDomMethod = dominantMethodology(aVec);
  const abstractHasMethod = aDomMethod !== null;
  const aTopic = expandForTopic(aVec);
  const prof = profiles || {};

  const interim = [];
  for (const v of venues) {
    const profile = prof[v.name];
    if (!profile || !profile.vector) continue;
    const vVec = profile.vector;
    const rawTopic = cosine(aTopic, expandForTopic(vVec));
    if (rawTopic <= 0) continue;

    const vShares = methodologyShares(vVec);
    let vMethMass = 0; let vTotalMass = 0;
    const vMethDist = methodologyDistribution(vVec);
    for (const c in vMethDist) vMethMass += vMethDist[c];
    for (const k in vVec) vTotalMass += vVec[k];
    const methCoverage = vTotalMass > 0 ? vMethMass / vTotalMass : 0;
    const method = (abstractHasMethod && aDomMethod && methCoverage >= METH_COVERAGE_MIN)
      ? (vShares[aDomMethod] ?? 0)
      : null;
    const cfp = cfpReadiness(v.cfpDaysUntil, v.cfpVerified);

    const vTopic = expandForTopic(vVec);
    const shared = Object.keys(aTopic)
      .filter((k) => k in vTopic)
      .sort((x, y) => {
        const cy = aTopic[y] * vTopic[y]; const cx = aTopic[x] * vTopic[x];
        if (cy !== cx) return cy - cx;
        return (y.includes(' ') ? 1 : 0) - (x.includes(' ') ? 1 : 0);
      })
      .slice(0, 6);
    const topMethodology = method !== null
      ? (Object.entries(vShares).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null)
      : null;

    interim.push({ v, rawTopic, method, cfp, shared, topMethodology });
  }

  if (interim.length === 0) return [];
  const maxTopic = Math.max(...interim.map((x) => x.rawTopic));

  return interim.map((x) => {
    const topicNorm = maxTopic > 0 ? x.rawTopic / maxTopic : 0;
    let overall;
    if (x.method === null) {
      const t = WEIGHTS.topic / (WEIGHTS.topic + WEIGHTS.cfp);
      const c = WEIGHTS.cfp / (WEIGHTS.topic + WEIGHTS.cfp);
      overall = t * topicNorm + c * x.cfp;
    } else {
      overall = WEIGHTS.topic * topicNorm + WEIGHTS.method * x.method + WEIGHTS.cfp * x.cfp;
    }
    return {
      name: x.v.name,
      type: x.v.type,
      impact: x.v.impact,
      overall: Math.round(overall * 100),
      topicScore: Math.round(topicNorm * 100),
      methodScore: x.method === null ? null : Math.round(x.method * 100),
      cfpScore: Math.round(x.cfp * 100),
      cfpDaysUntil: x.v.cfpDaysUntil ?? null,
      cfpVerified: Boolean(x.v.cfpVerified),
      sharedTerms: x.shared,
      topMethodology: x.topMethodology,
    };
  }).sort((a, b) => b.overall - a.overall);
}

/** Format the top-N scorecard rows as a Discord block. */
export function formatScorecard(results, { limit = 5 } = {}) {
  if (!results || results.length === 0) {
    return 'FieldExplorer 지문과 매칭되는 venue를 찾지 못했어요. 영어 초록을 충분히 붙여넣어 주세요.';
  }
  const lines = results.slice(0, limit).map((r, i) => {
    const q = r.impact ? ` · ${r.impact}` : '';
    const method = r.methodScore === null ? '' : ` · 방법론 ${r.methodScore}`;
    const cfp = r.cfpDaysUntil === null ? '' : (r.cfpDaysUntil >= 0 ? ` · CFP D-${r.cfpDaysUntil}` : ' · CFP 지남');
    const why = r.sharedTerms.length ? `\n   왜: ${r.sharedTerms.slice(0, 4).join(', ')}` : '';
    return `**${i + 1}. ${r.name}** — 적합도 ${r.overall}${q}\n   주제 ${r.topicScore}${method}${cfp}${why}`;
  });
  return lines.join('\n');
}
