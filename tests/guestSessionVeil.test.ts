// @vitest-environment jsdom
/**
 * Guest session veil tests (Gary, 2026-11-12 ~17:53–17:59 PST):
 * "guest is all one account", "always a new guest", "in theory you
 * could run a guest long enough to verify so the only restriction
 * is demo until you make a profile", "So no llmbuilder memory or
 * driving intelligence memory or chat memory or history etc",
 * "in every guest build", "So all our saved data will be wiped
 * thats fine".
 *
 * The veil is the guest's VIEW, not a deletion: entering as guest
 * stashes the owner's AI chats + terminal history in memory (never
 * deleted, never persisted over) and shows empty; the guest's own
 * live chats / terminal blocks are never persisted and are dropped
 * on exit; leaving the guest restores the owner exactly. The hard
 * constraint these tests pin down: NO guest action ever deletes or
 * overwrites the owner's persisted data (sessions.json, the
 * persisted history key, the retention tiers — the renderer has no
 * path to the tiers at all, so nothing here can touch them).
 *
 * What the veil does NOT do (flagged, not hidden): there is still
 * no per-profile chat store — the guest's chats live in the same
 * global aiStore/historyStore, veiled by the flag. A real
 * per-profile chat store would replace the stash with per-profile
 * records; the veil is the correct behaviour until then.
 *
 * Run with: npm test
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { useAIStore } from '../src/stores/aiStore';
import {
  useHistoryStore,
  selectHistoryBlocksForTab,
  HISTORY_STORAGE_KEY,
  flushHistoryPersistence,
} from '../src/stores/historyStore';
import {
  DEFAULT_PROFILE_ID,
  PROFILE_STORAGE_KEY,
  createDefaultProfile,
  useProfileStore,
} from '../src/stores/profileStore';
import type { ChatMessage, ChatSession, TerminalBlock } from '../src/types';

const ownerMessages: ChatMessage[] = [
  { id: 'm1', role: 'user', content: 'owner secret question', timestamp: 1000, ritualTick: 0 },
  { id: 'm2', role: 'assistant', content: 'owner answer', timestamp: 2000, ritualTick: 1 },
];

const ownerSession: ChatSession = {
  id: 'owner-1',
  title: 'Owner chat',
  messages: ownerMessages,
  createdAt: 1000,
  updatedAt: 2000,
  causalOrder: 0,
  nextTick: 2,
};

function ownerBlock(): TerminalBlock {
  return {
    id: 'b1',
    command: 'ls ~/secret',
    output: 'secret.txt',
    timestamp: 1000,
    isComplete: true,
    isCollapsed: false,
    isProcessing: false,
  };
}

function guestBlock(): TerminalBlock {
  return {
    id: 'g1',
    command: 'echo guest',
    output: 'guest',
    timestamp: 2000,
    isComplete: true,
    isCollapsed: false,
    isProcessing: false,
  };
}

let saveSession: ReturnType<typeof vi.fn>;
let deleteSession: ReturnType<typeof vi.fn>;
let clearSessions: ReturnType<typeof vi.fn>;
let getSessions: ReturnType<typeof vi.fn>;
let cancelStream: ReturnType<typeof vi.fn>;

function resetStores() {
  useAIStore.setState({
    sessions: [],
    currentSessionId: null,
    messages: [],
    isLoading: false,
    isSessionsLoaded: false,
    streamingMessage: '',
    streamStartedAt: null,
    generatingSessionId: null,
    lastTokenAt: null,
    stagingMessages: null,
    nextMessages: null,
    guestSessionActive: false,
    guestStash: null,
  });
  useHistoryStore.setState({
    blocksByTab: {},
    guestSessionActive: false,
    guestStash: null,
  });
  try {
    localStorage.removeItem(PROFILE_STORAGE_KEY);
  } catch {
    // jsdom without storage: the store resets below regardless.
  }
  useProfileStore.setState({
    profiles: [createDefaultProfile()],
    activeProfileId: DEFAULT_PROFILE_ID,
  });
}

beforeEach(() => {
  saveSession = vi.fn();
  deleteSession = vi.fn().mockResolvedValue(undefined);
  clearSessions = vi.fn().mockResolvedValue(undefined);
  getSessions = vi.fn().mockResolvedValue([ownerSession]);
  cancelStream = vi.fn();
  (globalThis as unknown as { window: unknown }).window = {
    lucidAPI: {
      ai: { getSessions, saveSession, deleteSession, clearSessions, cancelStream },
      settings: { set: vi.fn(), setMany: vi.fn() },
    },
  };
  resetStores();
  // Clear any debounced persist timer left by the previous test,
  // so it can never write a stale state into this test.
  flushHistoryPersistence();
});

/** Seed the owner's chats + history, persisted, as a real session would. */
function seedOwner() {
  useAIStore.setState({
    sessions: [ownerSession],
    currentSessionId: 'owner-1',
    messages: [...ownerSession.messages],
    isSessionsLoaded: true,
  });
  useHistoryStore.getState().setBlocks('tab-1', [ownerBlock()]);
  flushHistoryPersistence();
}

