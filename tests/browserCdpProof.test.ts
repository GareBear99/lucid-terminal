/**
 * Area 8 proof: Tier 1 is insufficient — the gap, proven, not
 * assumed.
 *
 * Tier 1 clicks are `element.click()` via `executeJavaScript`
 * (exactly what `buildClickScript` in src/lib/browserActions.ts
 * emits). The DOM spec says events dispatched by script are
 * untrusted: `event.isTrusted === false`, always — only a real
 * user gesture (or a CDP trusted-input event) is trusted. A page
 * can read that flag and ignore the click, and real sites do
 * (anti-bot checks, payment buttons, some SPAs that only act on
 * trusted input).
 *
 * This test proves it with jsdom: the same `el.click()` Tier 1
 * uses dispatches an event with `isTrusted === false`, and a
 * listener that only acts on trusted clicks ignores it. The
 * flow runner's click step therefore cannot be relied on for
 * arbitrary sites — Tier 2 (CDP trusted input) is needed.
 *
 * The second Tier 1 gap is observation, stated here because it
 * is a missing API, not a behaviour: no Tier 1 action can report
 * a failed network request or a page console error. A flow step
 * that fails because the page's XHR failed looks exactly like a
 * missing element to `readText`/`getState` — an empty page either
 * way. Tier 2's `Network` + `Runtime` observation closes it.
 *
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';

describe('Tier 1 gap proof: element.click() is untrusted', () => {
  it('el.click() — exactly what Tier 1 does — dispatches isTrusted === false', () => {
    const dom = new JSDOM(
      `<!DOCTYPE html><button id="buy">Buy now</button>`,
    );
    const button = dom.window.document.getElementById('buy');
    expect(button).not.toBeNull();
    let seenTrusted: boolean | null = null;
    button!.addEventListener('click', (event) => {
      seenTrusted = event.isTrusted;
    });
    // This is the Tier 1 click: HTMLElement.click() dispatches a
    // synthetic MouseEvent.
    (button as unknown as HTMLElement).click();
    expect(seenTrusted).toBe(false);
  });

  it('a page that only acts on trusted clicks ignores a Tier 1 click', () => {
    const dom = new JSDOM(
      `<!DOCTYPE html><button id="buy">Buy now</button>`,
    );
    const button = dom.window.document.getElementById('buy')!;
    let purchased = false;
    button.addEventListener('click', (event) => {
      // A real site gate: only a genuine user gesture proceeds.
      if (event.isTrusted) purchased = true;
    });
    (button as unknown as HTMLElement).click();
    expect(purchased).toBe(false);
  });
});
