// @vitest-environment jsdom
/**
 * Menu subscription tests (menus).
 *
 * `subscribeMenuModals` is the renderer's side of the
 * `menu:open-modal` IPC channel: it subscribes to the
 * preload's `lucidAPI.menu.onOpenModal` and hands the action
 * to the caller. It must be a no-op where the bridge is
 * absent (jsdom, the web build, a detached window's mini
 * renderer) so subscribing is always safe.
 *
 * Run with: npx vitest run tests/menuModals.test.ts
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { subscribeMenuModals } from '../src/lib/menuModals';
import type { MenuActionKind } from '../src/lib/menuModals';

describe('subscribeMenuModals', () => {
  const originalLucidAPI = (window as unknown as { lucidAPI?: unknown }).lucidAPI;

  afterEach(() => {
    (window as unknown as { lucidAPI?: unknown }).lucidAPI = originalLucidAPI;
  });

  test('forwards menu actions to the callback', () => {
    let captured: ((kind: MenuActionKind) => void) | null = null;
    (window as unknown as { lucidAPI?: unknown }).lucidAPI = {
      menu: {
        onOpenModal: (cb: (kind: MenuActionKind) => void) => {
          captured = cb;
          return () => {};
        },
      },
    };
    const callback = vi.fn();
    subscribeMenuModals(callback);
    expect(captured).not.toBeNull();
    captured!('symbols');
    captured!('palette');
    expect(callback.mock.calls.map((c) => c[0])).toEqual(['symbols', 'palette']);
  });

  test('unsubscribe removes the listener', () => {
    const off = vi.fn();
    (window as unknown as { lucidAPI?: unknown }).lucidAPI = {
      menu: {
        onOpenModal: () => off,
      },
    };
    const unsubscribe = subscribeMenuModals(vi.fn());
    unsubscribe();
    expect(off).toHaveBeenCalledTimes(1);
  });

  test('no-op unsubscribe when the bridge returns none', () => {
    (window as unknown as { lucidAPI?: unknown }).lucidAPI = {
      menu: {
        onOpenModal: () => undefined,
      },
    };
    const unsubscribe = subscribeMenuModals(vi.fn());
    expect(() => unsubscribe()).not.toThrow();
  });

  test('no-op when lucidAPI.menu is absent', () => {
    (window as unknown as { lucidAPI?: unknown }).lucidAPI = {};
    const unsubscribe = subscribeMenuModals(vi.fn());
    expect(() => unsubscribe()).not.toThrow();
  });

  test('no-op when lucidAPI itself is absent', () => {
    delete (window as unknown as { lucidAPI?: unknown }).lucidAPI;
    const unsubscribe = subscribeMenuModals(vi.fn());
    expect(() => unsubscribe()).not.toThrow();
  });
});
