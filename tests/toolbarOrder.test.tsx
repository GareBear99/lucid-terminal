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
 *   the Synth button (Orbit) and the blood drop button both
 *   show while LuciferAI is enabled, and are gone entirely while it
 *   is disabled (Forge stays).
 * - No hold gate (the 500ms press-and-hold gate was REMOVED
 *   2026-11-07): a completed drop on a different slot always
 *   commits — the gate silently rejected every natural quick drag
 *   (a real drag takes ~200-400ms), so the icons "didn't move"
 *   (Gary, 2026-11-07, real mouse). REGRESSION: a quick
 *   press-drag-drop with no hold at all commits and stores.
 * - Drag & drop is pointer events, NOT native HTML5 DnD (Gary,
 *   2026-11-13): every slot is `draggable={false}` at rest; a drag
 *   starts only from pointer movement past an 8px threshold. A
 *   real-mouse press that moves a pixel or two used to start a
 *   native drag and the browser swallowed the click, so the History
 *   button only worked on a perfectly still press (agent synthetic
 *   clicks, zero movement, always worked). The drag-probe in
 *   ~/workspace/drag-probe/ proved native DnD cannot both let a
 *   ~5px press click and let slow drags reorder. A plain click —
 *   and a press that moves a few pixels — still activates the icon
 *   (the press tests below); a press never produces a drop on
 *   another slot. Only a deliberate drag reorders, and the click
 *   after a drag release is swallowed. There is no DataTransfer
 *   anywhere in this path any more — the dragged id lives in a
 *   ref, not the event.
 * - The blood drop is LOCKED to the top spot (Gary,
 *   2026-11-07): it always resolves first, can never be moved, no
 *   icon can be inserted before it, and a press on it never starts
 *   a drag (its click still opens the blood drop terminal). When it
 *   becomes available again it re-inserts at the top. (No slot is
 *   natively draggable at rest any more — see the pointer-events
 *   note above — but the blood drop is the only one that can never
 *   start a drag at all.)
 * - The end zone always reserves its height (Gary, 2026-11-07):
 *   it is always h-6, never h-0 when idle. Growing it on drag
 *   start shrank the flex spacer and shifted every icon below the
 *   spacer up 24px mid-drag, so the drop targets went stale — the
 *   top icons worked, the bottom plugin icons didn't (Gary's real
 *   mouse, 2026-11-07). REGRESSION: the end zone is h-6 before
 *   and during a drag.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  resolveToolbarOrder,
  moveToolbarIcon,
  DEFAULT_TOOLBAR_ORDER,
} from '../src/lib/toolbarOrder';
import { BLOOD_COLOR } from '../src/components/Synth/blood';
import Sidebar from '../src/components/Layout/Sidebar';
import { useSettingsStore } from '../src/stores/settingsStore';

const AVAILABLE = [
  'terminal', 'editor', 'explorer', 'history',
  'synth', 'help', 'ai-chat', 'llmbuilder', 'mouse', 'persona-plex', 'settings',
];

