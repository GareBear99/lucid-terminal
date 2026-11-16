/**
 * Docks — store + location registry tests.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  useDockStore,
  DOCK_MIN_SIZE,
  DOCK_DEFAULT_SIZE,
  DOCK_MAX_SIZE,
  clampDockSize,
} from '../src/stores/dockStore';
import { isDockLocationAllowed, allowedDockLocations } from '../src/lib/dockLocations';

describe('dockStore', () => {
  beforeEach(() => {
    useDockStore.getState().resetForTests();
  });

  it('starts with all three docks hidden', () => {
    const { docks } = useDockStore.getState();
    expect(docks.left.visible).toBe(false);
    expect(docks.right.visible).toBe(false);
    expect(docks.bottom.visible).toBe(false);
  });

  it('the right dock keeps the AI panel\'s 500px default width', () => {
    expect(useDockStore.getState().docks.right.size).toBe(500);
    expect(useDockStore.getState().docks.left.size).toBe(DOCK_DEFAULT_SIZE);
    expect(useDockStore.getState().docks.bottom.size).toBe(DOCK_DEFAULT_SIZE);
  });

  it('showDock / hideDock / toggleDock flip one edge only', () => {
    const api = useDockStore.getState();
    api.showDock('right');
    expect(useDockStore.getState().docks.right.visible).toBe(true);
    expect(useDockStore.getState().docks.left.visible).toBe(false);
    api.toggleDock('right');
    expect(useDockStore.getState().docks.right.visible).toBe(false);
    api.toggleDock('bottom');
    expect(useDockStore.getState().docks.bottom.visible).toBe(true);
    api.hideDock('bottom');
    expect(useDockStore.getState().docks.bottom.visible).toBe(false);
  });

  it('setDockSize clamps to [100, 1200]', () => {
    const api = useDockStore.getState();
    api.setDockSize('right', 50);
    expect(useDockStore.getState().docks.right.size).toBe(DOCK_MIN_SIZE);
    api.setDockSize('right', 5000);
    expect(useDockStore.getState().docks.right.size).toBe(DOCK_MAX_SIZE);
    api.setDockSize('right', 640);
    expect(useDockStore.getState().docks.right.size).toBe(640);
  });

  it('clampDockSize falls back to the default for non-finite sizes', () => {
    expect(clampDockSize(Number.NaN)).toBe(DOCK_DEFAULT_SIZE);
    expect(clampDockSize(Number.POSITIVE_INFINITY)).toBe(DOCK_MAX_SIZE);
  });

  it('resetForTests restores the initial states', () => {
    const api = useDockStore.getState();
    api.showDock('right');
    api.setDockSize('right', 800);
    api.resetForTests();
    expect(useDockStore.getState().docks.right).toEqual({ visible: false, size: 500 });
  });
});

describe('dockLocations — the allowed-locations gate', () => {
  it('the AI panel may only sit on the right', () => {
    expect(allowedDockLocations('ai-panel')).toEqual(['right']);
    expect(isDockLocationAllowed('ai-panel', 'right')).toBe(true);
    expect(isDockLocationAllowed('ai-panel', 'left')).toBe(false);
    expect(isDockLocationAllowed('ai-panel', 'bottom')).toBe(false);
  });

  it('the sidebar may only sit on the left', () => {
    expect(allowedDockLocations('sidebar')).toEqual(['left']);
    expect(isDockLocationAllowed('sidebar', 'left')).toBe(true);
    expect(isDockLocationAllowed('sidebar', 'right')).toBe(false);
  });

  it('the terminal and the editor are center-only — never dock items', () => {
    expect(allowedDockLocations('terminal')).toEqual([]);
    expect(allowedDockLocations('editor')).toEqual([]);
    for (const edge of ['left', 'right', 'bottom'] as const) {
      expect(isDockLocationAllowed('terminal', edge)).toBe(false);
      expect(isDockLocationAllowed('editor', edge)).toBe(false);
    }
  });
});
