import type { View } from '../types';

/**
 * Synth-button toggle.
 *
 * The Synth button (the Sentinel face in the corner of the prompt
 * typing bar, and the Synth row in the sidebar) opens the Synth view —
 * and pressing it again exits back to the terminal. From any other
 * view it opens the Synth view.
 */
export function toggleSynthView(currentView: View): View {
  return currentView === 'synth' ? 'terminal' : 'synth';
}
