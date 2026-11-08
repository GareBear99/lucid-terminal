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
 * Voices (redo, Gary 2026-11-07 — the old take was bad: every
 * persona stored the same 'Lily', which is not a system voice, so
 * every persona silently spoke in the one system default voice).
 * Each persona now has its own EFFECTIVE voice — its stored voice
 * when that matches a voice on this machine, otherwise its
 * assigned voice from the macOS cast (see resolvePersonaVoice in
 * src/lib/personaPlex.ts) — and a Hear button that speaks a sample
 * line in it, so the voice can be judged before it is picked.
 * A stored 'Lily' is migrated once to the assigned voice when the
 * real voice list is known.
 *
 * LOCAL ONLY — no servers, no MCP server, no port, no HTTP.
 */
import { useEffect, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import type { Persona } from '../../types';
import {
  DEFAULT_PERSONA_VOICE,
  PERSONA_VOICE_CAST,
  assignPersonaVoices,
  parseSoulsConfig,
  personaVoiceSample,
  resolvePersonaVoice,
  soulsConfigPath,
  mergePersonas,
  type ParsedSoul,
} from '../../lib/personaPlex';
import {
  getAvailableSpeakVoices,
  speakText,
  stopSpeaking,
  waitForSpeakVoices,
} from '../../lib/speak';

export function usePersonaRoster() {
  const { settings, updateSetting } = useSettingsStore();
  const [souls, setSouls] = useState<ParsedSoul[]>([]);
  const [soulsLoaded, setSoulsLoaded] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<string[]>([]);
  // The persona whose Hear-voice preview is speaking right now
  // (null when none) — the preview button shows Pause for it.
  const [speakingPersonaId, setSpeakingPersonaId] = useState<string | null>(null);

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

  // The voice options for a persona: the voice it ACTUALLY speaks
  // in first (its effective voice — see below), then the cast
  // voices installed on this machine in cast order, then any other
  // available system voice, then the persona's stored voice if it
  // is not in the list (so the picker never silently resets it).
  // The old list put 'Lily' first unconditionally — Lily is the
  // pre-recorded-mp3 voice, never a system voice, so picking it
  // silently spoke the system default for every persona.
  const voiceOptionsFor = (persona: Persona): string[] => {
    const effective = effectiveVoiceFor(persona);
    const byLower = new Map(
      availableVoices.map((v) => [v.toLowerCase(), v] as const),
    );
    const castAvailable = PERSONA_VOICE_CAST.filter((name) =>
      byLower.has(name.toLowerCase()),
    ).map((name) => byLower.get(name.toLowerCase()) as string);
    const options = [
      effective,
      ...castAvailable,
      ...availableVoices,
      persona.voice,
    ];
    return [...new Set(options)];
  };

  // The voice this persona ACTUALLY speaks in: its stored voice
  // when that matches a voice on this machine (an explicit pick
  // always wins), otherwise its assigned voice from the cast —
  // distinct per persona, stable across restarts. Falls back to
  // the stored voice when no voices are known yet, so the picker
  // always has a value.
  const effectiveVoiceFor = (persona: Persona): string => {
    return (
      resolvePersonaVoice(persona, {
        availableVoices,
        personaIds: roster.map((p) => p.id),
      }) ?? persona.voice
    );
  };

  // Hear this persona's voice: speak its sample line in its
  // effective voice, at its volume and rate. Click again (or
  // another persona's Hear) to stop. Waits for the system voices
  // to load first, so the match is made against the real list.
  // The preview is an explicit user action, so it plays even when
  // the persona's Speak toggle is off — it is how Gary judges
  // whether the voice fits, not a chat message.
  const previewPersonaVoice = async (persona: Persona): Promise<void> => {
    if (speakingPersonaId === persona.id) {
      stopSpeaking();
      setSpeakingPersonaId(null);
      return;
    }
    stopSpeaking();
    setSpeakingPersonaId(null);
    await waitForSpeakVoices();
    // Resolve against the FRESH voice list, not the render-time
    // closure — the voices may have arrived during the wait.
    const freshVoices = getAvailableSpeakVoices();
    const voice =
      resolvePersonaVoice(persona, {
        availableVoices: freshVoices,
        personaIds: roster.map((p) => p.id),
      }) ?? effectiveVoiceFor(persona);
    const started = speakText(personaVoiceSample(persona), voice, {
      volume: persona.volume,
      rate: persona.rate,
      onEnd: () =>
        setSpeakingPersonaId((current) =>
          current === persona.id ? null : current,
        ),
    });
    setSpeakingPersonaId(started ? persona.id : null);
  };

  // One-time migration (Gary, 2026-11-07 redo): a stored voice of
  // 'Lily' never spoke as Lily — Lily is not a system voice, so
  // every such persona silently shared the system default voice.
  // Once the real voice list is known, store each such persona's
  // assigned distinct voice instead, so the stored truth matches
  // what is heard everywhere (chat Speak, Forge, the picker).
  // Only stored 'Lily' values move — an explicit pick of a real
  // voice is never touched, and when 'Lily' really is an
  // available voice on this machine there is nothing to migrate.
  // A soul with no stored config at all is left alone: it resolves
  // to its assigned voice at speak time without a write.
  useEffect(() => {
    if (!soulsLoaded || availableVoices.length === 0) return;
    if (
      availableVoices.some(
        (v) => v.toLowerCase() === DEFAULT_PERSONA_VOICE.toLowerCase(),
      )
    ) {
      return;
    }
    const live = useSettingsStore.getState().settings;
    const liveConfig = live.personaPlexConfig ?? {};
    const liveCustom = live.personaPlexCustomPersonas ?? [];
    const needsMigration =
      Object.values(liveConfig).some(
        (c) => c.voice === DEFAULT_PERSONA_VOICE,
      ) ||
      liveCustom.some((p) => p.voice === DEFAULT_PERSONA_VOICE);
    if (!needsMigration) return;
    const assignments = assignPersonaVoices(
      [
        ...souls.map((s) => s.id),
        ...liveCustom.map((p) => p.id),
      ],
      availableVoices,
    );
    let nextConfig = liveConfig;
    for (const [id, cfg] of Object.entries(liveConfig)) {
      if (cfg.voice !== DEFAULT_PERSONA_VOICE) continue;
      const assigned = assignments.get(id);
      if (!assigned) continue;
      nextConfig = { ...nextConfig, [id]: { ...cfg, voice: assigned } };
    }
    const nextCustom = liveCustom.map((p) => {
      if (p.voice !== DEFAULT_PERSONA_VOICE) return p;
      const assigned = assignments.get(p.id);
      return assigned ? { ...p, voice: assigned } : p;
    });
    void (async () => {
      if (nextConfig !== liveConfig) {
        await updateSetting('personaPlexConfig', nextConfig);
      }
      if (nextCustom.some((p, i) => p !== liveCustom[i])) {
        await updateSetting('personaPlexCustomPersonas', nextCustom);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soulsLoaded, availableVoices]);

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
    effectiveVoiceFor,
    speakingPersonaId,
    previewPersonaVoice,
    updatePersona,
    updateSetting,
  };
}
