/**
 * Modules tab — the Modules anchored plugin's tab in Settings
 * (Gary, 2026-11-06).
 *
 * Modules is an ANCHORED plugin: built in, always present, no
 * install step, no toolbar button. Its tab lives here, in the
 * Settings. It is the container for Segments — the starship's
 * segments appear in this tab (in the Segments panel below) when
 * a starship is detected.
 */
import { MODULES_PLUGIN } from '../../data/modules';
import { SegmentsPanel } from './SegmentsPanel';

export function ModulesTab() {
  const Icon = MODULES_PLUGIN.icon;

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
      </section>

      <SegmentsPanel />
    </div>
  );
}
