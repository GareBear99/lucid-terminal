// @vitest-environment jsdom
/**
 * History panel toggle tests (Gary, 2026-11-13).
 *
 * The toolbar button under the Terminal icon opens the History panel —
 * its hover tooltip used to say "Chats" and clicking it only ever
 * opened the panel, never closed it. Now:
 * - The button is the History button: tooltip "History", aria-label
 *   "History", the lucide History glyph, id 'history'.
 * - A second click MINIMIZES the panel to its w-12 tick rail —
 *   ChevronRight at the top ("Show conversation history", click to
 *   expand back), the chats as ticks down the rail (newest first),
 *   the chat count at the bottom. The panel is never unmounted by
 *   the icon (Gary, 2026-11-13: minimize, not delete). Same for the
 *   Explorer button (its rail has no ticks — files aren't chats).
 * - The collapse state lives in the Sidebar, so the toolbar icon
 *   can set it AND it survives panel switches. The panel's own
 *   chevron ("Collapse sidebar") drives the same state.
 * - The panel docks in the flex row beside the icon bar, never as a
 *   hover overlay.
 * - History order is stable across renders: the list used to call
 *   filteredItems.reverse() in place, which flipped the order on
 *   every render (ConversationHistory.tsx:235).
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Sidebar from '../src/components/Layout/Sidebar';
import { ConversationHistory } from '../src/components/Sidebar/ConversationHistory';
import { useSettingsStore } from '../src/stores/settingsStore';
import type { TerminalBlock } from '../src/types';

describe('History panel toggle (Gary, 2026-11-13)', () => {
  const mockSet = vi.fn(async (_key: string, _value: unknown) => undefined);
  let prevLucidAPI: unknown;

  beforeEach(() => {
    const win = window as unknown as Record<string, unknown>;
    prevLucidAPI = win.lucidAPI;
    win.lucidAPI = {
      settings: {
        set: mockSet,
        getAll: vi.fn(async () => ({})),
        hasApiKey: vi.fn(async () => false),
        hasPingKey: vi.fn(async () => false),
        getStorageStatus: vi.fn(async () => ({ degraded: false, reason: null })),
      },
    };
    mockSet.mockClear();
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: {
        ...base,
        toolbarPlugins: { synth: true, 'ai-chat': true, llmbuilder: true, mouse: true },
        luciferAiEnabled: true,
        toolbarOrder: [],
      },
    });
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
  });

  function renderSidebar() {
    return render(
      <Sidebar
        width={250}
        onWidthChange={vi.fn()}
        currentView="terminal"
        onViewChange={vi.fn()}
        showAI={false}
        onToggleAI={vi.fn()}
        onOpenBloodDrop={vi.fn()}
        onToggleForge={vi.fn()}
      />,
    );
  }

  function historyButton(): HTMLElement {
    const slot = document.querySelector('[data-toolbar-icon="history"]') as HTMLElement;
    expect(slot).not.toBeNull();
    return slot.querySelector('button') as HTMLElement;
  }

  function explorerButton(): HTMLElement {
    const slot = document.querySelector('[data-toolbar-icon="explorer"]') as HTMLElement;
    expect(slot).not.toBeNull();
    return slot.querySelector('button') as HTMLElement;
  }

  test('the History button is named History (not Chats) and has the history id', () => {
    renderSidebar();
    // The old 'chats' slot is gone entirely.
    expect(document.querySelector('[data-toolbar-icon="chats"]')).toBeNull();
    const button = historyButton();
    expect(button.getAttribute('aria-label')).toBe('History');
  });

  test('History panel opens by default; a second click MINIMIZES it to the tick rail; a third reopens it', () => {
    renderSidebar();
    // Default: the History panel is open (its header shows).
    expect(screen.getByText('History')).toBeTruthy();
    fireEvent.click(historyButton());
    // Minimized: the expanded header is gone, but the panel is NOT
    // unmounted — the w-12 tick rail is there (chevron to expand
    // back). No chats in this guest render, so the rail is just the
    // chevron — ticks and the count appear once there are chats.
    expect(screen.queryByText('History')).toBeNull();
    expect(screen.getByLabelText('Show conversation history')).toBeTruthy();
    fireEvent.click(historyButton());
    expect(screen.getByText('History')).toBeTruthy();
  });

  test('Explorer button toggles the same way: open, second click minimizes to its rail', () => {
    renderSidebar();
    fireEvent.click(explorerButton());
    expect(screen.getByText('Explorer')).toBeTruthy();
    expect(screen.queryByText('History')).toBeNull();
    fireEvent.click(explorerButton());
    // Minimized: the expanded Explorer header is gone, the rail is
    // there instead.
    expect(screen.queryByText('Explorer')).toBeNull();
    expect(screen.getByLabelText('Show explorer')).toBeTruthy();
    fireEvent.click(explorerButton());
    expect(screen.getByText('Explorer')).toBeTruthy();
  });

  test('the rail ChevronRight expands the panel back', () => {
    renderSidebar();
    fireEvent.click(historyButton());
    expect(screen.getByLabelText('Show conversation history')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Show conversation history'));
    expect(screen.getByText('History')).toBeTruthy();
  });

  test('collapse survives a panel switch: minimize History, switch away, switch back — still minimized', () => {
    renderSidebar();
    fireEvent.click(historyButton());
    expect(screen.getByLabelText('Show conversation history')).toBeTruthy();
    fireEvent.click(explorerButton());
    expect(screen.getByText('Explorer')).toBeTruthy();
    fireEvent.click(historyButton());
    // Back on History — still the rail, not the expanded panel.
    expect(screen.queryByText('History')).toBeNull();
    expect(screen.getByLabelText('Show conversation history')).toBeTruthy();
  });

  test('switching panels with the buttons: History -> Explorer -> History', () => {
    renderSidebar();
    fireEvent.click(explorerButton());
    expect(screen.getByText('Explorer')).toBeTruthy();
    fireEvent.click(historyButton());
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.queryByText('Explorer')).toBeNull();
  });

  test('Cmd+B toggles the active panel between expanded and minimized', () => {
    renderSidebar();
    expect(screen.getByText('History')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'b', metaKey: true });
    expect(screen.queryByText('History')).toBeNull();
    expect(screen.getByLabelText('Show conversation history')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'b', metaKey: true });
    expect(screen.getByText('History')).toBeTruthy();
  });
});

describe('History list order is stable across renders', () => {
  const blocks: TerminalBlock[] = [
    { id: 'b1', command: 'ls', output: 'a', timestamp: 1000, isComplete: true },
    { id: 'b2', command: 'pwd', output: 'b', timestamp: 2000, isComplete: true },
  ];

  function renderedCommands(container: HTMLElement): string[] {
    // The command text is the font-mono semibold span in each row.
    return Array.from(
      container.querySelectorAll('span.font-mono.font-semibold'),
    ).map((el) => (el.textContent ?? '').trim());
  }

  test('newest first, and the same order after a re-render', () => {
    const { container, rerender } = render(
      <ConversationHistory blocks={blocks} onJumpToBlock={vi.fn()} width={320} />,
    );
    // Newest first.
    expect(renderedCommands(container)).toEqual(['pwd', 'ls']);
    // A re-render must NOT flip the order (the old in-place
    // reverse() flipped it on every render).
    rerender(<ConversationHistory blocks={blocks} onJumpToBlock={vi.fn()} width={320} />);
    expect(renderedCommands(container)).toEqual(['pwd', 'ls']);
    rerender(<ConversationHistory blocks={blocks} onJumpToBlock={vi.fn()} width={320} />);
    expect(renderedCommands(container)).toEqual(['pwd', 'ls']);
  });
});