/** Enter as guest the way the Profiles screen does: create + select. */
function enterAsGuest() {
  const guest = useProfileStore.getState().createGuestProfile();
  expect(useProfileStore.getState().selectProfile(guest.id)).toBe(true);
  return guest;
}

describe('guest session veil — entering as guest', () => {
  test('shows empty chats + history and stashes the owner data untouched', () => {
    seedOwner();
    const persistedBefore = localStorage.getItem(HISTORY_STORAGE_KEY);

    enterAsGuest();

    const ai = useAIStore.getState();
    expect(ai.guestSessionActive).toBe(true);
    expect(ai.sessions).toEqual([]);
    expect(ai.messages).toEqual([]);
    expect(ai.currentSessionId).toBeNull();
    // The owner is stashed in memory — intact, not deleted.
    expect(ai.guestStash?.sessions).toEqual([ownerSession]);
    expect(ai.guestStash?.currentSessionId).toBe('owner-1');
    expect(ai.guestStash?.messages).toEqual(ownerMessages);

    const history = useHistoryStore.getState();
    expect(history.guestSessionActive).toBe(true);
    expect(history.blocksByTab).toEqual({});
    expect(history.guestStash).toEqual({ 'tab-1': [ownerBlock()] });

    // NOTHING was deleted or written on disk: no session IPC at all,
    // and the persisted history key still holds the owner's blocks.
    expect(saveSession).not.toHaveBeenCalled();
    expect(deleteSession).not.toHaveBeenCalled();
    expect(clearSessions).not.toHaveBeenCalled();
    expect(getSessions).not.toHaveBeenCalled();
    expect(localStorage.getItem(HISTORY_STORAGE_KEY)).toBe(persistedBefore);

    // The History panel shows nothing for a guest.
    expect(
      selectHistoryBlocksForTab(useHistoryStore.getState(), 'tab-1'),
    ).toEqual([]);
  });

  test('a guest chat works live but is never persisted', async () => {
    seedOwner();
    enterAsGuest();

    // The guest's own chat: creates, sends, models, deletes — all
    // visible, none of it reaching disk.
    useAIStore.getState().createSession();
    const guestId = useAIStore.getState().currentSessionId;
    expect(guestId).not.toBeNull();
    expect(guestId).not.toBe('owner-1');
    expect(useAIStore.getState().sessions).toHaveLength(1);
    useAIStore.getState().addMessage(
      { id: 'g1', role: 'user', content: 'guest question', timestamp: 2000 },
      guestId!,
    );
    expect(useAIStore.getState().messages).toHaveLength(1);
    expect(useAIStore.getState().messages[0].content).toBe('guest question');
    useAIStore.getState().setSessionModel(guestId!, 'tinyllama', 'local');
    await useAIStore.getState().deleteSession(guestId!);
    expect(useAIStore.getState().sessions).toEqual([]);
    expect(deleteSession).not.toHaveBeenCalled();

    // A guest clear drops only the guest's live chats — sessions.json
    // is never touched.
    useAIStore.getState().createSession();
    await useAIStore.getState().clearSessions();
    expect(useAIStore.getState().sessions).toEqual([]);
    expect(clearSessions).not.toHaveBeenCalled();

    // Nothing the guest did was ever persisted.
    expect(saveSession).not.toHaveBeenCalled();

    // The guest's terminal output shows live in the feed — but a
    // flush during the guest session must not overwrite the owner's
    // persisted history with the guest's live blocks.
    const persistedBefore = localStorage.getItem(HISTORY_STORAGE_KEY);
    useHistoryStore.getState().setBlocks('tab-1', [guestBlock()]);
    expect(useHistoryStore.getState().blocksByTab['tab-1']).toEqual([
      guestBlock(),
    ]);
    flushHistoryPersistence();
    expect(localStorage.getItem(HISTORY_STORAGE_KEY)).toBe(persistedBefore);
  });

  test('a guest never sees the owner’s stream — only the guest’s own chunks land', () => {
    seedOwner();
    enterAsGuest();

    // A generation still running from before guest entry has its id
    // in the stash, not the visible list: its chunks are dropped.
    useAIStore.setState({ generatingSessionId: 'owner-1' });
    useAIStore.getState().updateStreamingMessage('owner chunk');
    expect(useAIStore.getState().streamingMessage).toBe('');

    // The guest's own generation: the id IS a visible session, so
    // its chunks land normally.
    useAIStore.getState().createSession();
    useAIStore.getState().setLoading(true);
    useAIStore.getState().updateStreamingMessage('guest chunk');
    expect(useAIStore.getState().streamingMessage).toBe('guest chunk');
  });

  test('a message aimed at a stashed owner session is dropped, never shown to the guest', () => {
    seedOwner();
    enterAsGuest();

    // A reply completing after guest entry, aimed at the owner's
    // stashed chat: dropped — never inserted into the guest's
    // displayed list (the old fallback would have shown it).
    useAIStore.getState().addMessage(
      { id: 'm3', role: 'assistant', content: 'owner late reply', timestamp: 3000 },
      'owner-1',
    );
    expect(useAIStore.getState().messages).toEqual([]);
    expect(saveSession).not.toHaveBeenCalled();
  });
});

