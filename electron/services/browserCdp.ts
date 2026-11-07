/**
 * CDP Tier 2 (Area 8) — `webContents.debugger` session manager.
 *
 * Built only because Tier 1 was proven insufficient (see
 * tests/browserCdpProof.test.ts): `element.click()` dispatches
 * an untrusted event (`isTrusted === false`), which pages can
 * detect and ignore, and no Tier 1 action can observe network
 * failures or console errors. This manager closes both gaps:
 *
 * - trusted input: real mouse/keyboard events via
 *   `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent`
 *   (indistinguishable from a user gesture);
 * - observation: `Network` + `Runtime` events captured into
 *   per-tab diagnostics (failed requests, HTTP errors,
 *   console errors, uncaught exceptions).
 *
 * Safety: one session per tab, attached lazily on first Tier 2
 * use and detached when the tab closes. Only an explicit
 * allowlist of CDP methods may be sent — `Page`, `Runtime`,
 * `Input`, `Network`, and never `Target` management (no
 * creating/closing/detaching other targets). A disallowed
 * method is refused before it reaches the debugger.
 */

import { isValidSelector } from '../../src/lib/browserActions';
import type {
  CdpConsoleError,
  CdpDiagnostics,
  CdpNetworkFailure,
} from '../../src/types';

export type { CdpConsoleError, CdpDiagnostics, CdpNetworkFailure };

/** CDP methods this manager will ever send. Anything else is
 * refused. `Target` is deliberately absent: no target
 * management, ever. */
export const CDP_ALLOWED_METHODS: readonly string[] = [
  'Page.enable',
  'Page.disable',
  'Runtime.enable',
  'Runtime.disable',
  'Runtime.evaluate',
  'Input.dispatchMouseEvent',
  'Input.dispatchKeyEvent',
  'Network.enable',
  'Network.disable',
];

/** Is this CDP method on the allowlist? */
export function isCdpMethodAllowed(method: string): boolean {
  return (CDP_ALLOWED_METHODS as readonly string[]).includes(method);
}

/** How many diagnostics are kept per tab per kind (ring buffer). */
export const MAX_CDP_DIAGNOSTICS = 20;

