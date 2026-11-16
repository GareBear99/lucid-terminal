/**
 * Palette store tests (Raycast steal).
 *
 * The palette's own state — favorites, aliases, frecency,
 * quicklinks, disabled extensions/commands — lives in ONE key,
 * `lucid-palette-v1`, namespaced per profile. It NEVER touches
 * the profile record (`lucid-profiles-v1`) or the command history
 * (`lucid-command-history-v1`): the palette is personalization,
 * not profile data, and a guest must never see the owner's
 * quicklinks or favorites (the guest veil, same as history).
 *
 * Fails on unmodified cea360f (the store does not exist).
 */
// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { usePaletteStore, PALETTE_STORAGE_KEY } from '../src/stores/paletteStore';
import {
  paletteExtensions,
  paletteQuicklinks,
  palettePersonalization,
} from '../src/lib/paletteExtensions';

function resetAll() {
  localStorage.clear();
  paletteExtensions.clear();
  paletteQuicklinks.clear();
  palettePersonalization.clear();
  usePaletteStore.setState({ profileId: 'default', version: 0 });
}

describe('paletteStore', () => {
  beforeEach(resetAll);

  test('quicklinks and favorites persist and reload under the palette key', () => {
    paletteQuicklinks.register({ id: 'q1', name: 'Docs', link: 'https://example.com' });
    palettePersonalization.addFavorite('cmd:a');
    usePaletteStore.getState().bump();
    const raw = localStorage.getItem(PALETTE_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.profiles.default.quicklinks[0].name).toBe('Docs');
    expect(parsed.profiles.default.favorites).toEqual(['cmd:a']);

    // A fresh load restores them.
    paletteQuicklinks.clear();
    palettePersonalization.clear();
    usePaletteStore.getState().init('default');
    expect(paletteQuicklinks.get('q1')?.link).toBe('https://example.com');
    expect(palettePersonalization.isFavorite('cmd:a')).toBe(true);
  });

  test('switchProfile isolates palette state: the guest sees none of the owner’s data', () => {
    paletteQuicklinks.register({ id: 'q1', name: 'Owner Docs', link: 'https://example.com' });
    palettePersonalization.addFavorite('cmd:owner');
    palettePersonalization.setAlias('cmd:owner', 'od');
    usePaletteStore.getState().bump();

    usePaletteStore.getState().switchProfile('guest-1');
    expect(paletteQuicklinks.all()).toHaveLength(0);
    expect(palettePersonalization.isFavorite('cmd:owner')).toBe(false);
    expect(palettePersonalization.getAlias('cmd:owner')).toBeUndefined();

    // The guest's own additions stay the guest's.
    paletteQuicklinks.register({ id: 'q2', name: 'Guest Link', link: 'https://example.org' });
    usePaletteStore.getState().bump();

    // Back to the owner: the owner's data is exactly as left, no guest leak.
    usePaletteStore.getState().switchProfile('default');
    expect(paletteQuicklinks.all().map((q) => q.id)).toEqual(['q1']);
    expect(palettePersonalization.isFavorite('cmd:owner')).toBe(true);
    expect(palettePersonalization.getAlias('cmd:owner')).toBe('od');

    // And the guest's data is still the guest's.
    usePaletteStore.getState().switchProfile('guest-1');
    expect(paletteQuicklinks.all().map((q) => q.id)).toEqual(['q2']);
  });

  test('palette persistence never touches the profile or history keys', () => {
    paletteQuicklinks.register({ id: 'q1', name: 'Docs', link: 'https://example.com' });
    palettePersonalization.addFavorite('cmd:a');
    palettePersonalization.setAlias('cmd:a', 'da');
    usePaletteStore.getState().bump();
    usePaletteStore.getState().switchProfile('guest-1');
    usePaletteStore.getState().switchProfile('default');
    expect(localStorage.getItem('lucid-profiles-v1')).toBeNull();
    expect(localStorage.getItem('lucid-command-history-v1')).toBeNull();
    expect(localStorage.getItem(PALETTE_STORAGE_KEY)).not.toBeNull();
  });

  test('disabled extensions persist per profile', () => {
    paletteExtensions.registerExtension({
      id: 'notes', title: 'Notes',
      commands: [{ id: 'notes:new', title: 'New', mode: 'no-view', run: () => {} }],
    });
    paletteExtensions.setExtensionEnabled('notes', false);
    usePaletteStore.getState().bump();
    usePaletteStore.getState().switchProfile('guest-1');
    expect(paletteExtensions.isExtensionEnabled('notes')).toBe(true);
    usePaletteStore.getState().switchProfile('default');
    expect(paletteExtensions.isExtensionEnabled('notes')).toBe(false);
  });
});
