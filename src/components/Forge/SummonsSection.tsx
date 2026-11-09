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
 */

import { useState } from 'react';
import { useForgeStore } from '../../stores/forgeStore';
import {
  LILLY_SUMMON,
  SECOND_SUMMON_LOCKED_TEXT,
  type Summon,
} from '../../lib/summons';

/**
 * One summon slot. Mirrors the roster card's select / activate
 * pattern (RosterCard): click selects, double-click activates,
 * aria-pressed marks the selected one, and the Online / Offline
 * indicator marks the active one.
 */
function SummonSlot({ summon }: { summon: Summon }) {
  const selected = useForgeStore((s) => s.selectedSummonId === summon.id);
  const active = useForgeStore((s) => s.activeSummonId === summon.id);
  const selectSummon = useForgeStore((s) => s.selectSummon);
  const activateSummon = useForgeStore((s) => s.activateSummon);
  // The still is the fallback: if the GIF fails to load, swap to it
  // (and stay there — the guard stops a failed still looping back).
  const [gifFailed, setGifFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={() => selectSummon(summon.id)}
      onDoubleClick={() => activateSummon(summon.id)}
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
        <SummonSlot summon={LILLY_SUMMON} />
        <SecondSummonPlaceholder />
      </div>
    </section>
  );
}
