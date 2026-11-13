/**
 * Synth types + pure engine math for the Lucid synth view.
 *
 * Sources (verified in code, 2026-11-04):
 * - Iteration 11 preview_v0.2.html ("Proto-Synth Neural + Voxel Directory
 *   Merge"): the 8 categories, mulberry32 / hashString / seededColor, and the
 *   node / voxel / ring / link construction in rebuildFromSeed(). The
 *   functions below are exact ports, so a scene built here for a seed is
 *   identical to the one the vendored v67 patch builds for the same seed.
 * - Iteration 10 MATRIX SYNTH v67 (vendored at public/synth/): the shell,
 *   eye, and Sentinel glyph. The shell boots in WAIT_BLUEPRINT.
 *
 * Design rule from Gary (2026-11-04): the mount system is
 * CLASSIFICATION-AGNOSTIC. Lucifer is classified as a Sentinel, not a
 * Synth, and mounts as the synth embodiment anyway. Mounting is gated on
 * ROLE ('synth-embodiment'), never on classification. Do not add a
 * `classification === 'Synth'` check anywhere — that would break the mount.
 *
 * The "64 tracked each" figure from standing memory is NOT verified in the
 * engine source and is NOT asserted anywhere here.
 */

// ---------------------------------------------------------------------------
// Iteration 11 Neural Synth — categories (seed-bound RGB via seededColor)
// ---------------------------------------------------------------------------

export const NEURAL_CATEGORIES = [
  'planner',
  'critic',
  'repair',
  'memory',
  'routes',
  'receipts',
  'archive',
  'runtime',
] as const;

export type NeuralCategory = (typeof NEURAL_CATEGORIES)[number];

export const NODE_ROLES = [
  'gateway',
  'planner',
  'critic',
  'memory',
  'router',
  'receipt',
  'archive',
  'executor',
] as const;

export type NodeRole = (typeof NODE_ROLES)[number];

/** Which roles a role may talk to (v0.2 ROLE_LINKS, verbatim). */
export const ROLE_LINKS: Record<string, string[]> = {
  gateway: ['planner', 'router', 'memory', 'executor'],
  planner: ['critic', 'memory', 'router', 'receipt'],
  critic: ['planner', 'receipt', 'archive'],
  memory: ['planner', 'critic', 'archive', 'router'],
  router: ['gateway', 'planner', 'executor', 'receipt', 'archive'],
  receipt: ['planner', 'critic', 'archive'],
  archive: ['memory', 'receipt'],
  executor: ['router', 'receipt'],
};

export const DEFAULT_SYNTH_SEED = 'F1B49B1CB10D6FED';

/**
 * Iteration 8's default seed — the shell's own seed input default
 * (iteration8/index.html: the seed input's value="7F021AE4"). The
 * shell hashes (canonical blueprint + this seed) into its shell seed.
 */
export const ITERATION8_DEFAULT_SEED = '7F021AE4';

/** The center tile — the eye's anchor, and where the Sentinel is pinned. */
export const CENTER_TILE_ID = 'tile_0000';

export type EyeMode = 'AUTO' | 'MANUAL';

/**
 * Shell boot state — the repo's 6-state machine (iteration8/index.html:
 * Boot = {COLD, POST, PING_TEST, READY, SAFE_MODE, WAIT_BLUEPRINT}).
 * The empty shell boots in WAIT_BLUEPRINT; a loaded blueprint steps
 * WAIT_BLUEPRINT → COLD → POST → PING_TEST (NOOP ping) → READY, or
 * SAFE_MODE on any failure. The old 2-state derivation (READY if
 * mounted OR shellLoaded) is gone: it could read READY while the
 * shell was still waiting or failed.
 */
export type BootState =
  | 'COLD'
  | 'POST'
  | 'PING_TEST'
  | 'READY'
  | 'SAFE_MODE'
  | 'WAIT_BLUEPRINT';

/**
 * Build state — the repo's machine (iteration8/index.html: Build =
 * {IDLE, PLANNED, INTEGRITY, MAPPING, COMPLETE, EMPTY_REPO_READY}).
 * A loaded blueprint plans the build; integrity verifies every pivot
 * by ping; mapping writes every route tile by ping; complete means
 * the shell is constructed and the repo is empty and ready.
 */
