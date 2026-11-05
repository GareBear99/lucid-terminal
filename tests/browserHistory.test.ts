/**
 * Browser history tests — the address-bar history store (Area 1).
 *
 * Pure parts: addHistoryEntry dedupes by URL (a re-visit refreshes
 * time/title, never duplicates) and caps the list; matchHistoryEntries
 * matches title or URL case-insensitively, newest first, and returns
 * the most recent entries for an empty query.
 *
 * Store parts: only http(s) pages are recorded; persistence round-trips
 * through localStorage (stubbed here — vitest runs in node, where it
 * does not exist).
 *
 * Run with: npm test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  addHistoryEntry,
  isHistoryUrl,
  matchHistoryEntries,
  type BrowserHistoryEntry,
} from '../src/stores/browserHistory';

const entry = (url: string, title: string, visitedAt: number): BrowserHistoryEntry => ({
  url,
  title,
  visitedAt,
});

describe('isHistoryUrl', () => {
  it('accepts http and https only', () => {
    expect(isHistoryUrl('https://example.com')).toBe(true);
    expect(isHistoryUrl('http://127.0.0.1:8090')).toBe(true);
    expect(isHistoryUrl('about:blank')).toBe(false);
    expect(isHistoryUrl('chrome://settings')).toBe(false);
    expect(isHistoryUrl('file:///tmp/x.html')).toBe(false);
  });
});

describe('addHistoryEntry', () => {
  it('puts the newest visit first', () => {
    const entries = addHistoryEntry([], entry('https://a.example', 'A', 1));
    const next = addHistoryEntry(entries, entry('https://b.example', 'B', 2));
    expect(next.map((e) => e.url)).toEqual([
      'https://b.example',
      'https://a.example',
    ]);
  });

  it('a re-visit moves the URL to the front with the new title/time', () => {
    const entries = [
      entry('https://a.example', 'A', 1),
      entry('https://b.example', 'B', 2),
    ];
    const next = addHistoryEntry(entries, entry('https://b.example', 'B2', 3));
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual(entry('https://b.example', 'B2', 3));
    expect(next[1].url).toBe('https://a.example');
  });

  it('caps the list at the limit', () => {
    let entries: BrowserHistoryEntry[] = [];
    for (let i = 0; i < 5; i++) {
      entries = addHistoryEntry(
        entries,
        entry(`https://n${i}.example`, `N${i}`, i),
        3,
      );
    }
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.url)).toEqual([
      'https://n4.example',
      'https://n3.example',
      'https://n2.example',
    ]);
  });
});

describe('matchHistoryEntries', () => {
  const entries = [
    entry('https://example.com/docs', 'Example Docs', 3),
    entry('https://github.com/garebear99', 'GitHub — GareBear99', 2),
    entry('https://example.com/about', 'About Example', 1),
  ];

  it('an empty query returns the most recent entries', () => {
    expect(matchHistoryEntries(entries, '', 2).map((e) => e.url)).toEqual([
      'https://example.com/docs',
      'https://github.com/garebear99',
    ]);
  });

  it('matches a substring of the URL', () => {
    expect(matchHistoryEntries(entries, 'github').map((e) => e.url)).toEqual([
      'https://github.com/garebear99',
    ]);
  });

  it('matches a substring of the title, case-insensitively', () => {
    expect(matchHistoryEntries(entries, 'ABOUT').map((e) => e.url)).toEqual([
      'https://example.com/about',
    ]);
  });

  it('matches across both fields and keeps newest-first order', () => {
    expect(matchHistoryEntries(entries, 'example').map((e) => e.url)).toEqual([
      'https://example.com/docs',
      'https://example.com/about',
    ]);
  });

  it('returns nothing when nothing matches', () => {
    expect(matchHistoryEntries(entries, 'zzz')).toEqual([]);
  });
});

describe('useBrowserHistory store', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('records http(s) visits and ignores the rest', async () => {
    const { useBrowserHistory } = await import('../src/stores/browserHistory');
    const api = useBrowserHistory.getState();
    api.recordVisit('https://example.com', 'Example');
    api.recordVisit('about:blank', 'New Tab');
    api.recordVisit('http://127.0.0.1:8090', 'Phone');
    const entries = useBrowserHistory.getState().entries;
    expect(entries.map((e) => e.url)).toEqual([
      'http://127.0.0.1:8090',
      'https://example.com',
    ]);
  });

  it('clearHistory empties the list', async () => {
    const { useBrowserHistory } = await import('../src/stores/browserHistory');
    const api = useBrowserHistory.getState();
    api.recordVisit('https://example.com', 'Example');
    api.clearHistory();
    expect(useBrowserHistory.getState().entries).toEqual([]);
  });

  it('persists across a reload via localStorage', async () => {
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => {
        stored.set(key, value);
      },
      removeItem: (key: string) => {
        stored.delete(key);
      },
    });
    const first = await import('../src/stores/browserHistory');
    first.useBrowserHistory.getState().recordVisit('https://example.com', 'Example');
    expect(stored.size).toBe(1);

    vi.resetModules();
    const second = await import('../src/stores/browserHistory');
    expect(second.useBrowserHistory.getState().entries).toHaveLength(1);
    expect(second.useBrowserHistory.getState().entries[0].url).toBe(
      'https://example.com',
    );
  });

  it('a corrupt stored value starts empty instead of crashing', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => '{not json',
      setItem: () => undefined,
      removeItem: () => undefined,
    });
    const { useBrowserHistory } = await import('../src/stores/browserHistory');
    expect(useBrowserHistory.getState().entries).toEqual([]);
  });
});
