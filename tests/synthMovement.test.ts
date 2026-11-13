/**
 * Synth movement split + the field at the blueprint center (Gary, 2026-11-12
 * ~16:38 / ~16:45 PST).
 *
 * Gary's words: arrow keys move the RETICLE ("i like that recticle movement
 * and should be bound to arrow keys not was"); WASD moves the EYE ("wasd
 * moves what you called the eye not the field" — the original movement);
 * and the FIELD "needs to be at the center as i showed you its never been".
 *
 * What the three things are in code:
 * - The EYE is the camera anchor / eye direction (the `eye` vector). In v67
 *   it is the shell origin on load; WASD walks it (eyeStep) and the reticle
 *   resnaps onto it. In Iteration 8 it is the camera's surface anchor.
 * - The RETICLE is the user's pointer sentinel (`reticleDir` in v67, the
 *   SYNTHESIS SCANNER probe `SCN` in Iteration 8) — the independent movable
 *   target the arrow keys drive.
 * - The FIELD is the eye field, the spectrum animation `drawSynthEyeField`
 *   in v67 (one of the thinker/field/ship trio drawn at the eye's
 *   world-projected position). It is at screen center exactly when the
 *   camera looks at the eye, i.e. when the reticle is ON the eye. It had
 *   never been there because the reticle started at (0,0,1), was never reset
 *   to the eye on blueprint load, and roamed away — and because "Center
 *   Reticle" (C) used to snap the reticle to the canonical-face center tile,
 *   a different point than the eye. Iteration 8 has no eye field (zero
 *   "field" hits in its shell) — there the same order is carried by the eye
 *   itself: C snaps the eye back to the active shell's origin.
 *
 * These tests run the REAL vendored shells in jsdom (same harness shape as
 * iteration8Shell.test.ts) and exercise the bindings through real key
 * events, observing what the shells actually draw:
 * - v67: the field arc (the arc immediately before a clip() with radius
 *   0.5–0.7x the lens radius — the field is drawn before the thinker's
 *   pupil, so the FIRST such pair in the frame is the field) and the
 *   anchor line's reticle tile (f/i/j).
 * - Iteration 8: the scanner box position (roundRect x/y — it shifts by
 *   -dxP*scannerParallax while the eye is moving, i.e. while the camera
 *   lags the eye, and returns to rest once the camera catches up), the
 *   scanner title's probe tile, and a fingerprint of the drawn grid
 *   geometry (moveTo/lineTo coords rounded to 3 decimals — the grid rotates
 *   when the eye moves and is bit-stable at rest).
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, test, expect } from 'vitest';
import { JSDOM } from 'jsdom';

// ---------------------------------------------------------------------------
// Harness — the real shell file, a recording canvas stub, a manual clock
// ---------------------------------------------------------------------------

type Call = (string | number)[];

interface ShellHarness {
  dom: JSDOM;
  window: Window & typeof globalThis;
  doc: Document;
  calls: Call[];
  drive: (n: number) => Promise<boolean>;
  driveUntil: (pred: () => boolean, max: number) => Promise<boolean>;
  keyDown: (key: string) => void;
  keyUp: (key: string) => void;
  scriptErrors: string[];
  tick: () => Promise<void>;
}

function loadShell(shellFile: string): ShellHarness {
  const html = fs.readFileSync(
    path.join(process.cwd(), 'public', 'synth', shellFile),
    'utf8',
  );
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  expect(script).toBeTruthy();
  const htmlWithoutScript = html.replace(/<script>[\s\S]*<\/script>/, '');

  const dom = new JSDOM(htmlWithoutScript, {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    runScripts: 'dangerously',
  });
  const { window } = dom;
  const doc = window.document;

  let rafCb: ((now: number) => void) | null = null;
  let clock = 0;
  (
    window as unknown as {
      requestAnimationFrame: (cb: (now: number) => void) => number;
    }
  ).requestAnimationFrame = (cb) => {
    rafCb = cb;
    return 1;
  };
  (window.performance as unknown as { now: () => number }).now = () => clock;

  // Ordered call log for the current frame (cleared before each driven frame).
  const calls: Call[] = [];
  const noop = () => {};
  const gradient = { addColorStop: noop };
  const ctxStub = {
    beginPath: noop,
    moveTo: (x: number, y: number) => calls.push(['moveTo', x, y]),
    lineTo: (x: number, y: number) => calls.push(['lineTo', x, y]),
    stroke: noop,
    fill: noop,
    arc: (x: number, y: number, r: number) => calls.push(['arc', x, y, r]),
    arcTo: noop,
    ellipse: noop,
    fillRect: noop,
    clearRect: noop,
    save: noop,
    restore: noop,
    fillText: (t: string) => calls.push(['fillText', String(t)]),
    strokeText: noop,
    closePath: noop,
    clip: () => calls.push(['clip']),
    translate: noop,
    scale: noop,
    rotate: noop,
    setTransform: noop,
    resetTransform: noop,
    setLineDash: noop,
    roundRect: (x: number, y: number, w: number, h: number) =>
      calls.push(['roundRect', x, y, w, h]),
    drawImage: noop,
    putImageData: noop,
    measureText: () => ({ width: 0 }),
    getLineDash: () => [] as number[],
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
    createPattern: () => null,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  };
  (
    window.HTMLCanvasElement.prototype as unknown as {
      getContext: () => unknown;
    }
  ).getContext = () => ctxStub;

  class FakeCtx2D {}
  (window as unknown as Record<string, unknown>).CanvasRenderingContext2D =
    FakeCtx2D;

  const scriptErrors: string[] = [];
  window.addEventListener('error', (ev: ErrorEvent) => {
    scriptErrors.push(String(ev.message || ev.error || 'error'));
  });

  const scriptEl = doc.createElement('script');
  scriptEl.textContent = script!;
  doc.body.appendChild(scriptEl);

  const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  async function drive(n: number): Promise<boolean> {
    for (let i = 0; i < n; i++) {
      const cb = rafCb;
      rafCb = null;
      if (!cb) return false;
      clock += 1000 / 120;
      calls.length = 0;
      cb(clock);
      if (i % 200 === 199) await tick();
    }
    return true;
  }

  async function driveUntil(
    pred: () => boolean,
    max: number,
  ): Promise<boolean> {
    for (let i = 0; i < max; i++) {
      await drive(1);
      if (pred()) return true;
      if (i % 200 === 199) await tick();
    }
    return pred();
  }

  function keyDown(key: string) {
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key }));
  }
  function keyUp(key: string) {
    window.dispatchEvent(new window.KeyboardEvent('keyup', { key }));
  }

  return {
    dom,
    window: window as Window & typeof globalThis,
    doc,
    calls,
    drive,
    driveUntil,
    keyDown,
    keyUp,
    scriptErrors,
    tick,
  };
}

/** Euclidean distance between two [x, y] points. */
const dist2 = (a: number[] | null, b: number[] | null) =>
  a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : Infinity;