export type BuildState =
  | 'IDLE'
  | 'PLANNED'
  | 'INTEGRITY'
  | 'MAPPING'
  | 'COMPLETE'
  | 'EMPTY_REPO_READY';

/** A 3D vector (unit-sphere geometry for blueprints). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * The world origin {x:0, y:0, z:0} — the centre of the unit sphere the
 * blueprint lives on. It is EMPTY and UNPROJECTABLE: nothing is placed
 * or drawn there in any file, and projectDir((0,0,0)) returns null
 * (r.z = 0 hits the `r.z <= 0` guard), so the origin has NO screen
 * position at all. It is NOT where the Neural Synth lives, and it is
 * NOT (cx, cy): canvas centre is the projection of the camera-forward
 * direction, which in the vendored v67 shell is the RETICLE
 * (cameraStep builds the camera from reticleDir), not the origin.
 * The eye is norm(blueprint.origin), a unit direction — a point ON
 * the sphere's surface, the observer/camera the vision goes through.
 * The thinker/field/ship are drawn at the eye's world-projected
 * position (ex, ey) = projectDir(eye), gated on eyeVisible — the
 * blueprint's centre-anchor (Gary, 2026-11-08 ~03:55, af90dd2,
 * proved by Gary with a scroll). The neural scene cloud is centred
 * in its OWN local frame only. (CORRECTED 2026-11-12: the Iteration 8
 * port's "center" doctrine — (cx, cy) = world origin, thinker drawn
 * there always — was wrong; see the spatial-placements audit,
 * ~/workspace/iteration8-spatial-placements-2026-11-12.md §7.)
 */
export const SHELL_CENTER: Vec3 = { x: 0, y: 0, z: 0 };

// ---------------------------------------------------------------------------
// Seed / RNG / colour — exact ports of Iteration 11 preview_v0.2.html
// ---------------------------------------------------------------------------

export function mulberry32(a: number): () => number {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) =>
    Math.round(255 * x)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/** Each category's RGB identity, bound to (name + seed). */
export function seededColor(name: string, seed: string): string {
  return hslToHex(hashString(name + seed) % 360, 72, 62);
}

export function categoryColors(
  seedHex: string,
): Record<NeuralCategory, string> {
  const out = {} as Record<NeuralCategory, string>;
  for (const c of NEURAL_CATEGORIES) out[c] = seededColor(c, seedHex);
  return out;
}

// ---------------------------------------------------------------------------
// Neural scene — deterministic build from a seed (v0.2 rebuildFromSeed)
// ---------------------------------------------------------------------------

export interface NeuralNode {
  x: number;
  y: number;
  z: number;
  label: string;
  id: string;
  category: NeuralCategory;
  role: string;
  pulse: number;
  load: number;
  receipts: number;
  links: number;
}

export interface NeuralVoxel {
  x: number;
  y: number;
  z: number;
  size: number;
  phase: number;
  category: NeuralCategory;
  load: number;
  links: number;
  id: string;
}

export interface NeuralRing {
  a: number;
  r: number;
}

export interface NeuralScene {
  rings: NeuralRing[];
  voxels: NeuralVoxel[];
  nodes: NeuralNode[];
  /** [nodeIndexA, nodeIndexB, weight] — 50 pairs, same construction as v0.2. */
  links: [number, number, number][];
  categoryColors: Record<NeuralCategory, string>;
}

const TAU = Math.PI * 2;

/**
 * Build the thinker scene for a seed. Same rand-consumption order as
 * v0.2 rebuildFromSeed(), so the result is identical to the scene the
 * vendored v67 patch builds for the same seed.
 */
