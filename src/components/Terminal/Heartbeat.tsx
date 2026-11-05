import { useEffect, useState, type MutableRefObject } from 'react';
import {
  HEARTBEAT_INTERVAL_MS,
  bloodDropFrameIndex,
  heartbeatFrameFor,
  shouldAdvanceFrame,
  shouldShowHeartbeat,
} from './heartbeatLogic';

interface HeartbeatProps {
  /** The LuciferAI plugin is loaded/running (the dot is 🩸, green or amber). */
  active: boolean;
  /** A task is running — a terminal command, an AI-chat generation, or a
   * plugin task. While busy WITHOUT dripping the heartbeat hides and
   * gives way to the busy state (the loading swirl / the generation
   * indicator). While busy WITH dripping it holds instead — see below. */
  busy: boolean;
  /** The fangs are dripping — an AI-chat generation or a LuciferAI
   * plugin task is running. This is the exact `shouldDrip(...)`
   * signal from `src/components/Synth/blood.ts`, passed in from
   * Terminal so the heartbeat hold and the fang pixel drops share
   * one value and stay in sync by construction. While dripping the
   * heartbeat does NOT hide: it shifts to the blood-drop frame
   * (odd, purple 💀) next and HOLDS it there until the task
   * finishes, then cycling resumes from the held frame. */
  dripping: boolean;
  /** Ref holding the ms epoch of the last keystroke in the prompt. The
   * heartbeat pauses while the user is typing (the original's smart
   * pausing) and resumes once typing stops. Typing is irrelevant
   * while holding — the frame is held regardless. */
  lastKeystrokeAt: MutableRefObject<number>;
}

/**
 * The LuciferAI idle heartbeat — "Idle • Awaiting Commands... ☠️" /
 * "🩸 Idle • Awaiting Commands... 💀", cycling red ↔ purple every
 * second, shown directly above the prompt while the LuciferAI plugin
 * is active and idle. Restored from the original (`lucifer.py`
 * `heartbeat_animation()`, `docs/HEARTBEAT_UPDATE.md`) — with the
 * blood drop moved to the 💀 frame only, per Gary (2026-11-04).
 *
 * While the fangs drip (AI-chat generation or LuciferAI plugin task)
 * it holds on the blood-drop frame instead of hiding, in sync with
 * the fang pixel drops (same `shouldDrip(...)` signal) — per Gary
 * (2026-11-04). While busy without dripping (plain shell command)
 * it still hides.
 */
export function Heartbeat({ active, busy, dripping, lastKeystrokeAt }: HeartbeatProps) {
  const [frame, setFrame] = useState(0);

  // Jump to the blood-drop frame the moment the fangs start dripping —
  // "shift to the blood drop next" — whatever frame was current. If
  // the frame is already a blood-drop frame this is a no-op (same
  // value, React bails out), so no render loop.
  useEffect(() => {
    if (active && dripping) setFrame((f) => bloodDropFrameIndex(f));
  }, [active, dripping]);

  // The 1-second cycle. Torn down while dripping (the frame is held
  // and must not advance) and while busy without dripping (hidden).
  // Re-created when the hold ends, so cycling resumes from the held
  // frame — no reset to frame 0.
  useEffect(() => {
    if (!active || busy || dripping) return;
    const timer = setInterval(() => {
      if (shouldAdvanceFrame(active, busy, dripping, lastKeystrokeAt.current, Date.now())) {
        setFrame((f) => f + 1);
      }
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, busy, dripping, lastKeystrokeAt]);

  if (!shouldShowHeartbeat(active, busy, dripping)) return null;

  const { color, text } = heartbeatFrameFor(frame);
  return (
    <div
      data-heartbeat="true"
      aria-label="LuciferAI idle — awaiting commands"
      title="LuciferAI is idle and awaiting commands"
      className="px-4 py-1 font-mono text-xs select-none"
      style={{ color }}
    >
      {text}
    </div>
  );
}
