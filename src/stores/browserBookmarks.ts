import { create } from 'zustand';

/**
 * Browser bookmarks (Area 9): the pages Gary starred in the
 * in-panel browser, newest first. The nav bar's star toggles
 * the active page; the bookmarks list (under the tab strip)
 * opens one on click.
 *
 * Renderer-only, persisted to localStorage — no main-process
 * state, no server. Only http(s) pages can be bookmarked:
 * about:blank, the phone app's local URL and chrome:// pages
 * never appear (the star is disabled for them).
 */

export interface BrowserBookmark {
  url: string;
  title: string;
  /** Epoch ms the bookmark was added. */
  addedAt: number;
}

export const BROWSER_BOOKMARKS_LIMIT = 200;
const STORAGE_KEY = 'lucid-browser-bookmarks-v1';

/** Is this URL bookmarkable? */
export function isBookmarkableUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

/** Pure: add a bookmark, newest first, dropping any older one
 * for the same URL (re-starring refreshes the title), then cap. */
export function addBookmark(
  bookmarks: BrowserBookmark[],
  bookmark: BrowserBookmark,
  limit: number = BROWSER_BOOKMARKS_LIMIT,
): BrowserBookmark[] {
  const rest = bookmarks.filter((b) => b.url !== bookmark.url);
  return [bookmark, ...rest].slice(0, limit);
}

/** Pure: remove the bookmark for a URL. */
export function removeBookmark(
  bookmarks: BrowserBookmark[],
  url: string,
): BrowserBookmark[] {
  return bookmarks.filter((b) => b.url !== url);
}

function isStoredBookmark(value: unknown): value is BrowserBookmark {
  if (typeof value !== 'object' || value === null) return false;
  const b = value as Record<string, unknown>;
  return (
    typeof b.url === 'string' &&
    typeof b.title === 'string' &&
    typeof b.addedAt === 'number'
  );
}

function loadStoredBookmarks(): BrowserBookmark[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredBookmark).slice(0, BROWSER_BOOKMARKS_LIMIT);
  } catch {
    return [];
  }
}

function persistBookmarks(bookmarks: BrowserBookmark[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
  } catch {
    // Storage full or unavailable — bookmarks still work in memory.
  }
}

interface BrowserBookmarksState {
  bookmarks: BrowserBookmark[];
  isBookmarked: (url: string) => boolean;
  addBookmark: (url: string, title: string) => void;
  removeBookmark: (url: string) => void;
  toggleBookmark: (url: string, title: string) => void;
}

export const useBrowserBookmarks = create<BrowserBookmarksState>()(
  (set, get) => ({
    bookmarks: loadStoredBookmarks(),

    isBookmarked: (url) => get().bookmarks.some((b) => b.url === url),

    addBookmark: (url, title) => {
      if (!isBookmarkableUrl(url)) return;
      const next = addBookmark(get().bookmarks, {
        url,
        title: title || url,
        addedAt: Date.now(),
      });
      persistBookmarks(next);
      set({ bookmarks: next });
    },

    removeBookmark: (url) => {
      const next = removeBookmark(get().bookmarks, url);
      persistBookmarks(next);
      set({ bookmarks: next });
    },

    toggleBookmark: (url, title) => {
      if (get().isBookmarked(url)) get().removeBookmark(url);
      else get().addBookmark(url, title);
    },
  }),
);