export function buildNeuralScene(seedHex: string): NeuralScene {
  const rand = mulberry32(parseInt(seedHex.slice(0, 8), 16) || 1);
  const colors = categoryColors(seedHex);

  const rings: NeuralRing[] = [];
  for (let i = 0; i < 14; i++) rings.push({ a: (i / 14) * TAU, r: 260 - i * 3 });

  const voxels: NeuralVoxel[] = [];
  for (let i = 0; i < 900; i++) {
    const u = rand(),
      v = rand(),
      theta = TAU * u;
    const r = Math.pow(rand(), 0.58);
    const x = Math.cos(theta) * r * 150 * (0.95 + 0.06 * Math.sin(theta * 3));
    const y = (v * 2 - 1) * r * 142 * (1.15 + 0.1 * Math.cos(theta * 2.2));
    const z = Math.sin(theta) * r * 110 * (0.86 + 0.08 * Math.sin(theta * 5));
    const cat = NEURAL_CATEGORIES[i % NEURAL_CATEGORIES.length];
    voxels.push({
      x,
      y,
      z,
      size: 1 + rand() * 1.8,
      phase: rand() * TAU,
      category: cat,
      load: +(0.1 + rand() * 0.9).toFixed(2),
      links: 1 + Math.floor(rand() * 9),
      id: `${cat}_v_${i}`,
    });
  }

  const nodes: NeuralNode[] = [];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU + rand() * 0.15;
    const rr = 60 + rand() * 145;
    const zz = (rand() * 2 - 1) * 80;
    const cat = NEURAL_CATEGORIES[i % NEURAL_CATEGORIES.length];
    const role =
      NODE_ROLES[(i + NEURAL_CATEGORIES.indexOf(cat)) % NODE_ROLES.length];
    nodes.push({
      x: Math.cos(a) * rr,
      y: (rand() * 2 - 1) * 90,
      z: Math.sin(a) * rr * 0.8 + zz,
      label: `${cat}_${i}`,
      id: `${cat}_${i}`,
      category: cat,
      role,
      pulse: rand() * TAU,
      load: +(0.1 + rand() * 0.9).toFixed(2),
      receipts: Math.floor(rand() * 6),
      links: 0,
    });
  }

  const links: [number, number, number][] = [];
  for (let i = 0; i < 50; i++) {
    let a = Math.floor(rand() * nodes.length),
      b = Math.floor(rand() * nodes.length);
    if (a === b) b = (b + 1) % nodes.length;
    links.push([a, b, 0.2 + rand() * 0.8]);
  }
  nodes.forEach((n, idx) => {
    n.links = links.filter(([a, b]) => a === idx || b === idx).length;
  });

  return { rings, voxels, nodes, links, categoryColors: colors };
}

// ---------------------------------------------------------------------------
// Voxel Directory — Iteration 8 (Gary, 2026-11-12): ALL synths get a
// Voxel directory to start. Reference: protosynth Iteration11
// Voxel_Directory.html — "Voxel Icon view is the directory front":
// a directory lists the seed, the categories, and the objects in them.
// Here the directory is a per-plugin registry entry holding that
// synth's seed-bound voxel set — the 900 voxels + 22 nodes + 14 rings
// + 50 links + 8 category colours buildNeuralScene already computes —
// created when the synth starts, not a render side-effect. The store
// holds one directory per registered plugin id, so the structure
// works for the second synth the day it registers.
//
// The directory is GATED (Gary, 2026-11-12 ~12:23 PST): it only
// exists AFTER the demo has been permanently replaced by the
// creation one (the Iteration 8 creator build). No directory while
// the demo is still there. The gate is settings.synthDemoReplaced
// AND a saved creation build — see directoryGateMet in the synth
// store. This resolves the old scope §5 question: the gate is the
// permanent replacement, not just the demo existing.
// ---------------------------------------------------------------------------

/** One category's entry in a synth's Voxel Directory. */
export interface VoxelCategoryEntry {
  category: NeuralCategory;
  /** Seed-bound colour for the category. */
  color: string;
  voxelCount: number;
  nodeCount: number;
  /** Node ids in this category (e.g. planner_0) — the directory addresses them. */
  nodeIds: string[];
  /** Distinct node roles in this category. */
  roles: string[];
  /**
   * The category's objects, in directory order — its voxels first,
   * then its nodes. This is the directory's object depth (Iteration
   * 11 Voxel_Directory.html: root → category → object): each object
   * is addressable by id, with the load / links / receipts the
   * reference shows per object.
   */
  objects: VoxelDirectoryObject[];
}

/** One voxel row in the directory (a voxel of the seed-bound set). */
export interface VoxelDirectoryVoxelObject {
  kind: 'voxel';
  id: string;
  category: NeuralCategory;
  load: number;
  links: number;
}

/** One node row in the directory (a thinker node). */
export interface VoxelDirectoryNodeObject {
  kind: 'node';
  id: string;
  category: NeuralCategory;
  role: string;
  load: number;
  links: number;
  receipts: number;
}

export type VoxelDirectoryObject =
  | VoxelDirectoryVoxelObject
  | VoxelDirectoryNodeObject;

