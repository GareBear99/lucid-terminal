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
 */

interface BlockListProps {
  tabId: string;
  /** Put a block's command back into the composer. */
  onReinput: (command: string) => void;
}

export function BlockList({ tabId, onReinput }: BlockListProps) {
  const blocks = useHistoryStore((s) => s.blocksByTab[tabId] ?? EMPTY_BLOCKS);
  const [copied, setCopied] = useState<string | null>(null);

  if (blocks.length === 0) return null;

  const handleCopy = async (key: string, text: string) => {
    if (await copyText(text)) {
      setCopied(key);
      setTimeout(() => setCopied((cur) => (cur === key ? null : cur)), 2000);
    }
  };

  return (
    <div
      data-testid="terminal-blocks"
      className="mx-4 mt-4 max-h-72 shrink-0 overflow-y-auto rounded-none border border-[var(--border)] bg-[var(--bg-tertiary)]/50"
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
