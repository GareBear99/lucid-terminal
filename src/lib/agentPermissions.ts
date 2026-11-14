/**
 * The agent permission model — what the agent may do
 * unsupervised (steal #6 — Zed, 2026-11-14).
 *
 * Shape stolen from Zed's tool permissions
 * (`docs/src/ai/tool-permissions.md`): per-tool default
 * (`confirm` / `allow` / `deny`) + `always_allow` /
 * `always_deny` / `always_confirm` regex rules matched
 * against the tool input (the file path for edits).
 * Precedence, Zed's: hardcoded safety rules (never
 * overridden) > always_deny > always_confirm >
 * always_allow > tool default > global default.
 *
 * Lucid's shape of that, in TS:
 * - Per-tool permission: 'auto' (run without asking) /
 *   'ask' (pause for the review UI) / 'deny' (never run).
 * - Path rules: a regex matched against the call's path
 *   argument, optionally limited to named tools. A rule
 *   says 'auto' or 'deny' — there is no 'ask' rule,
 *   because 'ask' is already the default for writes.
 * - Defaults: readonly tools run unsupervised ('auto');
 *   write tools ask ('ask'). Nothing defaults to 'deny'.
 * - Hardcoded safety is NOT here: the policy gate
 *   (agentPolicy.ts) checks the workspace boundary and
 *   the secrets list BEFORE consulting permissions, so no
 *   rule or override can ever open a denied path.
 *
 * Pure functions — no React, no stores, no I/O. The
 * store (src/stores/agentPermissionStore.ts) owns the
 * persisted set; the gate consults the resolved value.
 * Profiles do not split permissions in this slice: the
 * set is global for now (a per-profile split is later
 * work if Gary wants it).
 */

import type { AgentToolDefinition } from './agentTools';

/** What the agent may do with a tool call, unsupervised:
 *  'auto' runs it, 'ask' pauses for the review UI,
 *  'deny' refuses it outright. */
export type AgentToolPermission = 'auto' | 'ask' | 'deny';

/** One regex rule: matched against the call's path
 *  argument (filepath / dirPath — a glob `pattern` is
 *  skipped, it is not a path), optionally limited to
 *  named tools. `permission` is 'auto' or 'deny' only:
 *  a rule never says 'ask' (that is the default). */
export interface AgentPermissionRule {
  id: string;
  /** Regex source, matched against the resolved path
   *  argument (unanchored — 'src/lib' matches any path
   *  containing it). An invalid regex never matches. */
  pattern: string;
  permission: 'auto' | 'deny';
  /** When given, the rule applies only to these tools. */
  tools?: string[];
}

/** The whole permission set: per-tool overrides (absent
 *  = the tool's default) + path rules in order. */
export interface AgentPermissionSet {
  tools: Record<string, AgentToolPermission>;
  rules: AgentPermissionRule[];
}

/** The empty set — every tool at its default, no rules. */
export function emptyAgentPermissionSet(): AgentPermissionSet {
  return { tools: {}, rules: [] };
}

/** The tool's default permission: readonly tools run
 *  unsupervised; write tools ask. Nothing defaults to
 *  'deny' — a denial is always an explicit choice. */
export function defaultToolPermission(tool: AgentToolDefinition): AgentToolPermission {
  return tool.readonly ? 'auto' : 'ask';
}

/** The path argument a rule can match: the first path-like
 *  arg, resolved to an absolute path. A glob `pattern` is
 *  not a path (same rule as the policy gate). */
export function getCallPathArg(
  args: Record<string, unknown>,
  resolvePath: (value: string) => string,
): string | undefined {
  for (const key of ['filepath', 'dirPath'] as const) {
    const value = args[key];
    if (typeof value === 'string' && value) return resolvePath(value);
  }
  const pattern = args.pattern;
  if (typeof pattern === 'string' && pattern && !/[*?[\]{}!]/.test(pattern)) {
    return resolvePath(pattern);
  }
  return undefined;
}

/** Does this rule match the call? The tool filter must
 *  pass, and the pattern must match the call's path
 *  argument. A rule never matches a call with no path
 *  argument, and an invalid regex never matches. */
export function matchPermissionRule(
  rule: AgentPermissionRule,
  toolName: string,
  pathArg: string | undefined,
): boolean {
  if (rule.tools && rule.tools.length > 0 && !rule.tools.includes(toolName)) return false;
  if (pathArg === undefined) return false;
  let re: RegExp;
  try {
    re = new RegExp(rule.pattern);
  } catch {
    return false;
  }
  return re.test(pathArg);
}

/**
 * Resolve a tool call to one permission. Precedence,
 * Zed's order, first match wins:
 * 1. A 'deny' rule that matches → 'deny'.
 * 2. An 'auto' rule that matches → 'auto'.
 * 3. A per-tool override → that value.
 * 4. The tool's default (readonly 'auto', write 'ask').
 */
export function resolveToolPermission(
  tool: AgentToolDefinition,
  args: Record<string, unknown>,
  permissions: AgentPermissionSet,
  resolvePath: (value: string) => string,
): AgentToolPermission {
  const toolName = tool.function.name;
  const pathArg = getCallPathArg(args, resolvePath);
  for (const rule of permissions.rules) {
    if (rule.permission === 'deny' && matchPermissionRule(rule, toolName, pathArg)) {
      return 'deny';
    }
  }
  for (const rule of permissions.rules) {
    if (rule.permission === 'auto' && matchPermissionRule(rule, toolName, pathArg)) {
      return 'auto';
    }
  }
  const override = permissions.tools[toolName];
  if (override !== undefined) return override;
  return defaultToolPermission(tool);
}

/** Serialize for storage (localStorage in the store).
 *  The shape is versioned by the store's key, not here. */
export function serializeAgentPermissions(set: AgentPermissionSet): string {
  return JSON.stringify(set);
}

/** Parse stored JSON. Anything malformed, wrong-shaped,
 *  or carrying an unknown permission value falls back to
 *  the empty set — a corrupt permission file must never
 *  silently widen what the agent may do. */
export function parseAgentPermissions(raw: string | null | undefined): AgentPermissionSet {
  if (!raw) return emptyAgentPermissionSet();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return emptyAgentPermissionSet();
    const record = parsed as Record<string, unknown>;
    const tools: Record<string, AgentToolPermission> = {};
    if (typeof record.tools === 'object' && record.tools !== null) {
      for (const [name, value] of Object.entries(record.tools as Record<string, unknown>)) {
        if (value === 'auto' || value === 'ask' || value === 'deny') tools[name] = value;
      }
    }
    const rules: AgentPermissionRule[] = [];
    if (Array.isArray(record.rules)) {
      for (const rawRule of record.rules as unknown[]) {
        if (typeof rawRule !== 'object' || rawRule === null) continue;
        const r = rawRule as Record<string, unknown>;
        if (typeof r.id !== 'string' || typeof r.pattern !== 'string') continue;
        if (r.permission !== 'auto' && r.permission !== 'deny') continue;
        const toolsFilter =
          Array.isArray(r.tools) && r.tools.every((t) => typeof t === 'string')
            ? (r.tools as string[])
            : undefined;
        rules.push({ id: r.id, pattern: r.pattern, permission: r.permission, tools: toolsFilter });
      }
    }
    return { tools, rules };
  } catch {
    return emptyAgentPermissionSet();
  }
}
