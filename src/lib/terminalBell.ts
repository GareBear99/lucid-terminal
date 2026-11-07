/**
 * Terminal bell sound (Gary, 2026-11-07): "have a play button for
 * terminal bell sound".
 *
 * What was broken: the Terminal tab had a "Terminal bell sound"
 * toggle, but bellSound was write-only — nothing read it, no bell
 * was ever played, and there was no way to preview the sound.
 *
 * The bell itself: the terminal is a custom block renderer, not
 * xterm, so there is no onBell event. The bell arrives as a BEL
 * character (\x07) in PTY data — the shell (or a program running in
 * it) writes \a and a real terminal rings. Terminal.tsx feeds every
 * PTY chunk through processTerminalBell(): if the chunk contains
 * BEL and the toggle is on, the bell rings; BEL is always stripped
 * from the displayed output (it rings, it does not print).
 *
 * The sound: a Web Audio API oscillator bell tone — no asset file,
 * self-contained, no cost. One shared AudioContext, created lazily
 * on the first ring. The play button in Settings and the live bell
 * both call playTerminalBell() — one source of truth, so the
 * preview is exactly the sound the terminal plays.
 *
 * Autoplay note: a fresh AudioContext starts suspended until the
 * user has interacted with the page, so a live bell before any
 * interaction may stay silent until the first click/keypress; the
 * preview button is itself a gesture, so it always sounds. The
 * resume() call is defensive, not a guarantee.
 */

/** The BEL character — what the shell writes to ring the bell. */
export const TERMINAL_BELL_CHAR = '\x07';

/** How long the bell tone lasts, in milliseconds. */
export const TERMINAL_BELL_DURATION_MS = 600;

/** True when the chunk contains a bell. */
export function containsBell(data: string): boolean {
  return data.indexOf(TERMINAL_BELL_CHAR) !== -1;
}

/** Remove BEL characters — the bell rings, it does not print. */
export function stripBell(data: string): string {
  return data.split(TERMINAL_BELL_CHAR).join('');
}

let sharedContext: AudioContext | null = null;

/**
 * Test-only: drop the cached AudioContext so the next ring creates
 * a fresh one. Lets tests install a mock AudioContext per test.
 */
export function resetTerminalBellContext(): void {
  sharedContext = null;
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor = win.AudioContext ?? win.webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedContext) {
    try {
      sharedContext = new Ctor();
    } catch {
      return null;
    }
  }
  return sharedContext;
}

/**
 * Play the terminal bell tone: a short two-partial sine bell
 * (880 Hz fundamental + 1318.5 Hz partial, exponential decay).
 * Safe to call anywhere — a no-op when Web Audio is unavailable
 * (SSR, or a browser without AudioContext). Does NOT check the
 * bellSound toggle: the preview button calls this directly, and
 * the live path gates on the toggle before calling it.
 */
export function playTerminalBell(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  try {
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.connect(ctx.destination);
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.5, now + 0.01);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    // Fundamental + a quieter 3/2 partial: a rounder bell than a
    // bare sine, still one short beep.
    const partials: Array<[number, number]> = [
      [880, 1],
      [1318.5, 0.4],
    ];
    for (const [frequency, volume] of partials) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      const oscGain = ctx.createGain();
      oscGain.gain.value = volume;
      osc.connect(oscGain);
      oscGain.connect(master);
      osc.start(now);
      osc.stop(now + TERMINAL_BELL_DURATION_MS / 1000);
    }
  } catch {
    // Audio is best-effort: a bell must never break the terminal.
    return;
  }
}

/**
 * The live-bell entry point. Terminal.tsx calls this with every
 * PTY chunk and the current bellSound setting. Returns the chunk
 * with BEL stripped (safe to display as-is). Rings only when the
 * chunk contains BEL *and* the bell is enabled.
 */
export function processTerminalBell(
  data: string,
  bellEnabled: boolean,
): string {
  if (!containsBell(data)) return data;
  if (bellEnabled) playTerminalBell();
  return stripBell(data);
}
