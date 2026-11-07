/**
 * Segments — Modules' anchored add-on (Gary, 2026-11-06).
 *
 * Segments is ANCHORED to the Modules plugin and LABELED as an
 * extension to the Modules plugin. It does NOT have an install —
 * no install button, no install action. It is just there, anchored,
 * as an extension (unlike the installable add-ons Persona Plex,
 * MCP Tools and gh-ai-operator, which have a disabled Install
 * button until an install flow exists). Its installed state comes
 * from the anchor (see src/data/pluginAddons.ts: `anchor:
 * 'modules'` + 'modules' in ANCHORED_PLUGIN_IDS), never from a
 * user install.
 *
 * WHEN THE STARSHIP IS DETECTED, Segments show up here, in the
 * Modules tab. That is the trigger. The detection itself lives in
 * src/lib/starshipDetection.ts — an explicit hook, currently
 * answering "not detected" because the detection mechanism (how
 * the starship link proves a purchase) is still open, Gary's call.
 * Do NOT fake a detection here and do NOT invent what a Segment
 * contains beyond the display descriptor the hook returns.
 */
import { Puzzle } from 'lucide-react';
import {
  PLUGIN_ADDONS,
  isAddonInstalled,
  addonAnchorLabel,
} from '../../data/pluginAddons';
import { detectStarship } from '../../lib/starshipDetection';
import { useSettingsStore } from '../../stores/settingsStore';
import { ComputerControlSegment } from './ComputerControlSegment';
import { ForgePersonaPlexSegment } from './ForgePersonaPlexSegment';

export function SegmentsPanel() {
  const segments = PLUGIN_ADDONS.find((addon) => addon.id === 'segments');
  const detection = detectStarship();
  const installed = segments ? isAddonInstalled(segments) : false;
  const anchorLabel = segments ? addonAnchorLabel(segments) : null;
  // The Forge-to-Persona Plex segment appears only when Persona
  // Plex is installed (the same installedAddons state as the
  // install flow). Installing Persona Plex carries this segment
  // with it; removing Persona Plex hides it again.
  const personaPlexInstalled = (useSettingsStore((s) => s.settings.installedAddons) ?? []).includes('persona-plex');

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Segments</h3>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          An extension of the Modules plugin — anchored to Modules, no
          install step. When a starship is detected, its Segments show
          up here.
        </p>
        {segments && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Puzzle size={18} className="text-[var(--text-muted)] shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm">{segments.name}</span>
                <span className="block text-xs text-[var(--text-muted)]">{segments.description}</span>
              </span>
              {installed && (
                <span className="text-xs text-[var(--text-muted)] shrink-0">
                  Installed{anchorLabel ? ` · ${anchorLabel}` : ''}
                </span>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Computer control — the pre-installed, agent-only segment
          (Gary, 2026-11-06). No starship, no install step, no
          server: it ships inside Lucid and lets a trained,
          user-directed agent drive the Mac one verified action at a
          time, failsafed like the phone setup. */}
      <section>
        <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Computer control</h3>
        <ComputerControlSegment />
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Starship segments</h3>
        {detection.detected ? (
          <div className="space-y-3">
            {detection.segments.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                Starship detected — it carries no Segments to show.
              </p>
            ) : (
              detection.segments.map((segment) => (
                <div key={segment.id} className="flex items-center gap-3">
                  <Puzzle size={18} className="text-[var(--text-muted)] shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{segment.name}</span>
                  </span>
                </div>
              ))
            )}
          </div>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">
            No starship detected. {detection.detail}
          </p>
        )}
      </section>

      {/* Forge ↔ Persona Plex — the bridge segment. It appears only
          when Persona Plex is installed; installing Persona Plex
          carries it with it, removing it hides it again. The voice
          picker and the voice ↔ chat-message options live inside
          this segment (see ForgePersonaPlexSegment). */}
      {personaPlexInstalled && (
        <section>
          <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">
            Forge-to-Persona Plex segment
          </h3>
          <ForgePersonaPlexSegment />
        </section>
      )}
    </div>
  );
}
