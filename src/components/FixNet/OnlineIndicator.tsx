/**
 * OnlineIndicator Component (Gary, 2026-11-09 ~03:58 PST, refined ~04:00 PST).
 *
 * Just the dot on the FixNet line, top-right, opposite the FixNet
 * stats — no visible text label. Hovering the dot opens a hover
 * overlay in which a cursor TYPES the status out character by
 * character (typewriter effect) instead of the text just appearing.
 *
 * Three states, from the terminal store's real PTY state (see
 * activeTerminalStatus in src/stores/terminalStore.ts) — never a
 * timer, never a guess:
 * - online: green dot, hover types "online";
 * - offline: blackened dot, hover types "offline";
 * - unknown: GREY dot, hover types "N/A" — while no PTY state is
 *   known yet (startup, before the first tab is created or the
 *   first shell exit is recorded).
 *
 * The dot TRAVELS with the typing (Gary, 2026-11-09 ~04:00 PST):
 * inside the overlay the dot sits right after the typed text and
 * before the typing cursor, so every character the cursor types
 * pushes the dot one step further along — the dot shifts position
 * as the text grows instead of sitting still beside it.
 *
 * Purely presentational: it takes the status and renders. No store
 * read, no IPC, no timer of its own except the typing interval
 * while the overlay is open, so the states are trivially testable
 * in isolation.
 */

import { useEffect, useState } from 'react';
import type { TerminalStatus } from '../../stores/terminalStore';

/** What the hover overlay types out for each state. */
export const STATUS_TEXT: Record<TerminalStatus, string> = {
  online: 'online',
  offline: 'offline',
  unknown: 'N/A',
};

/** Milliseconds per typed character. */
export const TYPE_INTERVAL_MS = 50;

function dotClassName(status: TerminalStatus): string {
  switch (status) {
    case 'online':
      return 'inline-block h-2 w-2 shrink-0 rounded-full bg-green-500';
    case 'offline':
      // Blackened (Gary, 2026-11-09 ~02:52 PST): a black dot. The
      // border keeps it visible against the black screen — without
      // it a black dot on black is invisible.
      return 'inline-block h-2 w-2 shrink-0 rounded-full bg-black border border-neutral-700';
    case 'unknown':
      // Grey (Gary, 2026-11-09 ~03:58 PST): status not known yet.
      return 'inline-block h-2 w-2 shrink-0 rounded-full bg-gray-500';
  }
}

function textClassName(status: TerminalStatus): string {
  return status === 'online' ? 'text-green-400' : 'text-gray-400';
}

export function OnlineIndicator({ status }: { status: TerminalStatus }) {
  const [hovered, setHovered] = useState(false);
  const [typed, setTyped] = useState('');
  const fullText = STATUS_TEXT[status];

  // Typewriter: while the overlay is open, type the status out one
  // character at a time. Re-types from scratch if the status flips
  // mid-hover; resets when the overlay closes.
  useEffect(() => {
    if (!hovered) {
      setTyped('');
      return;
    }
    setTyped('');
    if (fullText.length === 0) return;
    const timer = setInterval(() => {
      setTyped((prev) => {
        if (prev.length >= fullText.length) {
          clearInterval(timer);
          return prev;
        }
        return fullText.slice(0, prev.length + 1);
      });
    }, TYPE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hovered, fullText]);

  return (
    <span
      data-testid="online-indicator"
      data-status={status}
      aria-label={`Terminal status: ${fullText}`}
      tabIndex={0}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      className="relative flex items-center font-mono text-xs outline-none"
    >
      <span data-testid="online-dot" aria-hidden="true" className={dotClassName(status)} />
      {hovered && (
        <span
          data-testid="online-status-overlay"
          aria-hidden="true"
          className="absolute top-full right-0 mt-1 z-50 flex items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 shadow-2xl"
        >
          <span data-testid="typed-status-text" className={textClassName(status)}>
            {typed}
          </span>
          {/* The travelling dot (Gary, 2026-11-09 ~04:00 PST): it sits
              after the typed text and before the cursor, so it shifts
              along as the cursor types each new character. */}
          <span data-testid="online-dot-travelling" className={dotClassName(status)} />
          <span data-testid="typing-cursor" className={`animate-pulse ${textClassName(status)}`}>
            ▍
          </span>
        </span>
      )}
    </span>
  );
}
