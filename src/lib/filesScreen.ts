/**
 * Files screen — the Editor view, and how it differs from every
 * other screen (Gary, 2026-11-08): "the files screen shouldnt
 * have the splash back just the theme" + "not without full glass
 * theme obviously".
 *
 * The Files screen is the Editor view (the screen for files — the
 * FileCode icon, tooltip 'Editor'). Unlike every other screen it
 * has NO splash back: the splashscreen misty black (SplashMist)
 * is hidden while it is the current view, so it shows just the
 * theme. And that theme is the Full Glass theme, obviously — the
 * frosted-glass referral + purchase tier reward theme — applied
 * while the Editor is current, and the user's selected theme is
 * re-applied on leaving it.
 *
 * The lock is NOT touched: Full Glass stays locked as a selectable
 * app theme (referrals + purchase tier, see isThemeUnlocked). This
 * is Gary's explicit direction for the Files screen, not a theme
 * selection — App applies it directly with applyTheme, never
 * through setTheme, and never persists it.
 */
import { fullGlassTheme } from '../themes/themes';
import type { Theme, View } from '../types';

/** The view that is the Files screen. */
export const FILES_SCREEN_VIEW: View = 'editor';

/** True when this view is the Files screen. */
export function isFilesScreen(view: View): boolean {
  return view === FILES_SCREEN_VIEW;
}

/**
 * The theme to apply for a view: Full Glass on the Files screen,
 * the user's selected theme everywhere else.
 */
export function themeForView(view: View, userTheme: Theme): Theme {
  return isFilesScreen(view) ? fullGlassTheme : userTheme;
}

/** Whether the splash mist shows for a view: never on the Files screen. */
export function showSplashMistForView(view: View): boolean {
  return !isFilesScreen(view);
}
