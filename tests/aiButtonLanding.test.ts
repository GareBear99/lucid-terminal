/**
 * AI-button landing tests.
 *
 * The AI button always lands the AI panel on the AI Chat tab — even
 * if the panel was left on the Browser tab when it was closed. The
 * handler lives in App.tsx (handleToggleAI) and is a thin wrapper
 * around the store call the tests drive — setPanelTab('ai') from
 * 'browser'. Browser tabs are untouched by the switch.
 *
 * State persistence across restarts is deferred (History chats and
 * browser tabs are session-only for now), so this file covers only
 * the landing contract, not persistence.
 *
 * Run with: npm test
 */

import { describe, test, expect } from 'vitest';
import {
  useBrowserStore,
  PHONE_CONTROL_URL,
  ABOUT_BLANK,
} from '../src/stores/browserStore';

describe('AI button lands on AI Chat', () => {
  test('leaving the panel on Browser, then the AI button, lands on chat with tabs intact', () => {
    useBrowserStore.setState({ panelTab: 'ai', tabs: [], activeTabId: null });
    const api = useBrowserStore.getState();
    api.setPanelTab('browser');
    api.createTab('https://example.com');
    expect(useBrowserStore.getState().panelTab).toBe('browser');

    // Exactly what App.tsx handleToggleAI does when the panel opens
    // (or is already open on Browser): switch to the chat tab.
    useBrowserStore.getState().setPanelTab('ai');

    const s = useBrowserStore.getState();
    expect(s.panelTab).toBe('ai');
    expect(s.tabs.map((t) => t.url)).toEqual([
      PHONE_CONTROL_URL,
      'https://example.com',
    ]);
    // Switching to chat does not drop the tabs or open a fresh one.
    expect(s.tabs).toHaveLength(2);
    expect(s.activeTabId).toBe(s.tabs[1].id);
  });

  test('opening the panel on a fresh start lands on AI Chat, not a blank tab', () => {
    useBrowserStore.setState({ panelTab: 'ai', tabs: [], activeTabId: null });
    // handleToggleAI's opening move, from the default panel tab.
    useBrowserStore.getState().setPanelTab('ai');
    const s = useBrowserStore.getState();
    expect(s.panelTab).toBe('ai');
    expect(s.tabs).toEqual([]);
    expect(s.activeTabId).toBeNull();
    // No blank tab was opened: the first-visit phone tab only happens
    // on the Browser tab, and the panel opens on AI Chat.
    expect(s.tabs).not.toContainEqual(
      expect.objectContaining({ url: ABOUT_BLANK }),
    );
  });
});