/** The slice of Electron's debugger this manager uses. */
export interface CdpDebugger {
  attach(): Promise<void> | void;
  detach(): Promise<void> | void;
  sendCommand(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<unknown>;
  isAttached(): boolean;
  on(
    event: 'message',
    listener: (
      event: unknown,
      method: string,
      params: Record<string, unknown>,
    ) => void,
  ): void;
}

/** The slice of a tab's webContents this manager uses. */
export interface CdpWebContents {
  debugger: CdpDebugger;
  executeJavaScript(script: string): Promise<unknown>;
}

/** Script: scroll an element into view and return its centre
 * in viewport (CSS) coordinates, or null when it is missing. */
export function buildElementCenterScript(selector: string): string {
  return `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null;
  if (typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'center', inline: 'center' });
  }
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`;
}

interface CdpSession {
  wc: CdpWebContents;
  networkFailures: CdpNetworkFailure[];
  consoleErrors: CdpConsoleError[];
  /** requestId -> URL, for naming loadingFailed events (capped). */
  requestUrls: Map<string, string>;
}

export interface BrowserCdpManager {
  attach(
    tabId: string,
    wc: CdpWebContents,
  ): Promise<{ ok: boolean; error?: string }>;
  detach(tabId: string): Promise<void>;
  isAttached(tabId: string): boolean;
  sendCommand(
    tabId: string,
    method: string,
    params?: Record<string, unknown>,
  ): Promise<{ ok: boolean; result?: unknown; error?: string }>;
  trustedClick(
    tabId: string,
    x: number,
    y: number,
  ): Promise<{ ok: boolean; error?: string }>;
  trustedClickAtElement(
    tabId: string,
    selector: string,
  ): Promise<{ ok: boolean; error?: string }>;
  /** Move the live agent mouse to (x, y) — a real `mouseMoved`
   * event via CDP (Phase B). The page sees a real pointer moving,
   * and the renderer draws the agent cursor at the same point.
   * The caller clamps to the browser view bounds first (see
   * `clampAgentMousePosition`); this sends exactly what it gets. */
  moveMouse(
    tabId: string,
    x: number,
    y: number,
  ): Promise<{ ok: boolean; error?: string }>;
  /** Move the agent mouse to an element's centre (scrolls it into
   * view first) and return the point, so a click can visibly
   * travel there first. */
  moveMouseToElement(
    tabId: string,
    selector: string,
  ): Promise<{ ok: boolean; x?: number; y?: number; error?: string }>;
  dispatchKey(
    tabId: string,
    type: 'keyDown' | 'keyUp' | 'rawKeyDown' | 'char',
    key: string,
    code?: string,
  ): Promise<{ ok: boolean; error?: string }>;
  /** The tab's diagnostics, or null when it never had a session. */
  getDiagnostics(tabId: string): CdpDiagnostics | null;
}

export function createBrowserCdpManager(): BrowserCdpManager {
  const sessions = new Map<string, CdpSession>();

  const pushNetworkFailure = (
    session: CdpSession,
    failure: CdpNetworkFailure,
  ) => {
    session.networkFailures.push(failure);
    if (session.networkFailures.length > MAX_CDP_DIAGNOSTICS) {
      session.networkFailures.shift();
    }
  };

  const pushConsoleError = (session: CdpSession, error: CdpConsoleError) => {
    session.consoleErrors.push(error);
    if (session.consoleErrors.length > MAX_CDP_DIAGNOSTICS) {
      session.consoleErrors.shift();
    }
  };

  const onDebuggerMessage = (
    session: CdpSession,
    method: string,
    params: Record<string, unknown>,
  ) => {
    const at = Date.now();
    switch (method) {
      case 'Network.requestWillBeSent': {
        const requestId = params.requestId as string | undefined;
        const request = params.request as { url?: string } | undefined;
        if (requestId && request?.url) {
          session.requestUrls.set(requestId, request.url);
          if (session.requestUrls.size > 100) {
            const first = session.requestUrls.keys().next().value;
            if (first !== undefined) session.requestUrls.delete(first);
          }
        }
        break;
      }
      case 'Network.loadingFailed': {
        const requestId = params.requestId as string | undefined;
        const url = (requestId && session.requestUrls.get(requestId)) ?? '';
        pushNetworkFailure(session, {
          url,
          errorText: (params.errorText as string | undefined) ?? 'failed',
          at,
        });
        break;
      }
      case 'Network.responseReceived': {
        const response = params.response as
          | { url?: string; status?: number }
          | undefined;
        if (response?.url && typeof response.status === 'number' && response.status >= 400) {
          pushNetworkFailure(session, {
            url: response.url,
            status: response.status,
            at,
          });
        }
        break;
      }
      case 'Runtime.consoleAPICalled': {
        if (params.type !== 'error') break;
        const args = (params.args as Array<{ value?: unknown; description?: string }> | undefined) ?? [];
        const text = args
          .map((a) =>
            typeof a.value === 'string'
              ? a.value
              : (a.description ?? String(a.value ?? '')),
          )
          .join(' ');
        pushConsoleError(session, { text, at });
        break;
      }
      case 'Runtime.exceptionThrown': {
        const details = params.exceptionDetails as
          | { text?: string; exception?: { description?: string } }
          | undefined;
        const text = [
          details?.text,
          details?.exception?.description,
        ]
          .filter(Boolean)
          .join(': ');
        pushConsoleError(session, { text: text || 'Uncaught exception', at });
        break;
      }
      default:
        break;
    }
  };

  const manager: BrowserCdpManager = {
    async attach(tabId, wc) {
      if (sessions.has(tabId)) return { ok: true };
      try {
        await wc.debugger.attach();
      } catch {
        return { ok: false, error: 'attach-failed' };
      }
      const session: CdpSession = {
        wc,
        networkFailures: [],
        consoleErrors: [],
        requestUrls: new Map(),
      };
      wc.debugger.on('message', (_event, method, params) => {
        onDebuggerMessage(session, method, params);
      });
      sessions.set(tabId, session);
      // Observation on: network + console, from here on.
      const network = await manager.sendCommand(tabId, 'Network.enable');
      if (!network.ok) {
        await manager.detach(tabId);
        return { ok: false, error: 'attach-failed' };
      }
      const runtime = await manager.sendCommand(tabId, 'Runtime.enable');
      if (!runtime.ok) {
        await manager.detach(tabId);
        return { ok: false, error: 'attach-failed' };
      }
      return { ok: true };
    },

    async detach(tabId) {
      const session = sessions.get(tabId);
      if (!session) return;
      sessions.delete(tabId);
      try {
        await session.wc.debugger.sendCommand('Network.disable');
      } catch {
        // Best effort: the tab may already be gone.
      }
      try {
        await session.wc.debugger.sendCommand('Runtime.disable');
      } catch {
        // Best effort.
      }
      try {
        await session.wc.debugger.detach();
      } catch {
        // Best effort.
      }
    },

    isAttached(tabId) {
      return sessions.has(tabId);
    },

    async sendCommand(tabId, method, params) {
      if (!isCdpMethodAllowed(method)) {
        return { ok: false, error: 'not-allowed' };
      }
      const session = sessions.get(tabId);
      if (!session) return { ok: false, error: 'not-attached' };
      try {
        const result = await session.wc.debugger.sendCommand(method, params);
        return { ok: true, result };
      } catch {
        return { ok: false, error: 'command-failed' };
      }
    },

    async trustedClick(tabId, x, y) {
      const pressed = await manager.sendCommand(
        tabId,
        'Input.dispatchMouseEvent',
        { type: 'mousePressed', x, y, button: 'left', clickCount: 1 },
      );
      if (!pressed.ok) return { ok: false, error: pressed.error };
      const released = await manager.sendCommand(
        tabId,
        'Input.dispatchMouseEvent',
        { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 },
      );
      if (!released.ok) return { ok: false, error: released.error };
      return { ok: true };
    },

    async trustedClickAtElement(tabId, selector) {
      if (!isValidSelector(selector)) {
        return { ok: false, error: 'bad-selector' };
      }
      const session = sessions.get(tabId);
      if (!session) return { ok: false, error: 'not-attached' };
      let point: unknown;
      try {
        point = await session.wc.executeJavaScript(
          buildElementCenterScript(selector),
        );
      } catch {
        return { ok: false, error: 'script-failed' };
      }
      if (
        !point ||
        typeof point !== 'object' ||
        typeof (point as { x?: unknown }).x !== 'number' ||
        typeof (point as { y?: unknown }).y !== 'number'
      ) {
        return { ok: false, error: 'not-found' };
      }
      const { x, y } = point as { x: number; y: number };
      return manager.trustedClick(tabId, x, y);
    },

    async moveMouse(tabId, x, y) {
      const moved = await manager.sendCommand(
        tabId,
        'Input.dispatchMouseEvent',
        { type: 'mouseMoved', x, y, button: 'none' },
      );
      return { ok: moved.ok, ...(moved.error ? { error: moved.error } : {}) };
    },

    async moveMouseToElement(tabId, selector) {
      if (!isValidSelector(selector)) {
        return { ok: false, error: 'bad-selector' };
      }
      const session = sessions.get(tabId);
      if (!session) return { ok: false, error: 'not-attached' };
      let point: unknown;
      try {
        point = await session.wc.executeJavaScript(
          buildElementCenterScript(selector),
        );
      } catch {
        return { ok: false, error: 'script-failed' };
      }
      if (
        !point ||
        typeof point !== 'object' ||
        typeof (point as { x?: unknown }).x !== 'number' ||
        typeof (point as { y?: unknown }).y !== 'number'
      ) {
        return { ok: false, error: 'not-found' };
      }
      const { x, y } = point as { x: number; y: number };
      const moved = await manager.moveMouse(tabId, x, y);
      if (!moved.ok) return { ok: false, error: moved.error };
      return { ok: true, x, y };
    },

    async dispatchKey(tabId, type, key, code) {
      return manager
        .sendCommand(tabId, 'Input.dispatchKeyEvent', {
          type,
          key,
          ...(code ? { code } : {}),
          ...(type === 'char' ? { text: key } : {}),
        })
        .then((r) => ({ ok: r.ok, ...(r.error ? { error: r.error } : {}) }));
    },

    getDiagnostics(tabId) {
      const session = sessions.get(tabId);
      if (!session) return null;
      return {
        networkFailures: [...session.networkFailures],
        consoleErrors: [...session.consoleErrors],
      };
    },
  };

  return manager;
}
