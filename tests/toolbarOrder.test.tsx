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

  test('a stored order is respected as-is', () => {
    const stored = ['settings', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'synth', 'help', 'ai-chat', 'llmbuilder', 'persona-plex'];
    expect(resolveToolbarOrder(stored, AVAILABLE)).toEqual(stored);
  });

  test('an available icon missing from the stored order is inserted before Settings', () => {
    const stored = ['terminal', 'editor', 'explorer', 'chats', 'spacer', 'synth', 'settings'];
    // 'help', 'ai-chat', 'llmbuilder' and 'persona-plex' are available but not stored.
    expect(resolveToolbarOrder(stored, AVAILABLE)).toEqual([
      'terminal', 'editor', 'explorer', 'chats', 'spacer', 'synth', 'help', 'ai-chat', 'llmbuilder', 'persona-plex', 'settings',
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
      'synth', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'help', 'ai-chat', 'llmbuilder', 'persona-plex', 'settings',
    ]);
  });

  test('move after a target (drop on the spacer)', () => {
    expect(moveToolbarIcon(order, 'terminal', 'spacer', true)).toEqual([
      'editor', 'explorer', 'chats', 'spacer', 'terminal', 'synth', 'help', 'ai-chat', 'llmbuilder', 'persona-plex', 'settings',
    ]);
  });

  test('move after a target (pointer in its lower half) — dragging DOWN one slot swaps', () => {
    // Forge is immediately before Settings. Dragging Forge DOWN onto
    // Settings with insertAfter lands after it — they swap. Without
    // insertAfter that drop was a silent no-op (insert-before the
    // next icon is the order you already have), which reads as "the
    // icons don't move".
    expect(moveToolbarIcon(order, 'llmbuilder', 'settings', true)).toEqual([
      'terminal', 'editor', 'explorer', 'chats', 'spacer', 'synth', 'help', 'ai-chat', 'persona-plex', 'settings', 'llmbuilder',
    ]);
  });

  test('move to the very end (end zone, null target)', () => {
    expect(moveToolbarIcon(order, 'terminal', null, true)).toEqual([
      'editor', 'explorer', 'chats', 'spacer', 'synth', 'help', 'ai-chat', 'llmbuilder', 'persona-plex', 'settings', 'terminal',
    ]);
  });

  test('move across the spacer', () => {
    expect(moveToolbarIcon(order, 'settings', 'editor', false)).toEqual([
      'terminal', 'settings', 'editor', 'explorer', 'chats', 'spacer', 'synth', 'help', 'ai-chat', 'llmbuilder', 'persona-plex',
    ]);
  });

  test('no-ops: self-drop, the spacer, an unknown id; an unknown target appends', () => {
    expect(moveToolbarIcon(order, 'synth', 'synth', false)).toEqual(order);
    expect(moveToolbarIcon(order, 'spacer', 'terminal', false)).toEqual(order);
    expect(moveToolbarIcon(order, 'nope', 'terminal', false)).toEqual(order);
    expect(moveToolbarIcon(order, 'terminal', 'nope', false)).toEqual([
      'editor', 'explorer', 'chats', 'spacer', 'synth', 'help', 'ai-chat', 'llmbuilder', 'persona-plex', 'settings', 'terminal',
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
    const stored = ['synth', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'help', 'ai-chat', 'llmbuilder', 'persona-plex', 'settings'];
    // Resolving the stored order (as a reload would) returns it unchanged.
    expect(resolveToolbarOrder(stored, AVAILABLE)).toEqual(stored);
    // And after a move, the moved order also reloads unchanged.
    const moved = moveToolbarIcon(stored, 'settings', 'terminal', false);
    expect(resolveToolbarOrder(moved, AVAILABLE)).toEqual(moved);
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
      'synth', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'help', 'ai-chat', 'llmbuilder', 'settings',
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
      'synth', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'help', 'ai-chat', 'llmbuilder', 'settings',
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
        'synth', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'help', 'ai-chat', 'llmbuilder', 'settings',
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
      'synth', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'help', 'ai-chat', 'llmbuilder', 'settings',
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
      'terminal', 'editor', 'explorer', 'chats', 'spacer', 'synth', 'help', 'ai-chat', 'settings', 'llmbuilder',
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
      'synth', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'help', 'ai-chat', 'llmbuilder', 'settings',
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
    expect(document.querySelector('[data-toolbar-icon="ai-chat"]')).toBeNull();
    expect(document.querySelector(`path[fill="${BLOOD_COLOR}"]`)).toBeNull();
    // Forge stays (a different plugin).
    expect(document.querySelector('[data-toolbar-icon="llmbuilder"]')).not.toBeNull();
  });
});
