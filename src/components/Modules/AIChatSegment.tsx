/**
 * AI Chat segment — the pre-installed, connectable segment in the
 * Segments panel (Gary, 2026-11-08 ~00:54 PST): "Ok add a segment
 * for it" + "allows things like starship that can use segments to
 * connect to it etc".
 *
 * Pre-installed: no starship, no install step. AI Chat is its own
 * core plugin (src/data/toolbarPlugins.ts, id 'ai-chat'), split
 * from the LuciferAI plugin — it is Lucid AI, independent of
 * LuciferAI, and it stays when LuciferAI is off. It lives on the
 * StatusBar and starts off the toolbar; turning it on is Gary's
 * explicit choice (defaultOnToolbar: false).
 *
 * The panel shows:
 * - The segment itself (pre-installed) and its toolbar toggle —
 *   the SAME settings.toolbarPlugins['ai-chat'] state the
 *   Settings → Plugins tab toggles (one source of truth, two
 *   views). Unlike the Synth / blood-drop surfaces, this toggle
 *   stays live with LuciferAI off — AI Chat is not a LuciferAI
 *   surface.
 * - What it runs on: the ping server, your API key, or a local
 *   model.
 * - That it stays when LuciferAI is off.
 * - Connections: AI Chat is a place other things can connect to.
 *   Things like a starship can use segments to connect to it, so
 *   they can talk to Lucid AI through it. How a connection is
 *   made is OPEN (Gary's call) — nothing here invents a
 *   connection mechanism, a purchase check, a store, or a license
 *   server. Until one exists, the segment honestly reports no
 *   connections.
 */
import { Sparkles } from 'lucide-react';
import { TOOLBAR_PLUGINS } from '../../data/toolbarPlugins';
import { useSettingsStore } from '../../stores/settingsStore';
import { Toggle } from '../Settings/Toggle';

export function AIChatSegment() {
  const plugin = TOOLBAR_PLUGINS.find((p) => p.id === 'ai-chat');
  const toolbarPlugins = useSettingsStore((s) => s.settings.toolbarPlugins ?? {});
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  // Same state as Settings → Plugins: a Settings override wins,
  // with no override the plugin's default (off) applies.
  const onToolbar = plugin ? (toolbarPlugins[plugin.id] ?? plugin.defaultOnToolbar) : false;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Sparkles size={18} className="text-[var(--text-muted)] shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm">AI Chat</span>
          <span className="block text-xs leading-[1.5] text-[var(--text-muted)]">
            {plugin
              ? plugin.description
              : 'Lucid AI chat panel — its own plugin, independent of LuciferAI.'}
          </span>
        </span>
        <span className="text-xs text-[var(--text-muted)] shrink-0">Pre-installed</span>
      </div>

      {/* Toolbar toggle — the same setting Settings → Plugins
          toggles. AI Chat is not a LuciferAI surface, so this
          stays live with LuciferAI off. */}
      <div className="flex items-center gap-3">
        <Toggle
          checked={onToolbar}
          onChange={(checked) =>
            updateSetting('toolbarPlugins', {
              ...toolbarPlugins,
              ['ai-chat']: checked,
            })
          }
          ariaLabel="Show AI Chat on the toolbar"
          title="Put AI Chat on the toolbar — it lives on the StatusBar today"
        />
        <span className="text-xs leading-[1.5] text-[var(--text-muted)]">
          {onToolbar
            ? 'On the toolbar — AI Chat is a toolbar button.'
            : 'Off the toolbar — AI Chat lives on the StatusBar. Turning it on is your choice.'}
        </span>
      </div>

      <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
        Runs on the ping server, your API key, or a local model. It stays when LuciferAI is
        off — turning LuciferAI off removes the Synth and the blood drop, not AI Chat.
      </p>

      {/* Connections — AI Chat is a place other things can connect
          to. Things like a starship can use segments to connect to
          it, so they can talk to Lucid AI through it. How a
          connection is made is open (Gary's call); nothing here
          invents one. */}
      <div>
        <h4 className="text-xs font-semibold mb-2 text-[var(--text-secondary)]">Connections</h4>
        <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
          No connections yet. A starship, or anything else, can use segments to connect to AI
          Chat and talk to Lucid AI through it — how a connection is made is not decided yet,
          and this segment does not invent a connection mechanism.
        </p>
      </div>
    </div>
  );
}
