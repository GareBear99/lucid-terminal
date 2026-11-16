// @vitest-environment jsdom
/**
 * Genesis tests (src/lib/fixnetGenesis.ts).
 *
 * The genesis referral ('ref:genesis') is the root of the referral
 * chain — Gary's own profile, the first temp ever activated. The
 * claim is explicit and one-time: the founder flag must be on AND
 * this install must never have activated a temp. A wrong claim is
 * terminal on the server (genesis_not_root, never re-checked), so
 * the flag defaults to off and the claim can never be made twice.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  GENESIS_REFERRAL_ID,
  genesisReferralForNewProfile,
  markFixNetActivated,
} from '../src/lib/fixnetGenesis';
import { useSettingsStore } from '../src/stores/settingsStore';

// updateSettings writes through the main-process bridge first
// (window.lucidAPI.settings.set) and only then applies locally —
// the test supplies a bridge that resolves, the way the real app does.
function installSettingsBridge() {
  const win = window as unknown as { lucidAPI?: unknown };
  const prevLucidAPI = win.lucidAPI;
  const set = vi.fn().mockResolvedValue(undefined);
  win.lucidAPI = { settings: { set } };
  return { prevLucidAPI, set };
}

function restoreLucidAPI(prevLucidAPI: unknown) {
  const win = window as unknown as { lucidAPI?: unknown };
  if (prevLucidAPI === undefined) delete win.lucidAPI;
  else win.lucidAPI = prevLucidAPI;
}

function setFlags(claimGenesis: boolean, activatedOnce: boolean) {
  useSettingsStore.setState((state) => ({
    settings: { ...state.settings, fixnetClaimGenesis: claimGenesis, fixnetActivatedOnce: activatedOnce },
  }));
}

beforeEach(() => {
  setFlags(false, false);
});

describe('genesis', () => {
  let prevLucidAPI: unknown;
  let set: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const bridge = installSettingsBridge();
    prevLucidAPI = bridge.prevLucidAPI;
    set = bridge.set;
  });

  afterEach(() => {
    restoreLucidAPI(prevLucidAPI);
    vi.restoreAllMocks();
  });

  test('the referral id is ref:genesis', () => {
    expect(GENESIS_REFERRAL_ID).toBe('ref:genesis');
  });

  test('the flag off means no claim — a normal activation', () => {
    setFlags(false, false);
    expect(genesisReferralForNewProfile()).toBeNull();
  });

  test('the flag on + never activated claims the root', () => {
    setFlags(true, false);
    expect(genesisReferralForNewProfile()).toBe('ref:genesis');
  });

  test('the flag on + already activated does not claim — the root is taken', () => {
    setFlags(true, true);
    expect(genesisReferralForNewProfile()).toBeNull();
  });

  test('the flag off + already activated does not claim', () => {
    setFlags(false, true);
    expect(genesisReferralForNewProfile()).toBeNull();
  });

  test('markFixNetActivated consumes the flag and records the activation', async () => {
    setFlags(true, false);
    expect(genesisReferralForNewProfile()).toBe('ref:genesis');
    await markFixNetActivated();
    const settings = useSettingsStore.getState().settings;
    expect(settings.fixnetActivatedOnce).toBe(true);
    expect(settings.fixnetClaimGenesis).toBe(false);
    expect(genesisReferralForNewProfile()).toBeNull();
    // The flag was persisted through the bridge, not just in memory.
    expect(set).toHaveBeenCalledWith('fixnetActivatedOnce', true);
    expect(set).toHaveBeenCalledWith('fixnetClaimGenesis', false);
  });

  test('markFixNetActivated records a normal activation too', async () => {
    setFlags(false, false);
    await markFixNetActivated();
    expect(useSettingsStore.getState().settings.fixnetActivatedOnce).toBe(true);
    expect(genesisReferralForNewProfile()).toBeNull();
  });

  test('the check is a pure read — it does not consume the flag', () => {
    setFlags(true, false);
    expect(genesisReferralForNewProfile()).toBe('ref:genesis');
    expect(genesisReferralForNewProfile()).toBe('ref:genesis');
    expect(useSettingsStore.getState().settings.fixnetClaimGenesis).toBe(true);
  });
});
