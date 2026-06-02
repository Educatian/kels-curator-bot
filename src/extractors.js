const URL_PATTERN = /https?:\/\/[^\s<>)\]]+/gi;
const DATE_PATTERNS = [
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}\b/gi,
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}\b(?!,?\s+\d{4})/gi,
  /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/g,
  /\b\d{1,2}[-/.]\d{1,2}[-/.]\d{4}\b/g,
  /\b\d{1,2}[-/.]\d{1,2}\b(?![-/.]\d{2,4})/g,
  /\d{1,2}\s*\uC6D4\s*\d{1,2}\s*\uC77C/g,
  /\b(?:today|tomorrow)\b/gi,
];
const TIME_PATTERN = /\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?\b/g;

const CATEGORY_RULES = [
  ['job', /\b(job|faculty|fellow|postdoc|post-doctoral|lecturer|professor|position|hiring)\b|\uCC44\uC6A9|\uC784\uC6A9|\uACF5\uACE0/i],
  ['cfp', /\b(cfp|rfp|call for|special issue|proposal|grant|deadline|submission)\b|\uB17C\uBB38\uBAA8\uC9D1|\uACF5\uBAA8|\uC81C\uC548\uC11C|\uB9C8\uAC10/i],
  ['seminar', /\b(seminar|webinar|workshop|podcast|zoom|youtube|talk|colloquium)\b|\uC138\uBBF8\uB098|\uC6E8\uBE44\uB098|\uC6CC\uD06C\uC20D|\uAC15\uC5F0/i],
  ['resource', /\b(resource|guide|template|courseware|dataset|github|paper)\b|\uC790\uB8CC|\uAC00\uC774\uB4DC|\uD15C\uD50C\uB9BF|\uB9AC\uC18C\uC2A4/i],
  ['event', /\b(event|coffee chat|gathering|conference|meeting|meetup)\b|\uD589\uC0AC|\uBAA8\uC784|\uCEE8\uD37C\uB7F0\uC2A4|\uD559\uD68C/i],
];

const TAG_RULES = [
  ['AIED', /\bAIED\b|AI education|\uC778\uACF5\uC9C0\uB2A5\uAD50\uC721/i],
  ['learning-analytics', /learning analytics|\bLA\b|\uD559\uC2B5\uBD84\uC11D/i],
  ['HCI', /\bHCI\b|human-computer/i],
  ['instructional-design', /instructional design|learning design|\uAD50\uC721\uACF5\uD559|\uC218\uC5C5\uC124\uACC4/i],
  ['XR', /\bXR\b|\bVR\b|\bAR\b|virtual reality|augmented reality/i],
  ['doctoral', /phd|doctoral|graduate student|\uBC15\uC0AC|\uB300\uD559\uC6D0/i],
  ['early-career', /early career|postdoc|fellow|junior|\uC2E0\uC9C4/i],
  ['faculty', /faculty|professor|lecturer|\uAD50\uC218/i],
  ['grant', /grant|funding|rfp|\uC5F0\uAD6C\uBE44|\uACFC\uC81C/i],
];

const MONTHS = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

export function extractUrls(text) {
  return Array.from(new Set(text.match(URL_PATTERN) ?? []));
}

export function extractEventLinks(text) {
  const urls = extractUrls(String(text ?? ''));
  return {
    zoomLinks: urls.filter((url) => /zoom\.us|zoomgov\.com/i.test(url)),
    rsvpLinks: urls.filter((url) => /rsvp|eventbrite|lu\.ma|calendar|calendly|signup|registration|register/i.test(url)),
    formLinks: urls.filter((url) => /forms\.gle|docs\.google\.com\/forms|google\.com\/forms/i.test(url)),
    otherLinks: urls.filter((url) => !/zoom\.us|zoomgov\.com|rsvp|eventbrite|lu\.ma|calendar|calendly|signup|registration|register|forms\.gle|docs\.google\.com\/forms|google\.com\/forms/i.test(url)),
  };
}

export function extractDates(text) {
  const dates = DATE_PATTERNS.flatMap((pattern) => text.match(pattern) ?? []);
  return Array.from(new Set(dates.map((date) => date.trim())));
}

