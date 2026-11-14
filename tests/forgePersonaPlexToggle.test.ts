/**
 * Forge + Persona Plex toggle: a second press exits back to the
 * terminal (Gary, 2026-11-13: when you click OFF a toolbar tab icon
 * and there is nowhere to go, it defaults to the Terminal page).
 *
 * These two toggle fns were the only view toggles without a test
 * pinning the terminal fallback (Synth + Settings already had one).
 * The Editor button gets the same fallback inline in Sidebar.tsx —
 * see toolbarOrder.test.tsx.
 */
import { describe, expect, test } from 'vitest';

import { toggleForgeView } from '../src/lib/forgeView';
import { togglePersonaPlexView } from '../src/lib/personaPlexView';

describe('Forge toggle', () => {
  test('terminal -> forge (first press opens)', () => {
    expect(toggleForgeView('terminal')).toBe('forge');
  });

  test('forge -> terminal (second press exits)', () => {
    expect(toggleForgeView('forge')).toBe('terminal');
  });

  test('editor -> forge (from another view it opens Forge)', () => {
    expect(toggleForgeView('editor')).toBe('forge');
  });
});

describe('Persona Plex toggle', () => {
  test('terminal -> persona-plex (first press opens)', () => {
    expect(togglePersonaPlexView('terminal')).toBe('persona-plex');
  });

  test('persona-plex -> terminal (second press exits)', () => {
    expect(togglePersonaPlexView('persona-plex')).toBe('terminal');
  });

  test('editor -> persona-plex (from another view it opens Persona Plex)', () => {
    expect(togglePersonaPlexView('editor')).toBe('persona-plex');
  });
});
