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
  newCustomPersona,
  soulsConfigPath,
  type ParsedSoul,
  type Persona,
} from '../src/lib/personaPlex';

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
