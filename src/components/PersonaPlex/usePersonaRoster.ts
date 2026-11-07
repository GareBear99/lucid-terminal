/**
 * usePersonaRoster — the shared Persona Plex roster (Gary, 2026-11-06).
 *
 * The roster starts from the EXISTING SOULS, read live from the
 * Python soul config (~/.luciferai/data/souls.json) through
 * window.lucidAPI.fs (no new IPC, no server), merged with the
 * stored config overrides and the custom personas. A soul's
 * name/rarity/level are never stored — they are read live; only
 * the per-persona setup (voice, Homunculus pairing, Speak/auto-
 * speak, volume, rate, tool allowlist) is stored, in
 * `personaPlexConfig` (soul personas) or
 * `personaPlexCustomPersonas` (custom personas).
 *
 * Used by both the Persona Plex setup page and the Forge-to-
 * Persona Plex segment in Segments — one source of truth for the
 * roster and for updating a persona, so the two views can never
 * disagree. The voice chosen here (on the setup page or in the
 * segment) is the same voice: it is the voice that persona's chat
 * bubble messages speak in, and — when the persona is paired to a
 * Homunculus — the voice Forge uses for that Homunculus.
 *
 * LOCAL ONLY — no servers, no MCP server, no port, no HTTP.
 */
import { useEffect, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import type { Persona } from '../../types';
import {
  DEFAULT_PERSONA_VOICE,
  parseSoulsConfig,
  soulsConfigPath,
  mergePersonas,
  type ParsedSoul,
} from '../../lib/personaPlex';
import { getAvailableSpeakVoices } from '../../lib/speak';

export function usePersonaRoster() {
  const { settings, updateSetting } = useSettingsStore();
  const [souls, setSouls] = useState<ParsedSoul[]>([]);
  const [soulsLoaded, setSoulsLoaded] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<string[]>([]);

  const config = settings.personaPlexConfig ?? {};
  const customPersonas = settings.personaPlexCustomPersonas ?? [];
  const activeId = settings.personaPlexActiveId ?? null;
  const speakEnabled = settings.personaPlexSpeakEnabled ?? false;

  // The roster: souls from the Python config (read live, never
  // stored) plus the custom personas. A soul with no stored config
  // yet gets Lily's voice and every tool allowed.
  const roster = mergePersonas(souls, config, customPersonas);

  // Read the Python soul config on mount. A missing file (the soul
  // system never ran) is an empty roster from souls, not an error —
  // custom personas still work. A corrupt file is also empty, not a
  // crash. The fs API is absent under SSR/tests, so guard for it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fs = (window as unknown as { lucidAPI?: { fs?: { getHomeDir: () => Promise<string>; readFile: (p: string) => Promise<string> } } }).lucidAPI?.fs;
        if (!fs) return;
        const homeDir = await fs.getHomeDir();
        const text = await fs.readFile(soulsConfigPath(homeDir));
        if (cancelled) return;
        setSouls(parseSoulsConfig(JSON.parse(text)));
      } catch {
        if (!cancelled) setSouls([]);
      } finally {
        if (!cancelled) setSoulsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // System voices for the picker load async — refresh when they arrive.
  useEffect(() => {
    setAvailableVoices(getAvailableSpeakVoices());
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const refresh = () => setAvailableVoices(getAvailableSpeakVoices());
    window.speechSynthesis.addEventListener('voiceschanged', refresh);
    return () =>
      window.speechSynthesis.removeEventListener('voiceschanged', refresh);
  }, []);

  // The voice options for a persona: Lily (the Forge voice) first,
  // then the system voices, then the persona's own voice if it is
  // not in the list (so the picker never silently resets it).
  const voiceOptionsFor = (persona: Persona): string[] => {
    const options = [DEFAULT_PERSONA_VOICE, ...availableVoices];
    if (!options.includes(persona.voice)) options.push(persona.voice);
    return [...new Set(options)];
  };

  // Update a persona's stored setup. Takes the WHOLE updated
  // persona (not a patch) so unpairing a Homunculus — setting
  // homunculusId to null — is unambiguous (a patch cannot tell
  // "set to null" from "not mentioned"). A soul persona's setup is
  // a config override keyed by soul id (the soul itself is never
  // written); a custom persona is updated in place. Updated AND
  // stored, so the change survives restart.
  //
  // Reads the settings LIVE at call time (not the render-time
  // closure): two sequential updates (e.g. unpair the old persona,
  // then pair the new one) must each see the previous update, or
  // the second write would clobber the first with a stale base.
  const updatePersona = async (updated: Persona) => {
    const live = useSettingsStore.getState().settings;
    const liveConfig = live.personaPlexConfig ?? {};
    const liveCustom = live.personaPlexCustomPersonas ?? [];
    if (updated.source === 'soul') {
      await updateSetting('personaPlexConfig', {
        ...liveConfig,
        [updated.id]: {
          voice: updated.voice,
          allowedTools: updated.allowedTools,
          homunculusId: updated.homunculusId,
          speakEnabled: updated.speakEnabled,
          autoSpeak: updated.autoSpeak,
          volume: updated.volume,
          rate: updated.rate,
        },
      });
    } else {
      await updateSetting(
        'personaPlexCustomPersonas',
        liveCustom.map((p) => (p.id === updated.id ? updated : p)),
      );
    }
  };

  return {
    roster,
    soulsLoaded,
    config,
    customPersonas,
    activeId,
    speakEnabled,
    availableVoices,
    voiceOptionsFor,
    updatePersona,
    updateSetting,
  };
}
