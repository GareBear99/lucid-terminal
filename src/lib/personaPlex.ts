/**
 * Persona Plex — the data model and pure helpers (Gary, 2026-11-06).
 *
 * One plex embodiment, personas inside it. The starter roster is the
 * EXISTING SOULS, read live from the Python soul config
 * (~/.luciferai/data/souls.json) — the TS side never stores a soul's
 * name, rarity or level; it reads them at load time (single source
 * of truth) and only stores per-persona setup (voice + tool
 * allowlist) keyed by soul id. Custom personas (created on the
 * setup page) have no Python source and are stored whole.
 *
 * LOCAL ONLY — no servers. Personas use Lucid's tools directly and
 * locally (in-process, via the wrapped toolRegistry — see
 * PERSONA_TOOLS below, which mirrors
 * electron/core/tools/toolRegistry.ts), with per-persona allowlists
 * enforced locally in code (isToolAllowedForPersona). No MCP server,
 * no server per persona, no shared MCP server, no port, no HTTP.
 *
 * Pure helpers only — no window, no IPC, no store access — so the
 * roster parsing, allowlist and Speak gating are unit-testable
 * without a browser. The setup page (PersonaPlexView) does the
 * file read and the store writes.
 */

import type { Persona, PersonaConfig } from '../types';

/** The default voice for a persona — Lily, the voice of the Forge
 *  voice messages (avocado_v2:Lily). NOTE: Lily is the voice of the
 *  PRE-RECORDED mp3s (Forge, add-ons, plugin pages). It is NOT a
 *  macOS system voice, so it can never be spoken live through the
 *  Web Speech API — see PERSONA_VOICE_CAST and resolvePersonaVoice
 *  below. A stored voice of 'Lily' means "no live voice picked
 *  yet", and live speech resolves it to that persona's assigned
 *  voice instead of silently falling back to the system default
 *  for every persona (the old bad take: every persona sounded
 *  identical). */
export const DEFAULT_PERSONA_VOICE = 'Lily';

/**
 * The Persona Plex voice cast (Gary, 2026-11-07 redo): the real
 * macOS system voices live speech can use, in preference order.
 * These are the human-feeling Apple voices INSTALLED on Gary's
 * Mac (verified with `say -v '?'` on the Mac mini, 2026-11-07:
 * Samantha, Daniel, Karen, Moira, Tessa, Fred, Kathy, Ralph,
 * Albert, Flo, Reed, Shelley) — the same pool the Web Speech API
 * exposes via speechSynthesis.getVoices() and the `say` command
 * lists. Each persona is assigned its OWN voice from this cast
 * (see assignPersonaVoices), so personas sound like themselves
 * instead of all sharing one default voice.
 *
 * NOT in the cast, deliberately: Alex, Victoria, Susan, Tom,
 * Veena, Fiona and Amelie are NOT installed on this Mac (no
 * `say -v '?'` entry — Amelie exists only as accented 'Amélie'),
 * so listing them would assign voices that match nothing. Lily
 * is not installed either — it is the pre-recorded-mp3 voice,
 * never a system voice.
 *
 * Only voices actually installed on the machine are ever used:
 * the cast is intersected with the available voices, and when
 * fewer than two cast voices are available the full available
 * list is used instead — so this still works on a machine with a
 * different voice set. A voice name here that is not installed
 * is simply skipped, never spoken as something else.
 */
export const PERSONA_VOICE_CAST: readonly string[] = [
  'Samantha',
  'Daniel',
  'Karen',
  'Moira',
  'Tessa',
  'Fred',
  'Kathy',
  'Ralph',
  'Albert',
  'Flo',
  'Reed',
  'Shelley',
];

/** Deterministic hash of a persona id (FNV-1a) — the stable base
 *  for a persona's assigned voice, so a persona keeps its voice
 *  across restarts and roster changes. */
function hashPersonaId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Assign each persona its own live voice: a stable, distinct
 * voice per persona id, drawn from the voices actually available
 * on this machine (cast voices first). Two personas get the same
 * voice only when there are more personas than available voices.
 * The assignment is deterministic — same roster, same voices —
 * and a persona's slot is its hash, probed forward past slots
 * already taken, so adding a persona rarely moves another's.
 * Returns null for a persona when no voices are available at all
 * (the caller then falls back to the stored voice / system
 * default, as before).
 */