// ---------------------------------------------------------------------------
// v67 (the Lucid demo shell, Iteration 10 + Iteration 11 thinker)
// ---------------------------------------------------------------------------

describe('v67 movement split — arrows = reticle, WASD = eye, field at center', () => {
  test(
    'the field starts at the center, leaves it on arrows, and returns on WASD and on C',
    async () => {
      const h = loadShell('matrix-synth-v67.html');
      const shellLine = () =>
        h.doc.getElementById('shell')?.textContent ?? '';
      const anchor = () =>
        h.doc.getElementById('anchorLine')?.textContent ?? '';
      const canvas = h.doc.querySelector('canvas');
      const W = canvas?.width || 1024;
      const H = canvas?.height || 768;

      // The emergency fallback blueprint loads at init; the shell line
      // names it once setActiveShell has run.
      expect(
        await h.driveUntil(() => shellLine().includes('SHELL_'), 600),
      ).toBe(true);
      expect(h.scriptErrors).toEqual([]);

      // The field arc: the FIRST (arc -> clip) pair in the frame whose
      // radius is 0.5–0.7x the lens radius. The field is drawn before the
      // thinker's pupil (same shape, R*0.55), so the first pair is the
      // field. R_est is the largest arc radius centered on the canvas.
      const fieldArc = (): { x: number; y: number } | null => {
        const centerArcs = h.calls.filter(
          (c) =>
            c[0] === 'arc' &&
            Math.abs((c[1] as number) - W / 2) < 1 &&
            Math.abs((c[2] as number) - H / 2) < 1,
        );
        const rEst = centerArcs.length
          ? Math.max(...centerArcs.map((c) => c[3] as number))
          : 0;
        if (!rEst) return null;
        for (let i = 0; i + 1 < h.calls.length; i++) {
          const a = h.calls[i];
          const b = h.calls[i + 1];
          if (
            a[0] === 'arc' &&
            b[0] === 'clip' &&
            (a[3] as number) > 0.5 * rEst &&
            (a[3] as number) < 0.7 * rEst
          ) {
            return { x: a[1] as number, y: a[2] as number };
          }
        }
        return null;
      };
      const fieldDist = () => {
        const f = fieldArc();
        return f ? Math.hypot(f.x - W / 2, f.y - H / 2) : null;
      };

      // 1. On load the field IS at the center (the snap in setActiveShell).
      await h.drive(30);
      const d0 = fieldDist();
      expect(d0).not.toBeNull();
      expect(d0!).toBeLessThan(3);
      const anchor0 = anchor();
      expect(anchor0).toMatch(/f\d+\/i\d+\/j\d+/);
      await h.drive(10);
      expect(fieldDist()).toBeCloseTo(d0!, 6);

      // 2. Arrow keys move the RETICLE: the field leaves the center and the
      // reticle tile changes. The eye does not move.
      h.keyDown('ArrowUp');
      await h.drive(90);
      h.keyUp('ArrowUp');
      await h.drive(30);
      const dArrows = fieldDist();
      expect(dArrows).not.toBeNull();
      expect(dArrows!).toBeGreaterThan(5);
      expect(anchor()).not.toBe(anchor0);

      // 3. WASD moves the EYE — and the reticle resnaps onto it, so the
      // field comes back to the center. The reticle tile changes too: the
      // reticle is riding on the eye, which has moved to a new tile.
      h.keyDown('w');
      await h.drive(90);
      h.keyUp('w');
      await h.drive(90);
      const dWasd = fieldDist();
      expect(dWasd).not.toBeNull();
      expect(dWasd!).toBeLessThan(3);
      const anchorWasd = anchor();
      expect(anchorWasd).not.toBe(anchor0);

      // 4. C ("Center Reticle") snaps the reticle back onto the eye: the
      // field returns to the center, and the reticle tile is the eye's
      // tile again (the post-WASD tile — NOT the canonical-apex tile the
      // old C used to snap to).
      h.keyDown('ArrowLeft');
      await h.drive(60);
      h.keyUp('ArrowLeft');
      await h.drive(30);
      expect(fieldDist()!).toBeGreaterThan(5);
      h.keyDown('c');
      h.keyUp('c');
      await h.drive(60);
      expect(fieldDist()!).toBeLessThan(3);
      expect(anchor()).toBe(anchorWasd);

      expect(h.scriptErrors).toEqual([]);
      h.dom.window.close();
    },
    60000,
  );
});

