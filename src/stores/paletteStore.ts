/**
 * The palette store (Raycast steal — 2026-11-16).
 *
 * The palette's own state — favorites, aliases, frecency,
 * quicklinks, disabled extensions/commands — persists in ONE
 * key, `lucid-palette-v1`, namespaced per profile. It NEVER
 * touches the profile record (`lucid-profiles-v1`) or the
 * command history (`lucid-command-history-v1`): palette
 * personalization is not profile data, and the per-profile
 * namespacing is what keeps a guest from ever seeing the
 * owner's quicklinks or favorites (the guest veil, same shape
 * as historyStore / commandHistoryStore).
 *
 * The registries in paletteExtensions.ts own the runtime state;
 * this store owns persistence + the React version counter.
 * profileStore.selectProfile is the choke point that drives
 * switchProfile, exactly like it drives switchProfile on the
 * history stores. The store never imports profileStore (no
 * cycle): App passes the active id to init() at startup.
 */

import { create } from 'zustand';
import {
  paletteExtensions,
  paletteQuicklinks,
  palettePersonalization,
  type FrecencyEntry,
  type QuicklinkDef,
} from '../lib/paletteExtensions';

/** The palette's own storage key — nothing else writes here. */
export const PALETTE_STORAGE_KEY = 'lucid-palette-v1';

export interface PaletteProfileSlice {
  favorites: string[];
  aliases: Record<string, string>;
  frecency: Record<string, FrecencyEntry>;
  quicklinks: QuicklinkDef[];
  disabledExtensions: string[];
  disabledCommands: string[];
}

interface PalettePersisted {
  version: 1;
  profiles: Record<string, PaletteProfileSlice>;
}

function emptySlice(): PaletteProfileSlice {
  return {
    favorites: [],
    aliases: {},
    frecency: {},
    quicklinks: [],
    disabledExtensions: [],
    disabledCommands: [],
  };
}

/** Read the persisted record, or a fresh one. Never throws. */
function readPersisted(): PalettePersisted {
  try {
    if (typeof localStorage === 'undefined') return { version: 1, profiles: {} };
    const raw = localStorage.getItem(PALETTE_STORAGE_KEY);
    if (!raw) return { version: 1, profiles: {} };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return { version: 1, profiles: {} };
    const profiles = (parsed as PalettePersisted).profiles;
    if (!profiles || typeof profiles !== 'object') return { version: 1, profiles: {} };
    return { version: 1, profiles };
  } catch {
    return { version: 1, profiles: {} };
  }
}

/** Write the record. Never throws (private mode / quota). */
function writePersisted(record: PalettePersisted): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Palette state just doesn't persist this session.
  }
}

function sliceFromSingletons(): PaletteProfileSlice {
  const personalization = palettePersonalization.toJSON();
  return {
    favorites: personalization.favorites,
    aliases: personalization.aliases,
    frecency: personalization.frecency,
    quicklinks: paletteQuicklinks.all(),
    disabledExtensions: paletteExtensions.disabledExtensionIds(),
    disabledCommands: paletteExtensions.disabledCommandIds(),
  };
}

function applySlice(slice: PaletteProfileSlice): void {
  palettePersonalization.loadJSON({
    favorites: slice.favorites ?? [],
    aliases: slice.aliases ?? {},
    frecency: slice.frecency ?? {},
  });
  paletteQuicklinks.replaceAll(slice.quicklinks ?? []);
  paletteExtensions.applyDisabledState({
    extensions: slice.disabledExtensions ?? [],
    commands: slice.disabledCommands ?? [],
  });
}

interface PaletteState {
  /** The profile the in-memory palette state belongs to. */
  profileId: string;
  /** Bumped on every palette mutation (React re-renders). */
  version: number;
  /** Load the active profile's slice at startup. */
  init: (profileId: string) => void;
  /** Persist the current slice, then load the new profile's. */
  switchProfile: (profileId: string) => void;
  /** Persist the current slice and bump the version. */
  bump: () => void;
}

export const usePaletteStore = create<PaletteState>()((set, get) => ({
  profileId: 'default',
  version: 0,

  init: (profileId) => {
    const record = readPersisted();
    set({ profileId });
    applySlice(record.profiles[profileId] ?? emptySlice());
    set((s) => ({ version: s.version + 1 }));
  },

  switchProfile: (profileId) => {
    const current = get().profileId;
    if (profileId === current) return;
    const record = readPersisted();
    record.profiles[current] = sliceFromSingletons();
    writePersisted(record);
    set({ profileId });
    const next = readPersisted();
    applySlice(next.profiles[profileId] ?? emptySlice());
    set((s) => ({ version: s.version + 1 }));
  },

  bump: () => {
    const record = readPersisted();
    record.profiles[get().profileId] = sliceFromSingletons();
    writePersisted(record);
    set((s) => ({ version: s.version + 1 }));
  },
}));

// Registry mutations persist + re-render through the store.
// (Assigned here, not in paletteExtensions, so the pure module
// stays free of the store — and the callback runs at runtime,
// never at import.)
paletteExtensions.onChange = () => {
  usePaletteStore.getState().bump();
};
paletteQuicklinks.onChange = () => {
  usePaletteStore.getState().bump();
};
palettePersonalization.onChange = () => {
  usePaletteStore.getState().bump();
};
