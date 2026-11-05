import { useEffect, useState, type MutableRefObject } from 'react';
import {
  HEARTBEAT_INTERVAL_MS,
  heartbeatFrameFor,
  isTypingPaused,
} from './heartbeatLogic';

interface HeartbeatProps {
  /** The LuciferAI plugin is loaded/running (the dot is 🩸, green or amber). */
  active: boolean;
  /** A task is running — a terminal command, an AI-chat generation, or a
   * plugin task. While busy the heartbeat gives way to the busy state
   * (the blood drip / the loading swirl / the generation indicator). */
  busy: boolean;
  /** Ref holding the ms epoch of the last keystroke in the prompt. The
   * heartbeat pauses while the user is typing (the original's smart
   * pausing) and resumes once typing stops. */
  lastKeystrokeAt: MutableRefObject<number>;
}

/**
 * The LuciferAI idle heartbeat — "🩸 Idle • Awaiting Commands... ☠️/💀",
 * cycling red ↔ purple every second, shown directly above the prompt
 * while the LuciferAI plugin is active and idle. Restored from the
 * original (`lucifer.py` `heartbeat_animation()`, `docs/HEARTBEAT_UPDATE.md`).
 */
export function Heartbeat({ active, busy, lastKeystrokeAt }: HeartbeatProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!active || busy) return;
    const timer = setInterval(() => {
      // Pause while typing — the frame only advances once typing stops.
      if (isTypingPaused(lastKeystrokeAt.current, Date.now())) return;
      setFrame((f) => f + 1);
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, busy, lastKeystrokeAt]);

  if (!active || busy) return null;

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
