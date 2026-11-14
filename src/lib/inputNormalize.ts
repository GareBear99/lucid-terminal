/**
 * Normalize — the composer's input preprocessing for the
 * classifier (Warp-like parsing, 2026-11-14).
 *
 * Shape stolen from LuciferAI Local (`command_keywords.py`
 * helpers + `master_controller.py` normalize-before-classify,
 * Gary's own code — a bit, no credit question): normalize
 * runs BEFORE any classification, and it never rewrites what
 * the user typed — the draft stays exactly as typed; only the
 * classifier's VIEW of it is normalized. The submitted text is
 * always the original.
 *
 * Three steps, in order:
 *  1. trim + collapse whitespace;
 *  2. strip leading politeness phrases (longest first, up to
 *     two passes — "please can you fix" → "fix");
 *  3. typo-autocorrect whole words (exact match, then prefix
 *     match for single-word drafts).
 *
 * Synonym-normalizing (make/build/generate → create) is a
 * separate step (`normalizeIntentVerbs`) used ONLY by the
 * intent parser — never by the command-vs-agent detector.
 * The detector must see the raw verbs: `make test` is a shell
 * command, and normalizing `make` → `create` before the shell
 * gates would hide it.
 *
 * Pure functions — no React, no stores — unit-testable.
 */

/** Leading politeness phrases, stripped before classify.
 *  Longest first so "can you please" wins over "can you". */
export const POLITENESS_PHRASES: readonly string[] = [
  'could you please',
  'can you please',
  'would you please',
  'i would like to',
  'i want to',
  'i need to',
  'could you',
  'would you',
  'will you',
  'can you',
  'help me',
  'we just',
  'that we just',
  'please',
  'just',
];

/** Whole-word typo corrections (generic words only — the
 *  LuciferAI-specific entries from Local's table, e.g.
 *  mistrl → mistral, do not port). Exact match first, then a
 *  prefix match for single-word drafts. */
export const TYPO_CORRECTIONS: Readonly<Record<string, string>> = {
  hlep: 'help',
  crate: 'create',
  creat: 'create',
  teh: 'the',
  taht: 'that',
  wiht: 'with',
  form: 'from',
  recieve: 'receive',
  adress: 'address',
  enviroment: 'environment',
  instal: 'install',
  udpate: 'update',
  delte: 'delete',
  serach: 'search',
  exlpain: 'explain',
  buil: 'build',
  buid: 'build',
  writ: 'write',
  lis: 'list',
  fi: 'fix',
};

/** Strip leading politeness phrases from a lowercased line.
 *  Longest-first, up to two passes (so "please can you fix"
 *  loses both). Returns the stripped line, trimmed. */
export function stripPoliteness(lower: string): string {
  let text = lower.trim();
  for (let pass = 0; pass < 2; pass++) {
    let stripped = false;
    for (const phrase of POLITENESS_PHRASES) {
      if (text === phrase) {
        text = '';
        stripped = true;
        break;
      }
      if (text.startsWith(`${phrase} `)) {
        text = text.slice(phrase.length + 1);
        stripped = true;
        break;
      }
    }
    if (!stripped) break;
  }
  return text.trim();
}

/** Autocorrect whole words in a line: exact match first; a
 *  single-word draft also matches by prefix ("hlep" → "help",
 *  and a lone "crea" → "create"). Words that are already right
 *  pass through untouched. */
export function autocorrectTypos(text: string): string {
  const words = text.split(/\s+/);
  const fixed = words.map((word) => {
    const lower = word.toLowerCase();
    const exact = TYPO_CORRECTIONS[lower];
    if (exact) return exact;
    if (words.length === 1) {
      for (const [typo, fix] of Object.entries(TYPO_CORRECTIONS)) {
        if (typo.startsWith(lower) && lower.length >= 2) return fix;
      }
    }
    return word;
  });
  return fixed.join(' ');
}

export interface NormalizedInput {
  /** The classifier's view: trimmed, whitespace-collapsed,
   *  politeness-stripped, typo-fixed. Never the submitted text. */
  normalized: string;
  /** True when a politeness phrase was stripped. */
  politenessStripped: boolean;
  /** True when a typo was corrected. */
  typoFixed: boolean;
}

/** Normalize a draft for classification: trim + collapse
 *  whitespace, strip leading politeness, autocorrect typos.
 *  The original draft is untouched — this is a view only. */
export function normalizeInput(draft: string): NormalizedInput {
  const collapsed = draft.trim().replace(/\s+/g, ' ');
  const stripped = stripPoliteness(collapsed.toLowerCase());
  const corrected = autocorrectTypos(stripped);
  return {
    normalized: corrected,
    politenessStripped: stripped !== collapsed.toLowerCase(),
    typoFixed: corrected !== stripped,
  };
}

/**
 * Synonym map — collapse variant verbs to one canonical verb
 * for INTENT detection only (Local's SYNONYM_MAP, ported with
 * its collisions resolved explicitly instead of letting dict
 * order decide: 'start' → 'run' (not 'create'), 'setup' →
 * 'install' (not 'create'), 'fix'/'repair' → 'fix' (no cycle).
 * Multi-word phrases first, longest first.
 */
export const SYNONYM_MAP: Readonly<Record<string, string>> = {
  'where is': 'find',
  'look up': 'find',
  lookup: 'find',
  generate: 'create',
  make: 'create',
  build: 'create',
  initialize: 'create',
  place: 'create',
  remove: 'delete',
  trash: 'delete',
  erase: 'delete',
  display: 'read',
  show: 'read',
  view: 'read',
  repair: 'fix',
  start: 'run',
  execute: 'run',
  exec: 'run',
  setup: 'install',
  relocate: 'move',
  transfer: 'move',
};

/** Canonicalize verbs for intent detection: multi-word
 *  phrases longest-first, then single words, word-boundary
 *  matched throughout (Local's raw `in` checks matched
 *  'get' inside 'forget' — never again). */
export function normalizeIntentVerbs(text: string): string {
  let out = ` ${text.toLowerCase()} `;
  const phrases = Object.entries(SYNONYM_MAP)
    .filter(([from]) => from.includes(' '))
    .sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of phrases) {
    out = out.split(` ${from} `).join(` ${to} `);
  }
  const words = Object.entries(SYNONYM_MAP).filter(([from]) => !from.includes(' '));
  for (const [from, to] of words) {
    out = out.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
  }
  return out.trim().replace(/\s+/g, ' ');
}