describe('guest session veil — leaving the guest', () => {
  test('restores the owner exactly — chats, messages, history, persisted key', () => {
    seedOwner();
    const persistedBefore = localStorage.getItem(HISTORY_STORAGE_KEY);
    enterAsGuest();

    // The guest lived in the session: chats + terminal blocks.
    useAIStore.getState().createSession();
    useAIStore.getState().addMessage(
      { id: 'g1', role: 'user', content: 'guest question', timestamp: 2000 },
      useAIStore.getState().currentSessionId!,
    );
    useHistoryStore.getState().setBlocks('tab-1', [guestBlock()]);

    expect(useProfileStore.getState().selectProfile(DEFAULT_PROFILE_ID)).toBe(
      true,
    );

    const ai = useAIStore.getState();
    expect(ai.guestSessionActive).toBe(false);
    expect(ai.guestStash).toBeNull();
    expect(ai.sessions).toEqual([ownerSession]);
    expect(ai.messages).toEqual(ownerMessages);
    expect(ai.currentSessionId).toBe('owner-1');

    const history = useHistoryStore.getState();
    expect(history.guestSessionActive).toBe(false);
    expect(history.guestStash).toBeNull();
    expect(history.blocksByTab).toEqual({ 'tab-1': [ownerBlock()] });
    expect(
      selectHistoryBlocksForTab(useHistoryStore.getState(), 'tab-1'),
    ).toEqual([ownerBlock()]);

    // The persisted copy is the owner's again, byte for byte.
    flushHistoryPersistence();
    expect(localStorage.getItem(HISTORY_STORAGE_KEY)).toBe(persistedBefore);

    // And the whole guest session never persisted or deleted anything.
    expect(saveSession).not.toHaveBeenCalled();
    expect(deleteSession).not.toHaveBeenCalled();
    expect(clearSessions).not.toHaveBeenCalled();
  });

  test('a guest entered before the chat ever loaded still restores the owner on exit', async () => {
    // Boot case: the veil went on at module load, before the chat
    // loaded — the stash holds nothing, so exit loads for real.
    useHistoryStore.getState().setBlocks('tab-1', [ownerBlock()]);
    flushHistoryPersistence();
    // aiStore: sessions never loaded (isSessionsLoaded false).
    enterAsGuest();
    expect(useAIStore.getState().guestSessionActive).toBe(true);

    expect(useProfileStore.getState().selectProfile(DEFAULT_PROFILE_ID)).toBe(
      true,
    );

    await vi.waitFor(() => {
      expect(useAIStore.getState().sessions).toHaveLength(1);
    });
    expect(getSessions).toHaveBeenCalled();
    expect(useAIStore.getState().sessions).toEqual([ownerSession]);
    expect(useAIStore.getState().isSessionsLoaded).toBe(true);
  });
});

describe('guest session veil — always a new guest', () => {
  test('a fresh guest drops the previous guest’s live data; the owner stash survives', () => {
    seedOwner();
    const first = enterAsGuest();

    useAIStore.getState().createSession();
    useAIStore.getState().addMessage(
      { id: 'g1', role: 'user', content: 'first guest question', timestamp: 2000 },
      useAIStore.getState().currentSessionId!,
    );
    useHistoryStore.getState().setBlocks('tab-1', [guestBlock()]);
    expect(useAIStore.getState().sessions).toHaveLength(1);
    expect(useHistoryStore.getState().blocksByTab['tab-1']).toHaveLength(1);

    // A second entry replaces the guest record — and its live data.
    const second = enterAsGuest();
    expect(second.id).not.toBe(first.id);
    expect(
      useProfileStore.getState().profiles.filter((p) => p.status === 'guest'),
    ).toHaveLength(1);
    expect(useProfileStore.getState().activeProfileId).toBe(second.id);
    expect(useAIStore.getState().sessions).toEqual([]);
    expect(useAIStore.getState().messages).toEqual([]);
    expect(useHistoryStore.getState().blocksByTab).toEqual({});
    // The veil is still on and the owner is still stashed.
    expect(useAIStore.getState().guestSessionActive).toBe(true);
    expect(useAIStore.getState().guestStash?.sessions).toEqual([ownerSession]);
    expect(useHistoryStore.getState().guestStash).toEqual({
      'tab-1': [ownerBlock()],
    });
    expect(saveSession).not.toHaveBeenCalled();

    // And leaving still restores the owner exactly.
    expect(useProfileStore.getState().selectProfile(DEFAULT_PROFILE_ID)).toBe(
      true,
    );
    expect(useAIStore.getState().sessions).toEqual([ownerSession]);
    expect(useHistoryStore.getState().blocksByTab).toEqual({
      'tab-1': [ownerBlock()],
    });
  });
});
