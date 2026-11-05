/**
 * Bridge between the AI tools (`electron/services/aiTools.ts`) and
 * the in-panel browser (Area 5).
 *
 * The browser views live in `electron/ipc/browser.ts`; the AI tools
 * live in `aiTools.ts`. Neither imports the other — this module is
 * the registry between them: `setupBrowserHandlers` registers a
 * target that drives the active tab through the Area 4 action API,
 * and `executeTool`'s `browser_*` cases call it. When nothing is
 * registered (browser handlers never set up), the tools report
 * cleanly that the browser is unavailable instead of throwing.
 *
 * Everything the target does runs in the main process, against the
 * local BrowserView — never a remote server, never the Replit
 * backend. The AI asks; main acts on the page.
 */

import type { FlowDefinition } from '../../src/lib/browserFlows';

/** What the AI can do to the in-panel browser, as plain-text
 * tool results (the format `executeTool` returns). */
export interface BrowserToolTarget {
  /** Open `url` in the active tab. */
  navigate(url: string): Promise<string>;
  /** Visible text of the active tab's page (capped). */
  readPage(): Promise<string>;
  /** Click an element (CSS selector) in the active tab. */
  click(selector: string): Promise<string>;
  /** Fill a form field (CSS selector) in the active tab. Never a
   * password field — the target refuses those. */
  fill(selector: string, value: string): Promise<string>;
  /** Save a screenshot of the active tab; returns its file path. */
  screenshot(): Promise<string>;
  /** Describe the active tab's page (URL, title, forms). */
  getState(): Promise<string>;
  /** Search the web in a temporary tab; returns titles/URLs/snippets. */
  search(query: string, timeoutMs?: number): Promise<string>;
  /** Click an element with a real (trusted) mouse event via CDP
   * (Area 8) — for pages that ignore Tier 1's synthetic click. */
  trustedClick(selector: string): Promise<string>;
  /** What the user looked at in the last `days` days (Area 9),
   * formatted for the AI chat. */
  getHistory(days?: number): Promise<string>;
  /** Start a scripted multi-step flow (Area 7) on the active tab.
   * The flow runs in the background; steps that need approval
   * (money/irreversible, or explicitly flagged) pause for Gary
   * in the browser panel. Returns a started-flow summary. */
  runFlow(definition: FlowDefinition): Promise<string>;
}

let target: BrowserToolTarget | null = null;

export function registerBrowserToolTarget(next: BrowserToolTarget): void {
  target = next;
}

/** Test-only: drop the registered target. */
export function clearBrowserToolTarget(): void {
  target = null;
}

export function getBrowserToolTarget(): BrowserToolTarget | null {
  return target;
}

export function isBrowserToolAvailable(): boolean {
  return target !== null;
}

/** What the AI tools report when no browser target is registered. */
export const BROWSER_TOOL_UNAVAILABLE =
  'The in-panel browser is not available right now (its handlers are not set up).';
