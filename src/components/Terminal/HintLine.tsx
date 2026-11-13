/**
 * The hint line (heavy terminal work, 2026-11-13 — Warp teaches
 * the flow with one context-sensitive line above the prompt;
 * Lucid had no hint line). The text comes from
 * src/lib/hintLine.ts (pure, tested there); this component only
 * renders it, directly above the prompt row, inside the prompt
 * section.
 */

interface HintLineProps {
  /** The hint text for this context, or null when there is
   *  nothing to hint. */
  text: string | null;
}

export function HintLine({ text }: HintLineProps) {
  if (text === null) return null;
  return (
    <div
      data-testid="terminal-hint-line"
      className="px-5 pb-1 font-mono text-[11px] text-[var(--text-muted)] opacity-80"
    >
      {text}
    </div>
  );
}