// ---------------------------------------------------------------------------
// Iteration 8 (the real shell)
// ---------------------------------------------------------------------------

describe('Iteration 8 movement split — arrows = probe, WASD = eye, eye at center', () => {
  test(
    'WASD moves the eye not the probe, arrows move the probe not the eye, C returns the eye to the origin',
    async () => {
      const h = loadShell('matrix-synth-iteration8.html');
      const hud = () => h.doc.getElementById('state')?.textContent ?? '';

      expect(
        await h.driveUntil(
          () => hud().includes('waiting=UPLOAD_BLUEPRINT'),
          20,
        ),
      ).toBe(true);

      const input = h.doc.getElementById('file') as unknown as Record<
        string,
        unknown
      >;
      const text = fs.readFileSync(
        path.join(
          process.cwd(),
          'public',
          'synth',
          'iteration8',
          'blueprint_octagon.json',
        ),
        'utf8',
      );
      const file = new h.window.File([text], 'blueprint_octagon.json', {
        type: 'application/json',
      });
      Object.defineProperty(input, 'files', {
        value: [file],
        configurable: true,
      });
      (input as unknown as HTMLElement).dispatchEvent(
        new h.window.Event('change', { bubbles: true }),
      );
      await h.tick();
      await h.tick();
      await new Promise<void>((resolve) => setTimeout(resolve, 10));

      expect(
        await h.driveUntil(
          () =>
            hud().includes('EMPTY_REPO_READY') ||
            hud().includes('SAFE_MODE'),
          4000,
        ),
      ).toBe(true);
      expect(hud()).toContain('EMPTY_REPO_READY');
      expect(hud()).not.toContain('SAFE_MODE');
      expect(h.scriptErrors).toEqual([]);

      // Observables, all from what the shell draws:
      // - probe tile: the scanner title's tile (moves only with the probe).
      // - box: the scanner box's [x, y] (shifts while the eye is moving,
      //   because the camera lags the eye; back at rest once it catches up).
      // - grid fingerprint: the drawn grid geometry, coords rounded to 3
      //   decimals (rotates when the eye moves; stable at rest).
      const probeTile = () =>
        h.calls.find(
          (c) =>
            c[0] === 'fillText' &&
            (c[1] as string).startsWith('SYNTHESIS SCANNER'),
        )?.[1] as string | undefined;
      const box = (): number[] | null => {
        const rs = h.calls.filter((c) => c[0] === 'roundRect');
        return rs.length ? [rs[rs.length - 1][1], rs[rs.length - 1][2]] as number[] : null;
      };
      const gridFp = () =>
        JSON.stringify(
          h.calls
            .filter((c) => c[0] === 'moveTo' || c[0] === 'lineTo')
            .slice(0, 200)
            .map((c) => [
              c[0],
              Math.round((c[1] as number) * 1000) / 1000,
              Math.round((c[2] as number) * 1000) / 1000,
            ]),
        );

      // Let the probe finish its slerp to the last route tile, so the
      // tile cannot change from residual probe motion during the WASD phase.
      await h.drive(60);
      const tile0 = probeTile();
      const box0 = box();
      const fp0 = gridFp();
      expect(tile0).toBeDefined();
      expect(box0).not.toBeNull();
      await h.drive(10);
      expect(gridFp()).toBe(fp0);

      // 1. WASD moves the EYE, not the probe: while W is held the box
      // shifts (the camera lags the moving eye) and the grid rotates; the
      // probe tile does not change. After a long settle the camera has
      // caught up (box back at rest) but the grid stays rotated — the eye
      // is somewhere new.
      h.keyDown('w');
      await h.drive(30);
      const boxHeld = box();
      const fpHeld = gridFp();
      expect(dist2(boxHeld, box0)).toBeGreaterThan(1);
      expect(fpHeld).not.toBe(fp0);
      await h.drive(30);
      h.keyUp('w');
      await h.drive(300);
      expect(probeTile()).toBe(tile0);
      expect(gridFp()).not.toBe(fp0);
      expect(dist2(box(), box0)).toBeLessThan(0.5);

      // 2. Arrow keys move the PROBE, not the eye: the probe tile changes
      // while the box and the grid stay exactly where the eye left them.
      const fpW = gridFp();
      const boxW = box();
      h.keyDown('ArrowUp');
      await h.drive(90);
      h.keyUp('ArrowUp');
      expect(
        await h.driveUntil(() => probeTile() !== tile0, 240),
      ).toBe(true);
      await h.drive(120);
      expect(probeTile()).not.toBe(tile0);
      expect(dist2(box(), boxW)).toBeLessThan(0.5);
      expect(gridFp()).toBe(fpW);
      const tileArrows = probeTile();

      // 3. C snaps the EYE back to the shell origin: after a long settle
      // the box is back at its load-time rest position. The probe is
      // untouched by C.
      h.keyDown('c');
      h.keyUp('c');
      await h.drive(300);
      expect(dist2(box(), box0)).toBeLessThan(0.5);
      expect(probeTile()).toBe(tileArrows);

      expect(h.scriptErrors).toEqual([]);
      h.dom.window.close();
    },
    60000,
  );
});