export function parseDateToIso(dateText, referenceDate = new Date()) {
  const text = dateText.trim();
  const english = text.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (english) {
    const month = MONTHS[english[1].toLowerCase()];
    if (month === undefined) return null;
    return isoDate(new Date(Date.UTC(Number(english[3]), month, Number(english[2]))));
  }

  const englishNoYear = text.match(/^([A-Za-z]+)\s+(\d{1,2})$/);
  if (englishNoYear) {
    const month = MONTHS[englishNoYear[1].toLowerCase()];
    if (month === undefined) return null;
    const day = Number(englishNoYear[2]);
    const current = new Date(referenceDate);
    let year = current.getFullYear();
    const candidate = new Date(Date.UTC(year, month, day));
    if (candidate < floorUtcDate(current)) year += 1;
    return isoDate(new Date(Date.UTC(year, month, day)));
  }

  const ymd = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymd) {
    return isoDate(new Date(Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))));
  }

  const mdy = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (mdy) {
    return isoDate(new Date(Date.UTC(Number(mdy[3]), Number(mdy[1]) - 1, Number(mdy[2]))));
  }

  const mdNoYear = text.match(/^(\d{1,2})[-/.](\d{1,2})$/);
  if (mdNoYear) {
    const month = Number(mdNoYear[1]) - 1;
    const day = Number(mdNoYear[2]);
    const current = new Date(referenceDate);
    let year = current.getFullYear();
    const candidate = new Date(Date.UTC(year, month, day));
    if (candidate < floorUtcDate(current)) year += 1;
    return isoDate(new Date(Date.UTC(year, month, day)));
  }

  const korean = text.match(/^(\d{1,2})\s*\uC6D4\s*(\d{1,2})\s*\uC77C$/);
  if (korean) {
    const month = Number(korean[1]) - 1;
    const day = Number(korean[2]);
    const current = new Date(referenceDate);
    let year = current.getFullYear();
    const candidate = new Date(Date.UTC(year, month, day));
    if (candidate < floorUtcDate(current)) year += 1;
    return isoDate(new Date(Date.UTC(year, month, day)));
  }

  if (/^today$/i.test(text)) {
    return isoDate(floorUtcDate(new Date(referenceDate)));
  }

  if (/^tomorrow$/i.test(text)) {
    const date = floorUtcDate(new Date(referenceDate));
    date.setUTCDate(date.getUTCDate() + 1);
    return isoDate(date);
  }

  return null;
}

export function extractDeadlineDates(text, referenceDate = new Date()) {
  return extractDates(text)
    .map((label) => ({ label, iso: parseDateToIso(label, referenceDate) }))
    .filter((date) => date.iso);
}

export function extractEventDateTimes(text, referenceDate = new Date(), defaultTimeZone = 'America/Los_Angeles') {
  const value = String(text ?? '');
  const dates = extractDates(value);
  const zone = detectTimeZone(value, defaultTimeZone);
  const events = [];

  for (const dateLabel of dates) {
    const iso = parseDateToIso(dateLabel, referenceDate);
    if (!iso) continue;
    const dateIndex = value.indexOf(dateLabel);
    const context = value.slice(Math.max(0, dateIndex - 80), dateIndex + dateLabel.length + 140);
    const time = firstLikelyTime(context);
    if (!time) continue;
    const [year, month, day] = iso.split('-').map(Number);
    const startsAt = zonedDateTimeToUtcIso({
      year,
      month,
      day,
      hour: time.hour,
      minute: time.minute,
      timeZone: zone.timeZone,
    });
    if (!startsAt) continue;
    events.push({
      label: `${dateLabel} ${time.label}${zone.label ? ` ${zone.label}` : ''}`,
      iso,
      startsAt,
      timeZone: zone.timeZone,
    });
  }

  return dedupeEvents(events);
}

export function classifyPost({ content, channelName = '' }) {
  const target = `${channelName} ${content}`;
  if (/job_academic|job_practitioner/i.test(channelName)) return 'job';
  if (/cfp|rfp/i.test(channelName)) return 'cfp';
  if (/seminar|workshop|bootcamp|presentation/i.test(channelName)) return 'seminar';
  if (/academic-resources|resource/i.test(channelName)) return 'resource';
  if (/announcement|newsletter|gathering/i.test(channelName)) return 'event';

  const match = CATEGORY_RULES.find(([, pattern]) => pattern.test(target));
  return match?.[0] ?? 'general';
}

