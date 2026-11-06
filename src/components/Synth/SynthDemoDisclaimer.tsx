/**
 * SynthDemoDisclaimer — the step after the Homunculus colour choice.
 *
 * Gary (2026-11-05): the Lucid synth is a demo — the demo of what it
 * can become — until you build your own, and you build your own with
 * Iteration 8, the creator builder. This card asks: commence building
 * your own, or explore the demo still?
 *
 * Pure presentational component: it calls `onChoose` and the parent
 * (SynthView) persists the choice. It never touches storage itself,
 * so it is trivially testable and can never block the view on a
 * storage failure.
 *
 * Synth versions (Gary, 2026-11-05): starting a new build asks for a
 * synth version in a drop-down, starting with Iteration 8 for now —
 * Lucid is the demo, not a live working build yet. Choosing "Build my
 * own" opens the version step (a <select>, Iteration 8 selected);
 * confirming records the choice and the version together. "Explore
 * the demo still" is unchanged and records no version.
 *
 * The error boundary below it exists for one reason: if the
 * disclaimer itself throws, the Synth view must still open. A
 * disclaimer crash renders nothing and the demo continues.
 *
 * Iteration 8 does not exist yet as a built feature — "build my own"
 * only records the choice and the version; the parent lands on a clear
 * state naming Iteration 8 as the creator builder. It does not fake a
 * builder UI.
 */

import { Component, useState, type ReactNode } from 'react';
import type { SynthDisclaimerChoice } from '../../lib/synthDisclaimer';
import {
  DEFAULT_SYNTH_VERSION,
  SYNTH_VERSION_LABELS,
  SYNTH_VERSIONS,
  type SynthVersion,
} from '../../lib/synthDisclaimer';

export function SynthDemoDisclaimer({
  onChoose,
}: {
  onChoose: (choice: SynthDisclaimerChoice, version?: SynthVersion) => void;
}) {
  // Step 1: build or explore. Step 2 (build only): pick the synth
  // version — Iteration 8, the only version for now, selected.
  const [pickingVersion, setPickingVersion] = useState(false);
  const [selectedVersion, setSelectedVersion] =
    useState<SynthVersion>(DEFAULT_SYNTH_VERSION);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="The Lucid synth is a demo"
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/70"
    >
      <div className="w-[340px] rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-5 text-center shadow-2xl">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          This synth is a demo
        </h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          The Lucid synth is the demo of what it can become. Build your
          own with Iteration 8, the creator builder.
        </p>
        {pickingVersion ? (
          <>
            <p className="mt-2 text-sm text-[var(--text-primary)]">
              Which synth version are you building?
            </p>
            <label className="mt-3 block text-left text-xs text-[var(--text-muted)]">
              Synth version
              <select
                aria-label="Synth version"
                value={selectedVersion}
                onChange={(e) =>
                  setSelectedVersion(e.target.value as SynthVersion)
                }
                className="mt-1 block w-full rounded-md border border-[var(--border)] bg-white/5 px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border)]"
              >
                {SYNTH_VERSIONS.map((version) => (
                  <option key={version} value={version}>
                    {SYNTH_VERSION_LABELS[version]}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-5 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => onChoose('build', selectedVersion)}
                className="rounded-md border border-[var(--border)] bg-white/5 px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border)]"
              >
                Start with {SYNTH_VERSION_LABELS[selectedVersion]}
              </button>
              <button
                type="button"
                onClick={() => setPickingVersion(false)}
                className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border)]"
              >
                Back
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-[var(--text-primary)]">
              Commence building your own, or explore the demo still?
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setPickingVersion(true)}
                className="rounded-md border border-[var(--border)] bg-white/5 px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border)]"
              >
                Build my own
              </button>
              <button
                type="button"
                onClick={() => onChoose('explore')}
                className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border)]"
              >
                Explore the demo still
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * A disclaimer crash must never block the Synth view: render nothing
 * and let the demo continue.
 */
export class SynthDemoDisclaimerErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    console.error('Synth demo disclaimer failed:', error);
  }

  render(): ReactNode {
    return this.state.hasError ? null : this.props.children;
  }
}
