// @vitest-environment jsdom
/**
 * Memory tab tests (Gary, 2026-11-14 ~14:47 PST: a Memory tab
 * in Settings, under the AI tab).
 *
 * Covers:
 * - The tab renders its sections from REAL stores only:
 *   Chat memory (aiStore), Terminal-agent memory
 *   (commandHistoryStore + planStore + historyStore feed
 *   blocks), LLMBuilder memory (agent blocks, clear only),
 *   and the live SPSC tick stream (both rings).
 * - Chat memory and terminal-agent memory are segregated —
 *   two distinct sections, never mixed.
 * - The export downloads the profile's memory (Blob via the
 *   Settings export pattern); the LLMBuilder memory is never
 *   in it (covered in memoryExport.test.ts).
 * - Guest: the blank-slate rule — the tab shows the empty
 *   state only, no download, no clears, no owner data — while
 *   the tick stream (telemetry, not memory) still shows.
 * - The tick stream measures live rates from the counters
 *   (3 ticks in 0.5s reads 6.0/s), never a hardcoded number.
 * - Placement: the tab sits under the AI tab in Settings
 *   (SettingsPanel + default tab order).
 *
 * Client render with @testing-library/react (following the
 * Settings copilots tests): zustand under SSR returns the
 * initial snapshot, so state-dependent assertions need the
 * live store.
 *
 * Run with: npx vitest run tests/memoryTab.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, waitFor, act } from '@testing-library/react';
import { MemoryTab } from '../src/components/Settings/MemoryTab';
import SettingsPanel from '../src/components/Settings/SettingsPanel';
import { useCommandHistoryStore } from '../src/stores/commandHistoryStore';
import { usePlanStore, type Plan } from '../src/stores/planStore';
import { useAIStore } from '../src/stores/aiStore';
import { useHistoryStore } from '../src/stores/historyStore';
import { useProfileStore, type Profile } from '../src/stores/profileStore';
import { useEventLogStore } from '../src/stores/eventLogStore';
import { createEvent } from '../src/lib/eventLog';
import { issueAiChatTick, resetAiChatTickChannel } from '../src/lib/aiChatTicks';
import type { TerminalBlock, ChatSession } from '../src/types';

const NOW = 1763078400000;

const OWNER: Profile = {
  id: 'default',
  name: 'Default',
  status: 'temp',
  verifiedGates: [],
  createdAt: new Date(NOW).toISOString(),
  lastActiveAt: null,
};

const GUEST: Profile = {
  id: 'guest-1',
  name: 'Guest',
  status: 'guest',
  verifiedGates: [],
  createdAt: new Date(NOW).toISOString(),
  lastActiveAt: null,
};

const PLAN: Plan = {
  id: 'plan-1',
  title: 'Ship the pill',
  description: 'Deploy the split toggle pill',
  created: new Date(NOW).toISOString(),
  steps: [
    { id: 's1', title: 'Build', done: true },
    { id: 's2', title: 'Deploy', done: false },
  ],
};

const CHAT: ChatSession = {
  id: 'chat-1',
  title: 'First chat',
  messages: [
    { id: 'm1', role: 'user', content: 'hi', timestamp: NOW },
    { id: 'm2', role: 'assistant', content: 'hello', timestamp: NOW + 1 },
  ],
  createdAt: NOW,
  updatedAt: NOW,
};

function commandBlock(id: string, command: string): TerminalBlock {
  return {
    id,
    command,
    output: 'out',
    timestamp: NOW,
    isComplete: true,
    cwd: '/home/gary',
    kind: 'command',
  };
}

function agentBlock(id: string, kind: 'agent-prompt' | 'agent-response'): TerminalBlock {
  return {
    id,
    command: kind === 'agent-prompt' ? 'do the thing' : '',
    output: kind === 'agent-response' ? 'done' : '',
    timestamp: NOW,
    isComplete: true,
    cwd: '/home/gary',
    kind,
  };
}

describe('Memory tab', () => {
  const mockClearSessions = vi.fn(async () => undefined);
  let prevLucidAPI: unknown;
  let prevConfirm: unknown;
  let prevCreateObjectURL: unknown;
  let prevRevokeObjectURL: unknown;

  beforeEach(() => {
    const win = window as unknown as Record<string, unknown>;
    prevLucidAPI = win.lucidAPI;
    win.lucidAPI = {
      ai: {
        getSessions: vi.fn(async () => []),
        clearSessions: mockClearSessions,
      },
      settings: {
        set: vi.fn(async () => undefined),
        getAll: vi.fn(async () => ({})),
        hasApiKey: vi.fn(async () => false),
        hasPingKey: vi.fn(async () => false),
        hasCopilotApiKey: vi.fn(async () => false),
        setCopilotApiKey: vi.fn(async () => undefined),
        deleteCopilotApiKey: vi.fn(async () => undefined),
        getRunOnStartup: vi.fn(async () => false),
        getStorageStatus: vi.fn(async () => ({ degraded: false, reason: null })),
      },
    };
    prevConfirm = window.confirm;
    window.confirm = () => true;
    prevCreateObjectURL = window.URL.createObjectURL;
    prevRevokeObjectURL = window.URL.revokeObjectURL;
    mockClearSessions.mockClear();
    resetAiChatTickChannel();
    useEventLogStore.getState().clear();
    useProfileStore.setState({ profiles: [OWNER], activeProfileId: 'default' });
    useCommandHistoryStore.setState({
      entries: ['ls -la', 'git status'],
      profileId: 'default',
      loaded: true,
    });
    usePlanStore.setState({ plans: [PLAN], profileId: 'default', loaded: true });
    useAIStore.setState({ sessions: [CHAT], isSessionsLoaded: true });
    useHistoryStore.setState({
      blocksByTab: {
        'terminal-1': [
          commandBlock('b1', 'ls'),
          agentBlock('b2', 'agent-prompt'),
          agentBlock('b3', 'agent-response'),
        ],
      },
    });
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
    window.confirm = prevConfirm as typeof window.confirm;
    window.URL.createObjectURL = prevCreateObjectURL as typeof URL.createObjectURL;
    window.URL.revokeObjectURL = prevRevokeObjectURL as typeof URL.revokeObjectURL;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the sections from the real stores', () => {
    render(<MemoryTab />);
    expect(screen.getByTestId('memory-tab')).toBeTruthy();
    expect(screen.getByText('Chat memory')).toBeTruthy();
    expect(screen.getByText('Terminal-agent memory')).toBeTruthy();
    expect(screen.getByText('LLMBuilder memory')).toBeTruthy();
    expect(screen.getByText('Tick stream — live')).toBeTruthy();
    // Counts come from the stores, not from fixtures.
    expect(screen.getByText(/1 chat · 2 messages/)).toBeTruthy();
    expect(screen.getByText('2 commands')).toBeTruthy();
    expect(screen.getByText(/1 plan · 1\/2 steps done/)).toBeTruthy();
    expect(screen.getByText(/1 command block · 1 tab/)).toBeTruthy();
    expect(screen.getByText(/1 prompts · 1 replies/)).toBeTruthy();
  });

  it('chat memory and terminal-agent memory are separate sections', () => {
    render(<MemoryTab />);
    const chat = screen.getByText('Chat memory').closest('section');
    const terminal = screen.getByText('Terminal-agent memory').closest('section');
    expect(chat).not.toBe(terminal);
    // The chat section never mentions command history, and the
    // terminal section never mentions chats.
    expect(chat?.textContent).not.toContain('command history');
    expect(terminal?.textContent).not.toContain('chats');
  });

  it('the tick stream shows both rings with their capacities', () => {
    render(<MemoryTab />);
    const tick = screen.getByTestId('memory-ring-tick');
    const event = screen.getByTestId('memory-ring-event');
    expect(tick.textContent).toContain('AI chat ticks');
    expect(tick.textContent).toContain('in flight 0/256');
    expect(event.textContent).toContain('Event log');
    expect(event.textContent).toContain('in flight 0/512');
    expect(tick.textContent).toContain('accepted 0 · drained 0 · refused 0');
  });

  it('the tick stream measures live rates from the counters', async () => {
    vi.useFakeTimers();
    render(<MemoryTab />);
    // 3 ticks issued, then one 500 ms sample: 3 / 0.5s = 6.0/s.
    issueAiChatTick('chat-1', 'm1', 1);
    issueAiChatTick('chat-1', 'm2', 2);
    issueAiChatTick('chat-1', 'm3', 3);
    useEventLogStore
      .getState()
      .log(createEvent({ phase: 'throughout', type: 'file.directory-read', what: 'one' }));
    useEventLogStore
      .getState()
      .log(createEvent({ phase: 'throughout', type: 'file.directory-read', what: 'two' }));
    // Both drains run on a microtask — flush them so the latest
    // items are visible before the next sample.
    await Promise.resolve();
    // The interval's setStats must flush through React — the
    // timer advance alone leaves the render stale.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    const tick = screen.getByTestId('memory-ring-tick');
    const event = screen.getByTestId('memory-ring-event');
    expect(tick.textContent).toContain('6.0/s in');
    expect(tick.textContent).toContain('latest: tick 3 · chat chat-1');
    expect(event.textContent).toContain('4.0/s in');
    expect(event.textContent).toContain('latest: two');
  });

  it('Download memory exports the profile (Blob, Settings export pattern)', () => {
    const createObjectURL = vi.fn(() => 'blob:fake');
    window.URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    window.URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<MemoryTab />);
    fireEvent.click(screen.getByTestId('memory-download'));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect((createObjectURL.mock.calls[0][0] as Blob).type).toBe('application/json');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
  });

  it('Clear command history empties the store (behind confirm)', () => {
    render(<MemoryTab />);
    fireEvent.click(screen.getByTestId('memory-clear-commands'));
    expect(useCommandHistoryStore.getState().entries).toEqual([]);
    expect(screen.getByText('0 commands')).toBeTruthy();
  });

  it('Clear plans empties the store (behind confirm)', () => {
    render(<MemoryTab />);
    fireEvent.click(screen.getByTestId('memory-clear-plans'));
    expect(usePlanStore.getState().plans).toEqual([]);
    expect(screen.getByText(/0 plans · 0\/0 steps done/)).toBeTruthy();
  });

  it('Clear terminal feed drops the feed blocks, and nothing else', () => {
    render(<MemoryTab />);
    fireEvent.click(screen.getByTestId('memory-clear-feed'));
    // clearBlocks empties each tab's list (the key stays, with
    // an empty array — the per-tab clear's own behavior).
    expect(useHistoryStore.getState().blocksByTab).toEqual({ 'terminal-1': [] });
    expect(screen.getByText(/0 command blocks · 0 tabs/)).toBeTruthy();
    // The stores the feed clear must not touch are untouched.
    expect(useCommandHistoryStore.getState().entries).toHaveLength(2);
    expect(usePlanStore.getState().plans).toHaveLength(1);
    expect(useAIStore.getState().sessions).toHaveLength(1);
  });

  it('Clear LLMBuilder memory drops agent blocks and keeps command blocks', () => {
    render(<MemoryTab />);
    fireEvent.click(screen.getByTestId('memory-clear-agent'));
    const blocks = useHistoryStore.getState().blocksByTab['terminal-1'] ?? [];
    expect(blocks.map((b) => b.id)).toEqual(['b1']);
    expect(screen.getByText(/0 prompts · 0 replies/)).toBeTruthy();
    expect(useCommandHistoryStore.getState().entries).toHaveLength(2);
  });

  it('Clear chats calls the store clear (which drives the IPC)', async () => {
    render(<MemoryTab />);
    fireEvent.click(screen.getByTestId('memory-clear-chats'));
    await waitFor(() => {
      expect(mockClearSessions).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByText(/0 chats · 0 messages/)).toBeTruthy();
    });
  });

  it('guest: the empty state only — no owner data, no download, no clears', () => {
    useProfileStore.setState({ profiles: [GUEST], activeProfileId: 'guest-1' });
    render(<MemoryTab />);
    expect(screen.getByText('No memory in guest')).toBeTruthy();
    expect(screen.queryByTestId('memory-download')).toBeNull();
    expect(screen.queryByTestId('memory-clear-commands')).toBeNull();
    expect(screen.queryByTestId('memory-clear-chats')).toBeNull();
    expect(screen.queryByTestId('memory-clear-agent')).toBeNull();
    // The owner's data is in the stores and the tab still shows
    // none of it.
    expect(screen.queryByText(/1 chat/)).toBeNull();
    expect(screen.queryByText('2 commands')).toBeNull();
    // The tick stream is telemetry, not memory — it still shows.
    expect(screen.getByText('Tick stream — live')).toBeTruthy();
    expect(screen.getByTestId('memory-ring-tick')).toBeTruthy();
  });

  it('sits under the AI tab in Settings', () => {
    render(<SettingsPanel onClose={() => undefined} initialTab="memory" />);
    expect(screen.getByTestId('memory-tab')).toBeTruthy();
    const tabs = Array.from(document.querySelectorAll('[data-settings-tab]')).map((el) =>
      el.getAttribute('data-settings-tab'),
    );
    expect(tabs.indexOf('memory')).toBe(tabs.indexOf('ai') + 1);
  });
});
