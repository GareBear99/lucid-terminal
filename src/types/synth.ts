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

/** The center tile — the eye's anchor, and where the Sentinel is pinned. */
export const CENTER_TILE_ID = 'tile_0000';

export type EyeMode = 'AUTO' | 'MANUAL';

/** Shell boot state. The empty shell boots in WAIT_BLUEPRINT. */
export type BootState = 'WAIT_BLUEPRINT' | 'READY';

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
