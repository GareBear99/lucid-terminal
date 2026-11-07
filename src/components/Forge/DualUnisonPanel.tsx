/**
 * DualUnisonPanel — the Dual Unison tab in the Forge (Gary, 2026-11-06).
 *
 * Dual unison IS the third type: Type 1 = pink single, Type 2 =
 * purple single, Type 3 = dual unison, the one whole (binary 2).
 * It unlocks by creating the pair — one pink and one purple
 * Homunculus. The dual one has red, orange, and yellow outlines,
 * specifically for the dual one.
 *
 * The STOP is built into the dual unison type: once dual unison
 * unlocks, no more singles can be created until the FIRST STOP ACTION
 * is input here (setting up the third type). The stop action is then
 * verified and detected within the unison detect — that is what fully
 * unlocks the tail page. The tri unison buff lives here too (it is
 * acquired on the account with dual unison).
 */

import { useState } from 'react';
import { useForgeStore } from '../../stores/forgeStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { HomunculusVoiceNote } from './HomunculusVoiceNote';
import {
  DUAL_UNISON_OUTLINE_COLORS,
  DUAL_UNISON_OUTLINES,
  detectDualUnison,
  isTailPageFullyUnlocked,
  parseStopColorDurationSeconds,
  stopActionStateLabel,
  type DualUnisonOutline,
  type StopColorDuration,
} from '../../lib/dualUnison';

