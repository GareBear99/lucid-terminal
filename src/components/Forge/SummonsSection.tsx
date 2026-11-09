/**
 * SummonsSection — the Summons section of the Forge (Gary, 2026-11-09).
 *
 * SEPARATE from the Homunculi roster: the roster is Lucifer + EVE,
 * summons are their own section. Lilly, the LuciferAI siren, is the
 * intro summon — the FIRST slot. A second locked slot placeholder
 * follows (no named second summon yet — no name or art invented).
 *
 * Every summon ships LOCKED today (nobody owns a Living Golem yet;
 * detection is open — see src/lib/summons.ts), so each slot shows
 * its locked-state text. Selecting (single click) works while
 * locked; activating (double-click) is rejected by the store.
 *
 * Sizing is tightened so it can't fail: the slot's media box is a
 * fixed square (aspect-square) with overflow hidden, and the image
 * fills it with object-contain — no overflow, no distortion,
 * whether the asset is a still image or an animated GIF. The slot
 * shows the GIF; if the GIF fails to load, the still is the
 * fallback.
 *
 * VARIANT ASK (Gary, 2026-11-09 ~11:01 PST): on EVERY summon
 * activation, ask clothed vs 18+ variant — ask every time until the
 * user checks "don't ask again" after selecting one, then the choice
 * is remembered and the prompt stops. The ask runs here, in the
 * section, before the store's activateSummon: a locked summon never
 * reaches the ask (the store rejects it first); an unlocked summon
 * with a remembered choice (don't-ask checked) activates straight
 * away with that variant; otherwise the dialog opens. Confirming
 * saves the chosen variant (so the dialog pre-selects it next time)
 * and, when "don't ask again" is checked, the don't-ask flag with
 * it. Cancelling activates nothing.
 */

import { useState } from 'react';
import { useForgeStore } from '../../stores/forgeStore';
import { useSettingsStore } from '../../stores/settingsStore';
import {
  LILLY_SUMMON,
  SECOND_SUMMON_LOCKED_TEXT,
  SUMMON_VARIANT_LABELS,
  isSummonUnlocked,
  type Summon,
  type SummonVariant,
} from '../../lib/summons';

/**
 * The variant ask dialog: clothed vs 18+ (Gary's words), a "Don't
 * ask again" checkbox, Confirm (disabled until a variant is picked)
 * and Cancel. Confirm calls onConfirm with the chosen variant and
 * whether "don't ask again" was checked; Cancel calls onCancel and
 * activates nothing.
 */
