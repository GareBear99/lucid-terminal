import type { View } from '../types';

/**
 * Settings-button toggle.
 *
 * The Settings button (the toolbar icon) opens the Settings view —
 * and pressing it again exits back to the terminal. From any other
 * view it opens the Settings view.
 */
export function toggleSettingsView(currentView: View): View {
  return currentView === 'settings' ? 'terminal' : 'settings';
}
