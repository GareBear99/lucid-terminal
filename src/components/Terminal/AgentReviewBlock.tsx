/**
 * The edit-review block — Keep/Reject in the feed
 * (steal #6 — Zed, 2026-11-14).
 *
 * Zed's review surface is a multi-buffer diff tab with
 * per-hunk Keep / Reject + Keep All / Reject All. Lucid's
 * shape of that is a feed block: the loop pauses on the
 * review (agentReview.ts), the block shows the diff
 * preview + the decision buttons, and the run continues
 * when the user decides. The block stays in the feed as
 * the record of the decision — and, once kept, of the
 * checkpoint it can revert to.
 *
 * Theme vars only — no hardcoded colors, no new theme
 * tokens. Diff lines borrow the red/green the feed
 * already uses for exit codes.
 *
 * The block renders from the review data itself, not from a
 * terminal block — the copilot tab shows the same card in its
 * thread, where there is no terminal block to take it from.
 * The terminal feed passes the block's review + timestamp +
 * id; the copilot tab passes its thread message's.
 */

import { resolveAgentReview, revertAgentCheckpoint } from '../../lib/agentReview';
import type { AgentReviewBlockData } from '../../types';

const BUTTON_CLASS =
  'rounded px-1.5 py-px font-mono text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]';

export function AgentReviewBlock({
  review,
  timestamp,
  blockId,
}: {
  review: AgentReviewBlockData;
  timestamp: number;
  blockId: string;
}) {
  const pending = review.status === 'pending';
  const kept = review.status === 'kept' || review.status === 'kept-all';
  const canRevert = kept && review.checkpointId && !review.checkpointReverted;

  const decide = (decision: 'keep' | 'reject' | 'keep-all' | 'reject-all', alwaysAllowTool = false) => {
    void resolveAgentReview(review.requestId, decision, { alwaysAllowTool });
  };

  return (
    <article
      data-testid="agent-review"
      data-review-status={review.status}
      id={`block-${blockId}`}
      className="px-3 py-2"
    >
      {/* Header: REVIEW + the proposed action. */}
      <div
        data-testid="agent-review-header"
        className="flex items-center gap-2 overflow-hidden font-mono text-[11px] text-[var(--text-secondary)]"
      >
        <span className="shrink-0 font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          REVIEW
        </span>
        <span className="truncate font-semibold text-[var(--text-primary)]" title={review.summary}>
          {review.summary}
        </span>
        {review.filepath && (
          <span className="ml-auto shrink-0 truncate opacity-80" title={review.filepath}>
            {review.filepath}
          </span>
        )}
        <span className="shrink-0 opacity-70">
          {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>

      {/* The diff preview: removed lines red, added lines
          green, context muted — one hunk per edit. */}
      {review.hunks.map((hunk, i) => (
        <div key={i} data-testid="agent-review-hunk" className="mt-1 font-mono text-[12px] leading-[1.5]">
          <div className="text-[var(--text-muted)]">@@ line {hunk.line} @@</div>
          {hunk.before.map((line, j) => (
            <div key={`b-${j}`} className="whitespace-pre-wrap break-words text-[var(--text-muted)]">
              {'  '}{line}
            </div>
          ))}
          {hunk.removed.map((line, j) => (
            <div key={`r-${j}`} className="whitespace-pre-wrap break-words text-red-400">
              {'- '}{line}
            </div>
          ))}
          {hunk.added.map((line, j) => (
            <div key={`a-${j}`} className="whitespace-pre-wrap break-words text-green-400">
              {'+ '}{line}
            </div>
          ))}
          {hunk.after.map((line, j) => (
            <div key={`f-${j}`} className="whitespace-pre-wrap break-words text-[var(--text-muted)]">
              {'  '}{line}
            </div>
          ))}
          {hunk.note && (
            <div className="text-[var(--text-muted)] italic">{hunk.note}</div>
          )}
        </div>
      ))}

      {/* A new file has no removed lines — say so plainly
          instead of rendering an empty hunk. */}
      {review.hunks.length === 0 && !review.previewError && !review.diagnostics?.length && (
        <p className="mt-1 font-mono text-[12px] text-[var(--text-muted)]">
          No diff preview for this call.
        </p>
      )}

      {/* The diagnostics a fix is about (fix_diagnostics) —
          the reason the fix is proposed. */}
      {review.diagnostics && review.diagnostics.length > 0 && (
        <div data-testid="agent-review-diagnostics" className="mt-1 font-mono text-[12px] leading-[1.5] text-[var(--text-secondary)]">
          {review.diagnostics.map((d, i) => (
            <div key={i} className="whitespace-pre-wrap break-words">
              {d.path}:{d.line}: {d.message}
              {d.code !== undefined ? ` (${d.code})` : ''}
            </div>
          ))}
        </div>
      )}

      {/* A preview that could not be built — the review
          still shows, and the user can reject it. */}
      {review.previewError && (
        <p data-testid="agent-review-preview-error" className="mt-1 font-mono text-[12px] text-red-400">
          Preview unavailable: {review.previewError}
        </p>
      )}

      {/* The decision: pending shows the buttons; resolved
          shows the outcome (+ Revert while a checkpoint
          stands). */}
      {pending ? (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <button
            type="button"
            data-testid="agent-review-keep"
            onClick={() => decide('keep')}
            className={`${BUTTON_CLASS} font-semibold text-[var(--text-primary)]`}
          >
            Keep
          </button>
          <button
            type="button"
            data-testid="agent-review-reject"
            onClick={() => decide('reject')}
            className={BUTTON_CLASS}
          >
            Reject
          </button>
          <button
            type="button"
            data-testid="agent-review-keep-all"
            onClick={() => decide('keep-all')}
            className={BUTTON_CLASS}
          >
            Keep All
          </button>
          <button
            type="button"
            data-testid="agent-review-reject-all"
            onClick={() => decide('reject-all')}
            className={BUTTON_CLASS}
          >
            Reject All
          </button>
          <button
            type="button"
            data-testid="agent-review-always-allow"
            title={`Always allow ${review.toolName} without review`}
            onClick={() => decide('keep', true)}
            className={BUTTON_CLASS}
          >
            Always allow {review.toolName}
          </button>
        </div>
      ) : (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <span data-testid="agent-review-status" className="font-mono text-[11px] text-[var(--text-muted)]">
            {review.status === 'kept' && '✓ Kept — the edit landed.'}
            {review.status === 'rejected' && '✕ Rejected — the edit was not made.'}
            {review.status === 'kept-all' && '✓ Kept — all remaining edits in this run auto-kept.'}
            {review.status === 'rejected-all' && '✕ Rejected — all remaining edits in this run auto-rejected.'}
          </span>
          {canRevert && (
            <button
              type="button"
              data-testid="agent-review-revert"
              onClick={() => void revertAgentCheckpoint(review.checkpointId!)}
              className={BUTTON_CLASS}
            >
              Revert
            </button>
          )}
          {review.checkpointReverted && (
            <span className="font-mono text-[11px] text-[var(--text-muted)]">↩ Reverted to the checkpoint.</span>
          )}
        </div>
      )}
      {review.note && (
        <p className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">{review.note}</p>
      )}
    </article>
  );
}
