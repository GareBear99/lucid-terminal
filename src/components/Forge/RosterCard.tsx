/**
 * RosterCard — one Homunculus in the Forge roster.
 *
 * Shows its avatar (the SentinelFace SVG, small — the face IS the
 * avatar, in the Homunculus's colour), name, colour, biography (or
 * "Biography not written yet" — never an invented one), brain (model
 * name + status), and last Gate v2 decision. Clicking selects it.
 *
 * Note: SentinelFace itself wears the colour stored in Settings (it
 * takes no colour prop) — the card's accent ring and colour label use
 * this Homunculus's own colour, so a roster of two Homunculi is still
 * told apart at a glance.
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
  onEditBiography: (id: string) => void;
}

export function RosterCard({
  homunculus,
  selected,
  onSelect,
  onEditBiography,
}: RosterCardProps) {
  const lastEntry = homunculus.lineage[homunculus.lineage.length - 1];
  const accent =
    homunculus.color === 'purple' ? 'border-purple-400/60' : 'border-pink-400/60';
  return (
    <button
      type="button"
      onClick={() => onSelect(homunculus.id)}
      aria-pressed={selected}
      className={`w-full text-left rounded-md border bg-[var(--bg-secondary)] p-3 transition-colors ${
        selected
          ? `${accent} border-2`
          : 'border-[var(--border)] hover:border-[var(--text-muted)]'
      }`}
    >
      <span className="flex items-start gap-3">
        <span className="shrink-0" aria-hidden="true">
          <SentinelFace size={44} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
            {homunculus.name}
          </span>
          <span className="block text-xs capitalize text-[var(--text-muted)]">
            {homunculus.color} Homunculus
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
