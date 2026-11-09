/**
 * DefconBadge Component (Gary, 2026-11-09).
 *
 * The DEFCON level, visible on the main terminal — NON-devmode
 * is where the DEFCONs take effect (Gary, 2026-11-09 ~04:24 PST:
 * "the DEFCONs take effect in NON-devmode — that is the point.
 * Devmode is where we understood them; non-devmode is where
 * they take effect"). So this badge renders ONLY when devmode
 * is OFF, on the FixNet line next to the stats — and returns
 * null in devmode. Non-devmode itself is untouched (perfect,
 * identical to Warp): the badge is the readiness level that
 * takes effect on it, it does not redesign it.
 *
 * DEFCON 1 = NOW, the war zone — red, because 1 is the most
 * intense (the topology mirrors the army's DEFCONs). Levels 2
 * and 3 read calmer as the build advances through the war zone.
 * The badge is a label, not a control: clicking it does nothing
 * (levels change only on Gary's explicit order, `/defcon`).
 * The `title` carries the level's tagline, so hovering says
 * what the level means.
 *
 * Purely presentational apart from the settings read: it takes
 * no props and reads devMode + defconLevel from the settings
 * store, so the states are trivially testable in isolation.
 */

import { useSettingsStore } from '../../stores/settingsStore';
import { defconName, defconTagline, type DefconLevel } from '../../lib/defcon';

function badgeClassName(level: DefconLevel): string {
  const base =
    'inline-block rounded border px-1.5 py-px font-mono text-[11px] leading-4';
  switch (level) {
    case 1:
      // The war zone — red, the most intense, like the army's 1.
      return `${base} border-red-500/60 text-red-400`;
    case 2:
      return `${base} border-amber-500/60 text-amber-400`;
    case 3:
      return `${base} border-green-500/60 text-green-400`;
  }
}

export function DefconBadge() {
  const devMode = useSettingsStore((s) => s.settings.devMode);
  const level = useSettingsStore((s) => s.settings.defconLevel);
  // NON-devmode only (Gary, 2026-11-09 ~04:24 PST): the DEFCONs
  // take effect on the main Warp-style terminal. In devmode the
  // badge is gone — devmode is where the levels were understood,
  // not where they take effect.
  if (devMode) return null;
  return (
    <span
      data-testid="defcon-badge"
      data-level={level}
      title={`${defconName(level)} — ${defconTagline(level)}`}
      className={badgeClassName(level)}
    >
      DEFCON {level}
    </span>
  );
}
