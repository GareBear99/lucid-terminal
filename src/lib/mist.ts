/**
 * Mist toggles (Gary, 2026-11-09 ~08:15 PST) — the Mist section in
 * Settings holds one toggle per surface.
 *
 * Pattern, one per surface: a settings key (default off) + one
 * toggle in the Mist section + one conditional mist render gated
 * on that key. The Files toggle (`filesMist`) is the first; the AI
 * Chat toggle (`aiChatMist`, sweep item 12) is the second — its
 * conditional render is the panel shell going transparent (see
 * aiChatPanelBackground below), not a second mist layer.
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

/**
 * The AI Chat panel shell's background (sweep item 12). The panel
 * is a dock over the app-level mist, and its solid background is
 * what hides that mist inside the panel — so the toggle's
 * conditional render is the shell going transparent: the same one
 * mist (rendered once by the App root, behind everything) shows
 * through the panel instead of the solid theme. No second mist
 * layer is rendered — two would mean two sets of puffs and two
 * `splash-mist` testids. When the app-level mist itself is off
 * (Files view with filesMist off) the transparent panel shows the
 * black behind it, same as the rest of the screen — mist off
 * everywhere, consistently.
 */
export function aiChatPanelBackground(aiChatMist: boolean): string {
  return aiChatMist ? 'bg-transparent' : 'bg-[var(--bg-primary)]';
}
