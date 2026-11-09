/**
 * Mist toggles (Gary, 2026-11-09 ~08:15 PST) — the Mist section in
 * Settings holds one toggle per surface.
 *
 * Pattern, one per surface: a settings key (default off) + one
 * toggle in the Mist section + one conditional mist render gated
 * on that key. The Files toggle (`filesMist`) is the first; an AI
 * Chat mist toggle follows the same pattern — add the key, add the
 * toggle to the Mist section, gate that surface's <SplashMist />
 * on it. Nothing here is built for AI Chat yet (Files only).
 *
 * Before this file the Files screen's mist was hidden by
 * `showSplashMistForView` in filesScreen.ts, which also forced the
 * Full Glass theme on the Files screen (Gary, 2026-11-09: solid
 * theme like before — the stored theme everywhere, no per-view
 * exceptions). That file is deleted; the theme now comes only from
 * loadSettings / setTheme, and the mist rule for a view is here.
 */
import type { View } from '../types';

/** The Files screen is the Editor view. */
export const FILES_SCREEN_VIEW: View = 'editor';

/** True when this view is the Files screen. */
export function isFilesScreen(view: View): boolean {
  return view === FILES_SCREEN_VIEW;
}

/**
 * Whether the splash mist shows for a view. Every view except the
 * Files screen always shows it (as before); the Files screen shows
 * it only when the Files mist toggle is on (default off).
 */
export function showSplashMistForView(view: View, filesMist: boolean): boolean {
  return !isFilesScreen(view) || filesMist;
}
