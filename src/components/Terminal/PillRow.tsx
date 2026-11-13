/**
 * The pill row directly below the prompt input (heavy terminal
 * work, 2026-11-13 — Warp's pills sit directly under the prompt:
 * version, directory, branch, git counts. Lucid had no pill row
 * under the prompt at all — the equivalents were split across
 * the prompt-section header and the app status bar, and the
 * version / branch / git counts existed nowhere).
 *
 * - Mode pill (button): just the mode name — "Terminal" or
 *   "Agent" — plus an up-down arrow (↕). Gary, 2026-11-13
 *   ~07:32 PST: the pill should just say terminal or agent
 *   with up and down arrow. Click flips THIS tab's mode and
 *   nothing else (REBUILT 2026-11-13 ~08:21 PST per Gary —
 *   Warp's in-tab agent flow: one session per tab, the agent
 *   works in the tab). The parent owns the flip + the composer
 *   focus after it. The session title lives in the tab strip,
 *   not the pill.
 *   In a guest build the pill is DISABLED (Gary, 2026-11-13
 *   ~10:58 PST: guest stays terminal-only — the Default
 *   account is the full account): greyed out with a
 *   not-allowed cursor, instead of a silently dead clickable
 *   button. The sessionStore guard still refuses the flip
 *   itself; this is only the visible state.
 *   Later, a side arrow can be configurable (Gary, same
 *   message) — not built yet.
 * - Driving-agent pill (label, not a button): the base/default
 *   driving model. The picker lands with the driving
 *   intelligence (step 3) — a button with nothing behind it
 *   would be a dead toggle.
 * - Cwd pill (button): the tab's cwd — click copies
 *   it. (Known wart: the cwd also shows in the prompt-section
 *   header and the app status bar. The header is settled and
 *   not redesigned; this pill earns its place as the copyable
 *   one.)
 * - Branch + counts pills (labels): the live git state for the
 *   active cwd. They render only when the cwd is a repo.
 * - Version pill (label): the app version.
 *
 * Pure presentational except the cwd copy (copyText) — no
 * stores. Clicks stop propagation: the prompt section's click
 * handler focuses the composer, and a pill click must not also
 * run the topology focus check.
 */

import { useState } from 'react';
import { APP_VERSION } from '../../lib/appVersion';
import { DRIVING_AGENT_BASE_MODEL } from '../../stores/sessionStore';
import { formatGitBranch, formatGitCounts } from '../../lib/gitStatus';
import { copyText } from '../../lib/terminalBlocks';
import type { GitStatus } from '../../types';

interface PillRowProps {
  /** This tab's mode — what its prompt does. */
  mode: 'terminal' | 'agent';
  cwd?: string;
  /** Live git state for the cwd (undefined = not looked up yet,
   *  null = not a repo). */
  gitStatus?: GitStatus | null;
  /** The mode pill was clicked (flip the tab's mode). */
  onModePill: () => void;
  /** Guest build: the pill is disabled (greyed, not clickable).
   *  Guests stay terminal-only; agent mode needs a profile. */
  modePillDisabled?: boolean;
}

const PILL_CLASS =
  'shrink-0 truncate rounded-full border border-[var(--border)] bg-[var(--bg-tertiary)]/50 px-2 py-px font-mono text-[11px] text-[var(--text-secondary)]';

export function PillRow({ mode, cwd, gitStatus, onModePill, modePillDisabled = false }: PillRowProps) {
  const [copiedCwd, setCopiedCwd] = useState(false);

  const handleCopyCwd = async () => {
    if (!cwd) return;
    if (await copyText(cwd)) {
      setCopiedCwd(true);
      setTimeout(() => setCopiedCwd((cur) => (cur ? false : cur)), 2000);
    }
  };

  return (
    <div
      data-testid="prompt-pill-row"
      className="flex flex-wrap items-center gap-1.5 px-5 pb-3"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        data-testid="mode-pill"
        onClick={onModePill}
        disabled={modePillDisabled}
        title={
          modePillDisabled
            ? 'Agent needs a profile — guests use the terminal'
            : mode === 'agent'
              ? 'Switch to terminal mode'
              : 'Switch to agent mode'
        }
        className={
          modePillDisabled
            ? `${PILL_CLASS} max-w-56 cursor-not-allowed opacity-50`
            : `${PILL_CLASS} max-w-56 hover:bg-white/10 hover:text-[var(--text-primary)]`
        }
      >
        {mode === 'agent' ? 'Agent' : 'Terminal'} ↕
      </button>
      <span
        data-testid="driving-agent-pill"
        title={`Driving model — ${DRIVING_AGENT_BASE_MODEL} (base)`}
        className={PILL_CLASS}
      >
        {DRIVING_AGENT_BASE_MODEL}
      </span>
      {cwd && (
        <button
          type="button"
          data-testid="cwd-pill"
          onClick={() => void handleCopyCwd()}
          title={cwd}
          className={`${PILL_CLASS} max-w-64 hover:bg-white/10 hover:text-[var(--text-primary)]`}
        >
          {copiedCwd ? 'Copied' : cwd}
        </button>
      )}
      {gitStatus && (
        <span
          data-testid="git-branch-pill"
          title={`Branch ${gitStatus.branch}`}
          className={PILL_CLASS}
        >
          {formatGitBranch(gitStatus)}
        </span>
      )}
      {gitStatus && (
        <span
          data-testid="git-counts-pill"
          title={`${gitStatus.changedFiles} files changed`}
          className={PILL_CLASS}
        >
          {formatGitCounts(gitStatus)}
        </span>
      )}
      <span data-testid="version-pill" title="Lucid version" className={PILL_CLASS}>
        v{APP_VERSION}
      </span>
    </div>
  );
}
