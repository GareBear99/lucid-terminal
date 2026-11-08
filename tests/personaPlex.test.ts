/**
 * Persona Plex pure-helper tests — `src/lib/personaPlex.ts`.
 *
 * Persona Plex works LOCALLY, no servers: the roster starts from
 * the existing souls (read from the Python soul config), personas
 * are configured per-persona (voice, Homunculus pairing, Speak /
 * auto-speak, volume, rate, tool allowlist), and the allowlist is
 * enforced locally in code. The voice a persona picks is the voice
 * its chat bubble messages speak in — and, when the persona is
 * paired to a Homunculus, the voice Forge uses for that Homunculus.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PERSONA_VOICE,
  PERSONA_VOICE_CAST,
  ALL_PERSONA_TOOL_IDS,
  parseSoulsConfig,
  soulToPersona,
  mergePersonas,
  isToolAllowedForPersona,
  shouldShowSpeakOption,
  personaForHomunculus,
  voiceForHomunculus,
  voiceForHomunculusFromSettings,
  voiceSettingsForHomunculus,
  getActivePersonaVoice,
  getActivePersonaVoiceSettings,
  resolveSpeakVoice,
  assignPersonaVoices,
  resolvePersonaVoice,
  personaVoiceSample,
  activeHomunculus,
  speakActorOptions,
  resolveDefaultSpeakVoice,
  newCustomPersona,
  soulsConfigPath,
  type ParsedSoul,
  type Persona,
} from '../src/lib/personaPlex';
import { emptyHomunculus } from '../src/lib/homunculi';

const soul = (over: Partial<ParsedSoul> = {}): ParsedSoul => ({
  id: 'soul-1',
  entityKey: 'lucifer',
  name: 'Lucifer',
  emoji: '😈',
  rarity: 'legendary',
  level: 7,
  ...over,
});

const persona = (over: Partial<Persona> = {}): Persona => ({
  id: 'p-1',
  name: 'Lucifer',
  description: 'legendary soul · level 7',
  source: 'soul',
  soulId: 'soul-1',
  rarity: 'legendary',
  level: 7,
  voice: 'Lily',
  homunculusId: null,
  speakEnabled: true,
  autoSpeak: false,
  volume: 1,
  rate: 1,
  allowedTools: [...ALL_PERSONA_TOOL_IDS],
  ...over,
});

describe('parseSoulsConfig', () => {
  it('parses the per-user shape { [userId]: { souls: [...] } }', () => {
    const parsed = parseSoulsConfig({
      user1: { souls: [{ id: 's1', entity_key: 'lucifer', rarity: 'legendary', level: 7, entity: { name: 'Lucifer', emoji: '😈' } }] },
    });
    expect(parsed).toEqual([{
      id: 's1', entityKey: 'lucifer', name: 'Lucifer', emoji: '😈', rarity: 'legendary', level: 7,
    }]);
  });

  it('parses a bare { souls: [...] } shape', () => {
    const parsed = parseSoulsConfig({ souls: [{ id: 's2', entity_key: 'eve', entity: { name: 'Eve' } }] });
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('Eve');
    expect(parsed[0].rarity).toBe('common');
    expect(parsed[0].level).toBe(1);
  });

  it('falls back to entity_key then id for a missing name', () => {
    const parsed = parseSoulsConfig({ souls: [{ id: 's3', entity_key: 'mystery' }] });
    expect(parsed[0].name).toBe('mystery');
    const parsed2 = parseSoulsConfig({ souls: [{ id: 's4' }] });
    expect(parsed2[0].name).toBe('s4');
  });

  it('dedupes by id (first wins) and skips rows with no id', () => {
    const parsed = parseSoulsConfig({
      souls: [
        { id: 's1', entity_key: 'a', entity: { name: 'First' } },
        { id: 's1', entity_key: 'b', entity: { name: 'Second' } },
        { entity_key: 'no-id' },
      ],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('First');
  });

  it('returns [] for anything unparseable — never a crash, never invented souls', () => {
    expect(parseSoulsConfig(null)).toEqual([]);
    expect(parseSoulsConfig(undefined)).toEqual([]);
    expect(parseSoulsConfig('nope')).toEqual([]);
    expect(parseSoulsConfig({})).toEqual([]);
    expect(parseSoulsConfig({ souls: 'not-an-array' })).toEqual([]);
  });
});

describe('soulToPersona', () => {
  it('uses Lily, no Homunculus, Speak on, no auto-speak, full volume, normal rate by default', () => {
    const p = soulToPersona(soul());
    expect(p.voice).toBe('Lily');
    expect(p.homunculusId).toBeNull();
    expect(p.speakEnabled).toBe(true);
    expect(p.autoSpeak).toBe(false);
    expect(p.volume).toBe(1);
    expect(p.rate).toBe(1);
    expect(p.allowedTools).toEqual(ALL_PERSONA_TOOL_IDS);
  });

  it('applies a stored config override (voice, pairing, Speak, volume, rate, allowlist)', () => {
    const p = soulToPersona(soul(), {
      voice: 'Aria',
      allowedTools: ['file.read'],
      homunculusId: 'lucifer',
      speakEnabled: false,
      autoSpeak: true,
      volume: 0.5,
      rate: 1.5,
    });
    expect(p.voice).toBe('Aria');
    expect(p.homunculusId).toBe('lucifer');
    expect(p.speakEnabled).toBe(false);
    expect(p.autoSpeak).toBe(true);
    expect(p.volume).toBe(0.5);
    expect(p.rate).toBe(1.5);
    expect(p.allowedTools).toEqual(['file.read']);
  });
});

describe('mergePersonas', () => {
  it('souls first, then customs; a custom colliding with a soul id is dropped (soul wins)', () => {
    const custom = persona({ id: 'custom-1', name: 'Custom', source: 'custom' });
    const collision = persona({ id: 'soul-1', name: 'Impostor', source: 'custom' });
    const roster = mergePersonas([soul()], {}, [custom, collision]);
    expect(roster.map((p) => p.id)).toEqual(['soul-1', 'custom-1']);
    expect(roster[0].name).toBe('Lucifer');
  });
});

describe('isToolAllowedForPersona', () => {
  it('allows exactly the tools on the allowlist', () => {
    const p = persona({ allowedTools: ['file.read', 'command.run'] });
    expect(isToolAllowedForPersona(p, 'file.read')).toBe(true);
    expect(isToolAllowedForPersona(p, 'command.run')).toBe(true);
    expect(isToolAllowedForPersona(p, 'file.write')).toBe(false);
    expect(isToolAllowedForPersona(p, 'system.kill')).toBe(false);
  });
});

describe('shouldShowSpeakOption', () => {
  it('shows only when installed AND the toggle is on AND the persona has Speak on', () => {
    expect(shouldShowSpeakOption({ personaPlexInstalled: true, speakEnabled: true })).toBe(true);
    expect(shouldShowSpeakOption({ personaPlexInstalled: true, speakEnabled: true, personaSpeakEnabled: false })).toBe(false);
    expect(shouldShowSpeakOption({ personaPlexInstalled: true, speakEnabled: false })).toBe(false);
    expect(shouldShowSpeakOption({ personaPlexInstalled: false, speakEnabled: true })).toBe(false);
  });
});

describe('Homunculus voice pairing', () => {
  const lucifer = persona({ id: 'p-lucifer', name: 'Lucifer', homunculusId: 'lucifer', voice: 'Aria' });
  const eve = persona({ id: 'p-eve', name: 'Eve', homunculusId: null, voice: 'Lily' });

  it('personaForHomunculus finds the paired persona, or null', () => {
    expect(personaForHomunculus('lucifer', [lucifer, eve])).toBe(lucifer);
    expect(personaForHomunculus('eve', [lucifer, eve])).toBeNull();
  });

  it('voiceForHomunculus returns the paired persona voice, else Lily', () => {
    expect(voiceForHomunculus('lucifer', [lucifer, eve])).toBe('Aria');
    expect(voiceForHomunculus('eve', [lucifer, eve])).toBe('Lily');
  });

  it('voiceSettingsForHomunculus returns the paired voice, volume and rate, else the defaults', () => {
    const paired = persona({ homunculusId: 'lucifer', voice: 'Aria', volume: 0.5, rate: 1.5 });
    expect(voiceSettingsForHomunculus('lucifer', [paired])).toEqual({ voice: 'Aria', volume: 0.5, rate: 1.5 });
    expect(voiceSettingsForHomunculus('eve', [paired])).toEqual({ voice: 'Lily', volume: 1, rate: 1 });
  });

  it('voiceForHomunculusFromSettings resolves from settings only (no souls.json)', () => {
    const config = { 'soul-1': { voice: 'Aria', allowedTools: [], homunculusId: 'lucifer', speakEnabled: true, autoSpeak: false, volume: 0.5, rate: 1.5 } };
    expect(voiceForHomunculusFromSettings('lucifer', { config, customPersonas: [] })).toBe('Aria');
    expect(voiceForHomunculusFromSettings('eve', { config, customPersonas: [] })).toBe('Lily');
    const custom = persona({ id: 'c1', source: 'custom', homunculusId: 'eve', voice: 'Nova' });
    expect(voiceForHomunculusFromSettings('eve', { config: {}, customPersonas: [custom] })).toBe('Nova');
  });
});

describe('getActivePersonaVoice / getActivePersonaVoiceSettings', () => {
  it('reads the voice from a config override, a custom record, or Lily', () => {
    expect(getActivePersonaVoice({ activeId: 'soul-1', config: { 'soul-1': { voice: 'Aria', allowedTools: [], homunculusId: null, speakEnabled: true, autoSpeak: false, volume: 1, rate: 1 } }, customPersonas: [] })).toBe('Aria');
    const custom = persona({ id: 'c1', source: 'custom', voice: 'Nova' });
    expect(getActivePersonaVoice({ activeId: 'c1', config: {}, customPersonas: [custom] })).toBe('Nova');
    expect(getActivePersonaVoice({ activeId: null, config: {}, customPersonas: [] })).toBe('Lily');
  });

  it('returns the full voice settings with the defaults when nothing is stored', () => {
    const settings = getActivePersonaVoiceSettings({ activeId: null, config: {}, customPersonas: [] });
    expect(settings).toEqual({ voice: 'Lily', volume: 1, rate: 1, speakEnabled: true, autoSpeak: false });
    const custom = persona({ id: 'c1', source: 'custom', voice: 'Nova', volume: 0.5, rate: 1.5, speakEnabled: false, autoSpeak: true });
    expect(getActivePersonaVoiceSettings({ activeId: 'c1', config: {}, customPersonas: [custom] })).toEqual({
      voice: 'Nova', volume: 0.5, rate: 1.5, speakEnabled: false, autoSpeak: true,
    });
  });
});

describe('resolveSpeakVoice', () => {
  it('matches case-insensitively, then by substring, else null', () => {
    expect(resolveSpeakVoice('lily', ['Lily', 'Aria'])).toBe('Lily');
    expect(resolveSpeakVoice('Lily', ['Microsoft Lily Online'])).toBe('Microsoft Lily Online');
    expect(resolveSpeakVoice('Zara', ['Lily', 'Aria'])).toBeNull();
  });
});

describe('newCustomPersona', () => {
  it('creates a custom persona with Lily, no pairing, Speak on, no auto-speak', () => {
    const p = newCustomPersona('Nova', 'A test persona');
    expect(p.id.startsWith('custom-')).toBe(true);
    expect(p.name).toBe('Nova');
    expect(p.source).toBe('custom');
    expect(p.voice).toBe('Lily');
    expect(p.homunculusId).toBeNull();
    expect(p.speakEnabled).toBe(true);
    expect(p.autoSpeak).toBe(false);
    expect(p.allowedTools).toEqual(ALL_PERSONA_TOOL_IDS);
  });

  it('two creations get different ids', () => {
    expect(newCustomPersona('A', '').id).not.toBe(newCustomPersona('A', '').id);
  });
});

describe('soulsConfigPath', () => {
  it('points at ~/.luciferai/data/souls.json', () => {
    expect(soulsConfigPath('/Users/gary')).toBe('/Users/gary/.luciferai/data/souls.json');
    expect(DEFAULT_PERSONA_VOICE).toBe('Lily');
  });
});

describe('assignPersonaVoices (redo, 2026-11-07 — the old take gave every persona the same default voice)', () => {
  const macVoices = ['Samantha', 'Alex', 'Daniel', 'Karen', 'Moira', 'Tessa'];

  it('gives each persona a different voice from the cast, drawn from the voices actually available', () => {
    const assigned = assignPersonaVoices(['soul-lucifer', 'soul-eve', 'soul-nova'], macVoices);
    const voices = [...assigned.values()];
    expect(new Set(voices).size).toBe(3);
    for (const v of voices) expect(macVoices).toContain(v);
  });

  it('is deterministic — the same roster gets the same voices', () => {
    const ids = ['soul-lucifer', 'soul-eve'];
    const a = assignPersonaVoices(ids, macVoices);
    const b = assignPersonaVoices(ids, macVoices);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it('only uses cast voices that are actually installed', () => {
    // 'Aria' is not in the cast: with only one cast voice present
    // it falls back to the full available list, so personas can
    // still sound different from each other.
    const assigned = assignPersonaVoices(['a', 'b'], ['Samantha', 'Aria']);
    expect(new Set(assigned.values()).size).toBe(2);
    for (const v of assigned.values()) expect(['Samantha', 'Aria']).toContain(v);
  });

  it('returns null for everyone when no voices are available', () => {
    const assigned = assignPersonaVoices(['a', 'b'], []);
    expect([...assigned.values()]).toEqual([null, null]);
  });

  it('shares voices only when there are more personas than voices', () => {
    const assigned = assignPersonaVoices(['a', 'b', 'c'], ['Samantha']);
    expect([...assigned.values()]).toEqual(['Samantha', 'Samantha', 'Samantha']);
  });
});

describe('resolvePersonaVoice', () => {
  const macVoices = ['Samantha', 'Alex', 'Daniel', 'Karen'];

  it('an explicit pick of a real voice always wins', () => {
    expect(
      resolvePersonaVoice(persona({ id: 'p-1', voice: 'Alex' }), {
        availableVoices: macVoices,
        personaIds: ['p-1', 'p-2'],
      }),
    ).toBe('Alex');
  });

  it("a stored 'Lily' resolves to that persona's own assigned voice — never the shared default", () => {
    const lucifer = resolvePersonaVoice(persona({ id: 'soul-lucifer', voice: 'Lily' }), {
      availableVoices: macVoices,
      personaIds: ['soul-lucifer', 'soul-eve'],
    });
    const eve = resolvePersonaVoice(persona({ id: 'soul-eve', voice: 'Lily' }), {
      availableVoices: macVoices,
      personaIds: ['soul-lucifer', 'soul-eve'],
    });
    expect(lucifer).not.toBeNull();
    expect(eve).not.toBeNull();
    expect(lucifer).not.toBe('Lily');
    expect(eve).not.toBe('Lily');
    // The old bad take: both resolved to the same default voice.
    expect(lucifer).not.toBe(eve);
    expect(macVoices).toContain(lucifer);
    expect(macVoices).toContain(eve);
  });

  it('an unmatched stored voice also resolves to the assigned voice, not the default', () => {
    const voice = resolvePersonaVoice(persona({ id: 'p-9', voice: 'Zara' }), {
      availableVoices: macVoices,
      personaIds: ['p-9'],
    });
    expect(voice).not.toBeNull();
    expect(macVoices).toContain(voice);
  });

  it('returns null when no voices are available at all', () => {
    expect(
      resolvePersonaVoice(persona({ voice: 'Lily' }), { availableVoices: [] }),
    ).toBeNull();
  });
});

describe('personaVoiceSample', () => {
  it('names the persona, so the preview judges the voice against that persona', () => {
    expect(personaVoiceSample(persona({ name: 'Lucifer' }))).toBe(
      "Hi, I'm Lucifer. This is my voice.",
    );
    expect(personaVoiceSample(persona({ name: '  ' }))).toBe(
      "Hi, I'm Persona. This is my voice.",
    );
  });
});

describe('getActivePersonaVoiceSettings with availableVoices', () => {
  const macVoices = ['Samantha', 'Alex', 'Daniel', 'Karen'];
  const cfg = (voice: string) => ({
    voice,
    allowedTools: [],
    homunculusId: null,
    speakEnabled: true,
    autoSpeak: false,
    volume: 1,
    rate: 1,
  });

  it("resolves a stored 'Lily' to the active persona's assigned voice in chat Speak", () => {
    const settings = getActivePersonaVoiceSettings({
      activeId: 'soul-lucifer',
      config: { 'soul-lucifer': cfg('Lily') },
      customPersonas: [],
      availableVoices: macVoices,
      personaIds: ['soul-lucifer', 'soul-eve'],
    });
    expect(settings.voice).not.toBe('Lily');
    expect(macVoices).toContain(settings.voice);
  });

  it('keeps the stored voice when no available voices are passed (old behaviour)', () => {
    const settings = getActivePersonaVoiceSettings({
      activeId: 'soul-lucifer',
      config: { 'soul-lucifer': cfg('Lily') },
      customPersonas: [],
    });
    expect(settings.voice).toBe('Lily');
  });

  it('the cast is real macOS voices installed on Gary\'s Mac, in preference order', () => {
    expect(PERSONA_VOICE_CAST[0]).toBe('Samantha');
    expect(PERSONA_VOICE_CAST).toContain('Daniel');
    expect(PERSONA_VOICE_CAST).toContain('Fred');
    // Verified absent from `say -v '?'` on the Mac — never listed.
    expect(PERSONA_VOICE_CAST).not.toContain('Alex');
    expect(PERSONA_VOICE_CAST).not.toContain('Lily');
    expect(new Set(PERSONA_VOICE_CAST).size).toBe(PERSONA_VOICE_CAST.length);
  });
});

describe('Speak actor dropdown default — the active Homunculus voice (Gary, 2026-11-07)', () => {
  const macVoices = ['Samantha', 'Daniel', 'Karen', 'Moira', 'Tessa', 'Fred'];
  const lucifer = emptyHomunculus('lucifer', 'Lucifer', 'purple');
  const eve = emptyHomunculus('eve', 'EVE', 'pink');
  const cfg = (voice: string, homunculusId: string | null = null) => ({
    voice,
    allowedTools: [],
    homunculusId,
    speakEnabled: true,
    autoSpeak: false,
    volume: 1,
    rate: 1,
  });

  it('activeHomunculus is the selected one, else the first in the roster, else null', () => {
    expect(activeHomunculus([lucifer, eve], 'eve')).toBe(eve);
    expect(activeHomunculus([lucifer, eve], null)).toBe(lucifer);
    expect(activeHomunculus([lucifer, eve], 'no-such-id')).toBe(lucifer);
    expect(activeHomunculus([], null)).toBeNull();
  });

  it('speakActorOptions lists the installed cast voices first, in cast order, then the rest', () => {
    expect(speakActorOptions(['Zara', 'Karen', 'Samantha', 'Alex'])).toEqual([
      'Samantha',
      'Karen',
      'Zara',
      'Alex',
    ]);
    expect(speakActorOptions([])).toEqual([]);
    expect(speakActorOptions(['Zara'])).toEqual(['Zara']);
  });

  it('the default is the paired persona\'s effective voice when one is paired to the active Homunculus', () => {
    const paired = persona({ id: 'c-nova', source: 'custom', name: 'Nova', homunculusId: 'lucifer', voice: 'Karen' });
    const resolved = resolveDefaultSpeakVoice({
      roster: [lucifer, eve],
      selectedId: 'lucifer',
      config: {},
      customPersonas: [paired],
      availableVoices: macVoices,
    });
    expect(resolved.voice).toBe('Karen');
    expect(resolved.homunculus).toBe(lucifer);
    expect(resolved.source).toBe('homunculus-persona');
    expect(resolved.personaName).toBe('Nova');
    expect(resolved.label).toBe("Lucifer's voice · Karen (paired persona Nova)");
  });

  it('a paired persona with a stored phantom Lily resolves to its assigned cast voice, never the system default for everyone', () => {
    const resolved = resolveDefaultSpeakVoice({
      roster: [lucifer],
      selectedId: 'lucifer',
      config: { 'soul-1': cfg('Lily', 'lucifer') },
      customPersonas: [],
      availableVoices: macVoices,
    });
    expect(resolved.source).toBe('homunculus-persona');
    expect(resolved.voice).not.toBe('Lily');
    expect(macVoices).toContain(resolved.voice);
  });

  it('an unpaired Homunculus gets a stable deterministic cast voice from its own id', () => {
    const args = {
      roster: [lucifer],
      selectedId: 'lucifer',
      config: {},
      customPersonas: [],
      availableVoices: macVoices,
    } as const;
    const first = resolveDefaultSpeakVoice(args);
    const second = resolveDefaultSpeakVoice(args);
    expect(first.source).toBe('homunculus-assigned');
    expect(first.voice).toBe(second.voice);
    expect(first.voice).not.toBe('Lily');
    expect(macVoices).toContain(first.voice);
    expect(first.label).toBe(`Lucifer's voice · ${first.voice}`);
    // A different Homunculus in the same roster gets a different voice
    // (distinctness holds within one assignment over the roster — the
    // two resolutions below share the same roster, so the probe
    // separates them).
    const luciferInPair = resolveDefaultSpeakVoice({ ...args, roster: [lucifer, eve], selectedId: 'lucifer' });
    const eveVoice = resolveDefaultSpeakVoice({ ...args, roster: [lucifer, eve], selectedId: 'eve' });
    expect(eveVoice.voice).not.toBe(luciferInPair.voice);
  });

  it('selecting the second Homunculus moves the default to its voice', () => {
    const args = {
      roster: [lucifer, eve],
      selectedId: 'eve',
      config: {},
      customPersonas: [],
      availableVoices: macVoices,
    } as const;
    const resolved = resolveDefaultSpeakVoice(args);
    expect(resolved.homunculus).toBe(eve);
    expect(resolved.label.startsWith("EVE's voice · ")).toBe(true);
  });

  it('with no Homunculus at all the default is the active persona\'s voice (the old Speak behaviour)', () => {
    const resolved = resolveDefaultSpeakVoice({
      roster: [],
      selectedId: null,
      config: { 'soul-1': cfg('Karen') },
      customPersonas: [],
      availableVoices: macVoices,
      activePersonaId: 'soul-1',
    });
    expect(resolved.source).toBe('persona');
    expect(resolved.homunculus).toBeNull();
    expect(resolved.voice).toBe('Karen');
  });

  it('with no voices available at all the default is null — the caller falls back to the system default', () => {
    const resolved = resolveDefaultSpeakVoice({
      roster: [lucifer],
      selectedId: 'lucifer',
      config: {},
      customPersonas: [],
      availableVoices: [],
    });
    expect(resolved.voice).toBeNull();
    expect(resolved.label).toContain('system default');
  });
});
