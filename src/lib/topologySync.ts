/**
 * Topology sync — the non-devmode prompt contract (Gary, 2026-11-08).
 *
 * Non-devmode (devMode OFF, the default) is the REAL topology sync:
 * the prompt section and the xterm surface share ONE input topology —
 * clicking anywhere in the prompt section focuses the terminal, and
 * typing always lands in the shell. The page is a clean unison: full
 * black background, black prompt bar, like Warp AI.
 *
 * Dev mode ON is still the topology DESYNC (Gary, 2026-11-08 ~07:05
 * PST): the prompt bar is delinked from the terminal screen — a
 * detached command bar + dev console — and that does not change.
 *
 * FAILSAFE (Gary, 2026-11-08 ~07:05 PST): if the topology sync fails
 * or desyncs while in non-devmode, the app FALLS INTO dev mode — dev
 * mode ON, detached bar + dev console — so the terminal still works.
 * It must never be left with a broken, synced-but-dead prompt bar.
 * The detached bar is a REAL fallback, not theater: it runs commands
 * through `terminal:executeCommand` (a one-shot child_process call,
 * 30s timeout), which never touches the PTY stream or the xterm
 * surface — so it still works when the PTY write path or the surface
 * focus is what broke.
 *
 * What counts as a sync failure (the detectable desyncs):
 * 1. The terminal surface is not mounted (no handle to focus).
 * 2. Focusing the terminal throws.
 * 3. Writing keystrokes to the PTY throws (the input path is dead).
 *
 * A dead SHELL is not a topology failure — the shell-exited banner
 * already offers a restart — so the failsafe never fires for it.
 */

export const TOPOLOGY_FALLBACK_TITLE =
  'Topology sync failed — fell back to dev mode';

export const TOPOLOGY_FALLBACK_NOTICE =
  'Topology sync failed — fell back to dev mode (detached prompt bar). ' +
  'The prompt section could not reach the terminal screen, so dev mode is ON: ' +
  'the detached bar below still works — it runs commands without the terminal screen. ' +
  'Turn dev mode off in Settings → General, or run /devmode off from the bar, to try syncing again.';

export interface PromptFocusCheck {
  /** True when the prompt section can hand focus to the terminal. */
  ok: boolean;
  /** Why the sync failed (present only when ok is false). */
  reason?: string;
}

/**
 * Check whether the prompt section can hand focus to the terminal
 * surface — the click half of the topology sync. Pure, so tests can
 * drive every failure without mounting a terminal.
 */
export function checkPromptFocus(
  hasSurface: boolean,
  focus: () => void,
): PromptFocusCheck {
  if (!hasSurface) {
    return { ok: false, reason: 'the terminal surface is not mounted' };
  }
  try {
    focus();
  } catch (error) {
    return {
      ok: false,
      reason: `focusing the terminal threw: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
  return { ok: true };
}

/** Describe a PTY write failure as a topology-desync reason. */
export function ptyWriteFailureReason(error: unknown): string {
  return `writing to the terminal failed: ${
    error instanceof Error ? error.message : String(error)
  }`;
}
