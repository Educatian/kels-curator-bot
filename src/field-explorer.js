import fs from 'node:fs/promises';

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'about', 'into', 'are', 'was', 'were',
  'is', 'in', 'study', 'research', 'learning', 'students', 'education', 'kels', 'https', 'http',
]);

export async function loadFieldExplorerTopics(filePath) {
  if (!filePath) return [];
  const text = await fs.readFile(filePath, 'utf8');
  return parseFieldExplorerFile(text);
}

export function parseFieldExplorerFile(text) {
  const venueTopics = parseFieldExplorerVenuesJson(text);
  if (venueTopics.length) return venueTopics;

  const embeddedCsv = extractEmbeddedCsvData(text);
  const source = embeddedCsv || text;
  const records = parseCsv(source.replace(/^\uFEFF/, ''));
  const header = records[0] ?? [];
  if (header.includes('Name') && header.includes('Type') && header.includes('Category')) {
    return parseFieldExplorerNetworkCsv(source);
  }
  if (header.includes('Topic') && header.includes('Representation')) {
    return parseFieldExplorerTopics(source);
  }
  return [];
}

export function parseFieldExplorerVenuesJson(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(String(jsonText ?? '').replace(/^\uFEFF/, ''));
  } catch {
    return [];
  }

  const venues = Array.isArray(parsed) ? parsed : parsed?.venues;
  if (!Array.isArray(venues)) return [];

  const categoryMap = new Map();
  for (const venue of venues) {
    const name = String(venue?.name ?? '').trim();
    const type = String(venue?.type ?? '').trim();
    const categories = Array.isArray(venue?.categories) ? venue.categories : [];
    if (!name || !type || !categories.length) continue;

    for (const rawCategory of categories) {
      const category = String(rawCategory ?? '').trim();
      if (!category) continue;

      const item = categoryMap.get(category) ?? {
        id: category,
        count: 0,
        name: category,
        rawName: category,
        sourceType: 'fieldexplorer-venues-json',
        keywords: [],
        journals: [],
        conferences: [],
        organizations: [],
        representativePreview: '',
      };

      const deadline = String(venue.cfpDeadline ?? '').trim();
      const displayName = deadline && (type === 'Conference' || type === 'SubConference')
        ? `${name} (CFP: ${deadline})`
        : name;
      item.count += 1;
      if (type === 'Journal') item.journals.push(name);
      else if (type === 'Conference' || type === 'SubConference') item.conferences.push(displayName);
      else if (type === 'Organization') item.organizations.push(name);
      item.keywords.push(name, type, category, venue.impact, deadline);
      categoryMap.set(category, item);
    }
  }

  return [...categoryMap.values()]
    .map((item) => ({
      ...item,
      keywords: [...new Set(item.keywords.filter(Boolean))].slice(0, 28),
      journals: [...new Set(item.journals)].sort(),
      conferences: [...new Set(item.conferences)].sort(),
      organizations: [...new Set(item.organizations)].sort(),
      representativePreview: fieldExplorerPreview(item),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function parseFieldExplorerTopics(csvText) {
  const records = parseCsv(csvText.replace(/^\uFEFF/, ''));
  if (!records.length) return [];
  const [header, ...rows] = records;
  const columns = new Map(header.map((name, index) => [name, index]));
  return rows
    .map((row) => {
      const topicId = Number.parseInt(row[columns.get('Topic')] ?? '', 10);
      const count = Number.parseInt(row[columns.get('Count')] ?? '0', 10);
      const name = row[columns.get('Name')] ?? '';
      const representation = row[columns.get('Representation')] ?? '';
      const representativeDocs = row[columns.get('Representative_Docs')] ?? '';
      const keywords = extractQuotedList(representation);
      return {
        id: topicId,
        count: Number.isFinite(count) ? count : 0,
        name: cleanTopicName(name),
        rawName: name,
        keywords,
        representativePreview: firstQuotedValue(representativeDocs),
      };
    })
    .filter((topic) => Number.isInteger(topic.id) && topic.id >= 0 && topic.name);
}

export function parseFieldExplorerNetworkCsv(csvText) {
  const records = parseCsv(csvText.replace(/^\uFEFF/, ''));
  if (!records.length) return [];
  const [header, ...rows] = records;
  const columns = new Map(header.map((name, index) => [name, index]));
  const categoryMap = new Map();

  for (const row of rows) {
    const name = row[columns.get('Name')]?.trim();
    const type = row[columns.get('Type')]?.trim();
    const category = row[columns.get('Category')]?.trim();
    if (!name || !type || !category) continue;

    const item = categoryMap.get(category) ?? {
      id: category,
      count: 0,
      name: category,
      rawName: category,
      sourceType: 'field-explorer-network',
      keywords: [],
      journals: [],
      conferences: [],
      organizations: [],
      representativePreview: '',
    };

    item.count += 1;
    if (type === 'Journal') item.journals.push(name);
    else if (type === 'Conference' || type === 'SubConference') item.conferences.push(name);
    else if (type === 'Organization') item.organizations.push(name);
    item.keywords.push(name, type);
    categoryMap.set(category, item);
  }

  return [...categoryMap.values()]
    .map((item) => ({
      ...item,
      keywords: [...new Set(item.keywords)].slice(0, 20),
      journals: [...new Set(item.journals)].sort(),
      conferences: [...new Set(item.conferences)].sort(),
      organizations: [...new Set(item.organizations)].sort(),
      representativePreview: fieldExplorerPreview(item),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function rankFieldTopics(query, topics, { limit = 5 } = {}) {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return [];

  return topics
    .map((topic) => ({
      ...topic,
      score: scoreTopic(query, queryTokens, topic),
    }))
    .filter((topic) => topic.score > 0)
    .sort((a, b) => b.score - a.score || b.count - a.count)
    .slice(0, limit);
}

export function buildVenueScout(query, topics, { limit = 3 } = {}) {
  const ranked = rankFieldTopics(query, topics, { limit: Math.max(limit, 5) });
  const tiers = ranked.slice(0, limit).map((topic, index) => ({
    tier: ['Strong fit', 'Adjacent fit', 'Exploratory fit'][index] ?? `Option ${index + 1}`,
    topicName: topic.name,
    score: topic.score,
    count: topic.count,
    journals: (topic.journals ?? []).slice(0, 4),
    conferences: (topic.conferences ?? []).slice(0, 4),
    guidance: venueScoutGuidance(topic.name),
  }));

  return {
    query,
    ranked,
    tiers,
    weakFit: !ranked.length || (ranked[0]?.score ?? 0) < 4,
  };
}

export function tokenize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKC')
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token))
    .slice(0, 180);
}

function venueScoutGuidance(topicName) {
  const normalized = normalize(topicName);
  if (normalized.includes('learning analytics')) {
    return 'Frame the work around data traces, feedback loops, dashboards, modeling, or evidence for learner support.';
  }
  if (normalized.includes('aied') || normalized.includes('artificial intelligence')) {
    return 'Emphasize AI behavior, learner interaction with AI, evaluation design, and responsible deployment in learning contexts.';
  }
  if (normalized.includes('learning sciences')) {
    return 'Lead with theory of learning, mechanism, interaction, design conjecture, or evidence about how learning unfolds.';
  }
  if (normalized.includes('instructional design')) {
    return 'Make the design problem, intervention logic, implementation context, and evaluation evidence explicit.';
  }
  if (normalized.includes('teacher')) {
    return 'Clarify teacher learning, professional practice, classroom enactment, or teacher-facing support design.';
  }
  if (normalized.includes('hci') || normalized.includes('human-computer')) {
    return 'Highlight interaction design, usability, socio-technical context, and how people actually use the system.';
  }
  return 'Clarify the core contribution, evidence type, target community, and why this venue category is the right audience.';
}

function scoreTopic(query, queryTokens, topic) {
  const haystackTokens = tokenize([
    topic.name,
    topic.rawName,
    ...(topic.keywords ?? []),
    ...(topic.journals ?? []),
    ...(topic.conferences ?? []),
    ...(topic.organizations ?? []),
    topic.representativePreview,
  ].join(' '));
  const haystack = new Set(haystackTokens);
  let score = 0;
  for (const token of queryTokens) {
    if (haystack.has(token)) score += 3;
    if ((topic.keywords ?? []).some((keyword) => normalize(keyword).includes(token))) score += 1;
  }

  const normalizedQuery = normalize(query);
  for (const keyword of topic.keywords ?? []) {
    const normalizedKeyword = normalize(keyword);
    if (normalizedKeyword.length >= 4 && normalizedQuery.includes(normalizedKeyword)) {
      score += 5;
    }
  }

  return score;
}

function fieldExplorerPreview(item) {
  const parts = [];
  if (item.journals?.length) parts.push(`Journals: ${item.journals.slice(0, 4).join(', ')}`);
  if (item.conferences?.length) parts.push(`Conferences: ${item.conferences.slice(0, 4).join(', ')}`);
  if (item.organizations?.length) parts.push(`Organizations: ${item.organizations.slice(0, 4).join(', ')}`);
  return parts.join(' | ');
}

function extractEmbeddedCsvData(text) {
  const match = String(text ?? '').match(/const\s+csvData\s*=\s*`([\s\S]*?)`;/);
  return match?.[1] ?? '';
}

function cleanTopicName(name) {
  return String(name ?? '')
    .replace(/^\d+_/, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractQuotedList(value) {
  return [...String(value ?? '').matchAll(/'([^']+)'|"([^"]+)"/g)]
    .map((match) => (match[1] ?? match[2] ?? '').trim())
    .filter(Boolean)
    .slice(0, 12);
}

function firstQuotedValue(value) {
  const [first] = extractQuotedList(value);
  return first ? first.replace(/\s+/g, ' ').slice(0, 260) : '';
}

function normalize(value) {
  return String(value ?? '').toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((value) => value.length)) rows.push(row);
  }

  return rows;
}
