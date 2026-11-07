/**
 * Theme options — Light is removed (Gary, 2026-11-07).
 *
 * Gary: "light needs to be taken out of the options." The terminal is now
 * pure black in every theme (66ca165: the main screen is always splashscreen
 * misty black), and Light's dark text (#1f2328) on the black mist was
 * unreadable. Light is not recoloured — it is gone from the options.
 *
 * This asserts the offered theme list has no Light entry, the remaining
 * themes are exactly the five dark ones, and a removed id falls back to
 * the first theme (Dark) via getTheme.
 */
import { themes, getTheme } from '../src/themes/themes';

describe('Theme options — Light removed', () => {
  it('does not offer a Light theme', () => {
    expect(themes.some((t) => t.id === 'light')).toBe(false);
    expect(themes.some((t) => t.name === 'Light')).toBe(false);
  });

  it('offers exactly the five dark themes', () => {
    expect(themes.map((t) => t.id)).toEqual(['dark', 'midnight', 'ocean', 'forest', 'sunset']);
  });

  it("Sunset is still available (Gary's theme)", () => {
    expect(getTheme('sunset').id).toBe('sunset');
  });

  it('a removed id falls back to the first theme (Dark)', () => {
    expect(getTheme('light').id).toBe('dark');
  });
});
