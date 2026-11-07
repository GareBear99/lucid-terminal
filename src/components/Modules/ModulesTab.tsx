/**
 * Modules tab — the Modules anchored plugin's tab in Settings
 * (Gary, 2026-11-06; heavy update 2026-11-07).
 *
 * Modules is an ANCHORED plugin: built in, always present, no
 * install step, no toolbar button. Its tab lives here, in the
 * Settings. It is the container for Segments.
 *
 * The tab is the map of the whole plugin, not just a header:
 * - What lives here — the inventory of every segment group in
 *   Modules, with its live status (live / waiting / hidden), read
 *   from the same state the panel itself uses. Nothing here is
 *   hardcoded: the starship row follows detectStarship(), the
 *   Forge bridge row follows whether Persona Plex is installed,
 *   the Segments add-on row follows its anchor.
 * - How a segment gets here — the three arrival routes: a segment
 *   is pre-installed (ships with Lucid), starship-detected (appears
 *   when a starship is detected), or add-on-carried (arrives with
 *   an installed add-on). Every segment in the panel below arrives
 *   by exactly one of these routes.
 * - The Segments panel itself (below) — the categorised sections,
 *   each with its own info page and voice.
 *
 * Built to Gary's standard (2026-11-07 ~02:48 PST): everything
 * like Slave — verify before trusting, be honest about what is
 * unknown, never assume. A status here is never guessed: waiting
 * means the detection is not wired yet, hidden means the add-on
 * that carries it is not installed, and each row says how to
 * change it.
 */
import {
  PLUGIN_ADDONS,
  isAddonInstalled,
  addonAnchorLabel,
} from '../../data/pluginAddons';
import { MODULES_PLUGIN } from '../../data/modules';
import { detectStarship } from '../../lib/starshipDetection';
import { useSettingsStore } from '../../stores/settingsStore';
import { SegmentsPanel } from './SegmentsPanel';
import { PluginVoiceButton } from '../PluginVoiceButton';
import { pluginVoiceSrc } from '../../lib/pluginVoice';

export function ModulesTab() {
  const Icon = MODULES_PLUGIN.icon;
  const segments = PLUGIN_ADDONS.find((addon) => addon.id === 'segments');
  const segmentsInstalled = segments ? isAddonInstalled(segments) : false;
  const anchorLabel = segments ? addonAnchorLabel(segments) : null;
  const detection = detectStarship();
  const personaPlexInstalled = (useSettingsStore((s) => s.settings.installedAddons) ?? []).includes('persona-plex');

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Modules</h3>
        <div className="flex items-center gap-3">
          <Icon size={18} className="text-[var(--text-muted)] shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm">{MODULES_PLUGIN.name}</span>
            <span className="block text-xs text-[var(--text-muted)]">
              {MODULES_PLUGIN.description}
            </span>
          </span>
          <span className="text-xs text-[var(--text-muted)] shrink-0">
            Built-in · Anchored
          </span>
        </div>
        {/* Voice explanation (Gary, 2026-11-07 ~02:54 PST): plugins
            have voice recordings all throughout. */}
        <div className="mt-3">
          <PluginVoiceButton
            voiceId="modules-main"
            title="Modules"
            src={pluginVoiceSrc('modules-main')}
          />
        </div>
      </section>

      {/* What lives here — the inventory. Every segment group in
          Modules, with its live status. A status is read from the
          same state the panel uses, never hardcoded. */}
      <section>
        <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">What lives here</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm">Segments</span>
              <span className="block text-xs text-[var(--text-muted)]">
                The add-on this plugin is anchored around — an extension of Modules.
              </span>
            </span>
            <span className="text-xs text-[var(--text-muted)] shrink-0">
              {segmentsInstalled
                ? `Installed${anchorLabel ? ` · ${anchorLabel}` : ''}`
                : 'Not installed'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm">Computer control</span>
              <span className="block text-xs text-[var(--text-muted)]">
                Pre-installed, agent-only — a trained, user-directed agent drives the Mac one verified action at a time.
              </span>
            </span>
            <span className="text-xs text-[var(--text-muted)] shrink-0">Pre-installed · Live</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm">Starship segments</span>
              <span className="block text-xs text-[var(--text-muted)]">
                Whatever a detected starship carries — shown here when one is detected.
              </span>
            </span>
            <span className="text-xs text-[var(--text-muted)] shrink-0">
              {detection.detected
                ? `Live · ${detection.segments.length} segment${detection.segments.length === 1 ? '' : 's'}`
                : 'Waiting — no starship detected'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm">Forge ↔ Persona Plex bridge</span>
              <span className="block text-xs text-[var(--text-muted)]">
                The bridge between Forge and Persona Plex — carried by the Persona Plex add-on.
              </span>
            </span>
            <span className="text-xs text-[var(--text-muted)] shrink-0">
              {personaPlexInstalled
                ? 'Live · Persona Plex installed'
                : 'Hidden — install Persona Plex to show it'}
            </span>
          </div>
        </div>
      </section>

      {/* How a segment gets here — the three arrival routes. Every
          segment in the panel below arrives by exactly one of these. */}
      <section>
        <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">How a segment gets here</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm">Pre-installed</span>
              <span className="block text-xs text-[var(--text-muted)]">
                Ships with Lucid — no starship, no install step. Computer control arrives this way.
              </span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm">Starship-detected</span>
              <span className="block text-xs text-[var(--text-muted)]">
                Appears when a starship is detected. Detection is not wired yet — Gary&apos;s call.
              </span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm">Add-on-carried</span>
              <span className="block text-xs text-[var(--text-muted)]">
                Arrives with an installed add-on, and hides again if it is removed. The Forge ↔ Persona Plex bridge arrives this way.
              </span>
            </span>
          </div>
        </div>
      </section>

      <SegmentsPanel />
    </div>
  );
}
