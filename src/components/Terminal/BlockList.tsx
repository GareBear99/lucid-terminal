import { useState } from 'react';
import { EMPTY_BLOCKS, useHistoryStore } from '../../stores/historyStore';
import { copyText, formatBlockDuration } from '../../lib/terminalBlocks';

/**
 * DEFCON 3 Phase 2 — blocks in devmode (Gary, 2026-11-09 ~08:10 PST).
 *
 * RENDERER CHOICE — DOM blocks ABOVE the xterm, recorded with
 * reasoning (dissection §8 Q8): blocks as xterm content was
 * rejected because xterm text cannot carry per-block actions
 * (copy command / copy output / re-input need real DOM buttons)
 * and cannot carry a header. A DOM list above the xterm is the
 * only shape that gives headers, dividers and actions — and it
 * keeps ONE feed: the list lives in the terminal column, in the
 * same vertical flow as the xterm surface below it (not a second
 * panel, not a sidebar), and the non-devmode shape is untouched
 * — this list renders only when the prompter is active
 * (devmode + DEFCON 3+), so non-devmode keeps its exact settle
 * shape for the later Phase 5 landing. The xterm stream is
 * still the live surface in this phase (blocks do not replace
 * it — that is the Phase 5 landing decision); the list is the
 * structured record of composer-submitted commands, so output
 * appears twice (live stream + block transcript) until then.
 * A long output scrolls INSIDE its block (`max-h-48
 * overflow-y-auto` on the output) — the feed itself never
 * grows unboundedly per block.
 *
 * DIVIDERS: a real visible faint line — 1px `var(--border)`,
 * always on, no toggle (decided) — between every two blocks.
 * HEADERS carry cwd + duration (decided): cwd is the live cwd
 * stamped at submit; duration is submit → close (see
 * src/lib/terminalBlocks.ts for the close mechanism). While a
 * block is open the header reads RUNNING and shows no
 * duration. Theme vars only — no hardcoded colors, no new
 * theme tokens, none recolored.
 *
 * Per-block actions (§6.1), minimal: copy command, copy
 * output, re-input (puts the command back into the composer).
 * Exit-code coloring is NOT here: no per-command exit code is
 * capturable cleanly (see terminalBlocks.ts) — deferred, not
 * faked.
 *
 * DEFCON 3 Phase 5 — the non-devmode landing (Gary,
 * 2026-11-09): the SAME list lands in non-devmode at level
 * 3+, as the feed itself (`fill` — it takes the terminal
 * column, borderless and transparent, per the DEFCON 2 merge:
 * the terminal box is GONE, so the feed is text floating over
 * the mist, not a panel). THE DUPLICATION DECISION (recorded
 * with reasoning): output appeared TWICE in devmode (live
 * xterm stream + block transcript). The smallest change that
 * leaves non-devmode clean is to UNMOUNT the xterm surface
 * at level 3 in non-devmode (Terminal.tsx) — the BlockList
 * becomes the sole feed, so output appears exactly once.
 * Why unmount, not suppress-or-hide: suppressing the xterm
 * write while keeping the surface would leave a frozen stale
 * snapshot below the blocks; hiding it with display:none
 * would fire the ResizeObserver fit on a 0-size container and
 * risk a 0-column PTY resize; unmounting is deterministic —
 * XtermSurface's cleanup disposes only the xterm.js instance,
 * the PTY itself lives in the main process keyed by tabId and
 * keeps running, and dropping back to level 2 remounts a
 * fresh surface. KNOWN COSTS (not hidden): scrollback is lost
 * on landing (blocks are the record), and full-screen
 * interactive programs (vim / less / htop) have no live
 * surface at level 3 in non-devmode — their escape sequences
 * land as text in the block transcript. Dropping to level 2
 * restores the live xterm. In DEVMODE both surfaces stay: the
 * war zone keeps the raw stream visible for debugging, and
 * the duplication there is the known, documented devmode
 * state — it is not the settle.
 */

interface BlockListProps {
  tabId: string;
  /** Put a block's command back into the composer. */
  onReinput: (command: string) => void;
  /** Phase 5: the list IS the feed — it fills the terminal
   *  column (non-devmode at level 3+), borderless and
   *  transparent per the DEFCON 2 merge. Default (devmode):
   *  the capped panel above the live xterm. */
  fill?: boolean;
}

