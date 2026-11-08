/**
 * Synth tests — Phase 1 scaffold.
 *
 * Covers Gary's design requirements (2026-11-04):
 * 1. Seed determinism: same seed -> identical Neural Synth scene.
 * 2. Empty shell: boots in WAIT_BLUEPRINT with NOTHING mounted, no crash,
 *    no placeholder synth forced in.
 * 3. Mount accepts Lucifer as the synth embodiment DESPITE the Sentinel
 *    classification — the mount gate is role-based, never classification.
 * 4. Generic plugin shells: Lucifer is the first instance; the mount logic
 *    does not hardcode it.
 * 5. Vendored v67 shell smoke: patch present, mount gate present,
 *    WAIT_BLUEPRINT present, and no avatar wiring remains.
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, test, expect, beforeEach } from 'vitest';
import {
  NEURAL_CATEGORIES,
  DEFAULT_SYNTH_SEED,
  LUCIFER_EMBODIMENT,
  PLUGIN_SHELLS,
  buildNeuralScene,
  canMountEmbodiment,
  categoryColors,
  seededColor,
  SynthEmbodiment,
} from '../src/types/synth';
import { useSynthStore } from '../src/stores/synthStore';

// ---------------------------------------------------------------------------
// Seed determinism (Iteration 11 engine math)
// ---------------------------------------------------------------------------

describe('neural scene determinism', () => {
  test('same seed builds an identical scene', () => {
    const a = buildNeuralScene(DEFAULT_SYNTH_SEED);
    const b = buildNeuralScene(DEFAULT_SYNTH_SEED);
    expect(a).toEqual(b);
  });

  test('scene has the engine shape: 22 nodes, 900 voxels, 14 rings, 50 links, 8 categories', () => {
    const scene = buildNeuralScene(DEFAULT_SYNTH_SEED);
    expect(scene.nodes).toHaveLength(22);
    expect(scene.voxels).toHaveLength(900);
    expect(scene.rings).toHaveLength(14);
    expect(scene.links).toHaveLength(50);
    expect(Object.keys(scene.categoryColors)).toHaveLength(8);
    for (const c of NEURAL_CATEGORIES) {
      expect(scene.categoryColors[c]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  test('nodes cycle through the 8 categories in order', () => {
    const scene = buildNeuralScene(DEFAULT_SYNTH_SEED);
    scene.nodes.forEach((n, i) => {
      expect(n.category).toBe(NEURAL_CATEGORIES[i % 8]);
    });
  });

  test('a different seed changes at least one category colour', () => {
    const a = categoryColors(DEFAULT_SYNTH_SEED);
    const b = categoryColors('AAAAAAAAAAAAAAAA');
    const changed = NEURAL_CATEGORIES.some((c) => a[c] !== b[c]);
    expect(changed).toBe(true);
  });

  test('seededColor is stable for a name+seed pair', () => {
    expect(seededColor('planner', DEFAULT_SYNTH_SEED)).toBe(
      seededColor('planner', DEFAULT_SYNTH_SEED),
    );
    expect(seededColor('planner', DEFAULT_SYNTH_SEED)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

// ---------------------------------------------------------------------------
// Mount model — classification-agnostic (Gary's test case)
// ---------------------------------------------------------------------------

describe('mount gate (classification-agnostic)', () => {
  test('accepts a Sentinel-classified embodiment with the synth-embodiment role', () => {
    expect(LUCIFER_EMBODIMENT.classification).toBe('Sentinel');
    expect(canMountEmbodiment(LUCIFER_EMBODIMENT)).toBe(true);
  });

  test('accepts ANY classification when the role is synth-embodiment', () => {
    const warden: SynthEmbodiment = {
      id: 'warden',
      name: 'Warden',
      classification: 'Warden',
      role: 'synth-embodiment',
      plugin: 'warden-plugin',
    };
    expect(canMountEmbodiment(warden)).toBe(true);
  });

  test('rejects a wrong role even with a Synth classification', () => {
    const notASynth: SynthEmbodiment = {
      id: 'x',
      name: 'X',
      classification: 'Synth',
      role: 'other-role' as never,
      plugin: 'x',
    };
    expect(canMountEmbodiment(notASynth)).toBe(false);
  });

  test('rejects null / undefined', () => {
    expect(canMountEmbodiment(null)).toBe(false);
    expect(canMountEmbodiment(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Store — empty shell, mount, unmount (generic plugin shells)
// ---------------------------------------------------------------------------

describe('synth store', () => {
  beforeEach(() => {
    // Reset to a clean empty shell before each test (node env: no localStorage).
    useSynthStore.setState({
      activePluginId: 'lucifer',
      seedHex: DEFAULT_SYNTH_SEED,
      selectedTileId: 'tile_0000',
      eyeMode: 'AUTO',
      shellLoaded: false,
      mounts: {},
      bootState: 'WAIT_BLUEPRINT',
    });
  });

  test('empty shell: boots in WAIT_BLUEPRINT with nothing mounted', () => {
    const s = useSynthStore.getState();
    expect(s.bootState).toBe('WAIT_BLUEPRINT');
    expect(s.mounts['lucifer'] ?? null).toBeNull();
    expect(s.shellLoaded).toBe(false);
  });

  test('mountPlugin mounts Lucifer (Sentinel) as the synth embodiment', () => {
    const s = useSynthStore.getState();
    expect(s.mountPlugin('lucifer')).toBe(true);
    const after = useSynthStore.getState();
    expect(after.mounts['lucifer']).toEqual(LUCIFER_EMBODIMENT);
    expect(after.mounts['lucifer']?.classification).toBe('Sentinel');
    expect(after.bootState).toBe('READY');
  });

  test('mountEmbodiment accepts a Sentinel-classified embodiment directly', () => {
    const s = useSynthStore.getState();
    const ok = s.mountEmbodiment('lucifer', {
      id: 'lucifer',
      name: 'Lucifer the Sentinel',
      classification: 'Sentinel',
      role: 'synth-embodiment',
      plugin: 'lucifer-ai',
    });
    expect(ok).toBe(true);
    expect(useSynthStore.getState().bootState).toBe('READY');
  });

  test('mount rejects an unknown plugin shell and a wrong role', () => {
    const s = useSynthStore.getState();
    expect(s.mountPlugin('no-such-plugin')).toBe(false);
    expect(
      s.mountEmbodiment('lucifer', {
        id: 'x',
        name: 'X',
        classification: 'Synth',
        role: 'other-role' as never,
        plugin: 'x',
      }),
    ).toBe(false);
    expect(useSynthStore.getState().bootState).toBe('WAIT_BLUEPRINT');
  });

  test('unmount returns the shell to empty (WAIT_BLUEPRINT)', () => {
    const s = useSynthStore.getState();
    s.mountPlugin('lucifer');
    expect(useSynthStore.getState().bootState).toBe('READY');
    useSynthStore.getState().unmountEmbodiment('lucifer');
    const after = useSynthStore.getState();
    expect(after.mounts['lucifer'] ?? null).toBeNull();
    expect(after.bootState).toBe('WAIT_BLUEPRINT');
  });

  test('generic shell registry: lucifer is the first instance with a shell src', () => {
    expect(PLUGIN_SHELLS['lucifer']).toBeDefined();
    expect(PLUGIN_SHELLS['lucifer'].shellSrc).toMatch(/matrix-synth-v67\.html$/);
    expect(PLUGIN_SHELLS['lucifer'].embodiment).toEqual(LUCIFER_EMBODIMENT);
    expect(PLUGIN_SHELLS['lucifer'].defaultSeed).toBe(DEFAULT_SYNTH_SEED);
  });

  test('setActivePlugin rejects an unknown plugin id', () => {
    const s = useSynthStore.getState();
    s.setActivePlugin('no-such-plugin');
    expect(useSynthStore.getState().activePluginId).toBe('lucifer');
  });

  test('seed validation: bad seeds are ignored', () => {
    const s = useSynthStore.getState();
    s.setSeed('not a hex seed!!');
    expect(useSynthStore.getState().seedHex).toBe(DEFAULT_SYNTH_SEED);
    s.setSeed('abcdef01');
    expect(useSynthStore.getState().seedHex).toBe('ABCDEF01');
  });
});

// ---------------------------------------------------------------------------
// Vendored v67 shell smoke (file content — the scaffold's foundation)
// ---------------------------------------------------------------------------

describe('vendored v67 shell', () => {
  const shellPath = path.join(
    process.cwd(),
    'public',
    'synth',
    'matrix-synth-v67.html',
  );
  const shellSrc = fs.readFileSync(shellPath, 'utf-8');

  test('is the v67 shell and boots in WAIT_BLUEPRINT', () => {
    expect(shellSrc).toContain('WAIT_BLUEPRINT');
    expect(shellSrc).toContain('EYE COMMAND');
    expect(shellSrc).toContain('BUILDER SWARM');
  });

  test('carries the Lucid Neural Synth patch, mounted in the eye', () => {
    expect(shellSrc).toContain('LUCID SYNTH PATCH');
    expect(shellSrc).toContain('ntDrawThinker');
    // World-projected (Gary, 2026-11-08 ~03:55): the eye field is drawn
    // at the eye's projected position (ex, ey), not canvas center.
    expect(shellSrc).toContain('if(eyeVisible) drawSynthEyeField(ex, ey, R);');
  });

  test('thinker is gated on the mount (empty shell shows no thinker)', () => {
    expect(shellSrc).toContain('if(!ntMounted) return;');
    expect(shellSrc).toContain("lucid-synth-mount");
    expect(shellSrc).toContain('setMounted');
    expect(shellSrc).toContain('isMounted');
  });

  test('no avatar wiring remains in the shell patch', () => {
    expect(shellSrc).not.toContain('ntAvatar');
    expect(shellSrc).not.toContain('getAvatar');
    expect(shellSrc).not.toContain('Avatar');
    // The Sentinel aura rings stay, in the fixed magenta palette.
    expect(shellSrc).toContain('Sentinel aura');
    expect(shellSrc).toContain("ntRgba('#ff2d95'");
  });

  test('sibling arc files and blueprints were vendored alongside', () => {
    for (const f of [
      'arc_schema_v54.js',
      'arc_recovery_v54.js',
      'arc_authority_v55.js',
      'arc_validator_v55.js',
    ]) {
      expect(
        fs.existsSync(path.join(process.cwd(), 'public', 'synth', f)),
      ).toBe(true);
    }
    for (const f of [
      'blueprint_octagon.json',
      'module_ship_default.json',
      'module_scanner_default.json',
      'module_hud_default.json',
      'module_probe_default.json',
    ]) {
      expect(
        fs.existsSync(
          path.join(process.cwd(), 'public', 'synth', 'blueprints', f),
        ),
      ).toBe(true);
    }
  });
});

// Eye / reticle anchor model (Gary 2026-11-08 ~01:52–01:58 PST — final
// model, supersedes the 00:53 statement): the neural synth IS the center
// of the blueprint; the eye is locked to the center of the loaded
// blueprint; the spectrum animation (eye field) is at the center; ONLY the
// player reticle is on the outside, and it is the user's pointer sentinel
// — the only thing that moves with W.
describe('synth eye / reticle anchor model', () => {
  const shellPath = path.join(
    process.cwd(),
    'public',
    'synth',
    'matrix-synth-v67.html',
  );
  const shellSrc = fs.readFileSync(shellPath, 'utf-8');

  test('neural synth is the center of the blueprint (the core)', () => {
    // World-projected (Gary, 2026-11-08 ~03:55 — af90dd2 was broken):
    // the thinker is drawn at the eye's projected position (ex, ey), NOT
    // canvas center (cx, cy). Canvas center is the camera's look-at point
    // and the camera follows the reticle, so (cx, cy) IS the reticle.
    expect(shellSrc).toContain('if(eyeVisible) ntDrawThinker(ex, ey, R);');
    expect(shellSrc).not.toContain('ntDrawThinker(cx, cy, R);');
    expect(shellSrc).toContain(
      'The NEURAL SYNTH (ntDrawThinker) IS the center of the blueprint',
    );
  });

  test('eye is locked to the center of the loaded blueprint (shell origin)', () => {
    expect(shellSrc).toContain(
      'eye = (sh && sh.origin) ? norm(sh.origin) : norm({x:0,y:0,z:1});',
    );
    // World-projected (Gary, 2026-11-08 ~03:55): the eye ship is drawn at
    // the eye's projected position (ex, ey) at both draw sites, hidden
    // when the eye is on the far side — never at canvas center (the reticle).
    expect(shellSrc).toContain('if(eyeVisible) drawEyeShip(ex, ey, R);');
    expect(shellSrc).not.toContain('drawEyeShip(cx, cy, R);');
    expect(shellSrc).toContain('const eyeP = projectDir(eye);');
  });

  test('spectrum animation (eye field) is at the center, not outside', () => {
    // World-projected (Gary, 2026-11-08 ~03:55): the eye field is drawn
    // at the eye's projected position (ex, ey), not canvas center.
    expect(shellSrc).toContain('if(eyeVisible) drawSynthEyeField(ex, ey, R);');
    expect(shellSrc).not.toContain('drawSynthEyeField(cx, cy, R);');
    expect(shellSrc).toContain(
      'the spectrum animation (the eye field) is at the center around the',
    );
  });

  test('reticle is the only outside element — the user\'s pointer sentinel', () => {
    expect(shellSrc).toContain('function reticleScreenPos(cx, cy, R)');
    expect(shellSrc).toContain('drawReticle(rp.x, rp.y);');
    expect(shellSrc).toContain('POINTER SENTINEL FOR THE');
    // World-projected (Gary, 2026-11-08 ~03:55): the reticle orbits the
    // EYE (the blueprint center, ex/ey), not canvas center (the reticle's
    // own look-at point). Canvas center as the orbit center would put the
    // reticle on the eye's position.
    expect(shellSrc).toContain('reticleScreenPos(ex, ey, R)');
    expect(shellSrc).not.toContain('const rp = reticleScreenPos(cx, cy, R);');
  });

  test('W moves the reticle, not the eye', () => {
    expect(shellSrc).toContain(
      'reticleDir = norm(rotateAroundAxis(reticleDir, axis, ang));',
    );
    expect(shellSrc).not.toContain(
      'eye = norm(rotateAroundAxis(eye, axis, ang));',
    );
    expect(shellSrc).toContain('function reticleStep(){');
    expect(shellSrc).not.toContain('function eyeStep(){');
  });

  test('no stale reticle-center lock remains', () => {
    expect(shellSrc).not.toContain('drawCenterReticle');
    expect(shellSrc).not.toContain('lock=RETICLE');
    expect(shellSrc).not.toContain(
      'intentionally locked to the reticle center',
    );
    expect(shellSrc).toContain('lock=CENTER');
  });
});

// HUD panels are solid and borderless (Gary 2026-11-05): the synth
// windows were blurry (frosted glass, backdrop blur) with a visible
// outline line around them. The panels are solid dark cards now — no
// backdrop blur, no border, opaque backgrounds. The soft box-shadow
// glows stay; they are not lines.
describe('synth HUD panels are solid and borderless', () => {
  const shellPath = path.join(
    process.cwd(),
    'public',
    'synth',
    'matrix-synth-v67.html',
  );
  const shellSrc = fs.readFileSync(shellPath, 'utf-8');

  test('no backdrop blur anywhere in the shell', () => {
    expect(shellSrc).not.toContain('backdrop-filter');
  });

  // [css selector, expected solid background] for each floating panel.
  // The group rule covers three panels in one declaration.
  const panels: Array<[string, string]> = [
    ['#overlay', 'background:#000000;'],
    ['#vstrip', 'background:#000000;'],
    ['#vpanel', 'background:#000000;'],
    [
      '#probePanel',
      'background:linear-gradient(180deg, rgb(34,10,44), rgb(20,8,30));',
    ],
    [
      '#microReceiptPanel',
      'background:linear-gradient(180deg, rgb(16,18,34), rgb(10,12,24));',
    ],
    [
      '#writebackPanel,#commandHistoryPanel,#builderSwarmPanel',
      'background:#000000;',
    ],
  ];

  test.each(panels)('%s has no border and a solid background', (selector, background) => {
    const escaped = selector.replace(/[#.]/g, '\\$&');
    const rule = shellSrc.match(new RegExp(`${escaped}\\{[^}]*\\}`));
    expect(rule, `${selector} rule present`).not.toBeNull();
    expect(rule![0]).not.toContain('border:');
    expect(rule![0]).toContain(background);
  });

  test('eyePanel (inline style) has no border and a solid background', () => {
    const style = shellSrc.match(/id="eyePanel" style="([^"]*)"/);
    expect(style, 'eyePanel style present').not.toBeNull();
    expect(style![1]).not.toContain('border:');
    expect(style![1]).not.toContain('backdrop-filter');
    expect(style![1]).toContain('background:#000000;');
  });

  // No scroll-edge highlights (Gary 2026-11-06): the panels had
  // horizontal gradient strips at their top and bottom edges
  // (::before top / ::after bottom, sticky, 8px) that faded in while
  // scrolling (.edge-top / .edge-bottom). They are removed — no edge
  // highlight on any panel, top or bottom.
  test('no scroll-edge top/bottom gradient highlights on any panel', () => {
    expect(shellSrc).not.toContain('.edge-top::before');
    expect(shellSrc).not.toContain('.edge-bottom::after');
    expect(shellSrc).not.toContain('#vpanel::before,#vpanel::after');
    expect(shellSrc).not.toContain(
      '#probePanel::before,#probePanel::after,#probeQueueList::before,#probeQueueList::after',
    );
    expect(shellSrc).not.toContain(
      '#microReceiptPanel::before,#microReceiptPanel::after,#microReceiptList::before,#microReceiptList::after',
    );
    expect(shellSrc).not.toContain(
      '#writebackPanel::before,#writebackPanel::after,#commandHistoryPanel::before',
    );
  });
});
