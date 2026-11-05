import type { View } from '../types';

/**
 * Forge-button toggle.
 *
 * The Forge button (the toolbar plugin button, and the Forge row in
 * the sidebar) opens the Forge view — and pressing it again exits back
 * to the terminal. From any other view it opens the Forge view.
 *
 * The `View` union does not include 'forge' yet (src/types/index.ts is
 * owned by the still-running Homunculus agent — see
 * FORGE-PATCH-types-index.md). The narrow casts below are temporary
 * and harmless once that patch lands.
 */
export function toggleForgeView(currentView: View): View {
  return (currentView as string) === 'forge'
    ? 'terminal'
    : ('forge' as View);
}
