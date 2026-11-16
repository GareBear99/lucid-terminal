/**
 * Autosave vetoes (the `dontSaveIf` hook): any single veto blocks the blur save.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  registerDontSaveIf,
  autosaveVetoed,
  resetAutosaveVetoesForTests,
} from '../src/lib/autosave';

describe('autosave vetoes', () => {
  afterEach(() => resetAutosaveVetoesForTests());

  it('is not vetoed with no vetoes registered', () => {
    expect(autosaveVetoed()).toBe(false);
  });

  it('a veto that returns true blocks the save; unregistering clears it', () => {
    const unregister = registerDontSaveIf(() => true);
    expect(autosaveVetoed()).toBe(true);
    unregister();
    expect(autosaveVetoed()).toBe(false);
  });

  it('a veto that returns false does not block', () => {
    registerDontSaveIf(() => false);
    expect(autosaveVetoed()).toBe(false);
  });

  it('a throwing predicate vetoes (on uncertainty the save does not happen)', () => {
    registerDontSaveIf(() => {
      throw new Error('boom');
    });
    expect(autosaveVetoed()).toBe(true);
  });
});
