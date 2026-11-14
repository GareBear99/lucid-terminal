/**
 * The policy gate — the pass before a tool call runs
 * (steal #4 — Continue, 2026-11-14).
 *
 * Shape stolen from Continue twice over: the
 * `PolicyGate.decide()` in LLMBuilder's own tool pass
 * (`MCP_Tools/mcp/client/policy_gate.py` — unknown tool
 * → blocked, disabled → blocked, denied path → blocked,
 * approval required and not approved → requires_approval,
 * otherwise allowed; a denial still leaves a receipt)
 * and Continue's per-call escalation
 * (`core/tools/policies/fileAccess.ts` — files outside
 * the workspace always escalate, whatever the base
 * policy) plus the GUI loop's order (preprocess → evaluate
 * policies → auto-run readonly → pause for approval).
 *
 * Decisions, in order — the first match wins:
 * 1. Unknown tool → blocked ("Unknown tool: X"). The
 *    registry answers this too; the gate answers it for
 *    callers that check the policy before dispatching.
 * 2. Disabled tool → blocked.
 * 3. A path argument that resolves outside the workspace
 *    → blocked (Continue's fileAccess escalation, made
 *    absolute: outside the workspace is never allowed,
 *    not merely escalated — the workspace IS the boundary).
 * 4. A path argument matching the denied list (secrets,
 *    keys, credentials — Continue's `ignore.ts` security
 *    list, same patterns as the index) → blocked.
 * 5. Readonly tool → allowed (auto-run, no approval).
 * 6. Write tool, guest → requires_approval (the loop asks;
 *    with no approval UI yet the answer is "denied" — the
 *    review UI lands with the Zed slice, #6; until then a
 *    guest write is asked and refused, never silently
 *    auto-run and never silently dropped).
 * 7. Write tool, logged-in → requires_approval UNLESS the
 *    run was started with autoApproveWrites (Agent mode is
 *    the opt-in: the user flipped the pill and asked for
 *    the job — the loop's default for a logged-in run).
 *
 * The gate never reads the file itself and never writes
 * anything. It returns a decision + a human reason; the
 * loop is what pauses, asks, and records.
 */

import type { AgentToolDefinition } from './agentTools';
import { isWithinWorkspace, resolveAgentPath } from './agentHost';
import { isDeniedPath } from './agentIndex';

export type PolicyDecisionKind = 'allowed' | 'requires_approval' | 'blocked';

export interface PolicyDecision {
  decision: PolicyDecisionKind;
  /** Human-readable reason (shown in the feed on a block). */
  reason: string;
}

export interface PolicyContext {
  workspaceRoot: string;
  cwd: string;
  isGuest: boolean;
  /** The run's approval mode: when true, write tools are
   *  allowed without pausing (logged-in Agent mode — the
   *  user flipped the pill and asked). Guest runs never
   *  set this (a guest write is always asked, and asked
   *  means denied until the review UI lands). */
  autoApproveWrites: boolean;
}

/** The argument keys that carry a file path (checked
 *  against the workspace boundary + the denied list). */
const PATH_ARG_KEYS = ['filepath', 'dirPath', 'pattern'] as const;

/**
 * Decide a tool call. Pure — no I/O, no stores. The
 * path arguments are resolved against the run's cwd /
 * workspace root the same way the host resolves them, so
 * the gate and the host can never disagree about where a
 * call lands.
 */
export function decideToolPolicy(
  tool: AgentToolDefinition | undefined,
  args: Record<string, unknown>,
  ctx: PolicyContext,
): PolicyDecision {
  if (!tool) {
    return { decision: 'blocked', reason: 'Unknown tool' };
  }
  if (tool.defaultPolicy === 'disabled') {
    return { decision: 'blocked', reason: `Tool ${tool.function.name} is disabled` };
  }

  // Path boundary + denied list, before anything else.
  for (const key of PATH_ARG_KEYS) {
    const value = args[key];
    if (typeof value !== 'string' || !value) continue;
    // A glob pattern is not a path — only a pattern with
    // no glob characters is checked as a path.
    if (key === 'pattern' && /[*?[\]{}!]/.test(value)) continue;
    const resolved = resolveAgentPath(value, ctx.cwd, ctx.workspaceRoot);
    if (!isWithinWorkspace(ctx.workspaceRoot, resolved)) {
      return {
        decision: 'blocked',
        reason: `Denied path: ${value} is outside the workspace`,
      };
    }
    if (isDeniedPath(resolved)) {
      return {
        decision: 'blocked',
        reason: `Denied path: ${value} is a secrets/credentials path`,
      };
    }
  }

  // Readonly tools run without asking.
  if (tool.readonly) {
    return { decision: 'allowed', reason: 'Allowed' };
  }

  // Write tools: guest always asks (and the answer, with
  // no approval UI yet, is denied — see agentLoop.ts).
  if (ctx.isGuest) {
    return {
      decision: 'requires_approval',
      reason: `Tool ${tool.function.name} writes files — approval required in guest`,
    };
  }
  if (ctx.autoApproveWrites) {
    return { decision: 'allowed', reason: 'Allowed (Agent mode is the opt-in)' };
  }
  return {
    decision: 'requires_approval',
    reason: `Tool ${tool.function.name} writes files — approval required`,
  };
}