/** Browsing depth in the directory (reference: root/category/object). */
export type VoxelDirectoryDepth = 'root' | 'category' | 'object';

/**
 * A synth's Voxel Directory: the per-plugin registry entry holding
 * that synth's seed-bound voxel set. Built from the seed only when
 * the directory gate is met (the demo permanently replaced by the
 * creation — see above) and rebuilt when the seed changes; the
 * inspector shows it as the synth's starting structure.
 */
export interface VoxelDirectory {
  pluginId: string;
  seedHex: string;
  /** The full seed-bound voxel set — the directory IS this scene, held, not rendered. */
  scene: NeuralScene;
  voxelCount: number;
  nodeCount: number;
  ringCount: number;
  linkCount: number;
  categories: VoxelCategoryEntry[];
}

/** Build a synth's Voxel Directory from its seed. Pure and deterministic. */
export function buildVoxelDirectory(
  pluginId: string,
  seedHex: string,
): VoxelDirectory {
  const scene = buildNeuralScene(seedHex);
  const categories: VoxelCategoryEntry[] = NEURAL_CATEGORIES.map(
    (category) => {
      const nodes = scene.nodes.filter((n) => n.category === category);
      const voxels = scene.voxels.filter((v) => v.category === category);
      const objects: VoxelDirectoryObject[] = [
        ...voxels.map(
          (v): VoxelDirectoryVoxelObject => ({
            kind: 'voxel',
            id: v.id,
            category,
            load: v.load,
            links: v.links,
          }),
        ),
        ...nodes.map(
          (n): VoxelDirectoryNodeObject => ({
            kind: 'node',
            id: n.id,
            category,
            role: n.role,
            load: n.load,
            links: n.links,
            receipts: n.receipts,
          }),
        ),
      ];
      return {
        category,
        color: scene.categoryColors[category],
        voxelCount: voxels.length,
        nodeCount: nodes.length,
        nodeIds: nodes.map((n) => n.id),
        roles: [...new Set(nodes.map((n) => n.role))],
        objects,
      };
    },
  );
  return {
    pluginId,
    seedHex,
    scene,
    voxelCount: scene.voxels.length,
    nodeCount: scene.nodes.length,
    ringCount: scene.rings.length,
    linkCount: scene.links.length,
    categories,
  };
}

// ---------------------------------------------------------------------------
// Mount model — classification-agnostic by design (Gary, 2026-11-04)
// ---------------------------------------------------------------------------

/**
 * What a mounted thing IS classified as. Descriptive only — the mount
 * system must never gate on this. Lucifer is a Sentinel, not a Synth.
 */
export type EmbodimentClassification = string;

/**
 * What a mounted thing DOES in the shell. The mount gate checks this and
 * only this.
 */
export type EmbodimentRole = 'synth-embodiment';

export interface SynthEmbodiment {
  id: string;
  name: string;
  /** Classification is descriptive only. Never use it as a mount gate. */
  classification: EmbodimentClassification;
  role: EmbodimentRole;
  /** Which plugin this embodies (e.g. 'lucifer-ai'). */
  plugin: string;
}

/**
 * Lucifer the Sentinel — the LuciferAI plugin embodied as the synth.
 * Classification: Sentinel. Role: synth embodiment. The mount accepts it
 * on the role, not the classification.
 */
export const LUCIFER_EMBODIMENT: SynthEmbodiment = {
  id: 'lucifer',
  name: 'Lucifer the Sentinel',
  classification: 'Sentinel',
  role: 'synth-embodiment',
  plugin: 'lucifer-ai',
};

/**
 * Iteration 8 — the Dynamic Modules Shell itself, embodied.
 * Classification: Shell (descriptive only — the mount gate checks
 * role, never classification). It is a blueprint shell, not a
 * Sentinel: it mounts as the synth embodiment so the shell is
 * addressable like any other plugin shell, but it carries no
 * thinker — the shell's own blueprint-gated build is the capability.
 */
export const ITERATION8_EMBODIMENT: SynthEmbodiment = {
  id: 'iteration8',
  name: 'Iteration 8',
  classification: 'Shell',
  role: 'synth-embodiment',
  plugin: 'iteration8',
};

/**
 * The mount gate. Accepts an embodiment iff its ROLE is 'synth-embodiment'.
 * It deliberately does NOT inspect `classification` — a Sentinel mounts as
 * the synth embodiment exactly like a Synth would.
 */
