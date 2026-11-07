import type { View } from '../types';

/**
 * Persona Plex-button toggle.
 *
 * The Persona Plex button (the toolbar icon, and the settings
 * button in Settings > Plugins > Add-ons) opens the Persona Plex
 * setup page — and pressing it again exits back to the terminal.
 * From any other view it opens the Persona Plex page.
 */
export function togglePersonaPlexView(currentView: View): View {
  return currentView === 'persona-plex' ? 'terminal' : 'persona-plex';
}
