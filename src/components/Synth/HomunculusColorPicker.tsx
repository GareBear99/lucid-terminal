/**
 * HomunculusColorPicker — the first-entry colour choice for the
 * Homunculus (the Sentinel face).
 *
 * Gary (2026-11-05): on first entry to the Synth view the user chooses
 * purple or pink for the face. Just those two — not a full colour
 * picker. The choice is a small, premium moment: a dark solid card
 * over the synth, the word "Homunculus", two swatches.
 *
 * Pure presentational component: it calls `onChoose` and the parent
 * (SynthView) persists the choice. It never touches storage itself,
 * so it is trivially testable and can never block the view on a
 * storage failure.
 *
 * The error boundary below it exists for one reason: if the picker
 * itself throws, the Synth view must still open. A picker crash
 * renders nothing and the face falls back to the default colour.
 */

import { Component, type ReactNode } from 'react';
import {
  HOMUNCULUS_COLORS,
  HOMUNCULUS_THEMES,
  type HomunculusColor,
} from '../../lib/homunculusColor';

export function HomunculusColorPicker({
  onChoose,
}: {
  onChoose: (color: HomunculusColor) => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose your Homunculus colour"
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/70"
    >
      <div className="w-[320px] rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-5 text-center shadow-2xl">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          Choose your Homunculus
        </h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Purple or pink — the face wears it from now on.
        </p>
        <div className="mt-5 flex justify-center gap-6">
          {HOMUNCULUS_COLORS.map((color) => {
            const theme = HOMUNCULUS_THEMES[color];
            const label = color === 'purple' ? 'Purple' : 'Pink';
            return (
              <button
                key={color}
                type="button"
                onClick={() => onChoose(color)}
                aria-label={`Choose ${label.toLowerCase()}`}
                className="flex flex-col items-center gap-2 rounded-md px-3 py-2 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border)]"
              >
                <span
                  aria-hidden="true"
                  className="block h-14 w-14 rounded-full"
                  style={{
                    background: `radial-gradient(circle at 35% 35%, ${theme.light}, ${theme.primary} 70%)`,
                    boxShadow: `0 0 24px ${theme.glow}`,
                  }}
                />
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {label}
                  {/* Pink is the face's current variation — the palette
                      it already wears today; purple is the new
                      alternative. */}
                  {color === 'pink' && (
                    <span className="ml-1 rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                      current
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * A picker crash must never block the Synth view: render nothing and
 * let the face stay unformed (black, no eyes) until a colour is chosen.
 */
export class HomunculusPickerErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    console.error('Homunculus colour picker failed:', error);
  }

  render(): ReactNode {
    return this.state.hasError ? null : this.props.children;
  }
}