export function extractTags(text) {
  return TAG_RULES
    .filter(([, pattern]) => pattern.test(text))
    .map(([tag]) => tag);
}

export function normalizePost({ messageId, guildId, channelId, channelName, authorId, authorName, content, createdAt }) {
  const trimmed = content.replace(/\s+/g, ' ').trim();
  const category = classifyPost({ content: trimmed, channelName });
  return {
    id: messageId,
    guildId,
    channelId,
    channelName,
    authorId,
    authorName,
    content: trimmed.slice(0, 1800),
    category,
    tags: extractTags(trimmed),
    urls: extractUrls(trimmed),
    eventLinks: extractEventLinks(trimmed),
    dates: extractDates(trimmed),
    deadlineDates: extractDeadlineDates(trimmed, createdAt instanceof Date ? createdAt : new Date(createdAt)),
    eventDateTimes: extractEventDateTimes(trimmed, createdAt instanceof Date ? createdAt : new Date(createdAt)),
    createdAt: createdAt instanceof Date ? createdAt.toISOString() : new Date(createdAt).toISOString(),
  };
}

export function postMatchesKeyword(post, keyword) {
  const needle = keyword.trim().toLowerCase();
  if (!needle) return false;
  const haystack = [
    post.content,
    post.channelName,
    post.category,
    ...(post.tags ?? []),
    ...(post.urls ?? []),
    ...(post.dates ?? []),
    ...(post.deadlineDates ?? []).flatMap((date) => [date.label, date.iso]),
    ...(post.eventDateTimes ?? []).flatMap((event) => [event.label, event.iso, event.startsAt]),
  ].join(' ').toLowerCase();
  return haystack.includes(needle);
}

function isoDate(date) {
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function floorUtcDate(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function firstLikelyTime(context) {
  TIME_PATTERN.lastIndex = 0;
  const matches = Array.from(context.matchAll(TIME_PATTERN));
  for (const match of matches) {
    const raw = match[0];
    const hourRaw = Number(match[1]);
    const minute = match[2] ? Number(match[2]) : 0;
    const ampm = match[3]?.toLowerCase() ?? '';
    if (minute > 59) continue;
    if (!ampm && !raw.includes(':')) continue;
    if (ampm && (hourRaw < 1 || hourRaw > 12)) continue;
    if (!ampm && (hourRaw < 0 || hourRaw > 23)) continue;
    let hour = hourRaw;
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return { hour, minute, label: raw.trim() };
  }
  return null;
}

function detectTimeZone(text, fallback) {
  const value = String(text ?? '');
  if (/\b(KST|Korea(?:n)? Time|Seoul)\b/i.test(value)) return { timeZone: 'Asia/Seoul', label: 'KST' };
  if (/\b(ET|EST|EDT|Eastern Time)\b/i.test(value)) return { timeZone: 'America/New_York', label: 'ET' };
  if (/\b(CT|CST|CDT|Central Time)\b/i.test(value)) return { timeZone: 'America/Chicago', label: 'CT' };
  if (/\b(PT|PST|PDT|Pacific Time)\b/i.test(value)) return { timeZone: 'America/Los_Angeles', label: 'PT' };
  if (/\b(UTC|GMT)\b/i.test(value)) return { timeZone: 'UTC', label: 'UTC' };
  return { timeZone: fallback, label: '' };
}

function zonedDateTimeToUtcIso({ year, month, day, hour, minute, timeZone }) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (timeZone === 'UTC') return guess.toISOString();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(guess);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  const asUtc = Date.UTC(
    Number(part('year')),
    Number(part('month')) - 1,
    Number(part('day')),
    Number(part('hour')),
    Number(part('minute')),
  );
  const offset = asUtc - guess.getTime();
  const result = new Date(guess.getTime() - offset);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
}

function dedupeEvents(events) {
  const seen = new Set();
  return events.filter((event) => {
    const key = `${event.startsAt}:${event.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
