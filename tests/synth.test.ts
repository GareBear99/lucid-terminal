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
    expect(shellSrc).toContain('drawSynthEyeField(cx, cy, R);');
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
