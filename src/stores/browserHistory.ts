import { create } from 'zustand';

/**
 * Browser history: the pages Gary visited in the in-panel browser,
 * newest first. The address bar offers them as a typed-URL dropdown
 * (Area 1); Area 9 shares them with the AI ("what did I look at
 * yesterday?").
 *
 * Renderer-only, persisted to localStorage — no main-process state,
 * no server. Only http(s) pages are recorded: about:blank, the
 * phone app's local URL and chrome:// pages never appear.
 */

export interface BrowserHistoryEntry {
  url: string;
  title: string;
  /** Epoch ms of the visit (the latest visit, after dedupe). */
  visitedAt: number;
}

export const BROWSER_HISTORY_LIMIT = 200;
const STORAGE_KEY = 'lucid-browser-history-v1';

export function isHistoryUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

/**
 * Pure: put `entry` first, dropping any older entry for the same URL
 * (a re-visit refreshes the time and title, it does not duplicate),
 * then cap the list.
 */
export function addHistoryEntry(
  entries: BrowserHistoryEntry[],
  entry: BrowserHistoryEntry,
  limit: number = BROWSER_HISTORY_LIMIT,
): BrowserHistoryEntry[] {
  const rest = entries.filter((e) => e.url !== entry.url);
  return [entry, ...rest].slice(0, limit);
}

/**
 * Pure: entries matching `query` (case-insensitive substring on the
 * title or the URL), still newest first. An empty query returns the
 * most recent entries — what the dropdown shows on focus.
 */
export function matchHistoryEntries(
  entries: BrowserHistoryEntry[],
  query: string,
  limit: number = 8,
): BrowserHistoryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries.slice(0, limit);
  return entries
    .filter(
      (e) =>
        e.url.toLowerCase().includes(q) ||
        e.title.toLowerCase().includes(q),
    )
    .slice(0, limit);
}

function isStoredEntry(value: unknown): value is BrowserHistoryEntry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.url === 'string' &&
    typeof e.title === 'string' &&
    typeof e.visitedAt === 'number'
  );
}

function loadStoredEntries(): BrowserHistoryEntry[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredEntry).slice(0, BROWSER_HISTORY_LIMIT);
  } catch {
    // Corrupt or unreadable storage: start empty, never crash the panel.
    return [];
  }
}

function saveStoredEntries(entries: BrowserHistoryEntry[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Private mode / quota: history just doesn't persist this session.
  }
}

interface BrowserHistoryState {
  /** Newest first. */
  entries: BrowserHistoryEntry[];
  /** Record a finished page load. Non-http(s) URLs are ignored. */
  recordVisit: (url: string, title: string) => void;
  clearHistory: () => void;
}

export const useBrowserHistory = create<BrowserHistoryState>()((set, get) => ({
  entries: loadStoredEntries(),

  recordVisit: (url, title) => {
    if (!isHistoryUrl(url)) return;
    const next = addHistoryEntry(get().entries, {
      url,
      title: title || url,
      visitedAt: Date.now(),
    });
    set({ entries: next });
    saveStoredEntries(next);
  },

  clearHistory: () => {
    set({ entries: [] });
    saveStoredEntries([]);
  },
}));
