import fs from 'node:fs/promises';

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'about', 'into', 'are', 'was', 'were',
  'is', 'in', 'study', 'research', 'learning', 'students', 'education', 'kels', 'https', 'http',
]);

export async function loadFieldExplorerTopics(filePath) {
  if (!filePath) return [];
  const text = await fs.readFile(filePath, 'utf8');
  return parseFieldExplorerTopics(text);
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

export function tokenize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKC')
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token))
    .slice(0, 180);
}

function scoreTopic(query, queryTokens, topic) {
  const haystackTokens = tokenize([
    topic.name,
    topic.rawName,
    ...(topic.keywords ?? []),
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
