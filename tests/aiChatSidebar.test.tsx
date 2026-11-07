// @vitest-environment jsdom
/**
 * AI Chat — Chats panel tests.
 *
 * Expected behaviour (Gary, 2026-11-06): the Chats panel must NEVER
 * start open in the AI panel — open, it overlays most of the
 * conversation and hides the assistant replies — and it needs a
 * visible minus (-) minimize button. The only way to close it used to
 * be clicking off in the chat, which Gary did not realize at first
 * because the open panel was in the way of most of the screen.
 *
 * The click-off backdrop dismiss is kept and covered too.
 *
 * These are DOM/state tests — the flow is asserted through the
 * rendered panel, not pixels.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AIChat from '../src/components/AI/AIChat';
import { useAIStore } from '../src/stores/aiStore';
import { useSettingsStore } from '../src/stores/settingsStore';

// Mount needs the ai + settings IPC the panel calls on mount
// (loadSessions, checkBackendStatus, streaming listeners). Patch
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

function resetStores() {
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
  // Render the main chat, not the no-key gate screen.
  useSettingsStore.setState({ hasApiKey: true });
}

describe('AI Chat — Chats panel', () => {
  let restoreLucidAPI: () => void;

  beforeEach(() => {
    restoreLucidAPI = installMock();
    resetStores();
  });

  afterEach(() => {
    restoreLucidAPI();
  });

  // The mount loads sessions async (loadSessions, then a first
  // session is created when none exist). Let that settle inside act
  // before asserting, so no state update lands after the render.
  async function settleMount() {
    await waitFor(() => expect(useAIStore.getState().sessions.length).toBe(1));
  }

  test('Chats panel starts closed', async () => {
    render(<AIChat onClose={() => undefined} />);
    await settleMount();
    expect(screen.queryByText('Chats')).toBeNull();
    expect(screen.queryByTitle('Minimize chats')).toBeNull();
  });

  test('minus button closes the panel', async () => {
    render(<AIChat onClose={() => undefined} />);
    await settleMount();
    // Open it with the Menu toggle in the chat header.
    fireEvent.click(screen.getByTitle('Toggle chats panel'));
    expect(screen.getByText('Chats')).toBeTruthy();
    expect(screen.getByTitle('Minimize chats')).toBeTruthy();
    // The minus minimizes it.
    fireEvent.click(screen.getByTitle('Minimize chats'));
    expect(screen.queryByText('Chats')).toBeNull();
  });

  test('clicking off in the chat still closes the panel', async () => {
    const { container } = render(<AIChat onClose={() => undefined} />);
    await settleMount();
    fireEvent.click(screen.getByTitle('Toggle chats panel'));
    expect(screen.getByText('Chats')).toBeTruthy();
    const backdrop = container.querySelector('[class*="bg-black"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);
    expect(screen.queryByText('Chats')).toBeNull();
  });
});
