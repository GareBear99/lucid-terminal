import type { WebContents } from 'electron';
import {
  buildClickScript,
  buildFillScript,
  buildGetStateScript,
  buildReadTextScript,
  buildSelectorPresentScript,
  clampWaitTimeout,
  isValidFillValue,
  isValidSelector,
  MAX_PAGE_TEXT_FOR_AI,
} from '../../src/lib/browserActions';
import type {
  BrowserActionResult,
  BrowserPageState,
  BrowserPageText,
} from '../../src/types';

/**
 * Page-action API for the in-panel browser (Area 4): the automation
 * foundation every later area builds on (§2.3, §2.4 Tier 1, §2.6,
 * §2.9). Typed actions, parameterised — no raw JS from the
 * renderer. The scripts live in `src/lib/browserActions.ts` and are
 * built and run in main only; the renderer (and the AI) send
 * parameters, never code.
 *
 * Every method returns `{ ok, ... }` and never throws for a
 * page-side outcome (missing element, bad selector, timeout): the
 * caller gets a typed error string instead. Only a missing
 * `executeJavaScript`/`capturePage` on the webContents (a mock
 * without them, or a destroyed view) is reported the same way.
 *
 * The generic `fill` NEVER fills a password field — the page-side
 * script refuses it (`password-field`). Passwords belong to the
 * vault (Area 3) and its saved-login fill; a password must never
 * travel as an action parameter through the AI or IPC.
 *
 * Screenshots return a PNG data URL. The image is the page as Gary
 * sees it — it can contain whatever the page shows, so callers must
 * treat it as page content, not as a trusted string.
 */

/** A WebContents-like the runner can drive. `WebContents` in
 * production; the tests pass a mock with the same shape. */
export type ActionWebContents = Pick<
  WebContents,
  'executeJavaScript' | 'capturePage'
>;

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** How often waitForSelector re-checks the page (ms). */
const WAIT_POLL_MS = 100;

function noJs<T>(error: string): BrowserActionResult & T {
  return { ok: false, error } as BrowserActionResult & T;
}

export interface BrowserActionsRunner {
  readText(wc: ActionWebContents): Promise<
    BrowserActionResult & { text?: BrowserPageText }
  >;
  fill(
    wc: ActionWebContents,
    selector: string,
    value: string,
  ): Promise<BrowserActionResult>;
  click(
    wc: ActionWebContents,
    selector: string,
  ): Promise<BrowserActionResult>;
  waitForSelector(
    wc: ActionWebContents,
    selector: string,
    timeoutMs?: number,
  ): Promise<BrowserActionResult>;
  screenshot(wc: ActionWebContents): Promise<
    BrowserActionResult & { dataUrl?: string }
  >;
  getState(wc: ActionWebContents): Promise<
    BrowserActionResult & { state?: BrowserPageState }
  >;
}

/** Page text capped for the AI chat: the full read-text result can
 * be 20k chars; the chat context gets the first 8k. */
export function capTextForAi(text: string): string {
  return text.length > MAX_PAGE_TEXT_FOR_AI
    ? text.slice(0, MAX_PAGE_TEXT_FOR_AI)
    : text;
}

export function createBrowserActionsRunner(): BrowserActionsRunner {
  const runScript = async <T>(
    wc: ActionWebContents,
    script: string,
  ): Promise<{ ran: true; value: T } | { ran: false; error: string }> => {
    if (typeof wc.executeJavaScript !== 'function') {
      return { ran: false, error: 'unavailable' };
    }
    try {
      const value = (await wc.executeJavaScript(script)) as T;
      return { ran: true, value };
    } catch {
      return { ran: false, error: 'script-failed' };
    }
  };

  return {
    readText: async (wc) => {
      const result = await runScript<BrowserPageText>(
        wc,
        buildReadTextScript(),
      );
      if (!result.ran) return noJs(result.error);
      const text = result.value;
      if (!text || typeof text.text !== 'string') {
        return { ok: false, error: 'bad-result' };
      }
      return { ok: true, text };
    },

    fill: async (wc, selector, value) => {
      if (!isValidSelector(selector)) {
        return { ok: false, error: 'bad-selector' };
      }
      if (!isValidFillValue(value)) {
        return { ok: false, error: 'bad-value' };
      }
      const result = await runScript<{ ok: boolean; error?: string }>(
        wc,
        buildFillScript(selector, value),
      );
      if (!result.ran) return noJs(result.error);
      if (!result.value || typeof result.value.ok !== 'boolean') {
        return { ok: false, error: 'bad-result' };
      }
      return result.value.ok
        ? { ok: true }
        : { ok: false, error: result.value.error ?? 'failed' };
    },

    click: async (wc, selector) => {
      if (!isValidSelector(selector)) {
        return { ok: false, error: 'bad-selector' };
      }
      const result = await runScript<{ ok: boolean; error?: string }>(
        wc,
        buildClickScript(selector),
      );
      if (!result.ran) return noJs(result.error);
      if (!result.value || typeof result.value.ok !== 'boolean') {
        return { ok: false, error: 'bad-result' };
      }
      return result.value.ok
        ? { ok: true }
        : { ok: false, error: result.value.error ?? 'failed' };
    },

    waitForSelector: async (wc, selector, timeoutMs) => {
      if (!isValidSelector(selector)) {
        return { ok: false, error: 'bad-selector' };
      }
      const timeout = clampWaitTimeout(timeoutMs);
      const deadline = Date.now() + timeout;
      const script = buildSelectorPresentScript(selector);
      for (;;) {
        const result = await runScript<boolean>(wc, script);
        if (!result.ran) return noJs(result.error);
        if (result.value === true) return { ok: true };
        if (Date.now() >= deadline) {
          return { ok: false, error: 'timeout' };
        }
        await sleep(
          Math.min(WAIT_POLL_MS, Math.max(0, deadline - Date.now())),
        );
      }
    },

    screenshot: async (wc) => {
      if (typeof wc.capturePage !== 'function') {
        return { ok: false, error: 'unavailable' };
      }
      try {
        const image = await wc.capturePage();
        const png = image.toPNG();
        return {
          ok: true,
          dataUrl: `data:image/png;base64,${png.toString('base64')}`,
        };
      } catch {
        return { ok: false, error: 'capture-failed' };
      }
    },

    getState: async (wc) => {
      const result = await runScript<BrowserPageState>(
        wc,
        buildGetStateScript(),
      );
      if (!result.ran) return noJs(result.error);
      const state = result.value;
      if (!state || typeof state.url !== 'string') {
        return { ok: false, error: 'bad-result' };
      }
      return { ok: true, state };
    },
  };
}
