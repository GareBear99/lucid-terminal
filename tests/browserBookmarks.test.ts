/**
 * Browser bookmarks (Area 9) tests: the pure add/remove helpers
 * and the store (toggle, non-bookmarkable URLs ignored, cap) in
 * `src/stores/browserBookmarks.ts`.
 *
 * Run with: npm test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  addBookmark,
  removeBookmark,
  isBookmarkableUrl,
  useBrowserBookmarks,
  BROWSER_BOOKMARKS_LIMIT,
  type BrowserBookmark,
} from '../src/stores/browserBookmarks';

const bookmark = (url: string, title = 'Title'): BrowserBookmark => ({
  url,
  title,
  addedAt: 1000,
});

describe('isBookmarkableUrl', () => {
  it('only http(s) pages can be bookmarked', () => {
    expect(isBookmarkableUrl('https://example.com/')).toBe(true);
    expect(isBookmarkableUrl('http://example.com/')).toBe(true);
    expect(isBookmarkableUrl('about:blank')).toBe(false);
    expect(isBookmarkableUrl('chrome://settings')).toBe(false);
    expect(isBookmarkableUrl('')).toBe(false);
  });
});

describe('addBookmark / removeBookmark (pure)', () => {
  it('adds newest first and refreshes a re-starred URL', () => {
    const list = addBookmark([bookmark('https://a/')], bookmark('https://b/'));
    expect(list.map((b) => b.url)).toEqual(['https://b/', 'https://a/']);
    const restarred = addBookmark(list, {
      url: 'https://a/',
      title: 'New title',
      addedAt: 2000,
    });
    expect(restarred.map((b) => b.url)).toEqual(['https://a/', 'https://b/']);
    expect(restarred[0].title).toBe('New title');
  });

  it('removes by URL and caps the list', () => {
    const list = removeBookmark(
      [bookmark('https://a/'), bookmark('https://b/')],
      'https://a/',
    );
    expect(list.map((b) => b.url)).toEqual(['https://b/']);
    const many = Array.from({ length: BROWSER_BOOKMARKS_LIMIT + 5 }, (_, i) =>
      bookmark(`https://x/${i}`),
    );
    const capped = addBookmark(many, bookmark('https://new/'));
    expect(capped).toHaveLength(BROWSER_BOOKMARKS_LIMIT);
    expect(capped[0].url).toBe('https://new/');
  });
});

describe('useBrowserBookmarks store', () => {
  beforeEach(() => {
    useBrowserBookmarks.setState({ bookmarks: [] });
    vi.stubGlobal('localStorage', undefined);
  });

  it('toggle adds then removes; isBookmarked tracks it', () => {
    const api = useBrowserBookmarks.getState();
    expect(api.isBookmarked('https://example.com/')).toBe(false);
    api.toggleBookmark('https://example.com/', 'Example');
    expect(useBrowserBookmarks.getState().isBookmarked('https://example.com/')).toBe(true);
    expect(useBrowserBookmarks.getState().bookmarks).toHaveLength(1);
    api.toggleBookmark('https://example.com/', 'Example');
    expect(useBrowserBookmarks.getState().isBookmarked('https://example.com/')).toBe(false);
    expect(useBrowserBookmarks.getState().bookmarks).toHaveLength(0);
  });

  it('about:blank and chrome:// pages are ignored', () => {
    const api = useBrowserBookmarks.getState();
    api.addBookmark('about:blank', 'New Tab');
    api.addBookmark('chrome://settings', 'Settings');
    expect(useBrowserBookmarks.getState().bookmarks).toHaveLength(0);
  });
});
