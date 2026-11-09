// DEFCON 2 merge viewport guard (Gary, 2026-11-09).
//
// Root cause found live 2026-11-09 ~05:10 PST: the DEFCON 2 merge
// (mist as direct background, reading (b)) measured flat black at
// bg-black/50 AND bg-black/25 — the veil change moved the empty-area
// mean only 0.03 -> 0.68. The xterm surface is transparent
// (allowTransparency + transparent theme) but xterm.js's own CSS
// forces `.xterm-viewport { background-color: #000 }` — the scroll
// container behind the canvas — so the viewport painted an opaque
// black slab over the mist at EVERY level. The fix is the
// transparent override in src/index.css; this test pins it so a
// cleanup cannot silently re-hide the mist. The live proof is the
// screenshot + pixel check, not this test.

import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

describe('DEFCON 2 merge: xterm viewport must stay transparent', () => {
  test('src/index.css overrides the xterm viewport background', () => {
    const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');
    // The rule itself: .xterm .xterm-viewport { background-color: transparent ... }
    expect(css).toMatch(
      /\.xterm\s+\.xterm-viewport\s*\{[^}]*background-color:\s*transparent/,
    );
    // Load-order-proof: xterm.css lands after index.css in the bundle,
    // so the override needs !important (or higher specificity) to win.
    expect(css).toMatch(
      /\.xterm\s+\.xterm-viewport\s*\{[^}]*background-color:\s*transparent\s*!important/,
    );
    // The reason must stay documented next to the rule, so the next
    // person to touch it knows why it exists.
    expect(css).toMatch(/DEFCON 2 merge/);
    expect(css).toMatch(/xterm-viewport \{ background-color: #000 \}/);
  });

  test('upstream xterm.css still forces #000 (the reason the override exists)', () => {
    const xtermCssPath = join(
      process.cwd(),
      'node_modules/@xterm/xterm/css/xterm.css',
    );
    expect(existsSync(xtermCssPath)).toBe(true);
    const xtermCss = readFileSync(xtermCssPath, 'utf8');
    expect(xtermCss).toMatch(
      /\.xterm\s+\.xterm-viewport\s*\{[^}]*background-color:\s*#000/,
    );
  });
});
