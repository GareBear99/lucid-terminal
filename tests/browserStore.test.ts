/**
 * Browser panel store tests — tab switching logic and URL handling.
 *
 * The store is the single place where browser-tab bookkeeping lives:
 * - the first visit to the Browser tab opens the phone control app;
 * - closing the active tab activates its neighbour, and closing the
 *   last tab opens a fresh one (never zero tabs);
 * - closing a tab remembers it (unless blank) so Ctrl+Shift+T can
 *   reopen it, most recent first;
 * - zoom steps 20% per action, clamped to 25–500%, and tells main;
 * - a finished page load is recorded in browser history;
 * - switching panel tabs never drops browser tabs, and switching
 *   browser tabs never drops the panel tab;
 * - a main-process update for a closed tab must not resurrect it.
 *
 * The store runs in node here (vitest `environment: 'node'`), so
 * `window.lucidAPI.browser` is stubbed — the actions under test only
 * call it to drive the main-process BrowserViews, which the stubs
 * swallow. The stubs are asserted on, to prove the store actually
 * tells main what it did.
 *
 * Run with: npm test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  useBrowserStore,
  PHONE_CONTROL_URL,
  ABOUT_BLANK,
} from '../src/stores/browserStore';
import { useBrowserHistory } from '../src/stores/browserHistory';
import type { BrowserTabState } from '../src/types';

const browserStub = () => ({
  create: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  activate: vi.fn().mockResolvedValue(undefined),
  hide: vi.fn().mockResolvedValue(undefined),
  setBounds: vi.fn().mockResolvedValue(undefined),
  navigate: vi.fn().mockResolvedValue(undefined),
  goBack: vi.fn().mockResolvedValue(undefined),
  goForward: vi.fn().mockResolvedValue(undefined),
  reload: vi.fn().mockResolvedValue(undefined),
  setZoom: vi.fn().mockResolvedValue(1),
  onUpdated: vi.fn().mockReturnValue(() => undefined),
  onOpenUrl: vi.fn().mockReturnValue(() => undefined),
});

let stub: ReturnType<typeof browserStub>;

const resetStore = () => {
  useBrowserStore.setState({
    panelTab: 'ai',
    tabs: [],
    activeTabId: null,
    closedTabs: [],
    poppedOutTabId: null,
  });
  useBrowserHistory.setState({ entries: [] });
};

beforeEach(() => {
  resetStore();
  stub = browserStub();
  vi.stubGlobal('window', { lucidAPI: { browser: stub } });
});

const tabState = (url: string): BrowserTabState => ({
  url,
  title: `Title ${url}`,
  loading: false,
  canGoBack: true,
  canGoForward: false,
});

describe('useBrowserStore', () => {
  it('starts on the AI tab with no browser tabs', () => {
    const s = useBrowserStore.getState();
    expect(s.panelTab).toBe('ai');
    expect(s.tabs).toEqual([]);
    expect(s.activeTabId).toBeNull();
  });

  it('first visit to the Browser tab opens the phone control app', () => {
    const api = useBrowserStore.getState();
    api.setPanelTab('browser');
    const s = useBrowserStore.getState();
    expect(s.panelTab).toBe('browser');
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0].url).toBe(PHONE_CONTROL_URL);
    expect(s.activeTabId).toBe(s.tabs[0].id);
    expect(stub.create).toHaveBeenCalledWith(s.tabs[0].id, PHONE_CONTROL_URL);
  });

  it('switching panel tabs keeps the browser tabs', () => {
    const api = useBrowserStore.getState();
    api.setPanelTab('browser');
    api.setPanelTab('ai');
    const s = useBrowserStore.getState();
    expect(s.panelTab).toBe('ai');
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0].url).toBe(PHONE_CONTROL_URL);
    api.setPanelTab('browser');
    expect(useBrowserStore.getState().tabs).toHaveLength(1);
  });

  it('createTab with no URL opens about:blank and activates it', () => {
    const api = useBrowserStore.getState();
    api.createTab();
    const s = useBrowserStore.getState();
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0].url).toBe(ABOUT_BLANK);
    expect(s.tabs[0].title).toBe('New Tab');
    expect(s.activeTabId).toBe(s.tabs[0].id);
    expect(stub.create).toHaveBeenCalledWith(s.tabs[0].id, ABOUT_BLANK);
  });

  it('createTab with a URL opens that URL and activates it', () => {
    const api = useBrowserStore.getState();
    api.createTab('https://example.com');
    const s = useBrowserStore.getState();
    expect(s.tabs[0].url).toBe('https://example.com');
    expect(s.activeTabId).toBe(s.tabs[0].id);
  });

  it('activateTab switches the active tab', () => {
    const api = useBrowserStore.getState();
    api.createTab('https://one.example');
    api.createTab('https://two.example');
    const s = useBrowserStore.getState();
    api.activateTab(s.tabs[0].id);
    expect(useBrowserStore.getState().activeTabId).toBe(s.tabs[0].id);
  });

  it('activateTab ignores an unknown id', () => {
    const api = useBrowserStore.getState();
    api.createTab('https://one.example');
    const before = useBrowserStore.getState().activeTabId;
    api.activateTab('no-such-tab');
    expect(useBrowserStore.getState().activeTabId).toBe(before);
  });

  it('closing a non-active tab keeps the active tab', () => {
    const api = useBrowserStore.getState();
    api.createTab('https://one.example');
    api.createTab('https://two.example');
    const s = useBrowserStore.getState();
    api.closeTab(s.tabs[0].id);
    const next = useBrowserStore.getState();
    expect(next.tabs).toHaveLength(1);
    expect(next.tabs[0].url).toBe('https://two.example');
    expect(next.activeTabId).toBe(s.tabs[1].id);
    expect(stub.close).toHaveBeenCalledWith(s.tabs[0].id);
  });

  it('closing the active tab activates the next tab', () => {
    const api = useBrowserStore.getState();
    api.createTab('https://one.example');
    api.createTab('https://two.example');
    api.createTab('https://three.example');
    const s = useBrowserStore.getState();
    api.activateTab(s.tabs[0].id);
    api.closeTab(s.tabs[0].id);
    const next = useBrowserStore.getState();
    expect(next.tabs.map((t) => t.url)).toEqual([
      'https://two.example',
      'https://three.example',
    ]);
    expect(next.activeTabId).toBe(s.tabs[1].id);
  });

  it('closing the last tab opens a fresh tab, never zero tabs', () => {
    const api = useBrowserStore.getState();
    api.createTab('https://one.example');
    const s = useBrowserStore.getState();
    api.closeTab(s.tabs[0].id);
    const next = useBrowserStore.getState();
    expect(next.tabs).toHaveLength(1);
    expect(next.tabs[0].url).toBe(ABOUT_BLANK);
    expect(next.activeTabId).toBe(next.tabs[0].id);
    expect(stub.close).toHaveBeenCalledWith(s.tabs[0].id);
    expect(stub.create).toHaveBeenCalledWith(next.tabs[0].id, ABOUT_BLANK);
  });

  it('closing an unknown tab is a no-op', () => {
    const api = useBrowserStore.getState();
    api.createTab('https://one.example');
    api.closeTab('no-such-tab');
    expect(useBrowserStore.getState().tabs).toHaveLength(1);
    expect(stub.close).not.toHaveBeenCalled();
  });

  it('navigate resolves a bare domain to https and tells main', () => {
    const api = useBrowserStore.getState();
    api.createTab(ABOUT_BLANK);
    const id = useBrowserStore.getState().activeTabId as string;
    api.navigate('example.com');
    const s = useBrowserStore.getState();
    expect(s.tabs[0].url).toBe('https://example.com');
    expect(stub.navigate).toHaveBeenCalledWith(id, 'https://example.com');
  });

  it('navigate sends search text to DuckDuckGo', () => {
    const api = useBrowserStore.getState();
    api.createTab(ABOUT_BLANK);
    api.navigate('hello world');
    expect(useBrowserStore.getState().tabs[0].url).toBe(
      'https://duckduckgo.com/?q=hello%20world',
    );
  });

  it('navigate with no tabs opens a tab at the resolved URL', () => {
    const api = useBrowserStore.getState();
    api.navigate('example.com');
    const s = useBrowserStore.getState();
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0].url).toBe('https://example.com');
  });

  it('navigate with empty input is a no-op', () => {
    const api = useBrowserStore.getState();
    api.createTab(ABOUT_BLANK);
    api.navigate('   ');
    expect(useBrowserStore.getState().tabs[0].url).toBe(ABOUT_BLANK);
    expect(stub.navigate).not.toHaveBeenCalled();
  });

  it('goBack/forward only call main when the tab can go that way', () => {
    const api = useBrowserStore.getState();
    api.createTab('https://one.example');
    const id = useBrowserStore.getState().tabs[0].id;
    api.applyTabUpdate(id, tabState('https://one.example'));
    api.goBack();
    expect(stub.goBack).toHaveBeenCalledWith(id);
    api.goForward();
    expect(stub.goForward).not.toHaveBeenCalled();
  });

  it('reload calls main for the active tab', () => {
    const api = useBrowserStore.getState();
    api.createTab('https://one.example');
    const id = useBrowserStore.getState().tabs[0].id;
    api.reload();
    expect(stub.reload).toHaveBeenCalledWith(id);
  });

  it('applyTabUpdate merges live state into the right tab', () => {
    const api = useBrowserStore.getState();
    api.createTab('https://one.example');
    api.createTab('https://two.example');
    const s = useBrowserStore.getState();
    api.applyTabUpdate(s.tabs[1].id, {
      ...tabState('https://two.example/page'),
      title: 'Two Page',
      loading: true,
      canGoBack: true,
      canGoForward: true,
    });
    const next = useBrowserStore.getState();
    expect(next.tabs[0].url).toBe('https://one.example');
    expect(next.tabs[1].url).toBe('https://two.example/page');
    expect(next.tabs[1].title).toBe('Two Page');
    expect(next.tabs[1].loading).toBe(true);
    expect(next.tabs[1].canGoBack).toBe(true);
    expect(next.tabs[1].canGoForward).toBe(true);
  });

  it('applyTabUpdate for a closed tab does not resurrect it', () => {
    const api = useBrowserStore.getState();
    api.createTab('https://one.example');
    const id = useBrowserStore.getState().tabs[0].id;
    api.closeTab(id);
    api.applyTabUpdate(id, tabState('https://ghost.example'));
    expect(useBrowserStore.getState().tabs[0].url).toBe(ABOUT_BLANK);
  });

  it('openQuickTab navigates the active tab', () => {
    const api = useBrowserStore.getState();
    api.createTab(ABOUT_BLANK);
    api.openQuickTab(PHONE_CONTROL_URL);
    expect(useBrowserStore.getState().tabs[0].url).toBe(PHONE_CONTROL_URL);
  });

  it('openQuickTab with no tabs opens a tab at the quick URL', () => {
    const api = useBrowserStore.getState();
    api.openQuickTab(PHONE_CONTROL_URL);
    const s = useBrowserStore.getState();
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0].url).toBe(PHONE_CONTROL_URL);
  });

  it('closing a tab remembers it for reopening', () => {
    const api = useBrowserStore.getState();
    api.createTab('https://one.example');
    api.createTab('https://two.example');
    const s = useBrowserStore.getState();
    api.closeTab(s.tabs[0].id);
    expect(useBrowserStore.getState().closedTabs).toEqual([
      { url: 'https://one.example', title: 'https://one.example' },
    ]);
  });

  it('closing a blank tab does not add to the reopen stack', () => {
    const api = useBrowserStore.getState();
    api.createTab();
    const s = useBrowserStore.getState();
    api.closeTab(s.tabs[0].id);
    expect(useBrowserStore.getState().closedTabs).toEqual([]);
  });

  it('restoreClosedTab reopens the most recent closed tab first', () => {
    const api = useBrowserStore.getState();
    api.createTab('https://one.example');
    api.createTab('https://two.example');
    const s = useBrowserStore.getState();
    api.closeTab(s.tabs[0].id);
    api.closeTab(s.tabs[1].id);
    expect(useBrowserStore.getState().closedTabs).toHaveLength(2);
    api.restoreClosedTab();
    const next = useBrowserStore.getState();
    expect(next.tabs[next.tabs.length - 1].url).toBe('https://two.example');
    expect(next.closedTabs).toHaveLength(1);
    expect(next.closedTabs[0].url).toBe('https://one.example');
    api.restoreClosedTab();
    expect(useBrowserStore.getState().closedTabs).toHaveLength(0);
  });

  it('restoreClosedTab with nothing closed is a no-op', () => {
    const api = useBrowserStore.getState();
    api.createTab('https://one.example');
    api.restoreClosedTab();
    expect(useBrowserStore.getState().tabs).toHaveLength(1);
    expect(stub.create).toHaveBeenCalledTimes(1);
  });

  it('zoomIn steps 20% and tells main; zoomOut steps back', () => {
    const api = useBrowserStore.getState();
    api.createTab('https://one.example');
    const id = useBrowserStore.getState().tabs[0].id;
    api.zoomIn();
    expect(useBrowserStore.getState().tabs[0].zoomFactor).toBe(1.2);
    expect(stub.setZoom).toHaveBeenCalledWith(id, 1.2);
    api.zoomIn();
    expect(useBrowserStore.getState().tabs[0].zoomFactor).toBe(1.44);
    api.zoomOut();
    expect(useBrowserStore.getState().tabs[0].zoomFactor).toBe(1.2);
  });

  it('zoom clamps at 25% and 500%', () => {
    const api = useBrowserStore.getState();
    api.createTab('https://one.example');
    for (let i = 0; i < 20; i++) api.zoomOut();
    expect(useBrowserStore.getState().tabs[0].zoomFactor).toBe(0.25);
    for (let i = 0; i < 40; i++) api.zoomIn();
    expect(useBrowserStore.getState().tabs[0].zoomFactor).toBe(5);
  });

  it('resetZoom returns to 100% and tells main; at 100% it is a no-op', () => {
    const api = useBrowserStore.getState();
    api.createTab('https://one.example');
    const id = useBrowserStore.getState().tabs[0].id;
    api.resetZoom();
    expect(stub.setZoom).not.toHaveBeenCalled();
    api.zoomIn();
    api.resetZoom();
    expect(useBrowserStore.getState().tabs[0].zoomFactor).toBe(1);
    expect(stub.setZoom).toHaveBeenLastCalledWith(id, 1);
  });

  it('a finished load is recorded in history; a loading one is not', () => {
    const api = useBrowserStore.getState();
    api.createTab('https://one.example');
    const id = useBrowserStore.getState().tabs[0].id;
    api.applyTabUpdate(id, { ...tabState('https://one.example'), loading: true });
    expect(useBrowserHistory.getState().entries).toEqual([]);
    api.applyTabUpdate(id, tabState('https://one.example'));
    expect(useBrowserHistory.getState().entries).toHaveLength(1);
    expect(useBrowserHistory.getState().entries[0].url).toBe(
      'https://one.example',
    );
  });

  it('a finished about:blank load is not recorded in history', () => {
    const api = useBrowserStore.getState();
    api.createTab();
    const id = useBrowserStore.getState().tabs[0].id;
    api.applyTabUpdate(id, {
      url: ABOUT_BLANK,
      title: 'New Tab',
      loading: false,
      canGoBack: false,
      canGoForward: false,
    });
    expect(useBrowserHistory.getState().entries).toEqual([]);
  });
});

describe('poppedOutTabId (Area 6)', () => {
  it('starts null; setPoppedOutTabId records and clears it', () => {
    const api = useBrowserStore.getState();
    expect(api.poppedOutTabId).toBeNull();
    api.setPoppedOutTabId('tab-1');
    expect(useBrowserStore.getState().poppedOutTabId).toBe('tab-1');
    api.setPoppedOutTabId(null);
    expect(useBrowserStore.getState().poppedOutTabId).toBeNull();
  });
});
