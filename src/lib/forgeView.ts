import type { View } from '../types';

/**
 * Forge-button toggle.
 *
 * The Forge button (the toolbar plugin button, and the Forge row in
 * the sidebar) opens the Forge view — and pressing it again exits back
 * to the terminal. From any other view it opens the Forge view.
 */
export function toggleForgeView(currentView: View): View {
  return currentView === 'forge' ? 'terminal' : 'forge';
}
