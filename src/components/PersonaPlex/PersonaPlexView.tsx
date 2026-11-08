/**
 * Persona Plex — the setup page (Gary, 2026-11-06).
 *
 * One plex embodiment, personas inside. The roster starts from the
 * EXISTING SOULS, read live from the Python soul config
 * (~/.luciferai/data/souls.json) — the page reads it on mount
 * through window.lucidAPI.fs (no new IPC, no server) and never
 * stores a soul's name/rarity/level. Custom personas are created
 * here and stored whole. Per persona you pick a voice (for Speak),
 * pair it to a Homunculus (the persona's voice is that
 * Homunculus's voice in Forge), set when it speaks (Speak on/off,
 * auto-speak), its volume and speed, and a tool allowlist (which
 * tools that persona may use, enforced locally). Click a persona
 * to make it active — Speak reads in the active persona's voice.
 *
 * Voices (redo, Gary 2026-11-07 — the old take was bad): every
 * persona used to store the same 'Lily', which is not a system
 * voice, so every persona silently spoke in the one system
 * default voice and there was no way to hear a persona at all.
 * Each persona now has its own effective voice from the macOS
 * cast (its stored voice when that matches a voice on this
 * machine, otherwise its assigned distinct voice), and the
 * speaker button next to each persona's voice plays a sample line
 * in that persona's voice, so the voice can be judged before it
 * is picked. The page-explanation recording at the top (Lily's
 * voice, one voice for the whole page) is unchanged — it explains
 * the page, it is not a persona's voice.
 * The voice + options also live in the Forge-to-Persona Plex
 * segment in Modules > Segments — the bridge where Forge's
 * Homunculus voices and Persona Plex's personas meet. The setup
 * page and the segment share the same settings (see
 * usePersonaRoster), so a voice picked in either place is the
 * voice everywhere: the voice that persona's chat bubble messages
 * speak in, and the voice Forge uses for its paired Homunculus.
 *
 * LOCAL ONLY — no servers, no MCP server, no port, no HTTP. The
 * Speak toggle below turns right-click Speak on/off in AI chat.
 */
