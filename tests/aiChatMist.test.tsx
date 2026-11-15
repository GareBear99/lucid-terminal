// @vitest-environment jsdom
/**
 * AI Chat mist toggle (sweep item 12) — render level.
 *
 * The toggle (key + Settings toggle + conditional render) follows
 * the Files pattern exactly. The conditional render is the panel
 * shell going transparent: the AIPanel root and both AIChat roots
 * (no-key empty state + main chat) switch from solid
 * bg-[var(--bg-primary)] to bg-transparent, so the one app-level
 * mist shows through the panel. No second mist layer is rendered.
 *
 * NOT the full mist theme (Gary, 2026-11-14 ~20:31 PST) — that
 * comes LATER, gated on verified client-side yield + a verified
 * temp for that profile. This is only the per-surface toggle,
 * default OFF.
 *
 * Run with: npx vitest run tests/aiChatMist.test.tsx
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import AIPanel from '../src/components/AI/AIPanel';
import { useAIStore } from '../src/stores/aiStore';
import { useSettingsStore } from '../src/stores/settingsStore';

// The hidden Copilot/Browser tabs mount their views even while
// hidden — stub them; this test is about the panel shell and the
// AIChat tab, not the other two tabs.
vi.mock('../src/components/AI/CopilotView', () => ({
  CopilotView: () => null,
}));
vi.mock('../src/components/Browser/BrowserPanel', () => ({
  __esModule: true,
  default: () => null,
}));

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
    lucid: {
      getModelStatuses: vi.fn(async () => ({})),
    },
  };
  win.lucidAPI = { ...((prevLucidAPI as object) ?? {}), ...mock };
  return () => {
    if (prevLucidAPI === undefined) delete win.lucidAPI;
    else win.lucidAPI = prevLucidAPI;
  };
}

describe('AI Chat mist — sweep item 12', () => {
  let restoreLucidAPI: () => void;

  beforeEach(() => {
    restoreLucidAPI = installMock();
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
    useSettingsStore.setState({ hasApiKey: false });
  });

  afterEach(() => {
    restoreLucidAPI();
  });

  test('OFF (default): the panel shell and the chat root are solid', () => {
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({ settings: { ...base, aiChatMist: false } });
    render(<AIPanel onClose={() => undefined} />);
    expect(screen.getByTestId('ai-panel').className).toContain('bg-[var(--bg-primary)]');
    expect(screen.getByTestId('ai-panel').className).not.toContain('bg-transparent');
    // The no-key empty-state root is the h-full ancestor of its heading.
    const chatRoot = screen.getByText('Activate Lucid Terminal').closest('div.h-full');
    expect(chatRoot?.className).toContain('bg-[var(--bg-primary)]');
  });

  test('ON: the panel shell and the chat root go transparent (mist shows through)', () => {
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({ settings: { ...base, aiChatMist: true } });
    render(<AIPanel onClose={() => undefined} />);
    expect(screen.getByTestId('ai-panel').className).toContain('bg-transparent');
    expect(screen.getByTestId('ai-panel').className).not.toContain('bg-[var(--bg-primary)]');
    const chatRoot = screen.getByText('Activate Lucid Terminal').closest('div.h-full');
    expect(chatRoot?.className).toContain('bg-transparent');
    // Still one mist layer in the document — the panel renders no
    // second SplashMist of its own.
    expect(screen.queryAllByTestId('splash-mist')).toHaveLength(0);
  });
});