export function BlockList({ tabId, onReinput, fill = false }: BlockListProps) {
  const blocks = useHistoryStore((s) => s.blocksByTab[tabId] ?? EMPTY_BLOCKS);
  const [copied, setCopied] = useState<string | null>(null);

  if (blocks.length === 0) {
    // Empty feed in `fill` mode — the non-devmode DEFCON 3
    // landing (Gary, 2026-11-09 ~11:41 PST — "see how its at
    // the top" / "After something is input it sets right" /
    // "thats the issue"): at level 3+ in NON-devmode the xterm
    // surface is unmounted, so this list is the SOLE feed — and
    // returning null here left nothing above the prompt section
    // to fill the terminal column, so the prompt sat at the TOP
    // on launch (empty feed, 0 commands) and only dropped to
    // the bottom once the first block existed. The empty
    // fill-mode list still occupies the column (the same
    // flex-1 container), so the prompt is bottom-pinned from
    // launch. Devmode (fill=false) still returns null — the
    // live xterm below is the filler there.
    if (fill) {
      return (
        <div
          data-testid="terminal-blocks"
          className="mx-4 mb-4 mt-4 min-h-0 flex-1 overflow-y-auto rounded-none border-0 bg-transparent"
        />
      );
    }
    return null;
  }

  const handleCopy = async (key: string, text: string) => {
    if (await copyText(text)) {
      setCopied(key);
      setTimeout(() => setCopied((cur) => (cur === key ? null : cur)), 2000);
    }
  };

  return (
    <div
      data-testid="terminal-blocks"
      className={
        fill
          ? 'mx-4 mb-4 mt-4 min-h-0 flex-1 overflow-y-auto rounded-none border-0 bg-transparent'
          : 'mx-4 mt-4 max-h-72 shrink-0 overflow-y-auto rounded-none border border-[var(--border)] bg-[var(--bg-tertiary)]/50'
      }
    >
      {blocks.map((block, index) => (
        <div key={block.id}>
          {/* Faint divider between blocks — a real 1px
              `var(--border)` line, always on, no toggle. */}
          {index > 0 && (
            <div data-testid="block-divider" className="border-t border-[var(--border)]" aria-hidden="true" />
          )}
          <article
            data-testid="terminal-block"
            id={`block-${block.id}`}
            className="px-3 py-2"
          >
            {/* Header: command + cwd + duration. The cwd is the
                live cwd stamped at submit; the duration is
                submit → close (absent while RUNNING). */}
            <div
              data-testid="block-header"
              className="flex items-center gap-2 overflow-hidden font-mono text-[11px] text-[var(--text-secondary)]"
            >
              <span className="shrink-0 font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {block.isComplete ? 'CMD' : 'RUNNING'}
              </span>
              <span className="truncate font-semibold text-[var(--text-primary)]" title={block.command}>
                {block.command}
              </span>
              {block.cwd && (
                <span className="ml-auto shrink-0 truncate opacity-80" title={block.cwd}>
                  {block.cwd}
                </span>
              )}
              {block.isComplete && block.durationMs !== undefined ? (
                <span className="shrink-0" title={`${block.durationMs}ms`}>
                  {formatBlockDuration(block.durationMs)}
                </span>
              ) : null}
              <span className="shrink-0 opacity-70">
                {new Date(block.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
            {/* Output: a transcript that scrolls INSIDE its
                block, so one long output never stretches the
                feed. */}
            {block.output ? (
              <pre
                data-testid="block-output"
                className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap break-words p-1 font-mono text-[13px] leading-[1.5] text-[var(--text-primary)]"
              >
                {block.output}
              </pre>
            ) : null}
            {/* Per-block actions: copy command, copy output,
                re-input into the composer. Plain handlers,
                theme vars only. */}
            <div className="mt-1 flex items-center gap-1">
              <button
                type="button"
                data-testid="block-copy-command"
                onClick={() => void handleCopy(`cmd-${block.id}`, block.command)}
                className="rounded px-1.5 py-px font-mono text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
              >
                {copied === `cmd-${block.id}` ? 'Copied' : 'Copy cmd'}
              </button>
              <button
                type="button"
                data-testid="block-copy-output"
                onClick={() => void handleCopy(`out-${block.id}`, block.output)}
                className="rounded px-1.5 py-px font-mono text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
              >
                {copied === `out-${block.id}` ? 'Copied' : 'Copy out'}
              </button>
              <button
                type="button"
                data-testid="block-reinput"
                onClick={() => onReinput(block.command)}
                className="rounded px-1.5 py-px font-mono text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
              >
                Re-input
              </button>
            </div>
          </article>
        </div>
      ))}
    </div>
  );
}