describe('resolveToolbarOrder', () => {
  test('no stored order -> the default order', () => {
    expect(resolveToolbarOrder([], AVAILABLE)).toEqual(DEFAULT_TOOLBAR_ORDER);
    expect(resolveToolbarOrder(null, AVAILABLE)).toEqual(DEFAULT_TOOLBAR_ORDER);
    expect(resolveToolbarOrder(undefined, AVAILABLE)).toEqual(DEFAULT_TOOLBAR_ORDER);
  });

  test('a stored order is respected as-is — except the blood drop, which is pinned to the top', () => {
    const stored = ['settings', 'terminal', 'editor', 'explorer', 'history', 'spacer', 'synth', 'help', 'ai-chat', 'llmbuilder', 'persona-plex'];
    // Every entry keeps its relative order, but 'help' (the blood
    // drop, locked to the top spot) moves from index 7 to index 0.
    // 'mouse' is available but not stored, so it is inserted before
    // Settings, landing right after the pinned blood drop.
    expect(resolveToolbarOrder(stored, AVAILABLE)).toEqual([
      'help', 'mouse', 'settings', 'terminal', 'editor', 'explorer', 'history', 'spacer', 'synth', 'ai-chat', 'llmbuilder', 'persona-plex',
    ]);
  });

  test('the blood drop always resolves first (locked to the top spot, Gary 2026-11-07)', () => {
    // Help buried in the middle of a stored order comes to the front.
    const stored = ['terminal', 'editor', 'explorer', 'history', 'spacer', 'synth', 'help', 'ai-chat', 'llmbuilder', 'persona-plex', 'settings'];
    expect(resolveToolbarOrder(stored, AVAILABLE)).toEqual([
      'help', 'terminal', 'editor', 'explorer', 'history', 'spacer', 'synth', 'ai-chat', 'llmbuilder', 'persona-plex', 'mouse', 'settings',
    ]);
    // Help at the very end of a stored order also comes to the front.
    const storedEnd = ['terminal', 'editor', 'explorer', 'history', 'spacer', 'synth', 'ai-chat', 'llmbuilder', 'persona-plex', 'settings', 'help'];
    expect(resolveToolbarOrder(storedEnd, AVAILABLE)).toEqual([
      'help', 'terminal', 'editor', 'explorer', 'history', 'spacer', 'synth', 'ai-chat', 'llmbuilder', 'persona-plex', 'mouse', 'settings',
    ]);
  });

  test('the blood drop re-inserts at the top when it becomes available again', () => {
    // Stored while LuciferAI was off (no Help in the stored order);
    // now available again — it re-inserts at the top, not before
    // Settings where a newly-available icon would otherwise land.
    const stored = ['terminal', 'editor', 'explorer', 'history', 'spacer', 'synth', 'settings'];
    expect(resolveToolbarOrder(stored, AVAILABLE)).toEqual([
      'help', 'terminal', 'editor', 'explorer', 'history', 'spacer', 'synth', 'ai-chat', 'llmbuilder', 'mouse', 'persona-plex', 'settings',
    ]);
  });

  test('an available icon missing from the stored order is inserted before Settings', () => {
    const stored = ['terminal', 'editor', 'explorer', 'history', 'spacer', 'synth', 'settings'];
    // 'help', 'ai-chat', 'llmbuilder', 'mouse' and 'persona-plex' are available but not stored.
    // They are inserted before Settings — then the blood drop is
    // pinned to the top spot, so it ends up first.
    expect(resolveToolbarOrder(stored, AVAILABLE)).toEqual([
      'help', 'terminal', 'editor', 'explorer', 'history', 'spacer', 'synth', 'ai-chat', 'llmbuilder', 'mouse', 'persona-plex', 'settings',
    ]);
  });

  test('stale/unknown ids are dropped and duplicates keep the first', () => {
    const stored = ['terminal', 'terminal', 'nope', 'editor', 'explorer', 'history', 'spacer', 'synth', 'help', 'ai-chat', 'llmbuilder', 'settings'];
    expect(resolveToolbarOrder(stored, AVAILABLE)).toEqual(DEFAULT_TOOLBAR_ORDER);
  });

  test("legacy 'chats' id maps to 'history' in its stored position", () => {
    // The History button's id was 'chats' until the 2026-11-13 rename
    // (Gary: the button should say History). A stored order from
    // before then still carries 'chats' — it resolves to 'history'
    // in the same slot instead of dropping out and re-appearing
    // before Settings.
    const stored = ['help', 'terminal', 'editor', 'explorer', 'chats', 'spacer', 'synth', 'settings'];
    expect(resolveToolbarOrder(stored, AVAILABLE)).toEqual([
      'help', 'terminal', 'editor', 'explorer', 'history', 'spacer', 'synth', 'ai-chat', 'llmbuilder', 'mouse', 'persona-plex', 'settings',
    ]);
  });

  test('unavailable icons are excluded from the render order', () => {
    // Only the core icons + Settings are available (no plugins).
    const available = ['terminal', 'editor', 'explorer', 'history', 'settings'];
    expect(resolveToolbarOrder([], available)).toEqual([
      'terminal', 'editor', 'explorer', 'history', 'spacer', 'settings',
    ]);
  });

  test('a stored order without the spacer gets it back before the first plugin', () => {
    const stored = ['terminal', 'editor', 'explorer', 'history', 'synth', 'help', 'ai-chat', 'llmbuilder', 'settings'];
    expect(resolveToolbarOrder(stored, AVAILABLE)).toEqual(DEFAULT_TOOLBAR_ORDER);
  });
});

