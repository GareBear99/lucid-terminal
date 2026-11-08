/**
 * Files screen — the Editor view is Full Glass, no splash back
 * (Gary, 2026-11-08): "the files screen shouldnt have the splash
 * back just the theme" + "not without full glass theme obviously".
 *
 * The Files screen is the Editor view. While it is the current
 * view the applied theme is Full Glass and the splash mist is
 * hidden; everywhere else the user's selected theme applies and
 * the mist shows. The lock is untouched — Full Glass stays locked
 * as a selectable app theme; this is Gary's explicit direction
 * for the Files screen, not a theme selection.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import {
  FILES_SCREEN_VIEW,
  isFilesScreen,
  themeForView,
  showSplashMistForView,
} from '../src/lib/filesScreen';
import { fullGlassTheme, getTheme } from '../src/themes/themes';
import type { View } from '../src/types';

const ALL_VIEWS: View[] = [
  'terminal',
  'editor',
  'settings',
  'synth',
  'forge',
  'persona-plex',
];

describe('Files screen', () => {
  it('is the Editor view', () => {
    expect(FILES_SCREEN_VIEW).toBe('editor');
    expect(isFilesScreen('editor')).toBe(true);
    for (const view of ALL_VIEWS.filter((v) => v !== 'editor')) {
      expect(isFilesScreen(view)).toBe(false);
    }
  });

  it('applies the Full Glass theme on the Files screen, the user theme everywhere else', () => {
    const userTheme = getTheme('lucifer');
    expect(themeForView('editor', userTheme)).toBe(fullGlassTheme);
    expect(fullGlassTheme.isGlass).toBe(true);
    for (const view of ALL_VIEWS.filter((v) => v !== 'editor')) {
      expect(themeForView(view, userTheme)).toBe(userTheme);
    }
  });

  it('hides the splash mist on the Files screen, shows it everywhere else', () => {
    expect(showSplashMistForView('editor')).toBe(false);
    for (const view of ALL_VIEWS.filter((v) => v !== 'editor')) {
      expect(showSplashMistForView(view)).toBe(true);
    }
  });

  it('does not unlock Full Glass as a selectable theme — the lock still gates setTheme', async () => {
    // The Files-screen rule applies the theme directly; it must
    // not change the lock. Full Glass stays locked without
    // 2 activated + recognized referrals and an active purchase tier
    // (Gary, 2026-11-08: 2 temps a year + purchase tier).
    const { isThemeUnlocked } = await import('../src/themes/themes');
    expect(
      isThemeUnlocked(fullGlassTheme, { referralCount: 0, purchaseTierActive: false }),
    ).toBe(false);
    expect(
      isThemeUnlocked(fullGlassTheme, { referralCount: 1, purchaseTierActive: true }),
    ).toBe(false);
    expect(
      isThemeUnlocked(fullGlassTheme, { referralCount: 2, purchaseTierActive: true }),
    ).toBe(true);
  });
});
