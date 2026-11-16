/**
 * The policy gate — the pass before a tool call runs
 *
 * The shape: a `PolicyGate.decide()` — unknown tool
 * → blocked, disabled → blocked, denied path → blocked,
 * approval required and not approved → requires_approval,
 * otherwise allowed; a denial still leaves a receipt —
 * plus per-call escalation (files outside the workspace
 * always escalate, whatever the base policy) and the GUI
 * loop's order (preprocess → evaluate policies → auto-run
 * readonly → pause for approval).
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
 * 5. The permission model: a 'deny'
 *    rule or per-tool 'deny' → blocked; an 'auto' rule or
 *    per-tool 'auto' → allowed. Steps 3–4 are hardcoded
 *    safety and always win over permissions — no rule or
 *    override can open a denied path.
 * 6. Permission 'ask' (the default for write tools):
 *    guest → requires_approval (a guest write is asked,
 *    and with no approval UI the answer is denied — the
 *    review UI is the surface that answers); logged-in →
 *    requires_approval UNLESS the run was started with
 *    autoApproveWrites (Agent mode is the opt-in: the user
 *    flipped the pill and asked for the job — the loop's
 *    default for a logged-in run; the terminal path passes
 *    false, so every write is reviewed).
 *
 * The gate never reads the file itself and never writes
 * anything. It returns a decision + a human reason; the
 * loop is what pauses, asks, and records.
 */

import type { AgentToolDefinition } from './agentTools';
import type { DrivingAgentId } from '../types';
import { isWithinWorkspace, resolveAgentPath } from './agentHost';
import { isDeniedPath } from './agentIndex';
import { resolveToolPermission, type AgentPermissionSet } from './agentPermissions';

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
  /** The driving agent the run is under (the picker —
   *  the LLMBuilder tab's pick). Attribution only: the gate's
   *  rules are agent-independent — a denied path is denied
   *  under every agent, and no agent can reopen one. The
   *  agent's can-run check is the loop's front door
   *  (agentLoop.ts): an agent that cannot run yet never
   *  reaches this gate at all. */
  drivingAgent?: DrivingAgentId;
  /** The run's approval mode: when true, write tools are
   *  allowed without pausing (logged-in Agent mode — the
   *  user flipped the pill and asked). Guest runs never
   *  set this (a guest write is always asked, and asked
   *  means denied until the review UI answers). */
  autoApproveWrites: boolean;
  /** The permission set the gate consults. When absent, every tool runs at its default
   *  (readonly 'auto', write 'ask'). */
  permissions?: AgentPermissionSet;
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
  // The check runs over every path the call carries: the
  // flat args (filepath / dirPath / pattern) AND the
  // nested entries of a multi_file_edit plan (files[].filepath)
  // — a denied path buried in a plan is blocked the same
  // way as one in a single-file call.
  const checkPath = (value: string): PolicyDecision | null => {
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
    return null;
  };
  for (const key of PATH_ARG_KEYS) {
    const value = args[key];
    if (typeof value !== 'string' || !value) continue;
    // A glob pattern is not a path — only a pattern with
    // no glob characters is checked as a path.
    if (key === 'pattern' && /[*?[\]{}!]/.test(value)) continue;
    const blocked = checkPath(value);
    if (blocked) return blocked;
  }
  if (Array.isArray(args.files)) {
    for (const entry of args.files) {
      if (
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as Record<string, unknown>).filepath === 'string'
      ) {
        const blocked = checkPath((entry as Record<string, unknown>).filepath as string);
        if (blocked) return blocked;
      }
    }
  }

  // The permission model: deny beats
  // everything below; auto allows; ask falls through to
  // the run's approval mode. The path checks above are
  // hardcoded safety and already ran — no permission can
  // reopen a path they blocked.
  const permission = resolveToolPermission(tool, args, ctx.permissions ?? { tools: {}, rules: [] }, (value) =>
    resolveAgentPath(value, ctx.cwd, ctx.workspaceRoot),
  );
  if (permission === 'deny') {
    return {
      decision: 'blocked',
      reason: `Tool ${tool.function.name} is denied by your agent permissions`,
    };
  }
  if (permission === 'auto') {
    return { decision: 'allowed', reason: 'Allowed' };
  }

  // 'ask': guest always asks (and the answer, with no
  // approval UI yet, is denied — see agentLoop.ts).
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