export function assignPersonaVoices(
  personaIds: readonly string[],
  availableVoices: readonly string[],
): Map<string, string | null> {
  const result = new Map<string, string | null>();
  if (availableVoices.length === 0) {
    for (const id of personaIds) result.set(id, null);
    return result;
  }
  const byLower = new Map(
    availableVoices.map((v) => [v.toLowerCase(), v] as const),
  );
  let candidates = PERSONA_VOICE_CAST.filter((name) =>
    byLower.has(name.toLowerCase()),
  ).map((name) => byLower.get(name.toLowerCase()) as string);
  // Fewer than two cast voices on this machine: use everything
  // available, so personas can still sound different from each
  // other instead of all sharing the default.
  if (candidates.length < 2) candidates = [...availableVoices];
  const claimed = new Set<number>();
  for (const id of [...new Set(personaIds)].sort()) {
    const base = hashPersonaId(id) % candidates.length;
    let assigned = candidates[base];
    for (let step = 0; step < candidates.length; step++) {
      const slot = (base + step) % candidates.length;
      if (!claimed.has(slot)) {
        claimed.add(slot);
        assigned = candidates[slot];
        break;
      }
    }
    result.set(id, assigned);
  }
  return result;
}

/**
 * The voice live speech actually uses for a persona: the stored
 * voice when it matches a voice available on this machine (an
 * explicit pick always wins), otherwise the persona's assigned
 * voice from the cast (see assignPersonaVoices), otherwise null
 * when no voices are available at all. This is what fixes the
 * old bad take — a stored 'Lily' (the pre-recorded-mp3 voice,
 * never a system voice) used to match nothing and silently fall
 * back to the system default for EVERY persona, so all personas
 * sounded identical. Now it resolves to that persona's own
 * distinct voice.
 */
export function resolvePersonaVoice(
  persona: Pick<Persona, 'id' | 'voice'>,
  args: {
    availableVoices: readonly string[];
    personaIds?: readonly string[];
  },
): string | null {
  const matched = resolveSpeakVoice(persona.voice, args.availableVoices);
  if (matched) return matched;
  const ids = args.personaIds ?? [persona.id];
  return assignPersonaVoices(ids, args.availableVoices).get(persona.id) ?? null;
}

/**
 * The sample line a persona speaks for its Hear-voice preview:
 * short, in the persona's own name, so Gary can judge whether
 * the voice fits that persona.
 */
export function personaVoiceSample(persona: Pick<Persona, 'name'>): string {
  const name = persona.name.trim() || 'Persona';
  return `Hi, I'm ${name}. This is my voice.`;
}

/** The default per-persona voice options: Speak on for the persona,
 *  no auto-speak (only on right-click Speak), full volume, normal
 *  rate. A persona with no stored config gets these. */
export const DEFAULT_PERSONA_VOICE_OPTIONS = {
  homunculusId: null as string | null,
  speakEnabled: true,
  autoSpeak: false,
  volume: 1,
  rate: 1,
} as const;

/** The Python soul config file, relative to the home dir. Read by
 *  the setup page through window.lucidAPI.fs (getHomeDir + readFile)
 *  — no new IPC channel, no server. */
export function soulsConfigPath(homeDir: string): string {
  const base = homeDir.endsWith('/') ? homeDir.slice(0, -1) : homeDir;
  return `${base}/.luciferai/data/souls.json`;
}

/** One tool a persona may use — the allowlist entry. Mirrors
 *  electron/core/tools/toolRegistry.ts (same names, descriptions,
 *  categories and risk flags); keep the two in sync when the
 *  registry gains a tool. This is a UI catalog, not a second
 *  registry — the registry itself still owns execution. */
export interface PersonaTool {
  /** Stable id, e.g. 'file.read'. */
  id: string;
  description: string;
  category: 'file' | 'command' | 'system' | 'environment';
  /** A risky tool (writes, runs, kills) — shown with a warning. */
  isRisky: boolean;
}