export function canMountEmbodiment(
  emb: SynthEmbodiment | null | undefined,
): boolean {
  return !!emb && emb.role === 'synth-embodiment';
}

// ---------------------------------------------------------------------------
// Generic plugin shells — the shell + mount system is NOT Lucifer-specific.
// Every plugin can have its own shell; the plugin mounts into it as its
// embodiment (its Sentinel/synth). Lucifer is the FIRST instance, registered
// below. Nothing in the shell or the mount logic may hardcode Lucifer.
// ---------------------------------------------------------------------------

/**
 * One plugin's shell: the render surface the plugin mounts into, plus the
 * embodiment that mounts there. A second plugin gets its own shell by
 * adding one entry here (and a shell HTML file under public/synth/).
 */
export interface PluginShellSpec {
  /** Stable id, e.g. 'lucifer'. */
  pluginId: string;
  /** Display name, e.g. 'Lucifer'. */
  name: string;
  /** Iframe src for this plugin's shell, relative to the app. */
  shellSrc: string;
  /** The embodiment that mounts into this shell. */
  embodiment: SynthEmbodiment;
  /** Default seed for the shell's Neural Synth thinker. */
  defaultSeed: string;
  /**
   * True when the shell manages its own boot/build state (it runs its
   * own machine inside the iframe and reports it to Lucid) instead of
   * Lucid's TS machine being the boot truth. Iteration 8 is the only
   * such shell: the Dynamic Modules Shell boots and builds itself;
   * Lucid reads its state, never simulates it. Absent/false for the
   * demo shell, whose machine Lucid drives.
   */
  managesOwnState?: boolean;
}

/**
 * The iframe shell's own reported state (posted by a shell that
 * manages its own state — see managesOwnState). Lucid reads this,
 * never writes it: the shell's machine is the truth for its own
 * boot/build; the store just holds the latest report.
 */
export interface ShellIframeState {
  boot: BootState;
  build: BuildState;
  shellId: string | null;
  seed: string | null;
  routeTiles: number;
  mappedCount: number;
  receipts: number;
}

/**
 * Registry of plugin shells. Lucifer (LuciferAI) is the first instance.
 * To add a second plugin's shell: add one entry here, put its shell HTML
 * under public/synth/, and register its embodiment — no mount-logic change.
 */
export const PLUGIN_SHELLS: Record<string, PluginShellSpec> = {
  lucifer: {
    pluginId: 'lucifer',
    name: 'Lucifer',
    shellSrc: './synth/matrix-synth-v67.html',
    embodiment: LUCIFER_EMBODIMENT,
    defaultSeed: DEFAULT_SYNTH_SEED,
  },
  /**
   * Iteration 8 — the Dynamic Modules Shell (v2), vendored verbatim
   * from Proto-Synth_Grid_Engine iteration8/index.html (the ONLY
   * Iteration 8 that exists). Name from the shell's own title,
   * seed from the shell's own seed-input default (7F021AE4), id
   * from the folder. The demo stays the default (DEFAULT_PLUGIN_ID
   * is still 'lucifer') — Iteration 8 sits alongside it, selectable.
   * managesOwnState: the shell runs its own boot/build machine in
   * the iframe and posts its state to Lucid; no TS-machine
   * simulation, no Voxel Directory, no demo-flow mount gating.
   */
  iteration8: {
    pluginId: 'iteration8',
    name: 'Iteration 8 — Dynamic Modules Shell',
    shellSrc: './synth/matrix-synth-iteration8.html',
    embodiment: ITERATION8_EMBODIMENT,
    defaultSeed: ITERATION8_DEFAULT_SEED,
    managesOwnState: true,
  },
};

/** The first plugin shell (the default active shell). */
export const DEFAULT_PLUGIN_ID = 'lucifer';

/** Live condition of the embodied plugin (driven by the LuciferAI backend). */
export type SentinelCondition =
  | 'unmounted'
  | 'dormant'
  | 'awake'
  | 'unavailable';

/** Receipt shape (stub for Phase 2/3 — plain JSON, no hash/signature yet). */
export interface SynthReceipt {
  schema: string;
  app: string;
  version: string;
  created: string;
  seed: string;
  selectedTileId: string;
  mountedEmbodimentId: string | null;
}
