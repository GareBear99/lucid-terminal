import type { ReactNode } from 'react';

/**
 * The one view-header pattern (sweep item 17), condensed
 * (global presentation fix, 2026-11-15): title only. The
 * sweep's title + one-line description put a labelled section
 * at the top of every page — "writing and random space at the
 * tops of each page" — so the description paragraph is gone.
 * A page's top is its content, not a labelled section.
 *
 * `icon` is optional (PersonaPlex keeps its Users glyph);
 * `children` is for the extra lines a view already carries
 * (Forge's honest-scale note, PersonaPlex's voice note, the
 * Modules anchored badge) — those are the view's own content,
 * not header chrome, so they stay below the title. No close
 * button: views fall back to Terminal (Gary's toolbar rule),
 * they are never closed.
 */
export function ViewHeader({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header data-testid="view-header" className="mb-2 shrink-0">
      <h1 className="flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]">
        {icon}
        {title}
      </h1>
      {children}
    </header>
  );
}