/** The tools a persona may be allowed — all 20 from the registry. */
export const PERSONA_TOOLS: readonly PersonaTool[] = [
  { id: 'file.read', description: 'Read file contents with optional line range', category: 'file', isRisky: false },
  { id: 'file.write', description: 'Write content to file', category: 'file', isRisky: true },
  { id: 'file.edit', description: 'Search and replace in file', category: 'file', isRisky: true },
  { id: 'file.find', description: 'Find files matching glob pattern', category: 'file', isRisky: false },
  { id: 'file.grep', description: 'Search for text within files', category: 'file', isRisky: false },
  { id: 'file.list', description: 'List directory contents', category: 'file', isRisky: false },
  { id: 'file.move', description: 'Move or rename file', category: 'file', isRisky: true },
  { id: 'file.copy', description: 'Copy file', category: 'file', isRisky: false },
  { id: 'command.run', description: 'Execute shell command with safety checks', category: 'command', isRisky: true },
  { id: 'command.python', description: 'Execute Python code', category: 'command', isRisky: true },
  { id: 'command.script', description: 'Execute script file', category: 'command', isRisky: true },
  { id: 'command.exists', description: 'Check if command exists in PATH', category: 'command', isRisky: false },
  { id: 'system.info', description: 'Get system information', category: 'system', isRisky: false },
  { id: 'system.env', description: 'Get environment information', category: 'system', isRisky: false },
  { id: 'system.processes', description: 'List running processes', category: 'system', isRisky: false },
  { id: 'system.kill', description: 'Kill process by PID', category: 'system', isRisky: true },
  { id: 'system.cd', description: 'Change working directory', category: 'system', isRisky: false },
  { id: 'system.pwd', description: 'Get current working directory', category: 'system', isRisky: false },
  { id: 'env.find', description: 'Find virtual environments', category: 'environment', isRisky: false },
  { id: 'env.activate', description: 'Activate virtual environment', category: 'environment', isRisky: false },
];

/** Every tool id, in registry order — the default allowlist for a
 *  new persona (everything allowed; uncheck to restrict). */
export const ALL_PERSONA_TOOL_IDS: readonly string[] = PERSONA_TOOLS.map(
  (t) => t.id,
);

/** The four tool categories, in display order. */
export const PERSONA_TOOL_CATEGORIES: readonly PersonaTool['category'][] = [
  'file',
  'command',
  'system',
  'environment',
];

/** One soul as stored in the Python soul config (souls.json).
 *  The config is `{ [userId]: { souls: [...] } }`; each soul has
 *  an id, an entity_key, a rarity, a level, and an entity definition
 *  (name, emoji, traits). */
export interface ParsedSoul {
  id: string;
  entityKey: string;
  name: string;
  emoji: string | null;
  rarity: string;
  level: number;
}

/**
 * Parse the Python souls.json contents into souls. Accepts the
 * per-user shape `{ [userId]: { souls: [...] } }` and a bare
 * `{ souls: [...] }`. Anything unparseable yields an empty list —
 * never a crash, never invented souls.
 */
export function parseSoulsConfig(input: unknown): ParsedSoul[] {
  if (!input || typeof input !== 'object') return [];
  const obj = input as Record<string, unknown>;
  const soulLists: unknown[] = [];
  if (Array.isArray(obj.souls)) soulLists.push(obj.souls);
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      const entry = value as Record<string, unknown>;
      if (Array.isArray(entry.souls)) soulLists.push(entry.souls);
    }
  }
  const souls: ParsedSoul[] = [];
  for (const list of soulLists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const id = row.id;
      if (typeof id !== 'string' || id.length === 0) continue;
      const entityKey =
        typeof row.entity_key === 'string' ? row.entity_key : '';
      const entity =
        row.entity && typeof row.entity === 'object'
          ? (row.entity as Record<string, unknown>)
          : null;
      const name =
        (entity && typeof entity.name === 'string' && entity.name.length > 0
          ? entity.name
          : entityKey) || id;
      const emoji =
        entity && typeof entity.emoji === 'string' ? entity.emoji : null;
      const rarity =
        typeof row.rarity === 'string' ? row.rarity : 'common';
      const level =
        typeof row.level === 'number' && Number.isFinite(row.level)
          ? row.level
          : 1;
      souls.push({ id, entityKey, name, emoji, rarity, level });
    }
  }
  // Dedupe by id (first wins) — a soul listed under two users is one soul.
  const seen = new Set<string>();
  return souls.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

/**
 * One soul as a Persona — the name, rarity and level come from the
 * soul; the voice and allowlist come from the stored per-persona
 * config (or the defaults: Lily, everything allowed) when there is
 * no stored config for this soul yet.
 */
