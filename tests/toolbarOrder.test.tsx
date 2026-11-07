// @vitest-environment jsdom
/**
 * Toolbar icon order tests (Gary, 2026-11-06).
 *
 * Covers:
 * - resolveToolbarOrder: the default order, a stored order respected,
 *   a missing available icon appended, stale ids dropped, duplicates
 *   deduped, the spacer ensured, unavailable icons excluded.
 * - moveToolbarIcon: move before/after a target, to the very end,
 *   across the spacer, and the no-ops (self-drop, the spacer, an
 *   unknown id; an unknown target appends instead of losing the icon).
 * - Persistence round-trip: a stored order reloads to the same order.
 * - The Sidebar drag: dropping an icon STORES the new order
 *   immediately (updated AND stored) — window.lucidAPI.settings.set
 *   is called with the new toolbarOrder and the store holds it — and
 *   the Synth button (Orbit) and the Help button (blood drop) both
 *   show while LuciferAI is enabled, and are gone entirely while it
 *   is disabled (Forge stays).
 * - No hold gate (the 500ms press-and-hold gate was REMOVED
 *   2026-11-07): a completed drop on a different slot always
 *   commits — the gate silently rejected every natural quick drag
 *   (a real drag takes ~200-400ms), so the icons "didn't move"
 *   (Gary, 2026-11-07, real mouse). REGRESSION: a quick
 *   press-drag-drop with no hold at all commits and stores. A plain
 *   click still activates the icon (covered by the blood-drop Help
 *   tests) — it can never produce a drop on another slot.
 * - The blood drop (Help) is LOCKED to the top spot (Gary,
 *   2026-11-07): it always resolves first, can never be moved, no
 *   icon can be inserted before it, and its slot is not draggable
 *   (its click still opens Help). When it becomes available again
 *   it re-inserts at the top.
 * - The end zone always reserves its height (Gary, 2026-11-07):
 *   it is always h-6, never h-0 when idle. Growing it on drag
 *   start shrank the flex spacer and shifted every icon below the
 *   spacer up 24px mid-drag, so the drop targets went stale — the
 *   top icons worked, the bottom plugin icons didn't (Gary's real
 *   mouse, 2026-11-07). REGRESSION: the end zone is h-6 before
 *   and during a drag.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import {
  resolveToolbarOrder,
  moveToolbarIcon,
  DEFAULT_TOOLBAR_ORDER,
} from '../src/lib/toolbarOrder';
import { BLOOD_COLOR } from '../src/components/Synth/blood';
import Sidebar from '../src/components/Layout/Sidebar';
import { useSettingsStore } from '../src/stores/settingsStore';

const AVAILABLE = [
  'terminal', 'editor', 'explorer', 'chats',
  'synth', 'help', 'ai-chat', 'llmbuilder', 'persona-plex', 'settings',
];

describe('resolveToolbarOrder', () => {
  test('no stored order -> the default order', () => {
    expect(resolveToolbarOrder([], AVAILABLE)).toEqual(DEFAULT_TOOLBAR_ORDER);
    expect(resolveToolbarOrder(null, AVAILABLE)).toEqual(DEFAULT_TOOLBAR_ORDER);
    expect(resolveToolbarOrder(undefined, AVAILABLE)).toEqual(DEFAULT_TOOLBAR_ORDER);
  });

  test('a stored order is respected as-is — except the blood drop, which is pinned to the top', () => {
    const stored = ['settings', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'synth', 'help', 'ai-chat', 'llmbuilder', 'persona-plex'];
    // Every entry keeps its relative order, but 'help' (the blood
    // drop, locked to the top spot) moves from index 7 to index 0.
    expect(resolveToolbarOrder(stored, AVAILABLE)).toEqual([
      'help', 'settings', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'synth', 'ai-chat', 'llmbuilder', 'persona-plex',
    ]);
  });

  test('the blood drop always resolves first (locked to the top spot, Gary 2026-11-07)', () => {
    // Help buried in the middle of a stored order comes to the front.
    const stored = ['terminal', 'editor', 'explorer', 'chats', 'spacer', 'synth', 'help', 'ai-chat', 'llmbuilder', 'persona-plex', 'settings'];
    expect(resolveToolbarOrder(stored, AVAILABLE)).toEqual([
      'help', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'synth', 'ai-chat', 'llmbuilder', 'persona-plex', 'settings',
    ]);
    // Help at the very end of a stored order also comes to the front.
    const storedEnd = ['terminal', 'editor', 'explorer', 'chats', 'spacer', 'synth', 'ai-chat', 'llmbuilder', 'persona-plex', 'settings', 'help'];
    expect(resolveToolbarOrder(storedEnd, AVAILABLE)).toEqual([
      'help', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'synth', 'ai-chat', 'llmbuilder', 'persona-plex', 'settings',
    ]);
  });

  test('the blood drop re-inserts at the top when it becomes available again', () => {
    // Stored while LuciferAI was off (no Help in the stored order);
    // now available again — it re-inserts at the top, not before
    // Settings where a newly-available icon would otherwise land.
    const stored = ['terminal', 'editor', 'explorer', 'chats', 'spacer', 'synth', 'settings'];
    expect(resolveToolbarOrder(stored, AVAILABLE)).toEqual([
      'help', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'synth', 'ai-chat', 'llmbuilder', 'persona-plex', 'settings',
    ]);
  });

  test('an available icon missing from the stored order is inserted before Settings', () => {
    const stored = ['terminal', 'editor', 'explorer', 'chats', 'spacer', 'synth', 'settings'];
    // 'help', 'ai-chat', 'llmbuilder' and 'persona-plex' are available but not stored.
    // They are inserted before Settings — then the blood drop is
    // pinned to the top spot, so it ends up first.
    expect(resolveToolbarOrder(stored, AVAILABLE)).toEqual([
      'help', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'synth', 'ai-chat', 'llmbuilder', 'persona-plex', 'settings',
    ]);
  });

  test('stale/unknown ids are dropped and duplicates keep the first', () => {
    const stored = ['terminal', 'terminal', 'nope', 'editor', 'explorer', 'chats', 'spacer', 'synth', 'help', 'ai-chat', 'llmbuilder', 'settings'];
    expect(resolveToolbarOrder(stored, AVAILABLE)).toEqual(DEFAULT_TOOLBAR_ORDER);
  });

  test('unavailable icons are excluded from the render order', () => {
    // Only the core icons + Settings are available (no plugins).
    const available = ['terminal', 'editor', 'explorer', 'chats', 'settings'];
    expect(resolveToolbarOrder([], available)).toEqual([
      'terminal', 'editor', 'explorer', 'chats', 'spacer', 'settings',
    ]);
  });

  test('a stored order without the spacer gets it back before the first plugin', () => {
    const stored = ['terminal', 'editor', 'explorer', 'chats', 'synth', 'help', 'ai-chat', 'llmbuilder', 'settings'];
    expect(resolveToolbarOrder(stored, AVAILABLE)).toEqual(DEFAULT_TOOLBAR_ORDER);
  });
});

describe('moveToolbarIcon', () => {
  const order = [...DEFAULT_TOOLBAR_ORDER];

  test('move before a target', () => {
    expect(moveToolbarIcon(order, 'synth', 'terminal', false)).toEqual([
      'help', 'synth', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'ai-chat', 'llmbuilder', 'persona-plex', 'settings',
    ]);
  });

  test('move after a target (drop on the spacer)', () => {
    expect(moveToolbarIcon(order, 'terminal', 'spacer', true)).toEqual([
      'help', 'editor', 'explorer', 'chats', 'spacer', 'terminal', 'synth', 'ai-chat', 'llmbuilder', 'persona-plex', 'settings',
    ]);
  });

  test('move after a target (pointer in its lower half) — dragging DOWN one slot swaps', () => {
    // Forge is immediately before Settings. Dragging Forge DOWN onto
    // Settings with insertAfter lands after it — they swap. Without
    // insertAfter that drop was a silent no-op (insert-before the
    // next icon is the order you already have), which reads as "the
    // icons don't move".
    expect(moveToolbarIcon(order, 'llmbuilder', 'settings', true)).toEqual([
      'help', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'synth', 'ai-chat', 'persona-plex', 'settings', 'llmbuilder',
    ]);
  });

  test('move to the very end (end zone, null target)', () => {
    expect(moveToolbarIcon(order, 'terminal', null, true)).toEqual([
      'help', 'editor', 'explorer', 'chats', 'spacer', 'synth', 'ai-chat', 'llmbuilder', 'persona-plex', 'settings', 'terminal',
    ]);
  });

  test('move across the spacer', () => {
    expect(moveToolbarIcon(order, 'settings', 'editor', false)).toEqual([
      'help', 'terminal', 'settings', 'editor', 'explorer', 'chats', 'spacer', 'synth', 'ai-chat', 'llmbuilder', 'persona-plex',
    ]);
  });

  test('no-ops: self-drop, the spacer, an unknown id; an unknown target appends', () => {
    expect(moveToolbarIcon(order, 'synth', 'synth', false)).toEqual(order);
    expect(moveToolbarIcon(order, 'spacer', 'terminal', false)).toEqual(order);
    expect(moveToolbarIcon(order, 'nope', 'terminal', false)).toEqual(order);
    expect(moveToolbarIcon(order, 'terminal', 'nope', false)).toEqual([
      'help', 'editor', 'explorer', 'chats', 'spacer', 'synth', 'ai-chat', 'llmbuilder', 'persona-plex', 'settings', 'terminal',
    ]);
  });

  test('the blood drop can never be moved (locked to the top spot, Gary 2026-11-07)', () => {
    // Dragging Help onto another icon, onto the end zone, or onto
    // Settings all return the order unchanged.
    expect(moveToolbarIcon(order, 'help', 'terminal', false)).toEqual(order);
    expect(moveToolbarIcon(order, 'help', 'settings', true)).toEqual(order);
    expect(moveToolbarIcon(order, 'help', null, true)).toEqual(order);
    expect(moveToolbarIcon(order, 'help', 'spacer', true)).toEqual(order);
  });

  test('no icon can be inserted before the blood drop (it stays at index 0)', () => {
    // Dropping Synth onto Help (insert before) lands it right AFTER
    // Help instead — at index 1, never index 0.
    expect(moveToolbarIcon(order, 'synth', 'help', false)).toEqual([
      'help', 'synth', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'ai-chat', 'llmbuilder', 'persona-plex', 'settings',
    ]);
    // Dropping Terminal onto Help (insert before) also lands after it.
    expect(moveToolbarIcon(order, 'terminal', 'help', false)).toEqual([
      'help', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'synth', 'ai-chat', 'llmbuilder', 'persona-plex', 'settings',
    ]);
    // Dropping onto Help with insertAfter lands after it too.
    expect(moveToolbarIcon(order, 'synth', 'help', true)).toEqual([
      'help', 'synth', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'ai-chat', 'llmbuilder', 'persona-plex', 'settings',
    ]);
  });

  test('does not mutate the input', () => {
    const before = [...order];
    moveToolbarIcon(order, 'synth', 'terminal', false);
    expect(order).toEqual(before);
  });
});

describe('persistence round-trip', () => {
  test('a stored order reloads to the same order', () => {
    // Help is first (locked to the top spot), so the stored order
    // reloads unchanged.
    const stored = ['help', 'synth', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'ai-chat', 'llmbuilder', 'persona-plex', 'settings'];
    // Resolving the stored order (as a reload would) returns it unchanged.
    expect(resolveToolbarOrder(stored, AVAILABLE)).toEqual(stored);
    // And after a move, the moved order also reloads unchanged.
    const moved = moveToolbarIcon(stored, 'settings', 'terminal', false);
    expect(resolveToolbarOrder(moved, AVAILABLE)).toEqual(moved);
  });

  test('a stored order with Help elsewhere reloads with Help at the top', () => {
    // A stored order saved before the lock (Help in the middle)
    // reloads with Help moved to the top — the lock, not the
    // stored position, wins.
    const stored = ['synth', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'help', 'ai-chat', 'llmbuilder', 'persona-plex', 'settings'];
    expect(resolveToolbarOrder(stored, AVAILABLE)).toEqual([
      'help', 'synth', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'ai-chat', 'llmbuilder', 'persona-plex', 'settings',
    ]);
  });
});

describe('Sidebar toolbar drag (stored on drop)', () => {
  const mockSet = vi.fn(async (_key: string, _value: unknown) => undefined);
  let prevLucidAPI: unknown;

  /**
   * Dispatch a drag event that actually carries a pointer position.
   * jsdom has no DragEvent, so fireEvent.dragOver/drop lose clientY
   * (the coordinate is silently dropped). A MouseEvent carrying the
   * same type works instead: React only keys on the event type, and
   * the handlers read clientY + the target rect from the native event.
   */
  function dispatchPointerDragEvent(el: HTMLElement, type: 'dragover' | 'drop', clientY: number) {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientY }));
  }

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
    // All plugin buttons on, LuciferAI enabled, default order.
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: {
        ...base,
        toolbarPlugins: { synth: true, 'ai-chat': true, llmbuilder: true },
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
        onOpenHelp={vi.fn()}
        onToggleForge={vi.fn()}
      />,
    );
  }

  test('dragging Synth onto Terminal stores the new order (updated AND stored)', async () => {
    renderSidebar();
    const synth = document.querySelector('[data-toolbar-icon="synth"]') as HTMLElement;
    const terminal = document.querySelector('[data-toolbar-icon="terminal"]') as HTMLElement;
    expect(synth).not.toBeNull();
    expect(terminal).not.toBeNull();
    fireEvent.dragStart(synth);
    fireEvent.dragOver(terminal);
    fireEvent.drop(terminal);
    const expected = [
      'help', 'synth', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'ai-chat', 'llmbuilder', 'settings',
    ];
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('toolbarOrder', expected);
    });
    // And the store holds the new order (what a reload reads).
    expect(useSettingsStore.getState().settings.toolbarOrder).toEqual(expected);
  });

  test('REGRESSION (Gary, 2026-11-07): a quick press-drag-drop with no hold commits — the reorder is stored', async () => {
    renderSidebar();
    const synth = document.querySelector('[data-toolbar-icon="synth"]') as HTMLElement;
    const terminal = document.querySelector('[data-toolbar-icon="terminal"]') as HTMLElement;
    expect(synth).not.toBeNull();
    expect(terminal).not.toBeNull();
    // Press, drag and drop immediately (no hold) — the natural
    // gesture, ~200-400ms total. The old 500ms hold gate silently
    // rejected this and stored nothing, so the icons "didn't move"
    // with a real mouse. A completed drop on a different slot must
    // commit. This test FAILS on the old code (mockSet never called)
    // and PASSES after the fix.
    fireEvent.mouseDown(synth);
    fireEvent.dragStart(synth);
    fireEvent.dragOver(terminal);
    fireEvent.drop(terminal);
    const expected = [
      'help', 'synth', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'ai-chat', 'llmbuilder', 'settings',
    ];
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('toolbarOrder', expected);
    });
    expect(useSettingsStore.getState().settings.toolbarOrder).toEqual(expected);
  });

  test('a drag after holding still commits — holding is no longer required but harmless', async () => {
    const base = 1_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(base);
    try {
      renderSidebar();
      const synth = document.querySelector('[data-toolbar-icon="synth"]') as HTMLElement;
      const terminal = document.querySelector('[data-toolbar-icon="terminal"]') as HTMLElement;
      fireEvent.mouseDown(synth);
      // Hold 600ms, then drag — holding is no longer required, but
      // a held drag must still commit.
      nowSpy.mockReturnValue(base + 600);
      fireEvent.dragStart(synth);
      nowSpy.mockRestore();
      fireEvent.dragOver(terminal);
      fireEvent.drop(terminal);
      const expected = [
        'help', 'synth', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'ai-chat', 'llmbuilder', 'settings',
      ];
      await waitFor(() => {
        expect(mockSet).toHaveBeenCalledWith('toolbarOrder', expected);
      });
      expect(useSettingsStore.getState().settings.toolbarOrder).toEqual(expected);
    } finally {
      nowSpy.mockRestore();
    }
  });

  test('the drop indicator is solid during a drag — a drop always sticks (no dimmed hold state)', async () => {
    renderSidebar();
    const synth = document.querySelector('[data-toolbar-icon="synth"]') as HTMLElement;
    const terminal = document.querySelector('[data-toolbar-icon="terminal"]') as HTMLElement;
    expect(synth).not.toBeNull();
    expect(terminal).not.toBeNull();
    fireEvent.mouseDown(synth);
    fireEvent.dragStart(synth);
    fireEvent.dragOver(terminal);
    // The accent line renders solid — there is no dimmed "not ready
    // yet" state any more, because a drop always commits now.
    const line = terminal.querySelector('[class*="h-0.5"]') as HTMLElement | null;
    expect(line).not.toBeNull();
    expect(line?.className).not.toContain('opacity-40');
    // And the drop commits immediately.
    fireEvent.drop(terminal);
    const expected = [
      'help', 'synth', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'ai-chat', 'llmbuilder', 'settings',
    ];
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('toolbarOrder', expected);
    });
    expect(useSettingsStore.getState().settings.toolbarOrder).toEqual(expected);
  });

  test('dragging an icon DOWN one slot onto the next icon swaps them (midpoint-aware drop)', async () => {
    renderSidebar();
    const forge = document.querySelector('[data-toolbar-icon="llmbuilder"]') as HTMLElement;
    const settings = document.querySelector('[data-toolbar-icon="settings"]') as HTMLElement;
    expect(forge).not.toBeNull();
    expect(settings).not.toBeNull();
    // Give the target real geometry (jsdom rects are all zeros):
    // a 40px-tall slot, pointer at clientY 30 — in its lower half,
    // so the drop lands AFTER it.
    const rect = {
      top: 0, left: 0, right: 100, bottom: 40, width: 100, height: 40,
      x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect;
    const origRect = settings.getBoundingClientRect.bind(settings);
    settings.getBoundingClientRect = () => rect;
    try {
      fireEvent.mouseDown(forge);
      fireEvent.dragStart(forge);
      // jsdom has no DragEvent, so fireEvent.dragOver/drop lose
      // clientY. Dispatch a MouseEvent carrying the same type
      // instead — React only keys on the event type, and the
      // handlers read clientY + the target rect from it.
      dispatchPointerDragEvent(settings, 'dragover', 30);
      dispatchPointerDragEvent(settings, 'drop', 30);
    } finally {
      settings.getBoundingClientRect = origRect;
    }
    // Forge and Settings swap (was a silent no-op: insert-before
    // the next icon is the order you already have).
    const expected = [
      'help', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'synth', 'ai-chat', 'settings', 'llmbuilder',
    ];
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('toolbarOrder', expected);
    });
    expect(useSettingsStore.getState().settings.toolbarOrder).toEqual(expected);
  });

  test('the drop reads the dragged id from a real DataTransfer (the production path)', async () => {
    // jsdom has no DataTransfer, so the other drag tests only
    // exercise the dragged-id state fallback. The production Electron
    // build uses dataTransfer.getData — exercise that path with a
    // mock DataTransfer, so a regression in the getData wiring is
    // caught here instead of live.
    renderSidebar();
    const synth = document.querySelector('[data-toolbar-icon="synth"]') as HTMLElement;
    const terminal = document.querySelector('[data-toolbar-icon="terminal"]') as HTMLElement;
    expect(synth).not.toBeNull();
    expect(terminal).not.toBeNull();
    const store: Record<string, string> = {};
    const dataTransfer = {
      setData: vi.fn((format: string, value: string) => { store[format] = value; }),
      getData: vi.fn((format: string) => store[format] ?? ''),
      effectAllowed: 'uninitialized' as DataTransfer['effectAllowed'],
      dropEffect: 'none' as DataTransfer['dropEffect'],
      files: [] as unknown as FileList,
      items: [] as unknown as DataTransferItemList,
      types: [] as readonly string[],
      clearData: vi.fn(),
      setDragImage: vi.fn(),
    } as unknown as DataTransfer;
    fireEvent.dragStart(synth, { dataTransfer });
    fireEvent.dragOver(terminal, { dataTransfer });
    fireEvent.drop(terminal, { dataTransfer });
    const expected = [
      'help', 'synth', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'ai-chat', 'llmbuilder', 'settings',
    ];
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('toolbarOrder', expected);
    });
    // The dragstart stored the id and the drop read it back.
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'synth');
    expect(dataTransfer.getData).toHaveBeenCalledWith('text/plain');
    expect(useSettingsStore.getState().settings.toolbarOrder).toEqual(expected);
  });

  test('the Persona Plex button appears only while Persona Plex is installed', () => {
    // Not installed in the default test settings: no icon.
    const first = renderSidebar();
    expect(document.querySelector('[data-toolbar-icon="persona-plex"]')).toBeNull();
    first.unmount();
    // Install it: the icon appears (LuciferAI is enabled).
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({ settings: { ...base, installedAddons: ['persona-plex'] } });
    renderSidebar();
    expect(document.querySelector('[data-toolbar-icon="persona-plex"]')).not.toBeNull();
  });

  test('the Synth button shows the Orbit icon while LuciferAI is enabled', () => {
    renderSidebar();
    const synth = document.querySelector('[data-toolbar-icon="synth"]') as HTMLElement;
    expect(synth).not.toBeNull();
    expect(synth.querySelector('svg.lucide-orbit')).not.toBeNull();
    // And it is NOT the blood drop — the drop belongs to Help now.
    expect(synth.querySelector(`path[fill="${BLOOD_COLOR}"]`)).toBeNull();
  });

  test('the Help button shows the blood drop while LuciferAI is enabled', () => {
    renderSidebar();
    const help = document.querySelector('[data-toolbar-icon="help"]') as HTMLElement;
    expect(help).not.toBeNull();
    const drop = help.querySelector(`path[fill="${BLOOD_COLOR}"]`);
    expect(drop).not.toBeNull();
  });

  test('while LuciferAI is disabled the Synth and Help buttons — and the blood drop — are gone', () => {
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({ settings: { ...base, luciferAiEnabled: false } });
    renderSidebar();
    expect(document.querySelector('[data-toolbar-icon="synth"]')).toBeNull();
    expect(document.querySelector('[data-toolbar-icon="help"]')).toBeNull();
    expect(document.querySelector(`path[fill="${BLOOD_COLOR}"]`)).toBeNull();
    // AI Chat stays — it is Lucid AI, its own plugin (Gary, 2026-11-07),
    // unmounted from LuciferAI; it works with the plugin on or off.
    expect(document.querySelector('[data-toolbar-icon="ai-chat"]')).not.toBeNull();
    // Forge stays (a different plugin).
    expect(document.querySelector('[data-toolbar-icon="llmbuilder"]')).not.toBeNull();
  });

  test('the blood drop is locked to the top spot — first icon, and not draggable (Gary 2026-11-07)', () => {
    renderSidebar();
    // The first icon in the bar is the blood drop (Help).
    const icons = Array.from(document.querySelectorAll('[data-toolbar-icon]')) as HTMLElement[];
    const iconIds = icons.map((el) => el.getAttribute('data-toolbar-icon'));
    expect(iconIds[0]).toBe('help');
    // Its slot is NOT draggable — the user can't even start dragging
    // it — while the other icons are.
    const help = document.querySelector('[data-toolbar-icon="help"]') as HTMLElement;
    expect(help.getAttribute('draggable')).toBe('false');
    const terminal = document.querySelector('[data-toolbar-icon="terminal"]') as HTMLElement;
    expect(terminal.getAttribute('draggable')).toBe('true');
    const synth = document.querySelector('[data-toolbar-icon="synth"]') as HTMLElement;
    expect(synth.getAttribute('draggable')).toBe('true');
    // But the click still works — the blood drop still opens Help.
    // (The button inside the slot keeps its onClick; only the drag
    // is disabled.)
    expect(help.querySelector('button')).not.toBeNull();
  });

  test('REGRESSION (Gary, 2026-11-07): the end zone always reserves its height — no layout shift on drag start', () => {
    renderSidebar();
    const endZone = document.querySelector('[data-toolbar-icon="end"]') as HTMLElement;
    expect(endZone).not.toBeNull();
    // Before any drag, the end zone is already h-6 (its height is
    // reserved), never h-0.
    expect(endZone.className).toContain('h-6');
    expect(endZone.className).not.toContain('h-0');
    // Start a drag on a bottom plugin icon (Synth). The old code grew
    // the end zone from h-0 to h-6 here, which shrank the flex spacer
    // and shifted every icon below the spacer up 24px mid-drag — the
    // drop targets went stale, so the bottom icons "didn't move"
    // while the top ones (above the spacer) worked. With the height
    // reserved, the end zone is unchanged by the drag start.
    const synth = document.querySelector('[data-toolbar-icon="synth"]') as HTMLElement;
    fireEvent.mouseDown(synth);
    fireEvent.dragStart(synth);
    expect(endZone.className).toContain('h-6');
    expect(endZone.className).not.toContain('h-0');
  });
});
