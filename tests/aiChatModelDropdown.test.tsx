// @vitest-environment jsdom
/**
 * AI Chat — per-chat model dropdown tests.
 *
 * Expected behaviour (Gary, 2026-11-06): each chat has a model
 * choice dropdown at the top for the next prompted reply, and each
 * chat remembers its model. The dropdown sits in the header, next to
 * "Lucid AI" / the ping quota span — a flat header control, not an
 * input bubble. It lists ONLY the ping server models (Auto + every
 * Workers AI model the ping server can serve) — no locals, no GPTs.
 * Choosing a model sets that chat's model; sending passes it (read
 * at send time) into `lucidAPI.ai.chat`, with the chat id riding
 * along so the backend scopes its memory per chat.
 *
 * These are DOM/state tests — the flow is asserted through the
 * rendered panel, not pixels.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import AIChat from '../src/components/AI/AIChat';
import { useAIStore } from '../src/stores/aiStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { PING_SERVER_MODELS } from '../src/lib/chatModels';

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
      onSnapshotHit: vi.fn(() => noop),
    },
    lucid: {
      getModelStatuses: vi.fn(async () => ({})),
    },
  };
  win.lucidAPI = { ...((prevLucidAPI as object) ?? {}), ...mock };
  return { restore: () => {
    if (prevLucidAPI === undefined) delete win.lucidAPI;
    else win.lucidAPI = prevLucidAPI;
  }, mock };
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
  // Render the main chat, not the no-key gate screen, with ping on
  // so the ping entry is listed.
  useSettingsStore.setState({
    hasApiKey: true,
    settings: { ...useSettingsStore.getState().settings, pingServerEnabled: true },
  });
}

describe('AI Chat — per-chat model dropdown', () => {
  let restoreLucidAPI: () => void;
  let mock: ReturnType<typeof installMock>['mock'];

  beforeEach(() => {
    // jsdom has no scrollIntoView — sending adds a message, which
    // runs the chat's scroll-to-bottom effect.
    Element.prototype.scrollIntoView = vi.fn();
    const installed = installMock();
    restoreLucidAPI = installed.restore;
    mock = installed.mock;
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
    // The dropdown renders after mount; wait for a ping model label.
    await waitFor(() =>
      expect(within(screen.getByLabelText('Chat model')).getByText('Llama 3.2 1B')).toBeTruthy(),
    );
  }

  test('dropdown lists Auto and the ping server models — no locals, no GPTs', async () => {
    render(<AIChat onClose={() => undefined} />);
    await settleMount();

    const select = screen.getByLabelText('Chat model') as HTMLSelectElement;
    expect(select.value).toBe('');
    const values = within(select).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(['', ...PING_SERVER_MODELS.map((m) => m.id)]);
    expect(values).not.toContain('tinyllama');
    expect(values).not.toContain('gpt-4');
    expect(values).not.toContain('lucid-ping');
  });

  test('choosing a model sets that chat\'s model and persists it', async () => {
    render(<AIChat onClose={() => undefined} />);
    await settleMount();

    const chosen = '@cf/meta/llama-3.2-1b-instruct';
    const select = screen.getByLabelText('Chat model') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: chosen } });

    const state = useAIStore.getState();
    const current = state.sessions.find((s) => s.id === state.currentSessionId);
    expect(current?.model).toBe(chosen);
    expect(current?.modelSource).toBe('ping');
    expect(mock.ai.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({ model: chosen, modelSource: 'ping' }),
    );
    expect((screen.getByLabelText('Chat model') as HTMLSelectElement).value).toBe(chosen);
  });

  test('handleSend passes the session\'s model and chat id into ai.chat', async () => {
    render(<AIChat onClose={() => undefined} />);
    await settleMount();

    const sessionId = useAIStore.getState().currentSessionId;
    const chosen = '@cf/meta/llama-3.2-1b-instruct';
    fireEvent.change(screen.getByLabelText('Chat model'), { target: { value: chosen } });

    const input = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(mock.ai.chat).toHaveBeenCalled());
    expect(mock.ai.chat).toHaveBeenCalledWith(
      [{ role: 'user', content: 'hello' }],
      undefined,
      true,
      { model: chosen, modelSource: 'ping', chatId: sessionId },
    );
  });

  test('Auto sends no model — only the chat id rides along', async () => {
    render(<AIChat onClose={() => undefined} />);
    await settleMount();

    const sessionId = useAIStore.getState().currentSessionId;
    const input = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(mock.ai.chat).toHaveBeenCalled());
    expect(mock.ai.chat).toHaveBeenCalledWith(
      [{ role: 'user', content: 'hello' }],
      undefined,
      true,
      { chatId: sessionId },
    );
  });
});

describe('AI Chat — snapshot admits the chat (Gary, 2026-11-12)', () => {
  // A snapshot installed is a route, like ping: with no key,
  // no loaded local model and ping off, the chat still opens
  // and sends (its packets can answer at 0 SP). Without a
  // snapshot the no-key gate screen still shows.
  let restoreLucidAPI: () => void;
  let mock: ReturnType<typeof installMock>['mock'];

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    const installed = installMock();
    restoreLucidAPI = installed.restore;
    mock = installed.mock;
    resetStores();
  });

  afterEach(() => {
    restoreLucidAPI();
  });

  async function settleChat() {
    await waitFor(() => expect(useAIStore.getState().sessions.length).toBe(1));
    await waitFor(() =>
      expect(screen.getByTestId('ai-chat-hint-placeholder')).toBeTruthy(),
    );
  }

  function setNoKeyNoPing(snapshot: boolean) {
    useSettingsStore.setState({
      hasApiKey: false,
      settings: {
        ...useSettingsStore.getState().settings,
        pingServerEnabled: false,
        installedSnapshotVersion: snapshot ? 'v1-run1' : null,
        installedSnapshotHash: snapshot ? 'a'.repeat(64) : null,
      },
    });
  }

  test('snapshot installed, no key, ping off -> chat opens and send reaches ai.chat', async () => {
    setNoKeyNoPing(true);
    render(<AIChat onClose={() => undefined} />);
    await settleChat();

    const input = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(mock.ai.chat).toHaveBeenCalled());
  });

  test('no snapshot, no key, ping off -> the no-key gate screen, no input to send from', async () => {
    setNoKeyNoPing(false);
    render(<AIChat onClose={() => undefined} />);
    await waitFor(() => expect(useAIStore.getState().sessions.length).toBe(1));
    expect(screen.queryByTestId('ai-chat-hint-placeholder')).toBeNull();
    expect(document.querySelector('textarea')).toBeNull();
    expect(mock.ai.chat).not.toHaveBeenCalled();
  });
});

describe('AI Chat — ghost words (Gary, 2026-11-13 ~02:14 PST)', () => {
  // The mechanism covers EVERY prompt; the TEXT stays frozen:
  // the ghost text is 'Ask Lucid...' exactly as-is, rendered as
  // a position:absolute overlay inside the input wrap — the caret
  // overlaps the start of the ghost text, and when the words
  // appear or disappear NOTHING on screen moves. After the
  // chat's first sent message the ghost is gone for that chat,
  // even when the input is empty again — per chat, never global,
  // so a new chat shows it again. The native placeholder is ''
  // always now (the overlay IS the ghost); it must never carry
  // the text, or the two would double-render.
  let restoreLucidAPI: () => void;
  let mock: ReturnType<typeof installMock>['mock'];

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    const installed = installMock();
    restoreLucidAPI = installed.restore;
    mock = installed.mock;
    resetStores();
  });

  afterEach(() => {
    restoreLucidAPI();
  });

  async function settleChat() {
    await waitFor(() => expect(useAIStore.getState().sessions.length).toBe(1));
    await waitFor(() =>
      expect(screen.getByTestId('ai-chat-hint-placeholder')).toBeTruthy(),
    );
  }

  function chatInput(): HTMLTextAreaElement {
    // Found by element, not by placeholder text: the native
    // placeholder is '' now — the overlay carries the ghost.
    // The panel has exactly one textarea.
    const input = document.querySelector('textarea');
    expect(input).not.toBeNull();
    return input as HTMLTextAreaElement;
  }

  function ghostOverlay(): HTMLElement | null {
    return screen.queryByTestId('ai-chat-hint-placeholder');
  }

  test("fresh chat shows the 'Ask Lucid...' ghost as an overlay inside the input wrap", async () => {
    render(<AIChat onClose={() => undefined} />);
    await settleChat();
    const overlay = ghostOverlay();
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toBe('Ask Lucid...');
    // Caret-overlap positioning: absolute, at the textarea's
    // text origin, clicks pass through to the textarea.
    expect(overlay?.className).toContain('absolute');
    expect(overlay?.className).toContain('pointer-events-none');
    expect(overlay?.className).toContain('left-3');
    // The overlay lives INSIDE the input wrap, next to the
    // textarea — not before the input.
    expect(overlay?.parentElement?.contains(chatInput())).toBe(true);
    // Native placeholder never carries the text (no double
    // render) and no 'Ask...' variant exists anywhere.
    expect(chatInput().getAttribute('placeholder')).toBe('');
    expect(screen.queryByPlaceholderText('Ask Lucid...')).toBeNull();
    expect(screen.queryByPlaceholderText('Ask...')).toBeNull();
  });

  test('typing hides the ghost; emptying before the first send brings it back', async () => {
    render(<AIChat onClose={() => undefined} />);
    await settleChat();
    const input = chatInput();
    fireEvent.change(input, { target: { value: 'hel' } });
    expect(ghostOverlay()).toBeNull();
    fireEvent.change(input, { target: { value: '' } });
    expect(ghostOverlay()?.textContent).toBe('Ask Lucid...');
  });

  test('after the first sent message the ghost is gone even when the input is empty again', async () => {
    render(<AIChat onClose={() => undefined} />);
    await settleChat();
    const input = chatInput();
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(mock.ai.chat).toHaveBeenCalled());
    // Send clears the input — and the ghost does NOT come back:
    // this chat has had its first sent message.
    expect(chatInput().value).toBe('');
    expect(ghostOverlay()).toBeNull();
    expect(chatInput().getAttribute('placeholder')).toBe('');
  });

  test('a new chat shows the ghost again — the gating is per chat, never global', async () => {
    render(<AIChat onClose={() => undefined} />);
    await settleChat();
    const input = chatInput();
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(mock.ai.chat).toHaveBeenCalled());
    expect(ghostOverlay()).toBeNull();

    // A new chat has no sent messages yet: the ghost returns.
    act(() => {
      useAIStore.getState().createSession();
    });
    await waitFor(() =>
      expect(ghostOverlay()?.textContent).toBe('Ask Lucid...'),
    );
  });
});