export function soulToPersona(
  soul: ParsedSoul,
  config?: PersonaConfig,
): Persona {
  return {
    id: soul.id,
    name: soul.name,
    description: soul.emoji
      ? `${soul.emoji} ${soul.rarity} soul · level ${soul.level}`
      : `${soul.rarity} soul · level ${soul.level}`,
    source: 'soul',
    soulId: soul.id,
    rarity: soul.rarity,
    level: soul.level,
    voice: config?.voice ?? DEFAULT_PERSONA_VOICE,
    homunculusId: config?.homunculusId ?? DEFAULT_PERSONA_VOICE_OPTIONS.homunculusId,
    speakEnabled: config?.speakEnabled ?? DEFAULT_PERSONA_VOICE_OPTIONS.speakEnabled,
    autoSpeak: config?.autoSpeak ?? DEFAULT_PERSONA_VOICE_OPTIONS.autoSpeak,
    volume: config?.volume ?? DEFAULT_PERSONA_VOICE_OPTIONS.volume,
    rate: config?.rate ?? DEFAULT_PERSONA_VOICE_OPTIONS.rate,
    allowedTools: config?.allowedTools ?? [...ALL_PERSONA_TOOL_IDS],
  };
}

/**
 * The roster for the setup page: soul-derived personas (with their
 * stored config applied) plus the custom personas, in that order.
 * A custom persona whose id collides with a soul id is dropped —
 * the soul wins (single source of truth).
 */
export function mergePersonas(
  souls: readonly ParsedSoul[],
  config: Readonly<Record<string, PersonaConfig>> | null | undefined,
  customPersonas: readonly Persona[] | null | undefined,
): Persona[] {
  const roster: Persona[] = souls.map((s) =>
    soulToPersona(s, config?.[s.id]),
  );
  const soulIds = new Set(roster.map((p) => p.id));
  for (const custom of customPersonas ?? []) {
    if (!custom || typeof custom.id !== 'string' || soulIds.has(custom.id)) {
      continue;
    }
    roster.push(custom);
  }
  return roster;
}

/**
 * Whether a persona may use a tool — the local enforcement point.
 * A tool is allowed exactly when its id is in the persona's
 * allowlist. Call this wherever a persona drives a tool; never
 * bypass it.
 */
export function isToolAllowedForPersona(
  persona: Persona,
  toolId: string,
): boolean {
  return persona.allowedTools.includes(toolId);
}

/**
 * Whether the "Speak" option shows in the AI chat context menu.
 * It shows ONLY when Persona Plex is installed AND the Speak toggle
 * is on AND the persona's own Speak is on (a persona can opt out
 * of Speak even when the global toggle is on — pass
 * personaSpeakEnabled: false for that persona). Anything else —
 * not installed, toggle off, persona opted out — hides it.
 */
export function shouldShowSpeakOption(args: {
  personaPlexInstalled: boolean;
  speakEnabled: boolean;
  personaSpeakEnabled?: boolean;
}): boolean {
  return (
    args.personaPlexInstalled &&
    args.speakEnabled &&
    (args.personaSpeakEnabled ?? true)
  );
}

/**
 * The persona paired to a Homunculus, or null when none is paired.
 * A persona pairs to a Homunculus on the setup page / in the
 * Forge-to-Persona Plex segment (its `homunculusId`).
 */
export function personaForHomunculus(
  homunculusId: string,
  personas: readonly Persona[],
): Persona | null {
  return personas.find((p) => p.homunculusId === homunculusId) ?? null;
}

/**
 * The voice Forge uses for a Homunculus: the voice of the persona
 * paired to it. A Homunculus with no persona paired yet falls back
 * to the default voice (Lily) — the existing Forge voice messages
 * keep working.
 */
export function voiceForHomunculus(
  homunculusId: string,
  personas: readonly Persona[],
): string {
  return personaForHomunculus(homunculusId, personas)?.voice ?? DEFAULT_PERSONA_VOICE;
}

/**
 * The voice Forge uses for a Homunculus, resolved from settings
 * only — the config overrides (soul personas) and the custom
 * persona records. No souls.json read, so the Forge panels can
 * resolve it without loading the soul config. A Homunculus with
 * no persona paired yet falls back to the default voice (Lily).
 */