export function DualUnisonPanel() {
  const roster = useForgeStore((s) => s.roster);
  const unison = useForgeStore((s) => s.unison);
  const lastError = useForgeStore((s) => s.lastError);
  const inputStopAction = useForgeStore((s) => s.inputStopAction);
  const verifyStopAction = useForgeStore((s) => s.verifyStopAction);
  const detectStopAction = useForgeStore((s) => s.detectStopAction);
  const assignStopActionMessage = useForgeStore(
    (s) => s.assignStopActionMessage,
  );
  const hitStop = useForgeStore((s) => s.hitStop);
  const acquireTriUnison = useForgeStore((s) => s.acquireTriUnison);

  // The stop-setup form defaults to the saved stop-colour duration
  // setting. The panel remounts each time the Dual Unison
  // tab opens, so it picks up the current setting.
  const savedDuration = useSettingsStore(
    (s) => s.settings.forgeStopColorDuration,
  );
  const [stopColor, setStopColor] = useState('#ef4444');
  const [durationKind, setDurationKind] = useState<'seconds' | 'until-next-action'>(
    savedDuration.kind,
  );
  const [durationSeconds, setDurationSeconds] = useState(
    savedDuration.kind === 'seconds' ? savedDuration.seconds : 3,
  );
  const [message, setMessage] = useState('');
  const [inputting, setInputting] = useState(false);

  const detection = detectDualUnison(roster);
  const tailUnlocked = isTailPageFullyUnlocked(unison.stopAction);
  const hasPink = detection.pinkId !== null;
  const hasPurple = detection.purpleId !== null;

  const handleInputStop = () => {
    const seconds = parseStopColorDurationSeconds(durationSeconds);
    const duration: StopColorDuration =
      durationKind === 'seconds'
        ? { kind: 'seconds', seconds: seconds ?? 3 }
        : { kind: 'until-next-action' };
    setInputting(true);
    try {
      inputStopAction(stopColor, duration);
    } catch {
      // Rejected (not detected / already input / bad colour) —
      // lastError already says why; keep the form open.
    } finally {
      setInputting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
        <p className="text-xs text-[var(--text-muted)]">
          Listen to the Dual Unison voice message:
        </p>
        <audio
          className="mt-1 w-full max-w-md"
          controls
          preload="metadata"
          src="./forge/forge-dual-unison.mp3"
          aria-label="Dual Unison voice message"
        />
        <HomunculusVoiceNote />
      </section>
      <section className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Dual unison — the third type
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
          Binary 1 is the two equal, separate states — pink and purple.
          Binary 2 is the united state: dual unison, the one whole, both
          together. Type 1 is a pink single, Type 2 is a purple single,
          Type 3 is dual unison. It unlocks when you create the pair.
        </p>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          {detection.detected ? (
            <>Dual unison detected — the pair is united.</>
          ) : hasPink && !hasPurple ? (
            <>
              Not unlocked yet — you have pink but no purple. Create a
              purple Homunculus in the Forge tab to unlock it.
            </>
          ) : !hasPink && hasPurple ? (
            <>
              Not unlocked yet — you have purple but no pink. Create a
              pink Homunculus in the Forge tab to unlock it.
            </>
          ) : (
            <>
              Not unlocked yet — no Homunculus exists yet. Choose your
              Homunculus colour in the Synth view first, then create
              the opposite colour here.
            </>
          )}
        </p>
        <div className="mt-2 flex items-center gap-2" aria-label="Dual unison outlines">
          <span className="text-xs text-[var(--text-muted)]">Outlines:</span>
          {DUAL_UNISON_OUTLINES.map((outline: DualUnisonOutline) => (
            <span
              key={outline}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs capitalize text-[var(--text-secondary)]"
              style={{ borderColor: DUAL_UNISON_OUTLINE_COLORS[outline] }}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: DUAL_UNISON_OUTLINE_COLORS[outline] }}
              />
              {outline}
            </span>
          ))}
        </div>
      </section>

      {detection.detected && unison.stopAction === 'not-input' && (
        <section className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Set up the third type — the first stop action
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
            No more singles can be created until the first stop action is
            input. Assign a colour to the stop, and choose how long the
            action face colours to it when the stop is hit.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--text-muted)]">
                Stop colour
              </span>
              <input
                type="color"
                value={stopColor}
                onChange={(e) => setStopColor(e.target.value)}
                aria-label="Stop colour"
                className="h-8 w-12 cursor-pointer rounded border border-[var(--border)] bg-[var(--bg-primary)]"
              />
            </label>
            <div className="flex items-center gap-1" aria-label="Outline quick picks">
              {DUAL_UNISON_OUTLINES.map((outline: DualUnisonOutline) => (
                <button
                  key={outline}
                  type="button"
                  onClick={() =>
                    setStopColor(DUAL_UNISON_OUTLINE_COLORS[outline])
                  }
                  title={`Use the ${outline} outline colour`}
                  aria-label={`Use ${outline} as the stop colour`}
                  className="h-6 w-6 rounded-full border border-[var(--border)]"
                  style={{ backgroundColor: DUAL_UNISON_OUTLINE_COLORS[outline] }}
                />
              ))}
            </div>
            <fieldset className="block">
              <legend className="mb-1 text-xs text-[var(--text-muted)]">
                How long the colour shows
              </legend>
              <label className="mr-3 inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                <input
                  type="radio"
                  name="stop-duration"
                  checked={durationKind === 'seconds'}
                  onChange={() => setDurationKind('seconds')}
                />
                <input
                  type="number"
                  min={1}
                  max={9}
                  step={1}
                  value={durationSeconds}
                  onChange={(e) =>
                    setDurationSeconds(Number(e.target.value))
                  }
                  aria-label="Seconds the stop colour shows (1 to 9)"
                  className="w-14 rounded border border-[var(--border)] bg-[var(--bg-primary)] px-1 py-0.5 text-xs text-[var(--text-primary)]"
                />
                seconds (1–9)
              </label>
              <label className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                <input
                  type="radio"
                  name="stop-duration"
                  checked={durationKind === 'until-next-action'}
                  onChange={() => setDurationKind('until-next-action')}
                />
                Until the next action
              </label>
            </fieldset>
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            If seconds are chosen, when they expire the face regresses to
            the last validated solid in the causal tick time flow (the
            ritual ticks).
          </p>
          <button
            type="button"
            onClick={handleInputStop}
            disabled={inputting}
            className="mt-3 rounded bg-[var(--accent)] px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            {inputting ? 'Inputting…' : 'Input the first stop action'}
          </button>
          {lastError && (
            <p role="alert" className="mt-2 text-xs text-red-300">
              {lastError}
            </p>
          )}
        </section>
      )}

      {detection.detected && unison.stopAction !== 'not-input' && (
        <section className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Stop action — {stopActionStateLabel(unison.stopAction)}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
            The stop action must be verified and detected within the
            unison detect. That is what fully unlocks the tail page.
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-[var(--text-secondary)]">
            <li>Input — done.</li>
            <li>
              Verified —{' '}
              {unison.stopAction === 'input' ? (
                <button
                  type="button"
                  onClick={() => {
                    try {
                      verifyStopAction();
                    } catch {
                      // lastError already says why.
                    }
                  }}
                  className="rounded bg-[var(--accent)] px-2 py-0.5 text-xs text-white"
                >
                  Verify in the unison detect
                </button>
              ) : (
                'done.'
              )}
            </li>
            <li>
              Detected —{' '}
              {unison.stopAction === 'verified' ? (
                <button
                  type="button"
                  onClick={() => {
                    try {
                      detectStopAction();
                    } catch {
                      // lastError already says why.
                    }
                  }}
                  className="rounded bg-[var(--accent)] px-2 py-0.5 text-xs text-white"
                >
                  Detect in the unison detect
                </button>
              ) : unison.stopAction === 'detected' ? (
                'done — the tail page is fully unlocked.'
              ) : (
                'waiting for verification.'
              )}
            </li>
          </ol>
          {tailUnlocked && (
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              The tail page is fully unlocked. More singles can be made
              again.
            </p>
          )}
          <div className="mt-3 border-t border-[var(--border)] pt-3">
            <p className="text-xs text-[var(--text-secondary)]">
              Stop colour:{' '}
              <span
                className="inline-block h-3 w-3 rounded-full align-middle"
                style={{ backgroundColor: unison.stopColor ?? 'transparent' }}
              />{' '}
              {unison.stopColor ?? 'none assigned'}
              {unison.stopFaceColorActive
                ? ' — showing on the action face now.'
                : '.'}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  try {
                    hitStop();
                  } catch {
                    // lastError already says why.
                  }
                }}
                className="rounded border border-[var(--border)] px-3 py-1 text-sm text-[var(--text-secondary)]"
              >
                Hit the stop
              </button>
            </div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Hitting the stop colours the action face to the stop&apos;s
              colour — for the chosen duration, then it regresses to the
              last validated solid.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-sm text-[var(--text-primary)]"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && message.trim()) {
                    try {
                      assignStopActionMessage(message);
                      setMessage('');
                    } catch {
                      // lastError already says why.
                    }
                  }
                }}
                placeholder="Action message for this stop…"
                aria-label="Action message for this stop"
              />
              <button
                type="button"
                onClick={() => {
                  try {
                    assignStopActionMessage(message);
                    setMessage('');
                  } catch {
                    // lastError already says why.
                  }
                }}
                disabled={!message.trim()}
                className="shrink-0 rounded bg-[var(--accent)] px-3 py-1 text-sm text-white disabled:opacity-50"
              >
                Assign from the face
              </button>
            </div>
            {unison.stopMessage && (
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                Assigned message: “{unison.stopMessage}”
              </p>
            )}
          </div>
        </section>
      )}

      {detection.detected && (
        <section className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Tri unison — account buff
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
            Tri unison is a buff to acquire on the account with dual
            unison, like live active achievements that indicate
            intelligence gauging.
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            The buff&apos;s effect, and how intelligence is gauged, are
            still open — acquiring records that the account has it.
          </p>
          <button
            type="button"
            onClick={() => {
              try {
                acquireTriUnison();
              } catch {
                // lastError already says why.
              }
            }}
            disabled={unison.triUnisonAcquired}
            className="mt-2 rounded bg-[var(--accent)] px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            {unison.triUnisonAcquired ? 'Tri unison acquired' : 'Acquire tri unison'}
          </button>
        </section>
      )}

      <section className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          Live reporting buddy
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
          The active Homunculus is the live reporting buddy — the face
          reports live once the display messages are finished. Those
          messages are not finished yet.
        </p>
      </section>
    </div>
  );
}
