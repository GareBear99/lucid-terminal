/**
 * Synth tests — Phase 1 scaffold, updated for the Iteration 8 proper
 * port (2026-11-12).
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
 * 6. Mount via the machine (2026-11-12): the mount needs the ping
 *    handshake — the machine READY with a NOOP GRANT receipt. Mounting
 *    before boot is refused. Unmounting leaves boot READY (boot is a
 *    property of the shell+blueprint, not the mount).
 * 7. Placement (Gary, 2026-11-08 ~03:55, af90dd2 — proved by Gary
 *    with a scroll): the v67 shell draws thinker/field/ship at the
 *    eye's world-projected position (ex, ey) = projectDir(eye),
 *    gated on eyeVisible. Canvas centre (cx, cy) IS the reticle
 *    (cameraStep builds the camera from reticleDir); the world
 *    origin (0,0,0) is empty and unprojectable. The neural scene
 *    cloud is centred in its own local frame only. (The Iteration 8
 *    port's 2026-11-12 "center rule" — (cx, cy) = world origin,
 *    thinker drawn there always — was wrong and was reverted;
 *    see ~/workspace/iteration8-spatial-placements-2026-11-12.md §7.)
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
import { createMachine } from '../src/lib/synthBoot';

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

  test('scene centroid is near its local-frame origin — the Neural Synth cloud is centered in its own frame, not offset to the surface', () => {
    const scene = buildNeuralScene(DEFAULT_SYNTH_SEED);
    const points = [...scene.voxels, ...scene.nodes];
    const n = points.length;
    const cx = points.reduce((s, p) => s + p.x, 0) / n;
    const cy = points.reduce((s, p) => s + p.y, 0) / n;
    const cz = points.reduce((s, p) => s + p.z, 0) / n;
    // The scene spans ~±200 units; a centered scene's mean is a few
    // units from its local origin. An offset-to-the-surface scene would
    // sit ~200 units out. 15 is comfortably above the noise, far
    // below any surface offset. (This is the cloud's LOCAL frame only
    // — it says nothing about the shell's world origin, which is empty.)
    expect(Math.abs(cx)).toBeLessThan(15);
    expect(Math.abs(cy)).toBeLessThan(15);
    expect(Math.abs(cz)).toBeLessThan(15);
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
// Store — empty shell, machine boot, mount, unmount (generic plugin shells)
// ---------------------------------------------------------------------------

describe('synth store', () => {
  beforeEach(() => {
    // Reset to a clean empty shell before each test (node env: no localStorage).
    useSynthStore.setState({
      activePluginId: 'lucifer',
      seedHex: DEFAULT_SYNTH_SEED,
      selectedTileId: 'tile_0000',
      eyeMode: 'AUTO',
      machine: createMachine(),
      modules: { ship: null, scanner: null, hud: null },
      mounts: {},
      directories: {},
      localAccessSessionGranted: false,
    });
  });

  /** Boot the active shell's machine to READY (default octagon). */
  function bootToReady() {
    const s = useSynthStore.getState();
    s.loadDefaultShellBlueprint();
    s.setShellReady(true);
    s.runShellMachine();
    const m = useSynthStore.getState().machine;
    expect(m.boot).toBe('READY');
    expect(m.build).toBe('EMPTY_REPO_READY');
  }

  test('empty shell: boots in WAIT_BLUEPRINT with nothing mounted', () => {
    const s = useSynthStore.getState();
    expect(s.machine.boot).toBe('WAIT_BLUEPRINT');
    expect(s.machine.build).toBe('IDLE');
    expect(s.machine.shell).toBeNull();
    expect(s.mounts['lucifer'] ?? null).toBeNull();
  });

  test('mount is refused before the machine boots (no ping handshake yet)', () => {
    const s = useSynthStore.getState();
    expect(s.mountPlugin('lucifer')).toBe(false);
    expect(useSynthStore.getState().mounts['lucifer'] ?? null).toBeNull();
    expect(useSynthStore.getState().machine.boot).toBe('WAIT_BLUEPRINT');
  });

  test('mountPlugin mounts Lucifer (Sentinel) as the synth embodiment once READY', () => {
    bootToReady();
    const s = useSynthStore.getState();
    expect(s.mountPlugin('lucifer')).toBe(true);
    const after = useSynthStore.getState();
    expect(after.mounts['lucifer']).toEqual(LUCIFER_EMBODIMENT);
    expect(after.mounts['lucifer']?.classification).toBe('Sentinel');
    expect(after.machine.boot).toBe('READY');
  });

  test('mountEmbodiment accepts a Sentinel-classified embodiment directly once READY', () => {
    bootToReady();
    const s = useSynthStore.getState();
    const ok = s.mountEmbodiment('lucifer', {
      id: 'lucifer',
      name: 'Lucifer the Sentinel',
      classification: 'Sentinel',
      role: 'synth-embodiment',
      plugin: 'lucifer-ai',
    });
    expect(ok).toBe(true);
    expect(useSynthStore.getState().machine.boot).toBe('READY');
  });

  test('mount rejects an unknown plugin shell and a wrong role', () => {
    bootToReady();
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
    expect(useSynthStore.getState().machine.boot).toBe('READY');
  });

  test('unmount returns the shell to empty but leaves boot READY (boot is the shell, not the mount)', () => {
    bootToReady();
    const s = useSynthStore.getState();
    s.mountPlugin('lucifer');
    expect(useSynthStore.getState().machine.boot).toBe('READY');
    useSynthStore.getState().unmountEmbodiment('lucifer');
    const after = useSynthStore.getState();
    expect(after.mounts['lucifer'] ?? null).toBeNull();
    expect(after.machine.boot).toBe('READY');
    expect(after.machine.build).toBe('EMPTY_REPO_READY');
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
// model, supersedes the 00:53 statement; movement split Gary 2026-11-12
// ~16:38/16:45 PST): the neural synth IS the center of the blueprint; the
// eye is the center of the loaded blueprint; the spectrum animation (eye
// field) is at the center; ONLY the player reticle is on the outside, and
// it is the user's pointer sentinel. WASD moves the EYE (the original
// movement) and the reticle resnaps onto it, so the field stays at the
// center; the ARROW KEYS move the reticle. (Placement, Gary 2026-11-08
// ~03:55, af90dd2: drawn at the eye's world-projected position (ex, ey),
// gated on eyeVisible — canvas center (cx, cy) IS the reticle, and the world
// origin (0,0,0) is empty and unprojectable.)
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

  test('WASD moves the eye, arrow keys move the reticle (movement split)', () => {
    // Movement split (Gary, 2026-11-12 ~16:38 PST — arrows = reticle,
    // WASD = eye, the original movement; ~16:45 PST — "wasd moves what you
    // called the eye not the field"). The old test asserted the reverse
    // (W moves the reticle, the eye never moves); Gary's order reverses it.
    expect(shellSrc).toContain(
      'reticleDir = norm(rotateAroundAxis(reticleDir, axis, ang));',
    );
    expect(shellSrc).toContain('function reticleStep(){');
    expect(shellSrc).toContain('function eyeStep(){');
    expect(shellSrc).toContain(
      'eye = norm(rotateAroundAxis(eye, axis, ang));',
    );

    // reticleStep reads the arrow keys only — no WASD in its body.
    const reticleBody = shellSrc.slice(
      shellSrc.indexOf('function reticleStep(){'),
      shellSrc.indexOf('function eyeStep(){'),
    );
    expect(reticleBody).toContain("keys.has('arrowleft')");
    expect(reticleBody).toContain("keys.has('arrowright')");
    expect(reticleBody).toContain("keys.has('arrowup')");
    expect(reticleBody).toContain("keys.has('arrowdown')");
    expect(reticleBody).not.toContain("keys.has('w')");
    expect(reticleBody).not.toContain("keys.has('a')");
    expect(reticleBody).not.toContain("keys.has('s')");
    expect(reticleBody).not.toContain("keys.has('d')");
    // The old ArrowLeft/Right planet-spin binding is gone with the split.
    expect(reticleBody).not.toContain('ROLL_SPEED');

    // eyeStep reads WASD only — no arrow keys in its body — and resnaps
    // the reticle onto the eye every tick the eye moves, which is what
    // keeps the field (drawn at the eye's world-projected position) at
    // screen center while WASD drives.
    const eyeBody = shellSrc.slice(
      shellSrc.indexOf('function eyeStep(){'),
      shellSrc.indexOf('function cameraStep(){'),
    );
    expect(eyeBody).toContain("keys.has('w')");
    expect(eyeBody).toContain("keys.has('a')");
    expect(eyeBody).toContain("keys.has('s')");
    expect(eyeBody).toContain("keys.has('d')");
    expect(eyeBody).not.toContain("keys.has('arrow");
    expect(eyeBody).toContain('reticleDir = eye;');

    // The eye is (re)locked to the shell origin only on a snap event
    // (blueprint load / shell rebind) — the reticle-seed refresh in step()
    // must not yank it back. And C snaps the reticle onto the eye (the
    // blueprint center), not onto the canonical-face center tile.
    expect(shellSrc).toContain('function setActiveShell(id, opts){');
    expect(shellSrc).toContain('if(opts && opts.snap){');
    expect(shellSrc).toContain('reticleDir = eye;');
    const toggleBody = shellSrc.slice(
      shellSrc.indexOf('function toggleReticle(){'),
      shellSrc.indexOf("btnReticle.addEventListener('click'"),
    );
    expect(toggleBody).toContain('setReticleAnchor(eye);');
    // The old call is gone (the name still appears in the LUCID PATCH
    // comment explaining why, and the function itself is still defined —
    // only C no longer calls it).
    expect(toggleBody).not.toContain("resetToCanonicalApex('reticle_center')");
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