export function voiceForHomunculusFromSettings(
  homunculusId: string,
  args: {
    config: Readonly<Record<string, PersonaConfig>> | null | undefined;
    customPersonas: readonly Persona[] | null | undefined;
  },
): string {
  const custom = (args.customPersonas ?? []).find(
    (p) => p.homunculusId === homunculusId,
  );
  if (custom) return custom.voice;
  for (const cfg of Object.values(args.config ?? {})) {
    if (cfg.homunculusId === homunculusId && typeof cfg.voice === 'string') {
      return cfg.voice;
    }
  }
  return DEFAULT_PERSONA_VOICE;
}

/**
 * The full voice settings Forge uses for a Homunculus, resolved
 * from settings only (see voiceForHomunculusFromSettings): the
 * paired persona's voice, volume and rate — or the defaults
 * (Lily, full volume, normal rate) when nothing is paired.
 */
export function voiceSettingsForHomunculusFromSettings(
  homunculusId: string,
  args: {
    config: Readonly<Record<string, PersonaConfig>> | null | undefined;
    customPersonas: readonly Persona[] | null | undefined;
  },
): { voice: string; volume: number; rate: number } {
  const custom = (args.customPersonas ?? []).find(
    (p) => p.homunculusId === homunculusId,
  );
  if (custom) {
    return { voice: custom.voice, volume: custom.volume, rate: custom.rate };
  }
  for (const cfg of Object.values(args.config ?? {})) {
    if (cfg.homunculusId === homunculusId) {
      return {
        voice: cfg.voice ?? DEFAULT_PERSONA_VOICE,
        volume: cfg.volume ?? DEFAULT_PERSONA_VOICE_OPTIONS.volume,
        rate: cfg.rate ?? DEFAULT_PERSONA_VOICE_OPTIONS.rate,
      };
    }
  }
  return {
    voice: DEFAULT_PERSONA_VOICE,
    volume: DEFAULT_PERSONA_VOICE_OPTIONS.volume,
    rate: DEFAULT_PERSONA_VOICE_OPTIONS.rate,
  };
}

/**
 * The full voice settings Forge / Speak use for a Homunculus: the
 * paired persona's voice, volume and rate — or the defaults (Lily,
 * full volume, normal rate) when nothing is paired.
 */
export function voiceSettingsForHomunculus(
  homunculusId: string,
  personas: readonly Persona[],
): { voice: string; volume: number; rate: number } {
  const persona = personaForHomunculus(homunculusId, personas);
  if (!persona) {
    return {
      voice: DEFAULT_PERSONA_VOICE,
      volume: DEFAULT_PERSONA_VOICE_OPTIONS.volume,
      rate: DEFAULT_PERSONA_VOICE_OPTIONS.rate,
    };
  }
  return { voice: persona.voice, volume: persona.volume, rate: persona.rate };
}

/**
 * The voice Speak uses: the active persona's voice. The voice is
 * always read from the settings (the per-persona config for a soul
 * persona, the custom record for a custom persona) — never from the
 * roster, so AI chat can resolve it without reading souls.json.
 * No active persona (or no voice stored) falls back to Lily.
 */
export function getActivePersonaVoice(args: {
  activeId: string | null | undefined;
  config: Readonly<Record<string, PersonaConfig>> | null | undefined;
  customPersonas: readonly Persona[] | null | undefined;
}): string {
  const { activeId } = args;
  if (activeId) {
    const fromConfig = args.config?.[activeId]?.voice;
    if (typeof fromConfig === 'string' && fromConfig.length > 0) {
      return fromConfig;
    }
    const custom = (args.customPersonas ?? []).find((p) => p.id === activeId);
    if (custom && custom.voice.length > 0) return custom.voice;
  }
  return DEFAULT_PERSONA_VOICE;
}

/**
 * The active persona's voice settings (voice, volume, rate, Speak
 * on/off, auto-speak) — read from settings only (a config override
 * or a custom persona record), never from souls.json, so AI chat
 * can resolve them without reading the soul config. Falls back to
 * the defaults (Lily, full volume, normal rate, Speak on, no
 * auto-speak) when no persona is active or it has no stored
 * settings. The voice here is the voice Speak uses for a chat
 * bubble message — and, when the persona is paired to a Homunculus,
 * the voice Forge uses for that Homunculus.
 */
