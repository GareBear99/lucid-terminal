// @vitest-environment jsdom
/**
 * Summon variant ask tests (Gary, 2026-11-09 ~11:01 PST).
 *
 * On EVERY summon activation, ask clothed vs 18+ variant — ask every
 * time until the user checks "don't ask again" after selecting one,
 * then the choice is remembered and the prompt stops.
 *
 * Covers: the dialog asks with Gary's words (Clothed / 18+), Confirm
 * is disabled until a variant is picked, Cancel activates nothing;
 * confirming with "don't ask again" remembers the variant and the
 * next activation goes straight through with no prompt; without the
 * box checked the dialog asks again next time; a locked summon never
 * reaches the ask (the store rejects it first); and the store records
 * the chosen variant on the active summon.
 *
 * NOTE: isSummonUnlocked is mocked to true here (importOriginal +
 * override) so the activation path is reachable — in production every
 * summon is locked today (nobody owns a Living Golem yet; detection
 * is open), so the ask cannot fire until detection lands. The lock
 * behaviour itself is covered by tests/summons.test.tsx.
 *
 * Run with: npx vitest run tests/summonVariant.test.tsx
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SummonsSection, SummonVariantDialog } from '../src/components/Forge/SummonsSection';
import { useForgeStore } from '../src/stores/forgeStore';
import { useSettingsStore } from '../src/stores/settingsStore';

vi.mock('../src/lib/summons', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/summons')>();
  return { ...actual, isSummonUnlocked: () => true };
});

function installSettingsMock() {
  const win = window as unknown as Record<string, unknown>;
  const prevLucidAPI = win.lucidAPI;
  win.lucidAPI = {
    ...((prevLucidAPI as object) ?? {}),
    settings: { set: vi.fn(async () => undefined) },
  };
  return () => {
    if (prevLucidAPI === undefined) delete win.lucidAPI;
    else win.lucidAPI = prevLucidAPI;
  };
}

describe('Summon variant ask', () => {
  let restoreLucidAPI: () => void;

  beforeEach(() => {
    restoreLucidAPI = installSettingsMock();
    useForgeStore.getState().resetForTests();
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, summonVariant: null, summonVariantDontAsk: false },
    }));
  });

  afterEach(() => {
    restoreLucidAPI();
    vi.restoreAllMocks();
  });

  test('dialog: asks Clothed vs 18+, Confirm disabled until a variant is picked', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <SummonVariantDialog
        summonName="Lilly"
        initialVariant={null}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByTestId('summon-variant-dialog')).not.toBeNull();
    expect(screen.getByText('Clothed')).not.toBeNull();
    expect(screen.getByText('18+')).not.toBeNull();
    expect(screen.getByTestId('summon-variant-dont-ask')).not.toBeNull();
    const confirm = screen.getByTestId('summon-variant-confirm');
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('summon-variant-adult'));
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('adult', false);
  });

  test('dialog: Cancel activates nothing', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <SummonVariantDialog
        summonName="Lilly"
        initialVariant={null}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByTestId('summon-variant-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test('dialog: pre-selects the remembered variant', () => {
    render(
      <SummonVariantDialog
        summonName="Lilly"
        initialVariant="clothed"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByTestId('summon-variant-clothed').getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByTestId('summon-variant-confirm') as HTMLButtonElement).disabled).toBe(false);
  });

  test('store: activateSummon records the chosen variant on the active summon', () => {
    const api = useForgeStore.getState();
    api.activateSummon('lilly', 'adult');
    const s = useForgeStore.getState();
    expect(s.activeSummonId).toBe('lilly');
    expect(s.activeSummonVariant).toBe('adult');
    expect(s.lastError).toBeNull();
  });

  test('section: double-click asks, confirming with "don\'t ask again" remembers it — the next activation goes straight through', async () => {
    render(<SummonsSection />);
    const slot = screen.getByTestId('summon-slot-lilly');
    // First activation: the dialog opens (no remembered choice yet).
    fireEvent.doubleClick(slot);
    expect(screen.getByTestId('summon-variant-dialog')).not.toBeNull();
    expect(useForgeStore.getState().activeSummonId).toBeNull();
    // Pick 18+, check "don't ask again", confirm.
    fireEvent.click(screen.getByTestId('summon-variant-adult'));
    fireEvent.click(screen.getByTestId('summon-variant-dont-ask'));
    fireEvent.click(screen.getByTestId('summon-variant-confirm'));
    await waitFor(() => {
      expect(useForgeStore.getState().activeSummonId).toBe('lilly');
    });
    expect(useForgeStore.getState().activeSummonVariant).toBe('adult');
    expect(useSettingsStore.getState().settings.summonVariant).toBe('adult');
    expect(useSettingsStore.getState().settings.summonVariantDontAsk).toBe(true);
    // Second activation: no dialog — the remembered variant is used.
    useForgeStore.getState().resetForTests();
    fireEvent.doubleClick(screen.getByTestId('summon-slot-lilly'));
    expect(screen.queryByTestId('summon-variant-dialog')).toBeNull();
    expect(useForgeStore.getState().activeSummonId).toBe('lilly');
    expect(useForgeStore.getState().activeSummonVariant).toBe('adult');
  });

  test('section: without "don\'t ask again" the dialog asks again next time', async () => {
    render(<SummonsSection />);
    const slot = screen.getByTestId('summon-slot-lilly');
    fireEvent.doubleClick(slot);
    fireEvent.click(screen.getByTestId('summon-variant-clothed'));
    fireEvent.click(screen.getByTestId('summon-variant-confirm'));
    await waitFor(() => {
      expect(useForgeStore.getState().activeSummonId).toBe('lilly');
    });
    expect(useSettingsStore.getState().settings.summonVariantDontAsk).toBe(false);
    // Next activation asks again.
    useForgeStore.getState().resetForTests();
    fireEvent.doubleClick(screen.getByTestId('summon-slot-lilly'));
    expect(screen.getByTestId('summon-variant-dialog')).not.toBeNull();
    expect(useForgeStore.getState().activeSummonId).toBeNull();
  });

  test('section: cancelling the dialog activates nothing', () => {
    render(<SummonsSection />);
    fireEvent.doubleClick(screen.getByTestId('summon-slot-lilly'));
    expect(screen.getByTestId('summon-variant-dialog')).not.toBeNull();
    fireEvent.click(screen.getByTestId('summon-variant-cancel'));
    expect(screen.queryByTestId('summon-variant-dialog')).toBeNull();
    expect(useForgeStore.getState().activeSummonId).toBeNull();
  });
});