export function SummonVariantDialog({
  summonName,
  initialVariant,
  onConfirm,
  onCancel,
}: {
  summonName: string;
  initialVariant: SummonVariant | null;
  onConfirm: (variant: SummonVariant, dontAsk: boolean) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<SummonVariant | null>(initialVariant);
  const [dontAsk, setDontAsk] = useState(false);
  const variants: SummonVariant[] = ['clothed', 'adult'];
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Choose ${summonName}'s variant`}
      data-testid="summon-variant-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <div className="w-80 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          Choose {summonName}&rsquo;s variant
        </h3>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Which variant should this summon use?
        </p>
        <div className="mt-3 flex gap-2">
          {variants.map((variant) => (
            <button
              key={variant}
              type="button"
              onClick={() => setSelected(variant)}
              aria-pressed={selected === variant}
              data-testid={`summon-variant-${variant}`}
              className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                selected === variant
                  ? 'border-2 border-purple-400/60 bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                  : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)]'
              }`}
            >
              {SUMMON_VARIANT_LABELS[variant]}
            </button>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <input
            type="checkbox"
            checked={dontAsk}
            onChange={(e) => setDontAsk(e.target.checked)}
            data-testid="summon-variant-dont-ask"
          />
          Don&rsquo;t ask again
        </label>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            data-testid="summon-variant-cancel"
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={selected === null}
            onClick={() => {
              if (selected !== null) onConfirm(selected, dontAsk);
            }}
            data-testid="summon-variant-confirm"
            className="rounded-md bg-purple-500/80 px-3 py-1.5 text-sm text-white disabled:opacity-40"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * One summon slot. Mirrors the roster card's select / activate
 * pattern (RosterCard): click selects, double-click activates,
 * aria-pressed marks the selected one, and the Online / Offline
 * indicator marks the active one. Activation goes through the
 * section's onActivateRequest (the variant ask lives there) —
 * never straight to the store.
 */
function SummonSlot({
  summon,
  onActivateRequest,
}: {
  summon: Summon;
  onActivateRequest: (summon: Summon) => void;
}) {
  const selected = useForgeStore((s) => s.selectedSummonId === summon.id);
  const active = useForgeStore((s) => s.activeSummonId === summon.id);
  const selectSummon = useForgeStore((s) => s.selectSummon);
  // The still is the fallback: if the GIF fails to load, swap to it
  // (and stay there — the guard stops a failed still looping back).
  const [gifFailed, setGifFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={() => selectSummon(summon.id)}
      onDoubleClick={() => onActivateRequest(summon)}
      aria-pressed={selected}
      title="Click to select — double-click to activate"
      data-testid={`summon-slot-${summon.id}`}
      className={`w-56 shrink-0 rounded-md border bg-[var(--bg-secondary)] p-3 text-left transition-colors ${
        selected
          ? 'border-2 border-purple-400/60'
          : 'border-[var(--border)] hover:border-[var(--text-muted)]'
      }`}
    >
      {/* Fixed square media box — the sizing that can't fail. The
          box never grows with the asset (aspect-square + overflow
          hidden) and the image never distorts (object-contain keeps
          its own aspect inside the box). */}
      <span
        data-testid={`summon-media-${summon.id}`}
        className="block aspect-square w-full overflow-hidden rounded-md bg-[var(--bg-primary)]"
      >
        <img
          src={gifFailed ? summon.imageSrc : summon.gifSrc}
          alt={`${summon.name} — animated`}
          onError={() => setGifFailed(true)}
          className="h-full w-full object-contain"
        />
      </span>
      <span className="mt-2 block truncate text-sm font-semibold text-[var(--text-primary)]">
        {summon.name}
      </span>
      <span className="block text-xs text-[var(--text-muted)]">
        LuciferAI siren
      </span>
      {/* Online indicator: green for the active summon, dark for the
          rest — same as the roster cards. Locked summons are never
          active, so this reads Offline until an unlock lands. */}
      <span
        className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
          active
            ? 'border-green-400/60 text-green-300'
            : 'border-[var(--border)] text-[var(--text-muted)]'
        }`}
        aria-label={active ? 'Online — active' : 'Offline — inactive'}
      >
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            active ? 'bg-green-400' : 'bg-neutral-600'
          }`}
        />
        {active ? 'Online' : 'Offline'}
      </span>
      <span className="mt-1 block text-xs leading-snug text-[var(--text-muted)]">
        {summon.lockedText}
      </span>
    </button>
  );
}

/**
 * Locked second-slot placeholder — a slot with no summon in it yet.
 * No name and no art are invented for it; it states only its unlock
 * rule.
 */
function SecondSummonPlaceholder() {
  return (
    <div
      data-testid="summon-slot-second-placeholder"
      className="w-56 shrink-0 rounded-md border border-dashed border-[var(--border)] bg-[var(--bg-secondary)] p-3"
    >
      <span className="block aspect-square w-full overflow-hidden rounded-md bg-[var(--bg-primary)]" />
      <span className="mt-2 block truncate text-sm font-semibold text-[var(--text-primary)]">
        Second summon
      </span>
      <span className="mt-1 block text-xs leading-snug text-[var(--text-muted)]">
        {SECOND_SUMMON_LOCKED_TEXT}
      </span>
    </div>
  );
}

export function SummonsSection() {
  const activateSummon = useForgeStore((s) => s.activateSummon);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  // The summon the variant dialog is open for, or null when no ask
  // is showing.
  const [variantAsk, setVariantAsk] = useState<Summon | null>(null);

  /**
   * Activation, with the variant ask in front of it (Gary,
   * 2026-11-09 ~11:01 PST): locked summons never reach the ask —
   * the store rejects them (lastError says why). An unlocked summon
   * with a remembered choice activates straight away with that
   * variant; otherwise the dialog opens and the activation waits
   * for the user's pick.
   */
  const handleActivateRequest = (summon: Summon) => {
    if (!isSummonUnlocked(summon)) {
      activateSummon(summon.id);
      return;
    }
    const settings = useSettingsStore.getState().settings;
    const remembered =
      settings.summonVariantDontAsk === true ? settings.summonVariant : null;
    if (remembered !== null) {
      activateSummon(summon.id, remembered);
      return;
    }
    setVariantAsk(summon);
  };

  /** The dialog's Confirm: remember the choice (and the don't-ask
   *  flag when checked), then activate with the chosen variant. */
  const handleVariantConfirm = async (variant: SummonVariant, dontAsk: boolean) => {
    const summon = variantAsk;
    setVariantAsk(null);
    if (!summon) return;
    await updateSetting('summonVariant', variant);
    if (dontAsk) await updateSetting('summonVariantDontAsk', true);
    activateSummon(summon.id, variant);
  };

  const rememberedVariant =
    useSettingsStore((s) => s.settings.summonVariant) ?? null;

  return (
    <section
      id="summons-section"
      data-testid="summons-section"
      aria-label="Summons"
      className="mt-3 shrink-0 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3"
    >
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">
        Summons
      </h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Lilly, the LuciferAI siren, is the first summon. Summons are
        separate from the Homunculi roster.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <SummonSlot summon={LILLY_SUMMON} onActivateRequest={handleActivateRequest} />
        <SecondSummonPlaceholder />
      </div>
      {variantAsk !== null && (
        <SummonVariantDialog
          summonName={variantAsk.name}
          initialVariant={rememberedVariant}
          onConfirm={(variant, dontAsk) => void handleVariantConfirm(variant, dontAsk)}
          onCancel={() => setVariantAsk(null)}
        />
      )}
    </section>
  );
}
