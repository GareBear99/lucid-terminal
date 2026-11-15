// @vitest-environment jsdom
/**
 * Panel header consistency (sweep items 9 + 10).
 *
 * 9. History minimizes with a Minus glyph + "Minimize
 *    history", matching Explorer and Docs — the same action
 *    (minimize a sidebar panel to the w-12 rail) uses the same
 *    glyph and the same word everywhere. The collapsed rail's
 *    ChevronRight ("Show conversation history") is the expand
 *    direction and stays.
 *
 * 10. The AI panel is a right-edge DOCK, not a sidebar panel,
 *     so there is no w-12 rail to minimize it to — decided once:
 *     the X stays a close, and the tooltip/aria-label says so
 *     explicitly ("Hide AI panel": it hides the dock, state
 *     kept, the toolbar AI button brings it back). Applied to
 *     the AIPanel tab-bar X and both AIChat header X buttons
 *     (the no-key empty state and the main chat header).
 *
 * Run with: npx vitest run tests/panelHeaderConsistency.test.tsx
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConversationHistory } from '../src/components/Sidebar/ConversationHistory';
import AIPanel from '../src/components/AI/AIPanel';
import { useHistoryStore } from '../src/stores/historyStore';
import { useAIStore } from '../src/stores/aiStore';
import { useSettingsStore } from '../src/stores/settingsStore';

// The hidden Copilot/Browser tabs mount their views even while
// hidden — stub them; this test is about the panel chrome and
// the AIChat tab, not the other two tabs.
vi.mock('../src/components/AI/CopilotView', () => ({
  CopilotView: () => null,
}));
vi.mock('../src/components/Browser/BrowserPanel', () => ({
  __esModule: true,
  default: () => null,
}));

// window.lucidAPI in place — never replace the whole jsdom window.
function installMock() {
  const win = window as unknown as Record<string, unknown>;
  const prevLucidAPI = win.lucidAPI;
  const noop = () => undefined;
  const mock = {
    ai: {
      getSessions: vi.fn(async () => []),
      saveSession: vi.fn(async () => undefined),
      deleteSession: vi.fn(async () => undefined),
      clearSessions: vi.fn(async () => undefined),
      chat: vi.fn(async () => undefined),
      cancelStream: vi.fn(noop),
      checkLocalBackend: vi.fn(async () => false),
      onStream: vi.fn(() => noop),
      onStreamEnd: vi.fn(() => noop),
      onStreamError: vi.fn(() => noop),
      onSnapshotHit: vi.fn(() => noop),
    },
    browser: {
      onFlowProgress: vi.fn(() => noop),
      onFlowComplete: vi.fn(() => noop),
      onFlowError: vi.fn(() => noop),
    },
    lucid: {
      getModelStatuses: vi.fn(async () => ({}) ),
    },
  };
  win.lucidAPI = { ...((prevLucidAPI as object) ?? {}), ...mock };
  return () => {
    if (prevLucidAPI === undefined) delete win.lucidAPI;
    else win.lucidAPI = prevLucidAPI;
  };
}

describe('panel header consistency — sweep items 9 + 10', () => {
  let restoreLucidAPI: () => void;

  beforeEach(() => {
    restoreLucidAPI = installMock();
    useHistoryStore.setState({ blocksByTab: {} });
    useAIStore.setState({
      sessions: [],
      currentSessionId: null,
      messages: [],
      contextDirectory: null,
      isLoading: false,
      isSessionsLoaded: false,
      streamingMessage: '',
      streamStartedAt: null,
      generatingSessionId: null,
      pingQuota: null,
      pendingAiPrompt: null,
    });
  });

  afterEach(() => {
    restoreLucidAPI();
  });

  test('item 9: History minimizes with a Minus labelled "Minimize history"', () => {
    render(<ConversationHistory blocks={[]} onJumpToBlock={() => {}} />);
    const minimize = screen.getByLabelText('Minimize history');
    expect(minimize).not.toBeNull();
    // The Minus glyph — no ChevronLeft remains in the header.
    expect(minimize.querySelector('svg.lucide-minus')).not.toBeNull();

    fireEvent.click(minimize);
    // Minimized: the rail is there, the expanded header is gone.
    expect(screen.getByLabelText('Show conversation history')).not.toBeNull();
    expect(screen.queryByLabelText('Minimize history')).toBeNull();
  });

  test('item 10: the AIPanel X hides the panel and calls onClose', async () => {
    useSettingsStore.setState({ hasApiKey: true });
    const onClose = vi.fn();
    render(<AIPanel onClose={onClose} />);
    // The mount loads sessions async; let the chat settle.
    await waitFor(() => expect(useAIStore.getState().sessions.length).toBe(1));
    // Two hide buttons: the panel tab-bar X and the main chat
    // header X. Neither says "Close panel" any more.
    const hideButtons = screen.getAllByLabelText('Hide AI panel');
    expect(hideButtons).toHaveLength(2);
    expect(screen.queryByLabelText('Close panel')).toBeNull();

    fireEvent.click(hideButtons[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('item 10: the no-key empty state X is also "Hide AI panel"', () => {
    useSettingsStore.setState({ hasApiKey: false });
    render(<AIPanel onClose={() => undefined} />);
    expect(screen.getByText('Activate Lucid Terminal')).not.toBeNull();
    expect(screen.getAllByLabelText('Hide AI panel')).toHaveLength(2);
  });
});
