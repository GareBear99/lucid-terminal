/**
 * Forge ↔ Persona Plex segment — the bridge between Forge and
 * Persona Plex, in the Segments panel (Gary, 2026-11-06).
 *
 * This segment appears ONLY when Persona Plex is installed (it
 * reads the same `installedAddons` state as the install flow).
 * Installing Persona Plex carries this segment with it; removing
 * Persona Plex hides it again.
 *
 * The segment is where Forge's Homunculus voices and Persona
 * Plex's personas meet. For each Homunculus in the Forge roster
 * it shows the persona paired to it and the voice for that
 * pairing — the voice Forge uses for that Homunculus, and the
 * voice that persona's chat bubble messages speak in (Speak and
 * auto-speak). The voice picker and the options (Speak on/off,
 * auto-speak, volume, speed) live HERE, in this segment — the
 * Persona Plex setup page reflects the same settings (see
 * usePersonaRoster: one source of truth, two views), but this
 * segment is where the voice ↔ Homunculus ↔ chat-message pairing
 * is set.
 *
 * Pairing is one persona per Homunculus: pairing a persona to a
 * Homunculus unpairs whichever persona was paired there before.
 * A Homunculus with no persona paired falls back to the default
 * voice (Lily) — the existing Forge voice messages keep working.
 *
 * LOCAL ONLY — no servers, no MCP server, no port, no HTTP. The
 * settings are the same persisted Persona Plex settings (updated
 * AND stored).
 */
import { Users } from 'lucide-react';
import { useForgeStore } from '../../stores/forgeStore';
import { Toggle } from '../Settings/Toggle';
import { usePersonaRoster } from '../PersonaPlex/usePersonaRoster';
import { personaForHomunculus } from '../../lib/personaPlex';
import type { Persona } from '../../types';

export function ForgePersonaPlexSegment() {
  const { roster, updatePersona, voiceOptionsFor } = usePersonaRoster();
  const homunculi = useForgeStore((s) => s.roster);

  // Pair a persona to a Homunculus. One persona per Homunculus:
  // whichever persona was paired there before is unpaired first.
  const pairPersona = async (homunculusId: string, personaId: string | null) => {
    const currentlyPaired = personaForHomunculus(homunculusId, roster);
    if (currentlyPaired && currentlyPaired.id !== personaId) {
      await updatePersona({ ...currentlyPaired, homunculusId: null });
    }
    if (personaId) {
      const persona = roster.find((p) => p.id === personaId);
      if (persona) {
        await updatePersona({ ...persona, homunculusId });
      }
    }
  };

  // The voice options for one Homunculus's pairing — the voice
  // picker and the when/how it speaks, for the persona paired
  // there. Rendered per Homunculus so each pairing is set on its
  // own.
  const pairingOptions = (persona: Persona) => (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-[var(--text-muted)] text-xs w-12 shrink-0">Voice</span>
        <select
          data-segment-voice={persona.homunculusId ?? ''}
          value={persona.voice}
          onChange={(e) => void updatePersona({ ...persona, voice: e.target.value })}
          className="input text-sm flex-1"
        >
          {voiceOptionsFor(persona).map((voice) => (
            <option key={voice} value={voice}>
              {voice}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <Toggle
          checked={persona.speakEnabled}
          onChange={(checked) =>
            void updatePersona({ ...persona, speakEnabled: checked })
          }
          ariaLabel={`Speak on for ${persona.name}`}
        />
        <span className="text-xs">Speak on for this persona</span>
      </label>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <Toggle
          checked={persona.autoSpeak}
          onChange={(checked) =>
            void updatePersona({ ...persona, autoSpeak: checked })
          }
          ariaLabel={`Auto-speak for ${persona.name}`}
        />
        <span className="text-xs">
          Auto-speak this persona&rsquo;s messages as they arrive
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <span className="text-[var(--text-muted)] text-xs w-12 shrink-0">Volume</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(persona.volume * 100)}
          onChange={(e) =>
            void updatePersona({
              ...persona,
              volume: Number(e.target.value) / 100,
            })
          }
          data-segment-volume={persona.homunculusId ?? ''}
          aria-label={`Volume for ${persona.name}`}
          className="flex-1"
        />
        <span className="text-xs w-10 text-right">
          {Math.round(persona.volume * 100)}%
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <span className="text-[var(--text-muted)] text-xs w-12 shrink-0">Speed</span>
        <input
          type="range"
          min={0.5}
          max={2}
          step={0.1}
          value={persona.rate}
          onChange={(e) =>
            void updatePersona({
              ...persona,
              rate: Number(e.target.value),
            })
          }
          data-segment-rate={persona.homunculusId ?? ''}
          aria-label={`Speed for ${persona.name}`}
          className="flex-1"
        />
        <span className="text-xs w-10 text-right">{persona.rate.toFixed(1)}×</span>
      </label>
    </div>
  );

  return (
    <div
      data-forge-persona-plex-segment
      className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3 space-y-3"
    >
      <div className="flex items-center gap-3">
        <Users size={18} className="text-[var(--text-muted)] shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Forge ↔ Persona Plex</span>
          <span className="block text-xs text-[var(--text-muted)]">
            Installed · the bridge between Forge and Persona Plex. A
            persona&rsquo;s voice is the voice Forge uses for its
            paired Homunculus — and the voice that persona&rsquo;s chat
            bubble messages speak in.
          </span>
        </span>
      </div>

      {homunculi.length === 0 && (
        <p className="text-xs text-[var(--text-muted)]">
          No Homunculi yet — create one in the Forge first, then pair a
          persona to it here and pick its voice.
        </p>
      )}

      <div className="space-y-4">
        {homunculi.map((homunculus) => {
          const paired = personaForHomunculus(homunculus.id, roster);
          return (
            <div
              key={homunculus.id}
              data-segment-homunculus={homunculus.id}
              className="space-y-2 border-t border-[var(--border)] pt-3 first:border-t-0 first:pt-0"
            >
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{homunculus.name}</span>
                  <span className="block text-xs text-[var(--text-muted)]">
                    Homunculus · {homunculus.color}
                    {paired ? ` · paired to ${paired.name}` : ' · no persona paired'}
                  </span>
                </span>
              </div>

              {/* Which persona pairs to this Homunculus. */}
              <label className="flex items-center gap-2 text-sm">
                <span className="text-[var(--text-muted)] text-xs w-12 shrink-0">Persona</span>
                <select
                  data-segment-persona={homunculus.id}
                  value={paired?.id ?? ''}
                  onChange={(e) =>
                    void pairPersona(homunculus.id, e.target.value || null)
                  }
                  className="input text-sm flex-1"
                >
                  <option value="">Not paired</option>
                  {roster.map((persona) => (
                    <option key={persona.id} value={persona.id}>
                      {persona.name}
                    </option>
                  ))}
                </select>
              </label>

              {paired ? (
                pairingOptions(paired)
              ) : (
                <p className="text-xs text-[var(--text-muted)]">
                  No persona paired — this Homunculus speaks in the
                  default voice (Lily) until one is paired.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