describe('moveToolbarIcon', () => {
  const order = [...DEFAULT_TOOLBAR_ORDER];

  test('move before a target', () => {
    expect(moveToolbarIcon(order, 'synth', 'terminal', false)).toEqual([
      'help', 'synth', 'terminal', 'editor', 'explorer', 'history', 'spacer', 'ai-chat', 'llmbuilder', 'mouse', 'persona-plex', 'settings',
    ]);
  });

  test('move after a target (drop on the spacer)', () => {
    expect(moveToolbarIcon(order, 'terminal', 'spacer', true)).toEqual([
      'help', 'editor', 'explorer', 'history', 'spacer', 'terminal', 'synth', 'ai-chat', 'llmbuilder', 'mouse', 'persona-plex', 'settings',
    ]);
  });

  test('move after a target (pointer in its lower half) — dragging DOWN one slot swaps', () => {
    // Dragging Forge DOWN onto Settings with insertAfter lands after
    // it — they swap. Without insertAfter that drop was a silent
    // no-op (insert-before the next icon is the order you already
    // have), which reads as "the icons don't move". (Forge is no
    // longer immediately before Settings — Mouse and Persona Plex sit
    // between — but the drop still lands after Settings.)
    expect(moveToolbarIcon(order, 'llmbuilder', 'settings', true)).toEqual([
      'help', 'terminal', 'editor', 'explorer', 'history', 'spacer', 'synth', 'ai-chat', 'mouse', 'persona-plex', 'settings', 'llmbuilder',
    ]);
  });

  test('move to the very end (end zone, null target)', () => {
    expect(moveToolbarIcon(order, 'terminal', null, true)).toEqual([
      'help', 'editor', 'explorer', 'history', 'spacer', 'synth', 'ai-chat', 'llmbuilder', 'mouse', 'persona-plex', 'settings', 'terminal',
    ]);
  });

  test('move across the spacer', () => {
    expect(moveToolbarIcon(order, 'settings', 'editor', false)).toEqual([
      'help', 'terminal', 'settings', 'editor', 'explorer', 'history', 'spacer', 'synth', 'ai-chat', 'llmbuilder', 'mouse', 'persona-plex',
    ]);
  });

  test('no-ops: self-drop, the spacer, an unknown id; an unknown target appends', () => {
    expect(moveToolbarIcon(order, 'synth', 'synth', false)).toEqual(order);
    expect(moveToolbarIcon(order, 'spacer', 'terminal', false)).toEqual(order);
    expect(moveToolbarIcon(order, 'nope', 'terminal', false)).toEqual(order);
    expect(moveToolbarIcon(order, 'terminal', 'nope', false)).toEqual([
      'help', 'editor', 'explorer', 'history', 'spacer', 'synth', 'ai-chat', 'llmbuilder', 'mouse', 'persona-plex', 'settings', 'terminal',
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
      'help', 'synth', 'terminal', 'editor', 'explorer', 'history', 'spacer', 'ai-chat', 'llmbuilder', 'mouse', 'persona-plex', 'settings',
    ]);
    // Dropping Terminal onto Help (insert before) also lands after it.
    expect(moveToolbarIcon(order, 'terminal', 'help', false)).toEqual([
      'help', 'terminal', 'editor', 'explorer', 'history', 'spacer', 'synth', 'ai-chat', 'llmbuilder', 'mouse', 'persona-plex', 'settings',
    ]);
    // Dropping onto Help with insertAfter lands after it too.
    expect(moveToolbarIcon(order, 'synth', 'help', true)).toEqual([
      'help', 'synth', 'terminal', 'editor', 'explorer', 'history', 'spacer', 'ai-chat', 'llmbuilder', 'mouse', 'persona-plex', 'settings',
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
    const stored = ['help', 'synth', 'terminal', 'editor', 'explorer', 'history', 'spacer', 'ai-chat', 'llmbuilder', 'persona-plex', 'mouse', 'settings'];
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
    const stored = ['synth', 'terminal', 'editor', 'explorer', 'history', 'spacer', 'help', 'ai-chat', 'llmbuilder', 'persona-plex', 'mouse', 'settings'];
    expect(resolveToolbarOrder(stored, AVAILABLE)).toEqual([
      'help', 'synth', 'terminal', 'editor', 'explorer', 'history', 'spacer', 'ai-chat', 'llmbuilder', 'persona-plex', 'mouse', 'settings',
    ]);
  });
});

describe('Sidebar toolbar drag (stored on drop)', () => {
  const mockSet = vi.fn(async (_key: string, _value: unknown) => undefined);
  let prevLucidAPI: unknown;

  /**
   * Give a slot real geometry (jsdom rects are all zeros): a
   * 40px-tall slot. Returns a restore function. The midpoint logic
   * reads the target rect, so a hover at clientY 10 is its upper
   * half (insert before) and clientY 30 its lower half (insert
   * after).
   */
  function mockSlotRect(el: HTMLElement) {
    const rect = {
      top: 0, left: 0, right: 100, bottom: 40, width: 100, height: 40,
      x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect;
    const origRect = el.getBoundingClientRect.bind(el);
    el.getBoundingClientRect = () => rect;
    return () => { el.getBoundingClientRect = origRect; };
  }

  /**
   * A deliberate drag: press on `from`, move 20px (past the 8px
   * threshold), hover `to` at clientY (upper half by default — insert
   * before), release. The target rect is mocked for the hover so the
   * midpoint logic has real geometry.
   */
  function dragIconTo(from: HTMLElement, to: HTMLElement, clientY = 10) {
    const restore = mockSlotRect(to);
    try {
      fireEvent.pointerDown(from, { button: 0, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(window, { clientX: 0, clientY: 20 });
      fireEvent.pointerOver(to, { clientY });
      fireEvent.pointerUp(window, { clientX: 0, clientY: 20 });
    } finally {
      restore();
    }
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
    // (Mouse is enabled here explicitly: it defaults OFF — Gary,
    // 2026-11-12 ~12:37 PST — and these drag tests exercise the
    // full toolbar, not the default.)
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: {
        ...base,
        toolbarPlugins: { synth: true, 'ai-chat': true, llmbuilder: true, mouse: true },
        luciferAiEnabled: true,
        toolbarOrder: [],
        // The Persona Plex test installs the add-on; reset it here
        // so it doesn't leak into later tests' resolved order.
        installedAddons: [],
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

  test('dragging Synth onto Terminal stores the new order (updated AND stored)', async () => {
    renderSidebar();
    const synth = document.querySelector('[data-toolbar-icon="synth"]') as HTMLElement;
    const terminal = document.querySelector('[data-toolbar-icon="terminal"]') as HTMLElement;
    expect(synth).not.toBeNull();
    expect(terminal).not.toBeNull();
    // A deliberate drag onto Terminal's upper half — insert before it.
    dragIconTo(synth, terminal, 10);
    const expected = [
      'help', 'synth', 'terminal', 'editor', 'explorer', 'history', 'spacer', 'ai-chat', 'llmbuilder', 'mouse', 'settings',
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
    dragIconTo(synth, terminal, 10);
    const expected = [
      'help', 'synth', 'terminal', 'editor', 'explorer', 'history', 'spacer', 'ai-chat', 'llmbuilder', 'mouse', 'settings',
    ];
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('toolbarOrder', expected);
    });
    expect(useSettingsStore.getState().settings.toolbarOrder).toEqual(expected);
  });

  test('a drag that starts with a small nudge still commits — the nudge is not a drag', async () => {
    renderSidebar();
    const synth = document.querySelector('[data-toolbar-icon="synth"]') as HTMLElement;
    const terminal = document.querySelector('[data-toolbar-icon="terminal"]') as HTMLElement;
    const restore = mockSlotRect(terminal);
    try {
      fireEvent.pointerDown(synth, { button: 0, clientX: 0, clientY: 0 });
      // Nudge 2px — below the 8px threshold, still a press, not a drag.
      fireEvent.pointerMove(window, { clientX: 0, clientY: 2 });
      expect(document.querySelector('.opacity-40')).toBeNull();
      // Then move past the threshold — now it is a drag.
      fireEvent.pointerMove(window, { clientX: 0, clientY: 20 });
      expect(synth.className).toContain('opacity-40');
      fireEvent.pointerOver(terminal, { clientY: 10 });
      fireEvent.pointerUp(window, { clientX: 0, clientY: 20 });
    } finally {
      restore();
    }
    const expected = [
      'help', 'synth', 'terminal', 'editor', 'explorer', 'history', 'spacer', 'ai-chat', 'llmbuilder', 'mouse', 'settings',
    ];
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('toolbarOrder', expected);
    });
    expect(useSettingsStore.getState().settings.toolbarOrder).toEqual(expected);
  });

  test('the drop indicator is solid during a drag — a drop always sticks (no dimmed hold state)', async () => {
    renderSidebar();
    const synth = document.querySelector('[data-toolbar-icon="synth"]') as HTMLElement;
    const terminal = document.querySelector('[data-toolbar-icon="terminal"]') as HTMLElement;
    expect(synth).not.toBeNull();
    expect(terminal).not.toBeNull();
    fireEvent.pointerDown(synth, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 0, clientY: 20 });
    const restore = mockSlotRect(terminal);
    try {
      fireEvent.pointerOver(terminal, { clientY: 10 });
      // The accent line renders solid — there is no dimmed "not ready
      // yet" state any more, because a drop always commits now.
      const line = terminal.querySelector('[class*="h-0.5"]') as HTMLElement | null;
      expect(line).not.toBeNull();
      expect(line?.className).not.toContain('opacity-40');
      // And the drop commits immediately.
      fireEvent.pointerUp(window, { clientX: 0, clientY: 20 });
    } finally {
      restore();
    }
    const expected = [
      'help', 'synth', 'terminal', 'editor', 'explorer', 'history', 'spacer', 'ai-chat', 'llmbuilder', 'mouse', 'settings',
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
    const restore = mockSlotRect(settings);
    try {
      // A deliberate drag onto Settings' lower half — insert after it.
      fireEvent.pointerDown(forge, { button: 0, clientX: 0, clientY: 0 });
      fireEvent.pointerMove(window, { clientX: 0, clientY: 20 });
      fireEvent.pointerOver(settings, { clientY: 30 });
      fireEvent.pointerUp(window, { clientX: 0, clientY: 20 });
    } finally {
      restore();
    }
    // Forge and Settings swap (was a silent no-op: insert-before
    // the next icon is the order you already have).
    const expected = [
      'help', 'terminal', 'editor', 'explorer', 'history', 'spacer', 'synth', 'ai-chat', 'mouse', 'settings', 'llmbuilder',
    ];
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('toolbarOrder', expected);
    });
    expect(useSettingsStore.getState().settings.toolbarOrder).toEqual(expected);
  });

  // NOTE: the old "drop reads the dragged id from a real
  // DataTransfer" test is gone with the native-DnD path — there is
  // no DataTransfer anywhere in the pointer-events reorder (the
  // dragged id lives in a ref, not the event). The drag tests above
  // exercise the commit path instead.

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

  test('the Persona Plex button STAYS while installed even when LuciferAI is disabled (Gary, 2026-11-07 ~06:22 PST)', () => {
    // Persona Plex is an ADD-ON, not a LuciferAI surface: disabling
    // the plugin used to take its icon out as if it belonged to it.
    // Install is the only condition for the icon. REGRESSION: with
    // LuciferAI off and the add-on installed, the icon is present.
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: { ...base, luciferAiEnabled: false, installedAddons: ['persona-plex'] },
    });
    renderSidebar();
    expect(document.querySelector('[data-toolbar-icon="persona-plex"]')).not.toBeNull();
    // The INTENDED couplings are preserved: Synth and Help are
    // LuciferAI surfaces, so they still go with the plugin.
    expect(document.querySelector('[data-toolbar-icon="synth"]')).toBeNull();
    expect(document.querySelector('[data-toolbar-icon="help"]')).toBeNull();
    // And AI Chat stays too — it is its own plugin.
    expect(document.querySelector('[data-toolbar-icon="ai-chat"]')).not.toBeNull();
  });

  test('the Synth button shows the Orbit icon while LuciferAI is enabled', () => {
    renderSidebar();
    const synth = document.querySelector('[data-toolbar-icon="synth"]') as HTMLElement;
    expect(synth).not.toBeNull();
    expect(synth.querySelector('svg.lucide-orbit')).not.toBeNull();
    // And it is NOT the blood drop — the drop belongs to Help now.
    expect(synth.querySelector(`path[fill="${BLOOD_COLOR}"]`)).toBeNull();
  });

  test('the Blood drop button shows the blood drop while LuciferAI is enabled', () => {
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

  test('the blood drop is locked to the top spot — first icon, and a press on it never starts a drag (Gary 2026-11-07)', () => {
    renderSidebar();
    // The first icon in the bar is the blood drop (Help).
    const icons = Array.from(document.querySelectorAll('[data-toolbar-icon]')) as HTMLElement[];
    const iconIds = icons.map((el) => el.getAttribute('data-toolbar-icon'));
    expect(iconIds[0]).toBe('help');
    // No slot is natively draggable at rest — a drag starts only
    // from pointer movement past the threshold.
    const help = document.querySelector('[data-toolbar-icon="help"]') as HTMLElement;
    expect(help.getAttribute('draggable')).toBe('false');
    const terminal = document.querySelector('[data-toolbar-icon="terminal"]') as HTMLElement;
    expect(terminal.getAttribute('draggable')).toBe('false');
    const synth = document.querySelector('[data-toolbar-icon="synth"]') as HTMLElement;
    expect(synth.getAttribute('draggable')).toBe('false');
    // But the click still works — the blood drop still opens the
    // blood drop terminal. (The button inside the slot keeps its
    // onClick; only the drag is disabled.)
    expect(help.querySelector('button')).not.toBeNull();
    // A press on Help that moves past the threshold does NOT start a
    // drag — the blood drop never moves.
    fireEvent.pointerDown(help, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 0, clientY: 20 });
    expect(document.querySelector('.opacity-40')).toBeNull();
    fireEvent.pointerUp(window, { clientX: 0, clientY: 20 });
    // The same press on Terminal DOES start one (the drag visual).
    fireEvent.pointerDown(terminal, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 0, clientY: 20 });
    expect(terminal.className).toContain('opacity-40');
    fireEvent.pointerUp(window, { clientX: 0, clientY: 20 });
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
    fireEvent.pointerDown(synth, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 0, clientY: 20 });
    expect(endZone.className).toContain('h-6');
    expect(endZone.className).not.toContain('h-0');
    fireEvent.pointerUp(window, { clientX: 0, clientY: 20 });
  });

  // A press with movement still toggles the panel (Gary, 2026-11-13).
  // The old native-DnD slots swallowed the click on any press that
  // moved past the browser's ~4px drag threshold, so the History
  // button only worked on a perfectly still press. With pointer
  // events, a press that never moves past the 8px threshold is a
  // click, whatever small movement it had.
  function historySlot() {
    return document.querySelector('[data-toolbar-icon="history"]') as HTMLElement;
  }

  test('a press that moves 2px still toggles History to its rail (no reorder)', () => {
    renderSidebar();
    expect(screen.getByText('History')).toBeTruthy();
    const history = historySlot();
    fireEvent.pointerDown(history, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 0, clientY: 2 });
    fireEvent.pointerUp(window, { clientX: 0, clientY: 2 });
    fireEvent.click(history.querySelector('button') as HTMLElement);
    // Minimized to the rail, not unmounted.
    expect(screen.queryByText('History')).toBeNull();
    expect(document.querySelector('[aria-label="Show conversation history"]')).not.toBeNull();
    // And a press never reorders.
    expect(mockSet).not.toHaveBeenCalled();
  });

  test('a press that moves 5px still toggles History to its rail (the Gary regression)', () => {
    // 5px is past the browser's native drag threshold (~4px) — the
    // old code started a native drag here and swallowed the click.
    // With pointer events the 8px threshold has not been crossed,
    // so the click fires.
    renderSidebar();
    expect(screen.getByText('History')).toBeTruthy();
    const history = historySlot();
    fireEvent.pointerDown(history, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 0, clientY: 5 });
    fireEvent.pointerUp(window, { clientX: 0, clientY: 5 });
    fireEvent.click(history.querySelector('button') as HTMLElement);
    expect(screen.queryByText('History')).toBeNull();
    expect(document.querySelector('[aria-label="Show conversation history"]')).not.toBeNull();
    expect(mockSet).not.toHaveBeenCalled();
  });

  test('a press that moves past the threshold starts a drag — the click after release is swallowed, the reorder commits', async () => {
    const onViewChange = vi.fn();
    render(
      <Sidebar
        width={250}
        onWidthChange={vi.fn()}
        currentView="terminal"
        onViewChange={onViewChange}
        showAI={false}
        onToggleAI={vi.fn()}
        onOpenBloodDrop={vi.fn()}
        onToggleForge={vi.fn()}
      />,
    );
    const synth = document.querySelector('[data-toolbar-icon="synth"]') as HTMLElement;
    const terminal = document.querySelector('[data-toolbar-icon="terminal"]') as HTMLElement;
    dragIconTo(synth, terminal, 10);
    const expected = [
      'help', 'synth', 'terminal', 'editor', 'explorer', 'history', 'spacer', 'ai-chat', 'llmbuilder', 'mouse', 'settings',
    ];
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('toolbarOrder', expected);
    });
    // The click that follows the drag release is swallowed — the
    // Synth view does not open. (Re-query after the reorder: the
    // store update re-rendered the rail.)
    const synthButton = document.querySelector('[data-toolbar-icon="synth"] button') as HTMLElement;
    fireEvent.click(synthButton);
    expect(onViewChange).not.toHaveBeenCalled();
  });

  // Editor second-click falls back to Terminal (Gary, 2026-11-13):
  // when you click OFF a toolbar tab icon and there is nowhere to
  // go, it defaults to the Terminal page. (Synth/Forge/Settings/
  // Persona Plex already had this fallback in their toggle fns —
  // see synthToggle/settingsToggle/forgePersonaPlexToggle tests.)
  function renderSidebarAt(view: 'terminal' | 'editor', onViewChange: (v: string) => void) {
    return render(
      <Sidebar
        width={250}
        onWidthChange={vi.fn()}
        currentView={view}
        onViewChange={onViewChange}
        showAI={false}
        onToggleAI={vi.fn()}
        onOpenBloodDrop={vi.fn()}
        onToggleForge={vi.fn()}
      />,
    );
  }

  test('Editor second click deactivates and lands on the Terminal page', () => {
    const onViewChange = vi.fn();
    renderSidebarAt('editor', onViewChange);
    const editor = document.querySelector('[data-toolbar-icon="editor"] button') as HTMLElement;
    fireEvent.click(editor);
    expect(onViewChange).toHaveBeenCalledWith('terminal');
  });

  test('Editor click from Terminal opens the Editor', () => {
    const onViewChange = vi.fn();
    renderSidebarAt('terminal', onViewChange);
    const editor = document.querySelector('[data-toolbar-icon="editor"] button') as HTMLElement;
    fireEvent.click(editor);
    expect(onViewChange).toHaveBeenCalledWith('editor');
  });

  test('Terminal click while already there stays on Terminal', () => {
    const onViewChange = vi.fn();
    renderSidebarAt('terminal', onViewChange);
    const terminal = document.querySelector('[data-toolbar-icon="terminal"] button') as HTMLElement;
    fireEvent.click(terminal);
    expect(onViewChange).toHaveBeenCalledWith('terminal');
  });
});

