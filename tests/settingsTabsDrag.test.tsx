// @vitest-environment jsdom
/**
 * Settings tab drag-reorder + lock tests (Gary, 2026-11-06).
 *
 * Covers:
 * - The tabs render in the stored order (or the default order when
 *   nothing is stored), and a stored order survives a reload.
 * - Click-HOLD to drag: the drop only commits once the tab has
 *   been held for the hold threshold — a press-drag-drop inside the
 *   hold window stores nothing, while a drop after holding reorders
 *   and stores the new order immediately (updated AND stored). A drag
 *   that starts before the hold is done still reorders, as long as
 *   the drop happens after the hold (the hold is enforced at the
 *   drop, not dragstart — cancelling dragstart for a short press
 *   killed the drag for the whole press). The drop is midpoint-aware:
 *   dragging DOWN one slot onto the next tab swaps them instead of
 *   silently doing nothing.
 * - A plain click still switches to the tab (no reorder).
 * - The lock toggle: unlocked by default; locking pins the order
 *   (tabs stop being draggable and a drag stores nothing); unlocking
 *   lets you drag again. The order is persisted whenever it changes,
 *   locked or not.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import SettingsPanel from '../src/components/Settings/SettingsPanel';
import { useSettingsStore } from '../src/stores/settingsStore';
import { DEFAULT_SETTINGS_TAB_ORDER } from '../src/lib/settingsTabOrder';

const DEFAULT_IDS = [...DEFAULT_SETTINGS_TAB_ORDER];

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

describe('Settings tabs drag-reorder + lock', () => {
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
        settingsTabOrder: [],
        settingsTabsLocked: false,
      },
    });
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
  });

  function renderSettings() {
    return render(<SettingsPanel onClose={() => undefined} />);
  }

  function tabOrderInDom(): string[] {
    return Array.from(document.querySelectorAll('[data-settings-tab]')).map((el) =>
      el.getAttribute('data-settings-tab') as string,
    );
  }

  function tabEl(id: string): HTMLElement {
    const el = document.querySelector(`[data-settings-tab="${id}"]`) as HTMLElement;
    expect(el).not.toBeNull();
    return el;
  }

  function lockButton(): HTMLElement {
    const el = document.querySelector('[data-settings-tabs-lock]') as HTMLElement;
    expect(el).not.toBeNull();
    return el;
  }

  test('tabs render in the default order when nothing is stored', () => {
    renderSettings();
    expect(tabOrderInDom()).toEqual(DEFAULT_IDS);
  });

  test('a stored order renders in that order (what a reload reads)', () => {
    const base = useSettingsStore.getState().settings;
    const stored = ['general', 'appearance', 'customization', 'plugins', 'devices', 'forge', 'modules', 'models', 'terminal', 'ai', 'daemon'];
    useSettingsStore.setState({ settings: { ...base, settingsTabOrder: stored } });
    renderSettings();
    expect(tabOrderInDom()).toEqual(stored);
  });

  test('dragging General onto Appearance after holding stores the new order (updated AND stored)', async () => {
    const baseMs = 1_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(baseMs);
    try {
      renderSettings();
      const general = tabEl('general');
      const appearance = tabEl('appearance');
      fireEvent.mouseDown(general);
      // Hold 600ms (past the 500ms threshold), then drag.
      nowSpy.mockReturnValue(baseMs + 600);
      fireEvent.dragStart(general);
      nowSpy.mockRestore();
      fireEvent.dragOver(appearance);
      fireEvent.drop(appearance);
      const expected = [
        'general', 'appearance', 'customization', 'plugins', 'devices', 'forge', 'modules', 'models', 'terminal', 'ai', 'daemon',
      ];
      await waitFor(() => {
        expect(mockSet).toHaveBeenCalledWith('settingsTabOrder', expected);
      });
      // And the store holds the new order (what a reload reads).
      expect(useSettingsStore.getState().settings.settingsTabOrder).toEqual(expected);
    } finally {
      nowSpy.mockRestore();
    }
  });

  test('a press-drag-drop inside the hold window stores nothing (drop-gate)', () => {
    renderSettings();
    const general = tabEl('general');
    const appearance = tabEl('appearance');
    // Press, drag and drop immediately (no hold): the drop happens
    // inside the hold window, so the drop-gate ignores it and stores
    // nothing. (The old dragstart-cancel gate did the same job by
    // killing the drag; the gate now lives at the drop, so a drag
    // that starts before the hold can still commit if the drop
    // happens after it — see the next test.)
    fireEvent.mouseDown(general);
    fireEvent.dragStart(general);
    fireEvent.dragOver(appearance);
    fireEvent.drop(appearance);
    expect(mockSet).not.toHaveBeenCalled();
    expect(useSettingsStore.getState().settings.settingsTabOrder).toEqual([]);
  });

  test('a drag that starts before the hold but drops after it still reorders', async () => {
    const baseMs = 1_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(baseMs);
    try {
      renderSettings();
      const general = tabEl('general');
      const appearance = tabEl('appearance');
      fireEvent.mouseDown(general);
      // Drag immediately (no hold yet) — the old dragstart-cancel
      // gate killed this drag for the whole press, so a normal
      // press-and-drag never reordered at all.
      fireEvent.dragStart(general);
      fireEvent.dragOver(appearance);
      // The drop line is dimmed until the hold completes.
      expect(appearance.querySelector('[class*="opacity-40"]')).not.toBeNull();
      // Hold out the 500ms, then drop: the reorder commits.
      nowSpy.mockReturnValue(baseMs + 600);
      fireEvent.drop(appearance);
      const expected = [
        'general', 'appearance', 'customization', 'plugins', 'devices', 'forge', 'modules', 'models', 'terminal', 'ai', 'daemon',
      ];
      await waitFor(() => {
        expect(mockSet).toHaveBeenCalledWith('settingsTabOrder', expected);
      });
      expect(useSettingsStore.getState().settings.settingsTabOrder).toEqual(expected);
    } finally {
      nowSpy.mockRestore();
    }
  });

  test('dragging a tab DOWN one slot onto the next tab swaps them (midpoint-aware drop)', async () => {
    const baseMs = 1_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(baseMs);
    try {
      renderSettings();
      const appearance = tabEl('appearance');
      const customization = tabEl('customization');
      // Give the target real geometry (jsdom rects are all zeros):
      // a 40px-tall tab, pointer at clientY 30 — in its lower half,
      // so the drop lands AFTER it.
      const rect = {
        top: 0, left: 0, right: 100, bottom: 40, width: 100, height: 40,
        x: 0, y: 0, toJSON: () => ({}),
      } as DOMRect;
      const origRect = customization.getBoundingClientRect.bind(customization);
      customization.getBoundingClientRect = () => rect;
      try {
        fireEvent.mouseDown(appearance);
        nowSpy.mockReturnValue(baseMs + 600);
        fireEvent.dragStart(appearance);
        nowSpy.mockRestore();
        // jsdom has no DragEvent, so fireEvent.dragOver/drop lose
        // clientY. Dispatch a MouseEvent carrying the same type
        // instead — React only keys on the event type, and the
        // handlers read clientY + the target rect from it.
        dispatchPointerDragEvent(customization, 'dragover', 30);
        dispatchPointerDragEvent(customization, 'drop', 30);
      } finally {
        customization.getBoundingClientRect = origRect;
      }
      // Appearance and customization swap (was a silent no-op:
      // insert-before the next tab is the order you already have).
      const expected = [
        'customization', 'appearance', 'plugins', 'devices', 'forge', 'modules', 'models', 'terminal', 'ai', 'daemon', 'general',
      ];
      await waitFor(() => {
        expect(mockSet).toHaveBeenCalledWith('settingsTabOrder', expected);
      });
      expect(useSettingsStore.getState().settings.settingsTabOrder).toEqual(expected);
    } finally {
      nowSpy.mockRestore();
    }
  });

  test('dropping a tab on the end zone moves it last', async () => {
    renderSettings();
    const appearance = tabEl('appearance');
    const endZone = document.querySelector('[data-settings-tab-end-zone]') as HTMLElement;
    expect(endZone).not.toBeNull();
    fireEvent.dragStart(appearance);
    fireEvent.dragOver(endZone);
    fireEvent.drop(endZone);
    const expected = [
      'customization', 'plugins', 'devices', 'forge', 'modules', 'models', 'terminal', 'ai', 'daemon', 'general', 'appearance',
    ];
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('settingsTabOrder', expected);
    });
    expect(useSettingsStore.getState().settings.settingsTabOrder).toEqual(expected);
  });

  test('a plain click still switches to the tab (no reorder)', () => {
    renderSettings();
    expect(document.body.textContent).not.toContain('Core plugins');
    const pluginsButton = tabEl('plugins').querySelector('button') as HTMLElement;
    fireEvent.click(pluginsButton);
    expect(document.body.textContent).toContain('Core plugins');
    expect(mockSet).not.toHaveBeenCalledWith('settingsTabOrder', expect.anything());
    expect(useSettingsStore.getState().settings.settingsTabOrder).toEqual([]);
  });

  test('the lock toggle starts unlocked, locks the order, and unlocks it again', async () => {
    renderSettings();
    const button = lockButton();
    expect(button.getAttribute('data-settings-tabs-lock')).toBe('unlocked');
    expect(button.getAttribute('aria-label')).toBe('Lock Settings tab order');
    // Tabs are draggable while unlocked.
    expect(tabEl('general').getAttribute('draggable')).toBe('true');

    // Lock it: the setting is stored (updated AND stored).
    fireEvent.click(button);
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('settingsTabsLocked', true);
    });
    expect(useSettingsStore.getState().settings.settingsTabsLocked).toBe(true);
    expect(lockButton().getAttribute('data-settings-tabs-lock')).toBe('locked');
    expect(lockButton().getAttribute('aria-label')).toBe('Unlock Settings tab order');
    // Tabs stop being draggable while locked.
    expect(tabEl('general').getAttribute('draggable')).toBe('false');

    // Unlock it again.
    fireEvent.click(lockButton());
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('settingsTabsLocked', false);
    });
    expect(useSettingsStore.getState().settings.settingsTabsLocked).toBe(false);
    expect(tabEl('general').getAttribute('draggable')).toBe('true');
  });

  test('while locked, a drag stores nothing — the order stays pinned', async () => {
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({ settings: { ...base, settingsTabsLocked: true } });
    renderSettings();
    expect(tabEl('general').getAttribute('draggable')).toBe('false');
    const general = tabEl('general');
    const appearance = tabEl('appearance');
    fireEvent.mouseDown(general);
    fireEvent.dragStart(general);
    fireEvent.dragOver(appearance);
    fireEvent.drop(appearance);
    expect(mockSet.mock.calls.filter((c) => c[0] === 'settingsTabOrder')).toEqual([]);
    expect(useSettingsStore.getState().settings.settingsTabOrder).toEqual([]);
    expect(tabOrderInDom()).toEqual(DEFAULT_IDS);
  });
});
