/**
 * CDP Tier 2 (Area 8) manager tests: the allowlist, attach/detach,
 * trusted input, key dispatch, and network/console diagnostics in
 * `electron/services/browserCdp.ts`, against a fake debugger —
 * no Electron needed.
 *
 * Run with: npm test
 */

import { describe, it, expect, vi } from 'vitest';
import {
  AGENT_CURSOR_ELEMENT_ID,
  AGENT_CURSOR_IDLE_HIDE_MS,
  buildAgentCursorHideScript,
  buildAgentCursorScript,
  CDP_ALLOWED_METHODS,
  MAX_CDP_DIAGNOSTICS,
  createBrowserCdpManager,
  isCdpMethodAllowed,
  type CdpWebContents,
} from '../electron/services/browserCdp';

const makeDebugger = () => {
  const commands: Array<{
    method: string;
    params?: Record<string, unknown>;
  }> = [];
  const listeners: Array<
    (event: unknown, method: string, params: Record<string, unknown>) => void
  > = [];
  let attached = false;
  let attachFails = false;
  const dbg = {
    commands,
    listeners,
    attached: () => attached,
    failAttach: () => {
      attachFails = true;
    },
    attach: async () => {
      if (attachFails) throw new Error('attach failed');
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
      listener: (
        event: unknown,
        method: string,
        params: Record<string, unknown>,
      ) => void,
    ) => {
      listeners.push(listener);
    },
    emit: (method: string, params: Record<string, unknown>) => {
      for (const listener of listeners) listener({}, method, params);
    },
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

describe('CDP method allowlist', () => {
  it('allows Page/Runtime/Input/Network, never Target', () => {
    for (const method of [
      'Page.enable',
      'Runtime.evaluate',
      'Input.dispatchMouseEvent',
      'Input.dispatchKeyEvent',
      'Network.enable',
    ]) {
      expect(isCdpMethodAllowed(method)).toBe(true);
    }
    for (const method of [
      'Target.createTarget',
      'Target.closeTarget',
      'Target.attachToTarget',
      'Page.captureScreenshot',
      'Browser.close',
      'Debugger.enable',
      'Emulation.setDeviceMetricsOverride',
    ]) {
      expect(isCdpMethodAllowed(method)).toBe(false);
    }
    expect(CDP_ALLOWED_METHODS).not.toContain('Target.createTarget');
  });
});

describe('attach / detach', () => {
  it('attaches, enables Network + Runtime, and is idempotent', async () => {
    const manager = createBrowserCdpManager();
    const { wc, dbg } = makeWc();
    expect(await manager.attach('tab-1', wc)).toEqual({ ok: true });
    expect(dbg.attached()).toBe(true);
    expect(
      dbg.commands.map((c) => c.method),
    ).toEqual(['Network.enable', 'Runtime.enable']);
    expect(manager.isAttached('tab-1')).toBe(true);
    const before = dbg.commands.length;
    expect(await manager.attach('tab-1', wc)).toEqual({ ok: true });
    expect(dbg.commands.length).toBe(before);
  });

  it('a failed attach reports attach-failed', async () => {
    const manager = createBrowserCdpManager();
    const { wc, dbg } = makeWc();
    dbg.failAttach();
    expect(await manager.attach('tab-1', wc)).toEqual({
      ok: false,
      error: 'attach-failed',
    });
    expect(manager.isAttached('tab-1')).toBe(false);
  });

  it('detach disables observation, detaches, and clears diagnostics', async () => {
    const manager = createBrowserCdpManager();
    const { wc, dbg } = makeWc();
    await manager.attach('tab-1', wc);
    dbg.emit('Network.responseReceived', {
      response: { url: 'https://x/500', status: 500 },
    });
    expect(manager.getDiagnostics('tab-1')?.networkFailures).toHaveLength(1);
    await manager.detach('tab-1');
    expect(manager.isAttached('tab-1')).toBe(false);
    expect(dbg.attached()).toBe(false);
    expect(manager.getDiagnostics('tab-1')).toBeNull();
    // Detaching again is a no-op, not an error.
    await manager.detach('tab-1');
  });
});

describe('sendCommand', () => {
  it('refuses disallowed methods before they reach the debugger', async () => {
    const manager = createBrowserCdpManager();
    const { wc, dbg } = makeWc();
    await manager.attach('tab-1', wc);
    expect(
      await manager.sendCommand('tab-1', 'Target.createTarget', {}),
    ).toEqual({ ok: false, error: 'not-allowed' });
    expect(dbg.commands.map((c) => c.method)).not.toContain(
      'Target.createTarget',
    );
  });

  it('reports not-attached when no session exists', async () => {
    const manager = createBrowserCdpManager();
    expect(await manager.sendCommand('tab-1', 'Page.enable')).toEqual({
      ok: false,
      error: 'not-attached',
    });
  });

  it('forwards allowed commands and returns their result', async () => {
    const manager = createBrowserCdpManager();
    const { wc } = makeWc();
    await manager.attach('tab-1', wc);
    const result = await manager.sendCommand('tab-1', 'Runtime.evaluate', {
      expression: '1+1',
    });
    expect(result.ok).toBe(true);
  });
});

describe('trusted input', () => {
  it('trustedClick dispatches mousePressed then mouseReleased at the point', async () => {
    const manager = createBrowserCdpManager();
    const { wc, dbg } = makeWc();
    await manager.attach('tab-1', wc);
    dbg.commands.length = 0;
    expect(await manager.trustedClick('tab-1', 100, 50)).toEqual({
      ok: true,
    });
    expect(dbg.commands).toEqual([
      {
        method: 'Input.dispatchMouseEvent',
        params: {
          type: 'mousePressed',
          x: 100,
          y: 50,
          button: 'left',
          clickCount: 1,
        },
      },
      {
        method: 'Input.dispatchMouseEvent',
        params: {
          type: 'mouseReleased',
          x: 100,
          y: 50,
          button: 'left',
          clickCount: 1,
        },
      },
    ]);
  });

  it('trustedClickAtElement resolves the centre and clicks it', async () => {
    const manager = createBrowserCdpManager();
    const { wc, dbg } = makeWc({ x: 120, y: 80 });
    await manager.attach('tab-1', wc);
    dbg.commands.length = 0;
    expect(await manager.trustedClickAtElement('tab-1', '#buy-now')).toEqual({
      ok: true,
    });
    const script = (wc.executeJavaScript as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(script).toContain('#buy-now');
    expect(script).toContain('getBoundingClientRect');
    expect(dbg.commands[0].params).toMatchObject({ x: 120, y: 80 });
  });

  it('a missing element is not-found; a bad selector is bad-selector', async () => {
    const manager = createBrowserCdpManager();
    const { wc } = makeWc(null);
    await manager.attach('tab-1', wc);
    expect(await manager.trustedClickAtElement('tab-1', '#gone')).toEqual({
      ok: false,
      error: 'not-found',
    });
    expect(await manager.trustedClickAtElement('tab-1', '')).toEqual({
      ok: false,
      error: 'bad-selector',
    });
  });

  it('dispatchKey sends the key event (char carries text)', async () => {
    const manager = createBrowserCdpManager();
    const { wc, dbg } = makeWc();
    await manager.attach('tab-1', wc);
    dbg.commands.length = 0;
    expect(await manager.dispatchKey('tab-1', 'keyDown', 'Enter', 'Enter')).toEqual({
      ok: true,
    });
    expect(dbg.commands[0]).toEqual({
      method: 'Input.dispatchKeyEvent',
      params: { type: 'keyDown', key: 'Enter', code: 'Enter' },
    });
    expect(await manager.dispatchKey('tab-1', 'char', 'a')).toEqual({
      ok: true,
    });
    expect(dbg.commands[1].params).toMatchObject({ type: 'char', key: 'a', text: 'a' });
  });
});

describe('diagnostics', () => {
  it('records failed requests (with URL), HTTP errors, console errors, exceptions', async () => {
    const manager = createBrowserCdpManager();
    const { wc, dbg } = makeWc();
    await manager.attach('tab-1', wc);
    dbg.emit('Network.requestWillBeSent', {
      requestId: '1',
      request: { url: 'https://example.com/api' },
    });
    dbg.emit('Network.loadingFailed', {
      requestId: '1',
      errorText: 'net::ERR_CONNECTION_REFUSED',
    });
    dbg.emit('Network.responseReceived', {
      response: { url: 'https://example.com/missing', status: 404 },
    });
    dbg.emit('Network.responseReceived', {
      response: { url: 'https://example.com/ok', status: 200 },
    });
    dbg.emit('Runtime.consoleAPICalled', {
      type: 'error',
      args: [{ value: 'boom' }],
    });
    dbg.emit('Runtime.consoleAPICalled', {
      type: 'log',
      args: [{ value: 'not an error' }],
    });
    dbg.emit('Runtime.exceptionThrown', {
      exceptionDetails: {
        text: 'Uncaught',
        exception: { description: 'TypeError: x is not a function' },
      },
    });
    const diagnostics = manager.getDiagnostics('tab-1');
    expect(diagnostics?.networkFailures).toEqual([
      {
        url: 'https://example.com/api',
        errorText: 'net::ERR_CONNECTION_REFUSED',
        at: expect.any(Number),
      },
      {
        url: 'https://example.com/missing',
        status: 404,
        at: expect.any(Number),
      },
    ]);
    expect(diagnostics?.consoleErrors).toEqual([
      { text: 'boom', at: expect.any(Number) },
      {
        text: 'Uncaught: TypeError: x is not a function',
        at: expect.any(Number),
      },
    ]);
  });

  it('the ring buffers cap at 20 per kind', async () => {
    const manager = createBrowserCdpManager();
    const { wc, dbg } = makeWc();
    await manager.attach('tab-1', wc);
    for (let i = 0; i < MAX_CDP_DIAGNOSTICS + 5; i++) {
      dbg.emit('Network.responseReceived', {
        response: { url: `https://x/${i}`, status: 500 },
      });
    }
    const diagnostics = manager.getDiagnostics('tab-1');
    expect(diagnostics?.networkFailures).toHaveLength(MAX_CDP_DIAGNOSTICS);
    expect(diagnostics?.networkFailures[0].url).toBe('https://x/5');
  });

  it('a tab that never attached has no diagnostics', () => {
    const manager = createBrowserCdpManager();
    expect(manager.getDiagnostics('tab-1')).toBeNull();
  });
});

describe('in-page agent cursor (Gary, 2026-11-07)', () => {
  // A BrowserView paints ABOVE its host window's DOM, so the
  // renderer's DOM agent cursor is invisible while a page is
  // attached. The visible agent mouse lives in the page itself,
  // drawn by Runtime.evaluate on every move.
  it('buildAgentCursorScript targets one fixed, non-interactive element', () => {
    const script = buildAgentCursorScript(120, 80);
    expect(script).toContain(AGENT_CURSOR_ELEMENT_ID);
    expect(script).toContain('position:fixed');
    expect(script).toContain('pointer-events:none');
    expect(script).toContain('2147483647');
    expect(script).toContain('120');
    expect(script).toContain('80');
    expect(script).toContain(String(AGENT_CURSOR_IDLE_HIDE_MS));
    expect(script).toContain('Agent');
  });

  it('buildAgentCursorHideScript hides that element', () => {
    expect(buildAgentCursorHideScript()).toContain(AGENT_CURSOR_ELEMENT_ID);
    expect(buildAgentCursorHideScript()).toContain("display = 'none'");
  });

  it('moveMouse dispatches the real event AND draws the in-page cursor', async () => {
    const manager = createBrowserCdpManager();
    const { wc, dbg } = makeWc();
    await manager.attach('tab-1', wc);
    dbg.commands.length = 0;
    expect(await manager.moveMouse('tab-1', 120, 80)).toEqual({ ok: true });
    expect(dbg.commands[0]).toEqual({
      method: 'Input.dispatchMouseEvent',
      params: { type: 'mouseMoved', x: 120, y: 80, button: 'none' },
    });
    expect(dbg.commands[1].method).toBe('Runtime.evaluate');
    expect(String(dbg.commands[1].params?.expression)).toContain(
      AGENT_CURSOR_ELEMENT_ID,
    );
  });

  it('hideAgentCursor evaluates the hide script', async () => {
    const manager = createBrowserCdpManager();
    const { wc, dbg } = makeWc();
    await manager.attach('tab-1', wc);
    dbg.commands.length = 0;
    expect(await manager.hideAgentCursor('tab-1')).toEqual({ ok: true });
    expect(dbg.commands[0].method).toBe('Runtime.evaluate');
    expect(String(dbg.commands[0].params?.expression)).toContain(
      AGENT_CURSOR_ELEMENT_ID,
    );
  });

  it('moveMouse on a tab with no session reports not-attached', async () => {
    const manager = createBrowserCdpManager();
    expect(await manager.moveMouse('tab-1', 10, 10)).toEqual({
      ok: false,
      error: 'not-attached',
    });
  });
});