export function getActivePersonaVoiceSettings(args: {
  activeId: string | null | undefined;
  config: Readonly<Record<string, PersonaConfig>> | null | undefined;
  customPersonas: readonly Persona[] | null | undefined;
  /**
   * The voices available on this machine, when the caller knows
   * them (AI chat passes getAvailableSpeakVoices()). With them,
   * the voice is the persona's EFFECTIVE voice — a stored 'Lily'
   * or any other unmatched name resolves to that persona's
   * assigned distinct voice instead of the system default for
   * everyone. Without them the stored voice is returned as-is
   * (the old behaviour — speakText still falls back to default).
   */
  availableVoices?: readonly string[];
  /** All persona ids, for the distinct assignment — defaults to
   *  just the active id. */
  personaIds?: readonly string[];
}): {
  voice: string;
  volume: number;
  rate: number;
  speakEnabled: boolean;
  autoSpeak: boolean;
} {
  const { activeId } = args;
  const custom = activeId
    ? (args.customPersonas ?? []).find((p) => p.id === activeId)
    : undefined;
  if (custom) {
    return {
      voice: args.availableVoices
        ? resolvePersonaVoice(custom, {
            availableVoices: args.availableVoices,
            personaIds: args.personaIds ?? [custom.id],
          }) ?? custom.voice
        : custom.voice,
      volume: custom.volume,
      rate: custom.rate,
      speakEnabled: custom.speakEnabled,
      autoSpeak: custom.autoSpeak,
    };
  }
  const cfg = activeId ? args.config?.[activeId] : undefined;
  const storedVoice = cfg?.voice ?? DEFAULT_PERSONA_VOICE;
  return {
    voice: args.availableVoices
      ? resolvePersonaVoice(
          { id: activeId ?? '', voice: storedVoice },
          {
            availableVoices: args.availableVoices,
            personaIds: args.personaIds ?? (activeId ? [activeId] : []),
          },
        ) ?? storedVoice
      : storedVoice,
    volume: cfg?.volume ?? DEFAULT_PERSONA_VOICE_OPTIONS.volume,
    rate: cfg?.rate ?? DEFAULT_PERSONA_VOICE_OPTIONS.rate,
    speakEnabled:
      cfg?.speakEnabled ?? DEFAULT_PERSONA_VOICE_OPTIONS.speakEnabled,
    autoSpeak: cfg?.autoSpeak ?? DEFAULT_PERSONA_VOICE_OPTIONS.autoSpeak,
  };
}

/**
 * Match a stored voice name to an available speech-synthesis voice
 * (case-insensitive, substring match — 'Lily' matches 'Lily' or
 * 'Microsoft Lily'). Returns the matched available voice name, or
 * null when nothing matches (the caller then uses the system
 * default voice).
 */
export function resolveSpeakVoice(
  voiceName: string,
  availableVoiceNames: readonly string[],
): string | null {
  const wanted = voiceName.trim().toLowerCase();
  if (!wanted) return null;
  for (const name of availableVoiceNames) {
    if (name.toLowerCase() === wanted) return name;
  }
  for (const name of availableVoiceNames) {
    if (name.toLowerCase().includes(wanted)) return name;
  }
  return null;
}

/** A new custom persona — everything allowed, Lily's voice, no
 *  Homunculus paired, Speak on, no auto-speak, full volume, normal
 *  rate. The id is unique per creation (timestamp + random tail). */
export function newCustomPersona(name: string, description: string): Persona {
  const tail = Math.random().toString(36).slice(2, 8);
  return {
    id: `custom-${Date.now().toString(36)}-${tail}`,
    name: name.trim() || 'Unnamed persona',
    description: description.trim(),
    source: 'custom',
    voice: DEFAULT_PERSONA_VOICE,
    homunculusId: DEFAULT_PERSONA_VOICE_OPTIONS.homunculusId,
    speakEnabled: DEFAULT_PERSONA_VOICE_OPTIONS.speakEnabled,
    autoSpeak: DEFAULT_PERSONA_VOICE_OPTIONS.autoSpeak,
    volume: DEFAULT_PERSONA_VOICE_OPTIONS.volume,
    rate: DEFAULT_PERSONA_VOICE_OPTIONS.rate,
    allowedTools: [...ALL_PERSONA_TOOL_IDS],
  };
}
