import { create } from 'zustand';
import { resolveInputToUrl } from './browserUrl';
import type { BrowserTabState } from '../types';

/**
 * Browser state for the tabbed AI panel.
 *
 * The panel (see components/AI/AIPanel.tsx) has two tabs — AI Chat and
 * Browser — and switching between them is free: the AI chat keeps its
 * session (its state lives in aiStore and AIChat stays mounted, hidden),
 * and the browser keeps its pages (each browser tab owns one BrowserView
 * in the main process; switching tabs only attaches/detaches the view,
 * never destroys it, and the view's session partition persists cookies
 * across restarts).
 *
 * The store owns tab bookkeeping only. Creating/destroying a BrowserView
 * and navigating it are IPC calls to the main process; attaching the
 * active view and keeping its bounds in step with the panel is the
 * BrowserPanel component's job (it owns the container element).
 *
 * In node (vitest) there is no window.lucidAPI — the IPC calls are
 * no-ops there and the store state still updates, so the tab logic is
 * testable without Electron.
 */

export type PanelTab = 'ai' | 'browser';

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface QuickTab {
  id: string;
  label: string;
  url: string;
  /** Which Phone entry this is ('external' = the 127.0.0.1:8090 app). */
  kind?: 'external' | 'internal';
}

/** The phone control app — a local Node server Gary runs on his Mac. */
export const PHONE_CONTROL_URL = 'http://127.0.0.1:8090';
export const ABOUT_BLANK = 'about:blank';

/**
 * Anchored pinned pages. The first quick tab is always Phone —
 * the EXTERNAL entry (the standalone phone-control app). It is
 * never gated: the GPU gate applies only to Lucid's in-app
 * (internal) stream, and the internal entry is rendered from the
 * phone store only when the Android add-on is installed (see
 * src/phone/streaming.ts getPhoneEntries).
 */
export const QUICK_TABS: QuickTab[] = [
  { id: 'phone-external', label: 'Phone — External', url: PHONE_CONTROL_URL, kind: 'external' },
];

let tabCounter = 0;
function nextTabId(): string {
  tabCounter += 1;
  return `browser-tab-${Date.now().toString(36)}-${tabCounter}`;
}

/** The preload-exposed browser IPC, or undefined outside Electron. */
function browserApi() {
  if (typeof window === 'undefined') return undefined;
  return window.lucidAPI?.browser;
}

/** Fire-and-forget IPC: a rejected invoke must never surface as an
 * unhandled rejection in the renderer. */
function fire(p: unknown): void {
  if (p && typeof (p as Promise<unknown>).catch === 'function') {
    (p as Promise<unknown>).catch(() => undefined);
  }
}

interface BrowserState {
  /** Which panel tab is showing ('ai' is the default). */
  panelTab: PanelTab;
  /** Browser tabs, in strip order. */
  tabs: BrowserTab[];
  /** Id of the active browser tab, or null before the first tab exists. */
  activeTabId: string | null;

  setPanelTab: (tab: PanelTab) => void;
  createTab: (url?: string) => void;
  closeTab: (id: string) => void;
  activateTab: (id: string) => void;
  /** Navigate the active tab (or `tabId`) to raw address-bar input. */
  navigate: (input: string, tabId?: string) => void;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  /** Open a pinned quick-tab URL in the active tab (or a new tab). */
  openQuickTab: (url: string) => void;
  /** Merge live state pushed by the main process (url/title/loading). */
  applyTabUpdate: (tabId: string, state: BrowserTabState) => void;
}

function blankTab(url: string): BrowserTab {
  return {
    id: nextTabId(),
    url,
    title: url === ABOUT_BLANK ? 'New Tab' : url,
    loading: false,
    canGoBack: false,
    canGoForward: false,
  };
}

export const useBrowserStore = create<BrowserState>()((set, get) => ({
  panelTab: 'ai',
  tabs: [],
  activeTabId: null,

  setPanelTab: (tab) => {
    set({ panelTab: tab });
    // First visit to the Browser tab: open the phone control app — the
    // reason this browser exists — instead of a blank page.
    if (tab === 'browser' && get().tabs.length === 0) {
      get().createTab(PHONE_CONTROL_URL);
    }
  },

  createTab: (url = ABOUT_BLANK) => {
    const tab = blankTab(url);
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    }));
    fire(browserApi()?.create(tab.id, url));
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get();
    const index = tabs.findIndex((t) => t.id === id);
    if (index === -1) return;
    const nextTabs = tabs.filter((t) => t.id !== id);
    if (nextTabs.length === 0) {
      // Never zero tabs while the browser is open — a fresh tab takes
      // the closed one's place (same as Chrome).
      const fresh = blankTab(ABOUT_BLANK);
      set({ tabs: [fresh], activeTabId: fresh.id });
      fire(browserApi()?.close(id));
      fire(browserApi()?.create(fresh.id, ABOUT_BLANK));
      return;
    }
    // The closed tab's neighbour takes over: the next tab, else the
    // previous one.
    const nextActive =
      activeTabId === id
        ? nextTabs[Math.min(index, nextTabs.length - 1)].id
        : activeTabId;
    set({ tabs: nextTabs, activeTabId: nextActive });
    fire(browserApi()?.close(id));
  },

  activateTab: (id) => {
    if (!get().tabs.some((t) => t.id === id)) return;
    set({ activeTabId: id });
    // No IPC here: BrowserPanel watches activeTabId and attaches the
    // view itself (it owns the container bounds).
  },

  navigate: (input, tabId) => {
    const url = resolveInputToUrl(input);
    if (!url) return;
    const targetId = tabId ?? get().activeTabId;
    if (!targetId) {
      get().createTab(url);
      return;
    }
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === targetId ? { ...t, url, loading: true } : t,
      ),
    }));
    fire(browserApi()?.navigate(targetId, url));
  },

  goBack: () => {
    const { tabs, activeTabId } = get();
    const tab = tabs.find((t) => t.id === activeTabId);
    if (tab?.canGoBack) fire(browserApi()?.goBack(tab.id));
  },

  goForward: () => {
    const { tabs, activeTabId } = get();
    const tab = tabs.find((t) => t.id === activeTabId);
    if (tab?.canGoForward) fire(browserApi()?.goForward(tab.id));
  },

  reload: () => {
    const { activeTabId } = get();
    if (activeTabId) fire(browserApi()?.reload(activeTabId));
  },

  openQuickTab: (url) => {
    if (get().activeTabId) {
      get().navigate(url);
    } else {
      get().createTab(url);
    }
  },

  applyTabUpdate: (tabId, state) => {
    // A view event arriving after its tab closed must not resurrect it.
    if (!get().tabs.some((t) => t.id === tabId)) return;
    set((prev) => ({
      tabs: prev.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              url: state.url,
              title: state.title || state.url,
              loading: state.loading,
              canGoBack: state.canGoBack,
              canGoForward: state.canGoForward,
            }
          : t,
      ),
    }));
  },
}));
