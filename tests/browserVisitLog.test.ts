/**
 * Visit log (Area 9) tests: the pure record/filter/format core
 * in `electron/services/browserVisitLog.ts` — the AI's "what did
 * I look at yesterday?" data.
 *
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest';
import {
  recordVisit,
  visitsInLastDays,
  formatVisitsForAi,
  isLoggableVisitUrl,
  BROWSER_VISIT_LOG_LIMIT,
  type BrowserVisit,
} from '../electron/services/browserVisitLog';

const visit = (url: string, visitedAt: number, title = 'Page'): BrowserVisit => ({
  url,
  title,
  visitedAt,
});

// 2026-11-05 12:00 UTC, a Thursday.
const NOW = Date.UTC(2026, 10, 5, 12, 0, 0);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('isLoggableVisitUrl', () => {
  it('only http(s) pages are logged', () => {
    expect(isLoggableVisitUrl('https://example.com/')).toBe(true);
    expect(isLoggableVisitUrl('about:blank')).toBe(false);
    expect(isLoggableVisitUrl('chrome://settings')).toBe(false);
  });
});

describe('recordVisit', () => {
  it('records newest first and drops a consecutive duplicate', () => {
    let log = recordVisit([], visit('https://a/', NOW));
    log = recordVisit(log, visit('https://b/', NOW + 1));
    expect(log.map((v) => v.url)).toEqual(['https://b/', 'https://a/']);
    // A reload of the same page is not a new visit.
    log = recordVisit(log, visit('https://b/', NOW + 2));
    expect(log.map((v) => v.url)).toEqual(['https://b/', 'https://a/']);
    // But a re-visit after another page is recorded again.
    log = recordVisit(log, visit('https://a/', NOW + 3));
    expect(log.map((v) => v.url)).toEqual([
      'https://a/',
      'https://b/',
      'https://a/',
    ]);
  });

  it('ignores non-http(s) URLs and caps the log', () => {
    let log = recordVisit([], visit('about:blank', NOW));
    expect(log).toEqual([]);
    const many = Array.from({ length: BROWSER_VISIT_LOG_LIMIT + 5 }, (_, i) =>
      visit(`https://x/${i}`, NOW + i),
    );
    // Build it up one at a time so the cap applies in order.
    log = [];
    for (const v of many) log = recordVisit(log, v);
    expect(log).toHaveLength(BROWSER_VISIT_LOG_LIMIT);
    expect(log[0].url).toBe(`https://x/${BROWSER_VISIT_LOG_LIMIT + 4}`);
  });
});

describe('visitsInLastDays / formatVisitsForAi', () => {
  const log = [
    visit('https://today/', NOW - HOUR, 'Today page'),
    visit('https://yesterday/', NOW - DAY - HOUR, 'Yesterday page'),
    visit('https://last-week/', NOW - 8 * DAY, 'Old page'),
  ];

  it('filters to the requested window', () => {
    expect(visitsInLastDays(log, 1, NOW).map((v) => v.url)).toEqual([
      'https://today/',
    ]);
    expect(visitsInLastDays(log, 2, NOW).map((v) => v.url)).toEqual([
      'https://today/',
      'https://yesterday/',
    ]);
    expect(visitsInLastDays(log, 30, NOW)).toHaveLength(3);
  });

  it('groups by day with Today / Yesterday labels', () => {
    const text = formatVisitsForAi(log, 7, NOW);
    expect(text).toContain('Pages visited in the last 7 days (2):');
    expect(text).toContain('Today:');
    expect(text).toContain('- Today page (https://today/)');
    expect(text).toContain('Yesterday:');
    expect(text).toContain('- Yesterday page (https://yesterday/)');
    expect(text).not.toContain('Old page');
  });

  it('says plainly when nothing was visited', () => {
    expect(formatVisitsForAi([], 7, NOW)).toBe(
      'No pages visited in the last 7 days.',
    );
    expect(formatVisitsForAi(log, 1, NOW + 30 * DAY)).toBe(
      'No pages visited in the last day.',
    );
  });
});
