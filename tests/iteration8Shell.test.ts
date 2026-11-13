/**
 * Iteration 8, properly in — the REAL shell (2026-11-12).
 *
 * Covers Gary's order (~15:27-15:28 PST): "fix all its issues and get
 * it in" + "go through everything and get it up and going in lucid
 * now". The shell is iteration8/index.html, the ONLY Iteration 8
 * that exists — NOT the TS port (src/lib/synthBlueprint.ts etc.),
 * which re-implemented the design and is not Iteration 8.
 *
 * 1. Registry: PLUGIN_SHELLS['iteration8'] — id/seed/name derived
 *    from the repo (folder / seed-input default 7F021AE4 / shell
 *    title), the vendored shell file, a Shell-classified embodiment
 *    (mount is role-gated, never classification).
 * 2. Store: switching to Iteration 8 seeds from the shell's own
 *    default, clears the iframe state, never builds a Voxel
 *    Directory for it (it is a blueprint shell — the directory is
 *    the demo flow's structure), and mounts only on the shell's own
 *    reported READY (the TS machine never sees the shell's boot).
 * 3. The shell itself, run for real in jsdom: the vendored file
 *    starts EMPTY, uploads the octagon blueprint + all three module
 *    JSONs, and reaches EMPTY_REPO_READY with no SAFE_MODE. This
 *    test FAILS against the repo original (pivotVerified never
 *    initialized, logPush/safeFail never defined, the HUD script's
 *    `hooks = {...}` throwing under "use strict") — the fixes in
 *    public/synth/matrix-synth-iteration8.html are what make it pass.
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, test, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  DEFAULT_PLUGIN_ID,
  DEFAULT_SYNTH_SEED,
  ITERATION8_DEFAULT_SEED,
  ITERATION8_EMBODIMENT,
  PLUGIN_SHELLS,
  canMountEmbodiment,
} from '../src/types/synth';
import { useSynthStore } from '../src/stores/synthStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { createMachine } from '../src/lib/synthBoot';
import {
  DEFAULT_MODULES,
  DEFAULT_SHELL_BLUEPRINT,
} from '../src/lib/synthBlueprint';
import { createCreatorBuild } from '../src/lib/synthDisclaimer';

// ---------------------------------------------------------------------------
// Registry — derived from the repo, not invented
// ---------------------------------------------------------------------------

describe('Iteration 8 registry', () => {
  test('the entry exists with the repo-derived spec', () => {
    const spec = PLUGIN_SHELLS['iteration8'];
    expect(spec).toBeDefined();
    expect(spec.pluginId).toBe('iteration8');
    // Name from the shell's own title: "Synth — Dynamic Modules Shell (v2)".
    expect(spec.name).toContain('Iteration 8');
    expect(spec.name).toContain('Dynamic Modules Shell');
    // Shell src is the vendored real shell, not the v67 demo.
    expect(spec.shellSrc).toMatch(/matrix-synth-iteration8\.html$/);
    expect(spec.shellSrc).not.toMatch(/v67/);
    // Seed from the shell's own seed-input default (7F021AE4).
    expect(spec.defaultSeed).toBe('7F021AE4');
    expect(spec.defaultSeed).toBe(ITERATION8_DEFAULT_SEED);
    // The shell manages its own boot/build state in the iframe.
    expect(spec.managesOwnState).toBe(true);
  });

  test('the demo stays the default — Iteration 8 sits alongside it', () => {
    expect(DEFAULT_PLUGIN_ID).toBe('lucifer');
    expect(PLUGIN_SHELLS['lucifer']).toBeDefined();
    expect(PLUGIN_SHELLS['lucifer'].managesOwnState).toBeFalsy();
    expect(Object.keys(PLUGIN_SHELLS).sort()).toEqual([
      'iteration8',
      'lucifer',
    ]);
  });

  test('the embodiment is a Shell, and the mount gate takes it on role', () => {
    expect(ITERATION8_EMBODIMENT.id).toBe('iteration8');
    expect(ITERATION8_EMBODIMENT.name).toBe('Iteration 8');
    // A blueprint shell, not a Sentinel — classification is
    // descriptive only; the mount gate checks role, never this.
    expect(ITERATION8_EMBODIMENT.classification).toBe('Shell');
    expect(ITERATION8_EMBODIMENT.classification).not.toBe('Sentinel');
    expect(ITERATION8_EMBODIMENT.role).toBe('synth-embodiment');
    expect(ITERATION8_EMBODIMENT.plugin).toBe('iteration8');
    expect(canMountEmbodiment(ITERATION8_EMBODIMENT)).toBe(true);
  });

  test('the vendored shell + its JSONs exist on disk', () => {
    expect(
      fs.existsSync(
        path.join(process.cwd(), 'public', 'synth', 'matrix-synth-iteration8.html'),
      ),
    ).toBe(true);
    for (const f of [
      'blueprint_octagon.json',
      'module_ship_default.json',
      'module_scanner_default.json',
      'module_hud_default.json',
    ]) {
      expect(
        fs.existsSync(path.join(process.cwd(), 'public', 'synth', 'iteration8', f)),
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Store — Iteration 8's own state rules
// ---------------------------------------------------------------------------

describe('Iteration 8 store', () => {
  beforeEach(() => {
    // Reset to a clean empty shell before each test (node env: no localStorage).
    useSynthStore.setState({
      activePluginId: 'lucifer',
      seedHex: DEFAULT_SYNTH_SEED,
      selectedTileId: 'tile_0000',
      eyeMode: 'AUTO',
      machine: createMachine(),
      iframeShellState: null,
      modules: { ship: null, scanner: null, hud: null },
      mounts: {},
      directories: {},
      localAccessSessionGranted: false,
    });
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: { ...base, synthDemoReplaced: false, synthOwnBuild: null },
    });
  });

  /** Flip the directory gate on (demo permanently replaced + a saved creation). */
  function openDirectoryGate() {
    const build = createCreatorBuild(
      'iteration-8',
      DEFAULT_SYNTH_SEED,
      'pink',
      DEFAULT_SHELL_BLUEPRINT,
      DEFAULT_MODULES,
    );
    expect(build).not.toBeNull();
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: { ...base, synthDemoReplaced: true, synthOwnBuild: build },
    });
  }

  test('switching to Iteration 8 seeds from the shell default and clears iframe state', () => {
    const s = useSynthStore.getState();
    s.setActivePlugin('iteration8');
    const after = useSynthStore.getState();
    expect(after.activePluginId).toBe('iteration8');
    expect(after.seedHex).toBe('7F021AE4');
    expect(after.machine.boot).toBe('WAIT_BLUEPRINT');
    expect(after.machine.build).toBe('IDLE');
    expect(after.iframeShellState).toBeNull();
  });

  test('iframe state is ignored while the demo shell is active', () => {
    const s = useSynthStore.getState();
    s.setIframeShellState({
      boot: 'READY',
      build: 'EMPTY_REPO_READY',
      shellId: 'SHELL_OCTAGON_ALPHA',
      seed: '7F021AE4',
      routeTiles: 16,
      mappedCount: 16,
      receipts: 42,
    });
    expect(useSynthStore.getState().iframeShellState).toBeNull();
  });

  test('iframe state is recorded once Iteration 8 is active', () => {
    const s = useSynthStore.getState();
    s.setActivePlugin('iteration8');
    s.setIframeShellState({
      boot: 'READY',
      build: 'EMPTY_REPO_READY',
      shellId: 'SHELL_OCTAGON_ALPHA',
      seed: '7F021AE4',
      routeTiles: 16,
      mappedCount: 16,
      receipts: 42,
    });
    const after = useSynthStore.getState();
    expect(after.iframeShellState?.boot).toBe('READY');
    expect(after.iframeShellState?.shellId).toBe('SHELL_OCTAGON_ALPHA');
    expect(after.iframeShellState?.mappedCount).toBe(16);
  });

  test('mount needs the shell’s own READY — not the TS machine’s', () => {
    const s = useSynthStore.getState();
    s.setActivePlugin('iteration8');
    // No iframe report yet: refused.
    expect(s.mountPlugin('iteration8')).toBe(false);
    // Reported but still booting: refused.
    s.setIframeShellState({
      boot: 'WAIT_BLUEPRINT',
      build: 'IDLE',
      shellId: null,
      seed: '7F021AE4',
      routeTiles: 0,
      mappedCount: 0,
      receipts: 0,
    });
    expect(s.mountPlugin('iteration8')).toBe(false);
    // The shell itself reached READY: mounts, role-gated as usual.
    s.setIframeShellState({
      boot: 'READY',
      build: 'EMPTY_REPO_READY',
      shellId: 'SHELL_OCTAGON_ALPHA',
      seed: '7F021AE4',
      routeTiles: 16,
      mappedCount: 16,
      receipts: 42,
    });
    expect(s.mountPlugin('iteration8')).toBe(true);
    expect(useSynthStore.getState().mounts['iteration8']).toBe(
      ITERATION8_EMBODIMENT,
    );
  });

  test('Iteration 8 never gets a Voxel Directory, even with the gate open', () => {
    openDirectoryGate();
    const s = useSynthStore.getState();
    // Control: the demo shell DOES get one when the gate is met.
    s.setActivePlugin('lucifer');
    expect(
      useSynthStore.getState().directories['lucifer'],
    ).toBeDefined();
    // Iteration 8 does not — on switch or on refresh.
    s.setActivePlugin('iteration8');
    expect(
      useSynthStore.getState().directories['iteration8'],
    ).toBeUndefined();
    s.refreshDirectory();
    expect(
      useSynthStore.getState().directories['iteration8'],
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The shell itself, run for real (jsdom + stubbed canvas + manual rAF)
// ---------------------------------------------------------------------------

describe('Iteration 8 shell (vendored, real file)', () => {
  const shellPath = path.join(
    process.cwd(),
    'public',
    'synth',
    'matrix-synth-iteration8.html',
  );
  const jsonDir = path.join(process.cwd(), 'public', 'synth', 'iteration8');
  const readJson = (name: string) =>
    fs.readFileSync(path.join(jsonDir, name), 'utf8');

  test(
    'blueprint + modules reach EMPTY_REPO_READY, no SAFE_MODE',
    async () => {
      const html = fs.readFileSync(shellPath, 'utf8');
      const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
      expect(script).toBeTruthy();
      // Strip the script out of the HTML: it is injected below, after
      // the stubs are in place (window.eval runs outside the jsdom
      // realm, so bare `document` does not resolve there).
      const htmlWithoutScript = html.replace(
        /<script>[\s\S]*<\/script>/,
        '',
      );

      const dom = new JSDOM(htmlWithoutScript, {
        url: 'http://localhost/',
        pretendToBeVisual: true,
        runScripts: 'dangerously',
      });
      const { window } = dom;
      const doc = window.document;

      // --- stubs, before the script runs ---
      // requestAnimationFrame: capture the callback; the test drives it.
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
      // Manual clock: one 120 Hz step per driven frame.
      (window.performance as unknown as { now: () => number }).now =
        () => clock;
      // Canvas 2D: a plain no-op stub (fast — no Proxy trap per call;
      // the shell draws ~10k grid segments per frame).
      const noop = () => {};
      const gradient = { addColorStop: noop };
      const ctxStub = {
        beginPath: noop,
        moveTo: noop,
        lineTo: noop,
        stroke: noop,
        fill: noop,
        arc: noop,
        fillRect: noop,
        clearRect: noop,
        save: noop,
        restore: noop,
        fillText: noop,
        strokeText: noop,
        closePath: noop,
        clip: noop,
        translate: noop,
        scale: noop,
        rotate: noop,
        setTransform: noop,
        resetTransform: noop,
        setLineDash: noop,
        roundRect: noop,
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

      // jsdom has no CanvasRenderingContext2D global (no canvas
      // package) — the shell's roundRect polyfill check reads it, so
      // define a stand-in. The shell never uses it beyond that check:
      // its ctx comes from the getContext stub above.
      class FakeCtx2D {}
      (window as unknown as Record<string, unknown>).CanvasRenderingContext2D =
        FakeCtx2D;

      // State posts from the shell (it posts to window.parent, which
      // is this window in jsdom).
      const posted: unknown[] = [];
      window.addEventListener('message', (ev: MessageEvent) => {
        posted.push(ev.data);
      });
      // Script errors surface here (jsdom reports them via the error
      // event instead of throwing from the append) — collected so a
      // failure names the real cause instead of a stale HUD.
      const scriptErrors: string[] = [];
      window.addEventListener('error', (ev: ErrorEvent) => {
        scriptErrors.push(String(ev.message || ev.error || 'error'));
      });

      // --- run the real script ---
      const scriptEl = doc.createElement('script');
      scriptEl.textContent = script!;
      doc.body.appendChild(scriptEl);

      const hud = () => doc.getElementById('state')?.textContent ?? '';
      const shellLine = () =>
        doc.getElementById('shell')?.textContent ?? '';
      const vMods = () => doc.getElementById('vMods')?.textContent ?? '';
      const tick = () =>
        new Promise<void>((resolve) => setTimeout(resolve, 0));

      async function driveUntil(
        pred: () => boolean,
        maxFrames: number,
      ): Promise<boolean> {
        for (let i = 0; i < maxFrames; i++) {
          const cb = rafCb;
          rafCb = null;
          if (!cb) return false;
          clock += 1000 / 120;
          cb(clock);
          if (pred()) return true;
          if (i % 200 === 199) await tick();
        }
        return pred();
      }

      async function upload(
        inputId: string,
        filename: string,
        text: string,
      ) {
        const input = doc.getElementById(inputId) as unknown as Record<
          string,
          unknown
        >;
        const file = new window.File([text], filename, {
          type: 'application/json',
        });
        Object.defineProperty(input, 'files', {
          value: [file],
          configurable: true,
        });
        (input as unknown as HTMLElement).dispatchEvent(
          new window.Event('change', { bubbles: true }),
        );
        // FileReader / Blob.text() complete asynchronously.
        await tick();
        await tick();
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
      }

      // Starts EMPTY until a blueprint is uploaded (the design).
      expect(
        await driveUntil(
          () => hud().includes('waiting=UPLOAD_BLUEPRINT'),
          20,
        ),
      ).toBe(true);

      // Upload the octagon blueprint through the shell's own input.
      await upload('file', 'blueprint_octagon.json', readJson('blueprint_octagon.json'));

      // Boot + build to EMPTY_REPO_READY (or fail loudly on SAFE_MODE).
      const reached = await driveUntil(
        () =>
          hud().includes('EMPTY_REPO_READY') ||
          hud().includes('SAFE_MODE'),
        4000,
      );
      expect(reached).toBe(true);
      expect(hud()).toContain('EMPTY_REPO_READY');
      expect(hud()).not.toContain('SAFE_MODE');
      expect(shellLine()).toContain('SHELL_OCTAGON_ALPHA');

      // The shell posted its state to the parent along the way.
      await tick();
      const readyPost = posted.find(
        (p) =>
          !!p &&
          typeof p === 'object' &&
          (p as { type?: unknown }).type === 'iteration8-shell-state' &&
          (p as { build?: unknown }).build === 'EMPTY_REPO_READY',
      );
      expect(readyPost).toBeDefined();

      // Upload all three module JSONs through the shell's own inputs —
      // including the HUD module, whose script field the port rejected
      // and whose `hooks = {...}` threw under "use strict".
      await upload('fileShip', 'module_ship_default.json', readJson('module_ship_default.json'));
      await upload('fileScanner', 'module_scanner_default.json', readJson('module_scanner_default.json'));
      await upload('fileHud', 'module_hud_default.json', readJson('module_hud_default.json'));

      // A few more frames: still built, still no SAFE_MODE, and the
      // validator panel now lists all three lanes.
      await driveUntil(() => vMods().includes('ship'), 30);
      expect(vMods()).toContain('ship');
      expect(vMods()).toContain('scanner');
      expect(vMods()).toContain('hud');
      expect(hud()).toContain('EMPTY_REPO_READY');
      expect(hud()).not.toContain('SAFE_MODE');
      expect(scriptErrors).toEqual([]);

      dom.window.close();
    },
    30000,
  );
});
