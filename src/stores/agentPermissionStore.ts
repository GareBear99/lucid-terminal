/**
 * The agent permission store — the persisted permission
 * set the policy gate consults (steal #6 — Zed,
 * 2026-11-14).
 *
 * The set is global for now (not split per profile — a
 * later split if Gary wants it). Persistence is
 * localStorage, best-effort: a missing or corrupt entry
 * falls back to the empty set (every tool at its
 * default), never to a widened one. The store never
 * touches the settings IPC — permissions are the agent's
 * own knob, not a settings-file entry.
 *
 * The review UI writes here: "Always allow {tool}" sets
 * that tool to 'auto'; the gate reads the set at the
 * start of each run (agentSession.ts passes it into the
 * loop), so a change applies to the next run, never
 * mid-run.
 */

import { create } from 'zustand';
import {
  emptyAgentPermissionSet,
  parseAgentPermissions,
  serializeAgentPermissions,
  type AgentPermissionRule,
  type AgentPermissionSet,
  type AgentToolPermission,
} from '../lib/agentPermissions';

/** Versioned so a future shape change can reset cleanly. */
export const AGENT_PERMISSIONS_STORAGE_KEY = 'lucid-agent-permissions-v1';

function loadStored(): AgentPermissionSet {
  if (typeof localStorage === 'undefined') return emptyAgentPermissionSet();
  try {
    return parseAgentPermissions(localStorage.getItem(AGENT_PERMISSIONS_STORAGE_KEY));
  } catch {
    return emptyAgentPermissionSet();
  }
}

function saveStored(set: AgentPermissionSet): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(AGENT_PERMISSIONS_STORAGE_KEY, serializeAgentPermissions(set));
  } catch {
    // Persist is best-effort; the in-memory set is the
    // truth for this session either way.
  }
}

export interface AgentPermissionState {
  /** Per-tool overrides (absent = the tool's default). */
  tools: Record<string, AgentToolPermission>;
  /** Path rules, in order. */
  rules: AgentPermissionRule[];
  /** The set the gate consults (a fresh object each call,
   *  so a caller cannot mutate the store's state). */
  getPermissionSet: () => AgentPermissionSet;
  /** Set one tool's permission ('auto' / 'ask' / 'deny').
   *  Passing 'ask' for a write tool removes the override
   *  (it is already the default); passing a tool's default
   *  removes the override either way. */
  setToolPermission: (toolName: string, permission: AgentToolPermission) => void;
  /** Add a path rule (the caller supplies the id — the
   *  review UI uses `rule-${Date.now()}`). */
  addRule: (rule: AgentPermissionRule) => void;
  /** Remove a path rule by id (a no-op when absent). */
  removeRule: (id: string) => void;
  /** Back to the empty set — every tool at its default,
   *  no rules. */
  resetPermissions: () => void;
  /** Test reset: forget the persisted set (in-memory only
   *  — the next load re-reads localStorage). */
  resetAgentPermissionsForTests: () => void;
}

const initial = loadStored();

export const useAgentPermissionStore = create<AgentPermissionState>((set, get) => ({
  tools: initial.tools,
  rules: initial.rules,

  getPermissionSet: () => ({
    tools: { ...get().tools },
    rules: get().rules.map((r) => ({ ...r, tools: r.tools ? [...r.tools] : undefined })),
  }),

  setToolPermission: (toolName, permission) => {
    const next = { ...get().tools };
    // A tool's default needs no override stored: readonly
    // defaults to 'auto', writes to 'ask'. Storing the
    // default would be noise (and would survive a future
    // default change as a stale override).
    const defaultForTool: AgentToolPermission = isReadonlyTool(toolName) ? 'auto' : 'ask';
    if (permission === defaultForTool) {
      delete next[toolName];
    } else {
      next[toolName] = permission;
    }
    set({ tools: next });
    saveStored(get().getPermissionSet());
  },

  addRule: (rule) => {
    const rules = get().rules.filter((r) => r.id !== rule.id);
    rules.push(rule);
    set({ rules });
    saveStored(get().getPermissionSet());
  },

  removeRule: (id) => {
    set({ rules: get().rules.filter((r) => r.id !== id) });
    saveStored(get().getPermissionSet());
  },

  resetPermissions: () => {
    set({ tools: {}, rules: [] });
    saveStored(get().getPermissionSet());
  },

  resetAgentPermissionsForTests: () => {
    set({ tools: {}, rules: [] });
  },
}));

/** Whether a tool is readonly — the default table lives
 *  in the tool definitions, but the store must not import
 *  the whole registry (and its dynamic LSP import) just
 *  to know a default. The readonly set is the built-in
 *  read tools; anything unknown is treated as a write
 *  (its default is 'ask', the safe side). Kept in sync
 *  with getBuiltInToolDefinitions (agentToolsImpl.ts). */
const READONLY_TOOLS = new Set([
  'read_file',
  'read_currently_open_file',
  'ls',
  'file_glob_search',
  'grep_search',
  'codebase_search',
  'find_symbol',
  'go_to_definition',
  'find_references',
  'view_diff',
]);

function isReadonlyTool(toolName: string): boolean {
  return READONLY_TOOLS.has(toolName);
}
