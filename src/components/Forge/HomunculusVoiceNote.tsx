/**
 * HomunculusVoiceNote — the voice the active Homunculus speaks in
 * (Gary, 2026-11-06).
 *
 * Shown next to the Forge voice messages. The voice is the voice
 * of the persona paired to the active Homunculus (set in the
 * Forge-to-Persona Plex segment or on the Persona Plex setup
 * page); a Homunculus with no persona paired yet falls back to
 * the default voice (Lily). Resolved from settings only, so the
 * Forge panels do not need to load the soul config.
 *
 * The voice messages themselves are pre-recorded mp3s in Lily's
 * voice (the default/fallback) — a recording cannot change voice.
 * The paired voice is the voice live Homunculus speech uses
 * (Speak, and the Homunculus as the live reporting buddy when it
 * speaks a message) — see voiceSettingsForHomunculusFromSettings
 * in src/lib/personaPlex.ts. This note shows which voice that is.
 */
import { useForgeStore } from '../../stores/forgeStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { voiceForHomunculusFromSettings } from '../../lib/personaPlex';

export function HomunculusVoiceNote() {
  const selectedId = useForgeStore((s) => s.selectedId);
  const roster = useForgeStore((s) => s.roster);
  const config = useSettingsStore((s) => s.settings.personaPlexConfig ?? {});
  const customPersonas = useSettingsStore(
    (s) => s.settings.personaPlexCustomPersonas ?? [],
  );

  const active = roster.find((h) => h.id === selectedId) ?? null;
  if (!active) return null;

  const voice = voiceForHomunculusFromSettings(active.id, {
    config,
    customPersonas,
  });
  const paired =
    (customPersonas ?? []).some((p) => p.homunculusId === active.id) ||
    Object.values(config ?? {}).some((c) => c.homunculusId === active.id);

  return (
    <p className="text-xs text-[var(--text-muted)]" data-homunculus-voice={active.id}>
      {active.name} speaks in {voice}
      {paired
        ? ' (paired persona — set in the Forge-to-Persona Plex segment).'
        : ' (default — pair a persona in the Forge-to-Persona Plex segment to change it).'}
    </p>
  );
}
