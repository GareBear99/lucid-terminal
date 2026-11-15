import type { ReactNode } from 'react';

/**
 * The one view-header pattern (sweep item 17): title + one-line
 * description, same sizes everywhere. Taken from Forge, which had
 * it right — an h1 (text-lg, semibold) and one description line
 * (text-xs, muted). The views reached from the toolbar had three
 * different shapes (Forge h1 + description, PersonaPlex h2,
 * Synth none at all, Editor only a file-tabs bar, Modules a
 * Settings-scale h3) — now they share this one.
 *
 * `icon` is optional (PersonaPlex keeps its Users glyph);
 * `children` is for the extra lines a view already carries
 * (Forge's honest-scale note, PersonaPlex's voice note) — the
 * pattern is title + ONE description line, and the extras stay
 * below it, not in it. No close button: views fall back to
 * Terminal (Gary's toolbar rule), they are never closed.
 */
export function ViewHeader({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header data-testid="view-header" className="mb-3 shrink-0">
      <h1 className="flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]">
        {icon}
        {title}
      </h1>
      <p className="text-xs text-[var(--text-muted)]">{description}</p>
      {children}
    </header>
  );
}