describe('Sidebar toolbar blood drop opens the blood drop terminal (Gary, 2026-11-07 ~09:18 PST)', () => {
  /**
   * Both blood drops go to the same creation place: the toolbar
   * blood drop opens the blood drop terminal, the same as the create
   * blood drop — NOT the Help modal. (The toolbar drop opened Help
   * until 2026-11-07 ~09:18 PST; Gary: "both blood drops go to the
   * same creation place now.") Help stays reachable via the StatusBar
   * button, the terminal `help` command, and Cmd+/ — none of those
   * go through the Sidebar, so they are untouched here. Clicking the
   * toolbar drop calls onOpenBloodDrop. The Sidebar takes no
   * onOpenHelp prop at all anymore, so there is no Help path left
   * in the toolbar to regress.
   */
  const mockSet = vi.fn(async (_key: string, _value: unknown) => undefined);
  let prevLucidAPI: unknown;
  const onOpenBloodDrop = vi.fn();

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
    onOpenBloodDrop.mockClear();
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

  it('clicking the toolbar blood drop opens the blood drop terminal (not Help)', () => {
    render(
      <Sidebar
        width={250}
        onWidthChange={vi.fn()}
        currentView="terminal"
        onViewChange={vi.fn()}
        showAI={false}
        onToggleAI={vi.fn()}
        onOpenBloodDrop={onOpenBloodDrop}
        onToggleForge={vi.fn()}
      />,
    );
    const drop = screen.getByRole('button', { name: 'Blood drop' });
    expect(drop).toBeTruthy();
    // The blood drop icon itself: a droplet svg in the button.
    expect(drop.querySelector('svg')).not.toBeNull();
    fireEvent.click(drop);
    expect(onOpenBloodDrop).toHaveBeenCalledTimes(1);
  });
});
