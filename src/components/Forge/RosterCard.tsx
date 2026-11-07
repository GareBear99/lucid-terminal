/**
 * RosterCard — one Homunculus in the Forge roster.
 *
 * Shows its avatar (the SentinelFace SVG, small — the face IS the
 * avatar, in the Homunculus's colour — passed as the `color` prop so
 * each card's face wears its own Homunculus's colour), name, colour,
 * biography (or "Biography not written yet" — never an invented one),
 * brain (model name + status), and last Gate v2 decision. Clicking
 * selects it. DOUBLE-CLICKING activates it, IN THE FORGE
 * specifically (Gary, 2026-11-06): the activated Homunculus is the
 * active one, its face swaps onto the main terminal pages, and it
 * shows the little green "online" indicator — inactive ones show a
 * dark one. Swappable on the go, quick.
 */

import { SentinelFace } from '../Synth/SentinelFace';
import {
  gateDecisionLabel,
  homunculusStatusLabel,
  type Homunculus,
} from '../../lib/homunculi';

interface RosterCardProps {
  homunculus: Homunculus;
  selected: boolean;
  onSelect: (id: string) => void;
  /** Double-click activation, in the Forge specifically. */
  onActivate: (id: string) => void;
  onEditBiography: (id: string) => void;
}

export function RosterCard({
  homunculus,
  selected,
  onSelect,
  onActivate,
  onEditBiography,
}: RosterCardProps) {
  const lastEntry = homunculus.lineage[homunculus.lineage.length - 1];
  const accent =
    homunculus.color === 'purple' ? 'border-purple-400/60' : 'border-pink-400/60';
  return (
    <button
      type="button"
      onClick={() => onSelect(homunculus.id)}
      onDoubleClick={() => onActivate(homunculus.id)}
      aria-pressed={selected}
      title="Click to select — double-click to activate"
      className={`w-full text-left rounded-md border bg-[var(--bg-secondary)] p-3 transition-colors ${
        selected
          ? `${accent} border-2`
          : 'border-[var(--border)] hover:border-[var(--text-muted)]'
      }`}
    >
      <span className="flex items-start gap-3">
        <span className="shrink-0" aria-hidden="true">
          <SentinelFace size={44} color={homunculus.color} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
            {homunculus.name}
          </span>
          <span className="block text-xs capitalize text-[var(--text-muted)]">
            {homunculus.color} Homunculus
          </span>
          {/* Online indicator: green for the active one, dark for the rest. */}
          <span
            className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
              selected
                ? 'border-green-400/60 text-green-300'
                : 'border-[var(--border)] text-[var(--text-muted)]'
            }`}
            aria-label={selected ? 'Online — active' : 'Offline — inactive'}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                selected ? 'bg-green-400' : 'bg-neutral-600'
              }`}
            />
            {selected ? 'Online' : 'Offline'}
          </span>
          <span className="mt-1 block text-xs text-[var(--text-secondary)]">
            {homunculusStatusLabel(homunculus.status)}
            {homunculus.modelPath
              ? ` — ${homunculus.modelPath.split('/').pop()}`
              : ''}
          </span>
          <span className="mt-1 block text-xs text-[var(--text-muted)]">
            {lastEntry
              ? `Last Gate: ${gateDecisionLabel(lastEntry.gateDecision)}${
                  lastEntry.score !== null ? ` (${lastEntry.score})` : ''
                }`
              : 'No Gate decision yet'}
          </span>
        </span>
      </span>
      <span className="mt-2 block text-xs leading-snug text-[var(--text-secondary)]">
        {homunculus.biography ? (
          <>
            {homunculus.biography.character}{' '}
            <span className="text-[var(--text-muted)]">
              — {homunculus.biography.vibe}
            </span>
          </>
        ) : (
          'Biography not written yet'
        )}
      </span>
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onEditBiography(homunculus.id);
        }}
        onDoubleClick={(e) => {
          // Editing a biography is not activating — keep a
          // double-click on this control from activating the card.
          e.stopPropagation();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
            onEditBiography(homunculus.id);
          }
        }}
        className="mt-2 inline-block text-xs text-[var(--accent)] hover:underline"
      >
        {homunculus.biography ? 'Edit biography' : 'Write biography'}
      </span>
    </button>
  );
}
