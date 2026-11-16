import type { View } from '../types';

/**
 * Offline Worldmap-button toggle.
 *
 * The Worldmap button (the toolbar icon) opens the full-screen
 * worldmap view — and pressing it again exits back to the
 * terminal. From any other view it opens the worldmap. The
 * same shape as the Persona Plex toggle (see personaPlexView):
 * the worldmap is an add-on + plugin, not a LuciferAI surface,
 * so the toggle never checks LuciferAI.
 */
export function toggleWorldmapView(currentView: View): View {
  return currentView === 'worldmap' ? 'terminal' : 'worldmap';
}