import { useState } from 'react';
import { Users, Volume2, Pause, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { useForgeStore } from '../../stores/forgeStore';
import type { Persona } from '../../types';
import {
  ALL_PERSONA_TOOL_IDS,
  PERSONA_TOOLS,
  PERSONA_TOOL_CATEGORIES,
  newCustomPersona,
} from '../../lib/personaPlex';
import { Toggle } from '../Settings/Toggle';
import { PluginVoiceButton } from '../PluginVoiceButton';
import { pluginVoiceSrc } from '../../lib/pluginVoice';
import { usePersonaRoster } from './usePersonaRoster';

export function PersonaPlexView() {
  const {
    roster,
    soulsLoaded,
    customPersonas,
    activeId,
    speakEnabled,
    voiceOptionsFor,
    effectiveVoiceFor,
    speakingPersonaId,
    previewPersonaVoice,
    updatePersona,
    updateSetting,
  } = usePersonaRoster();
  const homunculi = useForgeStore((s) => s.roster);
  const [expandedPersonaId, setExpandedPersonaId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const toggleTool = async (persona: Persona, toolId: string) => {
    const allowed = persona.allowedTools.includes(toolId)
      ? persona.allowedTools.filter((id) => id !== toolId)
      : [...persona.allowedTools, toolId];
    await updatePersona({ ...persona, allowedTools: allowed });
  };

  const setCategoryTools = async (
    persona: Persona,
    category: (typeof PERSONA_TOOL_CATEGORIES)[number],
    allow: boolean,
  ) => {
    const categoryIds = PERSONA_TOOLS.filter((t) => t.category === category).map(
      (t) => t.id,
    );
    const allowed = allow
      ? [...new Set([...persona.allowedTools, ...categoryIds])]
      : persona.allowedTools.filter((id) => !categoryIds.includes(id));
    await updatePersona({ ...persona, allowedTools: allowed });
  };

  const addPersona = async () => {
    if (!newName.trim()) return;
    const persona = newCustomPersona(newName, newDescription);
    await updateSetting('personaPlexCustomPersonas', [...customPersonas, persona]);
    setNewName('');
    setNewDescription('');
  };

  const removePersona = async (persona: Persona) => {
    await updateSetting(
      'personaPlexCustomPersonas',
      customPersonas.filter((p) => p.id !== persona.id),
    );
    if (activeId === persona.id) {
      await updateSetting('personaPlexActiveId', null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <header>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users size={20} />
            Persona Plex
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            One plex embodiment, personas inside. The roster starts from
            your existing souls — custom personas are added below. Local
            only, no servers.
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Voices + options also live in the Forge-to-Persona Plex
            segment (Modules &gt; Segments) — the bridge where a
            persona&rsquo;s voice meets its Homunculus. A voice picked
            there is the same voice here. Each persona has its own
            voice — press the speaker next to a persona&rsquo;s voice
            to hear that persona speak.
          </p>
          {/* Voice explanation (Gary, 2026-11-07 ~02:54 PST):
              plugins have voice recordings all throughout. */}
          <div className="mt-2">
            <PluginVoiceButton
              voiceId="persona-plex-view"
              title="Persona Plex"
              src={pluginVoiceSrc('persona-plex-view')}
            />
          </div>
        </header>

        {/* Speak — the right-click Speak toggle (Gary, 2026-11-06).
            When on, right-clicking a message in AI chat shows Speak,
            read aloud in the active persona's voice. */}
        <section className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <Toggle
              checked={speakEnabled}
              onChange={(checked) => void updateSetting('personaPlexSpeakEnabled', checked)}
              ariaLabel="Speak on right-click"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm">
                <Volume2 size={14} />
                Speak on right-click
              </span>
              <span className="block text-xs text-[var(--text-muted)]">
                When on, right-clicking a message in AI chat shows Speak —
                read aloud in the active persona&rsquo;s voice. Off hides it.
              </span>
            </span>
          </label>
        </section>

        {/* Roster */}
        <section>
          <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">
            Personas ({roster.length})
          </h3>
          {!soulsLoaded && (
            <p className="text-xs text-[var(--text-muted)]">Loading souls…</p>
          )}
          {soulsLoaded && roster.length === 0 && (
            <p className="text-sm text-[var(--text-muted)]">
              No personas yet — no souls in the Python soul config, and no
              custom personas. Add one below.
            </p>
          )}
          <div className="space-y-3">
            {roster.map((persona) => {
              const isActive = activeId === persona.id;
              const expanded = expandedPersonaId === persona.id;
              return (
                <div
                  key={persona.id}
                  data-persona-row={persona.id}
                  className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3 space-y-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{persona.name}</span>
                      <span className="block text-xs text-[var(--text-muted)]">
                        {persona.source === 'soul'
                          ? `Soul · ${persona.rarity ?? 'common'} · level ${persona.level ?? 1}`
                          : 'Custom persona'}
                        {persona.description ? ` · ${persona.description}` : ''}
                      </span>
                    </span>
                    <button
                      data-persona-active={persona.id}
                      onClick={() => void updateSetting('personaPlexActiveId', persona.id)}
                      disabled={isActive}
                      className="btn btn-secondary text-xs shrink-0 disabled:opacity-50"
                    >
                      {isActive ? 'Active' : 'Set active'}
                    </button>
                    {persona.source === 'custom' && (
                      <button
                        data-persona-remove={persona.id}
                        onClick={() => void removePersona(persona)}
                        className="btn btn-secondary text-xs shrink-0"
                        title="Remove persona"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  {/* Voice picker — the value shown is the voice
                      this persona ACTUALLY speaks in (its stored
                      voice when that matches a voice on this
                      machine, otherwise its assigned voice from
                      the cast). The speaker next to it plays a
                      sample line in that voice, so the voice can
                      be judged before it is picked. */}
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-[var(--text-muted)] text-xs w-12 shrink-0">Voice</span>
                    <select
                      data-persona-voice={persona.id}
                      value={effectiveVoiceFor(persona)}
                      onChange={(e) => void updatePersona({ ...persona, voice: e.target.value })}
                      className="input text-sm flex-1"
                    >
                      {voiceOptionsFor(persona).map((voice) => (
                        <option key={voice} value={voice}>
                          {voice}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      data-persona-hear={persona.id}
                      onClick={() => void previewPersonaVoice(persona)}
                      className="btn btn-secondary text-xs shrink-0"
                      title={`Hear ${persona.name} in ${effectiveVoiceFor(persona)}`}
                      aria-label={
                        speakingPersonaId === persona.id
                          ? `Stop ${persona.name}'s voice`
                          : `Hear ${persona.name}'s voice`
                      }
                    >
                      {speakingPersonaId === persona.id ? <Pause size={14} /> : <Volume2 size={14} />}
                    </button>
                  </div>

                  {/* Homunculus pairing — the persona's voice is the
                      voice Forge uses for this Homunculus. */}
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-[var(--text-muted)] text-xs w-12 shrink-0">Homunculus</span>
                    <select
                      data-persona-homunculus={persona.id}
                      value={persona.homunculusId ?? ''}
                      onChange={(e) =>
                        void updatePersona({
                          ...persona,
                          homunculusId: e.target.value || null,
                        })
                      }
                      className="input text-sm flex-1"
                    >
                      <option value="">Not paired</option>
                      {homunculi.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name} ({h.color})
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="text-xs text-[var(--text-muted)]">
                    Pairing a Homunculus makes this persona&rsquo;s voice
                    the voice Forge uses for it.
                  </p>

                  {/* Voice options — when it speaks, and how loud/fast.
                      These are the same settings the Forge-to-Persona
                      Plex segment shows, for this persona. */}
                  <div className="space-y-2">
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
                        data-persona-volume={persona.id}
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
                        data-persona-rate={persona.id}
                        aria-label={`Speed for ${persona.name}`}
                        className="flex-1"
                      />
                      <span className="text-xs w-10 text-right">
                        {persona.rate.toFixed(1)}×
                      </span>
                    </label>
                  </div>

                  {/* Tool allowlist */}
                  <div>
                    <button
                      data-persona-tools-toggle={persona.id}
                      onClick={() =>
                        setExpandedPersonaId(expanded ? null : persona.id)
                      }
                      className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      Tools — {persona.allowedTools.length} of {ALL_PERSONA_TOOL_IDS.length} allowed
                    </button>
                    {expanded && (
                      <div className="mt-2 space-y-3">
                        {PERSONA_TOOL_CATEGORIES.map((category) => {
                          const tools = PERSONA_TOOLS.filter(
                            (t) => t.category === category,
                          );
                          return (
                            <div key={category}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold capitalize">
                                  {category}
                                </span>
                                <button
                                  onClick={() => void setCategoryTools(persona, category, true)}
                                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                >
                                  All
                                </button>
                                <button
                                  onClick={() => void setCategoryTools(persona, category, false)}
                                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                >
                                  None
                                </button>
                              </div>
                              <div className="grid grid-cols-2 gap-1">
                                {tools.map((tool) => (
                                  <label
                                    key={tool.id}
                                    className="flex items-center gap-2 text-xs cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      data-persona-tool={`${persona.id}:${tool.id}`}
                                      checked={persona.allowedTools.includes(tool.id)}
                                      onChange={() => void toggleTool(persona, tool.id)}
                                    />
                                    <span title={tool.description}>
                                      {tool.id}
                                      {tool.isRisky ? ' ⚠️' : ''}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Add a custom persona */}
        <section className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3 space-y-2">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)]">
            Add a persona
          </h3>
          <input
            data-persona-new-name
            type="text"
            className="input text-sm w-full"
            placeholder="Persona name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            data-persona-new-description
            type="text"
            className="input text-sm w-full"
            placeholder="Description (optional)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addPersona();
            }}
          />
          <button
            data-persona-add
            onClick={() => void addPersona()}
            disabled={!newName.trim()}
            className="btn btn-primary text-sm disabled:opacity-50"
          >
            <Plus size={14} className="inline mr-1" />
            Add persona
          </button>
        </section>
      </div>
    </div>
  );
}
