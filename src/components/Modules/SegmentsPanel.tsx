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
 *
 * CATEGORISED SECTIONS (Gary, 2026-11-07 ~02:50 PST): the panel
 * is organised into categorised sections, each with an info
 * explanatory page and a voice that reads the EXACT words on
 * that page — the same as the Settings tabs info page + voice.
 * The categories and their info texts live in
 * src/lib/segmentCategories.ts (single source of truth: the
 * panel renders the text, the voice mp3 is synthesized from it).
 * Categories reflect what the segments ARE — nothing invented.
 */
import { Puzzle } from 'lucide-react';
import {
  PLUGIN_ADDONS,
  isAddonInstalled,
  addonAnchorLabel,
} from '../../data/pluginAddons';
import { detectStarship } from '../../lib/starshipDetection';
import { segmentCategory } from '../../lib/segmentCategories';
import { useSettingsStore } from '../../stores/settingsStore';
import { AIChatSegment } from './AIChatSegment';
import { ComputerControlSegment } from './ComputerControlSegment';
import { ForgePersonaPlexSegment } from './ForgePersonaPlexSegment';
import { SegmentCategorySection } from './SegmentCategorySection';

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

  const about = segmentCategory('about');
  const control = segmentCategory('computer-control');
  const aiChat = segmentCategory('ai-chat');
  const starship = segmentCategory('starship');
  const forge = segmentCategory('forge-persona-plex');

  return (
    <div className="space-y-6">
      {about && (
        <SegmentCategorySection category={about}>
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
        </SegmentCategorySection>
      )}

      {/* Computer control — the pre-installed, agent-only segment
          (Gary, 2026-11-06). No starship, no install step, no
          server: it ships inside Lucid and lets a trained,
          user-directed agent drive the Mac one verified action at a
          time, failsafed like the phone setup. */}
      {control && (
        <SegmentCategorySection category={control}>
          <ComputerControlSegment />
        </SegmentCategorySection>
      )}

      {/* AI Chat — the pre-installed, connectable segment (Gary,
          2026-11-08). Its own plugin, independent of LuciferAI,
          and a place other things can connect to: things like a
          starship can use segments to connect to it. */}
      {aiChat && (
        <SegmentCategorySection category={aiChat}>
          <AIChatSegment />
        </SegmentCategorySection>
      )}

      {starship && (
        <SegmentCategorySection category={starship}>
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
        </SegmentCategorySection>
      )}

      {/* Forge ↔ Persona Plex — the bridge segment. It appears only
          when Persona Plex is installed; installing Persona Plex
          carries it with it, removing it hides it again. The voice
          picker and the voice ↔ chat-message options live inside
          this segment (see ForgePersonaPlexSegment). */}
      {personaPlexInstalled && forge && (
        <SegmentCategorySection category={forge}>
          <ForgePersonaPlexSegment />
        </SegmentCategorySection>
      )}
    </div>
  );
}
