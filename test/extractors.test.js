import { describe, expect, it } from 'vitest';
import {
  classifyPost,
  extractDates,
  extractDeadlineDates,
  extractEventDateTimes,
  extractTags,
  extractUrls,
  normalizePost,
  parseDateToIso,
} from '../src/extractors.js';

describe('extractors', () => {
  it('classifies job posts from channel name', () => {
    expect(classifyPost({ channelName: 'job_academic', content: 'Assistant Professor in Learning Sciences' })).toBe('job');
  });

  it('extracts CFP dates and links', () => {
    const text = 'Special issue proposal deadline: November 30, 2026 https://example.org/cfp';
    expect(extractDates(text)).toContain('November 30, 2026');
    expect(extractUrls(text)).toContain('https://example.org/cfp');
    expect(classifyPost({ channelName: 'cfp-rfp', content: text })).toBe('cfp');
  });

  it('adds useful research tags', () => {
    const tags = extractTags('AIED learning analytics HCI workshop for doctoral students');
    expect(tags).toEqual(expect.arrayContaining(['AIED', 'learning-analytics', 'HCI', 'doctoral']));
  });

  it('classifies Korean community posts', () => {
    expect(classifyPost({ channelName: 'general', content: '교수 채용 공고 공유드립니다' })).toBe('job');
    expect(classifyPost({ channelName: 'general', content: '논문모집 마감 안내' })).toBe('cfp');
    expect(extractTags('학습분석과 교육공학 세미나')).toEqual(expect.arrayContaining(['learning-analytics', 'instructional-design']));
  });

  it('normalizes dates for deadline views', () => {
    expect(parseDateToIso('November 30, 2026')).toBe('2026-11-30');
    expect(parseDateToIso('2026-06-05')).toBe('2026-06-05');
    expect(parseDateToIso('6월 5일', new Date('2026-06-01T00:00:00Z'))).toBe('2026-06-05');
    expect(parseDateToIso('1월 5일', new Date('2026-06-01T00:00:00Z'))).toBe('2027-01-05');
    expect(extractDeadlineDates('마감: 6월 5일', new Date('2026-06-01T00:00:00Z'))).toEqual([
      { label: '6월 5일', iso: '2026-06-05' },
    ]);
  });

  it('extracts timed event starts for one-hour reminders', () => {
    const events = extractEventDateTimes(
      'KELS panel: June 2, 2026, 1PM-3PM (Korean Time). RSVP required.',
      new Date('2026-06-01T00:00:00Z'),
      'America/Los_Angeles',
    );

    expect(events).toEqual([
      {
        label: 'June 2, 2026 1PM KST',
        iso: '2026-06-02',
        startsAt: '2026-06-02T04:00:00.000Z',
        timeZone: 'Asia/Seoul',
      },
    ]);
  });

  it('normalizes a message for storage', () => {
    const post = normalizePost({
      messageId: '1',
      guildId: 'g',
      channelId: 'c',
      channelName: 'seminar-resource',
      authorId: 'u',
      authorName: 'Jewoong',
      content: 'Zoom webinar about GitHub and Codex: https://youtu.be/example',
      createdAt: new Date('2026-06-01T12:00:00Z'),
    });

    expect(post.category).toBe('seminar');
    expect(post.urls).toHaveLength(1);
    expect(post.deadlineDates).toEqual([]);
    expect(post.createdAt).toBe('2026-06-01T12:00:00.000Z');
  });
});
