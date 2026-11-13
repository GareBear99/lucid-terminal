/**
 * The agent session's intro card (heavy terminal work, 2026-11-13
 * — Warp's fresh sessions show an intro card that teaches the
 * session before anything is typed; Lucid's fresh tabs showed a
 * bare feed). Pairs with the hint line: together they are Warp's
 * onboarding, and Lucid had neither.
 *
 * Pure presentational — no stores, no handlers.
 */

interface AgentIntroCardProps {
  /** The cwd the conversation was started in (the hand-off's
   *  attached directory). */
  cwd?: string;
  /** Terminal blocks attached as context by the hand-off. */
  attachedCount?: number;
}

export function AgentIntroCard({ cwd, attachedCount = 0 }: AgentIntroCardProps) {
  return (
    <div data-testid="agent-intro-card" className="px-3 py-4">
      <p className="font-mono text-[13px] font-semibold text-[var(--text-primary)]">
        New agent conversation
      </p>
      <p className="mt-1 font-mono text-[12px] leading-[1.6] text-[var(--text-muted)]">
        Send a prompt below to start a new conversation
        {cwd ? ` in ${cwd}` : ''}.
      </p>
      {attachedCount > 0 && (
        <p className="mt-1 font-mono text-[12px] leading-[1.6] text-[var(--text-muted)]">
          {attachedCount} block{attachedCount === 1 ? '' : 's'} attached as context.
        </p>
      )}
      <p className="mt-2 font-mono text-[11px] text-[var(--text-muted)] opacity-80">
        ⌘⏎ send to agent · esc back to terminal · ↑ past prompts
      </p>
    </div>
  );
}
