/**
 * CDP Tier 2 mouse moves (Phase B): the live agent mouse is a real
 * `Input.dispatchMouseEvent` `mouseMoved` event, and
 * `moveMouseToElement` moves it to an element's centre so a trusted
 * click visibly travels there first.
 *
 * Same fake-debugger harness as tests/browserCdp.test.ts — no
 * Electron needed.
 *
 * Run with: npm test
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createBrowserCdpManager,
  type CdpWebContents,
} from '../electron/services/browserCdp';

const makeDebugger = () => {
  const commands: Array<{
    method: string;
    params?: Record<string, unknown>;
  }> = [];
  let attached = false;
  const dbg = {
    commands,
    attached: () => attached,
    attach: async () => {
      attached = true;
    },
    detach: async () => {
      attached = false;
    },
    sendCommand: async (
      method: string,
      params?: Record<string, unknown>,
    ) => {
      commands.push({ method, params });
      return {};
    },
    isAttached: () => attached,
    on: (
      _event: string,
      _listener: (
        event: unknown,
        method: string,
        params: Record<string, unknown>,
      ) => void,
    ) => {},
  };
  return dbg;
};

const makeWc = (center: { x: number; y: number } | null = { x: 100, y: 50 }) => {
  const dbg = makeDebugger();
  const wc = {
    debugger: dbg,
    executeJavaScript: vi.fn(async (_script: string) => center),
  } as unknown as CdpWebContents & {
    executeJavaScript: ReturnType<typeof vi.fn>;
  };
  return { wc, dbg };
};

async function attachedManager(center?: { x: number; y: number } | null) {
  const manager = createBrowserCdpManager();
  const { wc, dbg } = makeWc(center);
  const attached = await manager.attach('tab-1', wc);
  expect(attached.ok).toBe(true);
  return { manager, wc, dbg };
}

describe('CDP mouseMoved', () => {
  it('dispatches a real mouseMoved event at the given point', async () => {
    const { manager, dbg } = await attachedManager();
    const moved = await manager.moveMouse('tab-1', 120, 80);
    expect(moved).toEqual({ ok: true });
    const mouse = dbg.commands.filter(
      (c) => c.method === 'Input.dispatchMouseEvent',
    );
    expect(mouse).toEqual([
      {
        method: 'Input.dispatchMouseEvent',
        params: { type: 'mouseMoved', x: 120, y: 80, button: 'none' },
      },
    ]);
  });

  it('refuses to move the mouse on a tab with no session', async () => {
    const manager = createBrowserCdpManager();
    const moved = await manager.moveMouse('no-such-tab', 10, 10);
    expect(moved).toEqual({ ok: false, error: 'not-attached' });
  });

  it('moves to an element centre and returns the point', async () => {
    const { manager, dbg } = await attachedManager({ x: 200, y: 90 });
    const moved = await manager.moveMouseToElement('tab-1', '#buy-now');
    expect(moved).toEqual({ ok: true, x: 200, y: 90 });
    const mouse = dbg.commands.filter(
      (c) => c.method === 'Input.dispatchMouseEvent',
    );
    expect(mouse).toHaveLength(1);
    expect(mouse[0].params).toEqual({
      type: 'mouseMoved',
      x: 200,
      y: 90,
      button: 'none',
    });
  });

  it('moveMouseToElement reports not-found when the element is missing', async () => {
    const { manager } = await attachedManager(null);
    expect(await manager.moveMouseToElement('tab-1', '#missing')).toEqual({
      ok: false,
      error: 'not-found',
    });
  });

  it('moveMouseToElement refuses a bad selector', async () => {
    const { manager } = await attachedManager();
    const moved = await manager.moveMouseToElement('tab-1', '');
    expect(moved.ok).toBe(false);
    expect(moved.error).toBe('bad-selector');
  });
});
