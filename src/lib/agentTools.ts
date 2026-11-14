/**
 * The tool registry — the agent loop's tool pass
 * (steal #4 — Continue, 2026-11-14).
 *
 * Shape stolen from Continue: the `Tool` interface
 * (`core/index.d.ts:1132`) — definition + implementation
 * per tool, same basename — the `wouldLikeTo` /
 * `isCurrently` / `hasAlready` status triple (the sidebar
 * shows "wants to edit X" → "editing X" → "edited X" from
 * the definition itself), `readonly` + `defaultToolPolicy`,
 * and the dispatcher (`core/tools/callTool.ts`): errors
 * are returned to the caller as error context, never
 * thrown, so one bad call never kills the run.
 *
 * This closes gap G2 from the driving-intelligence
 * dissection (the LLMBuilder `ToolRouter` is an empty
 * registry — a gated request today raises
 * `KeyError("Tool not registered: ...")` even after the
 * gate allows it): this registry has ACTUAL register()
 * calls, and `registerBuiltInTools` (agentToolsImpl.ts)
 * fills it at startup. A tool that is not registered is
 * an error result, not an exception and not a silent pass.
 *
 * Continue's lesson, kept by construction
 * (`core/tools/index.ts` top comment): definitions are
 * built by functions, not pushed to a shared const,
 * because pushing caused duplicate tools on config reload.
 * This registry replaces on re-register — registering the
 * same name twice yields one tool, never two.
 */

import type { AgentFileIndex } from './agentIndex';
import type { AgentHost } from './agentHost';

/** The policy a tool carries by default (Continue's
 *  `ToolPolicy` — `packages/terminal-security/src/types.ts`).
 *  `allowedWithoutPermission` runs without asking;
 *  `allowedWithPermission` pauses for approval;
 *  `disabled` never runs. The gate (agentPolicy.ts) may
 *  tighten a call beyond this default — never loosen it. */
export type AgentToolPolicy =
  | 'allowedWithoutPermission'
  | 'allowedWithPermission'
  | 'disabled';

/** A JSON-schema-shaped parameter block (the shape the
 *  brain sees when it plans a call — enough for the local
 *  planner to validate required string args). */
export interface AgentToolParameters {
  type: 'object';
  required?: string[];
  properties: Record<
    string,
    { type: string; description: string; items?: { type: string } }
  >;
}

export interface AgentToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: AgentToolParameters;
  };
  displayTitle: string;
  /** "wants to read {{{ filepath }}}" — rendered with the
   *  call's args (renderToolStatus below). */
  wouldLikeTo: string;
  /** "reading {{{ filepath }}}" */
  isCurrently: string;
  /** "read {{{ filepath }}}" */
  hasAlready: string;
  readonly: boolean;
  isInstant: boolean;
  group: string;
  defaultPolicy: AgentToolPolicy;
}

/** What a tool call returns. `ok: false` carries the
 *  failure as text in `error` — the loop feeds it back
 *  as context, it never throws. `edits` is set by the
 *  edit tools so the loop can show what changed. */
export interface AgentToolResult {
  ok: boolean;
  /** Human-readable output (file contents, listings,
   *  match lines, or the edit summary). */
  output: string;
  /** The failure, when ok is false. */
  error?: string;
  /** Edits this call made (multi_edit / create_new_file). */
  edits?: AgentEditSummary[];
  /** Whether the TS-LSP diagnostics check ran for this
   *  call's edits (false when the engine was unavailable
   *  — the edit still landed, the check just did not run). */
  diagnosticsChecked?: boolean;
  /** Diagnostics the edit left behind (empty = clean). */
  diagnostics?: Array<{ path: string; line: number; message: string; code?: string | number }>;
  /** True when this result's diagnostics were already
   *  reflected on (the verify loop ran on them) — the
   *  loop must NOT re-verify a verified result, or the
   *  reflection would run twice on the same diagnostics
   *  (steal #5 — Aider). `fix_diagnostics` sets this;
   *  edit tools do not. */
  verified?: boolean;
  /** The verification's own numbers, when this result
   *  came out of the verify loop (steal #5 — Aider). */
  verification?: { reflections: number; fixed: number; remaining: number };
}

export interface AgentEditSummary {
  path: string;
  /** 'created' | 'edited' */
  kind: 'created' | 'edited';
  /** Replacements applied (multi_edit) or 1 (create). */
  replacements: number;
}

/** What a tool implementation receives. The index is the
 *  workspace file index (agentIndex.ts); the host is the
 *  agent host (agentHost.ts). Tools never import stores or
 *  IPC directly — everything arrives here. */
export interface AgentToolContext {
  workspaceRoot: string;
  cwd: string;
  isGuest: boolean;
  host: AgentHost;
  index: AgentFileIndex;
  signal?: AbortSignal;
}

export type AgentToolImplementation = (
  args: Record<string, unknown>,
  ctx: AgentToolContext,
) => Promise<AgentToolResult>;

/** Render a `wouldLikeTo` / `isCurrently` / `hasAlready`
 *  template with the call's args (`{{{ filepath }}}` →
 *  the value, missing → the key in brackets). */
export function renderToolStatus(template: string, args: Record<string, unknown>): string {
  return template.replace(/\{\{\{\s*(\w+)\s*\}\}\}/g, (_match, key: string) => {
    const value = args[key];
    return value === undefined || value === null ? `[${key}]` : String(value);
  });
}

/** The registry. One instance per process (the loop owns
 *  the singleton via getAgentRegistry in agentLoop.ts);
 *  tests build their own. */
export class ToolRegistry {
  private readonly tools = new Map<string, AgentToolDefinition>();
  private readonly implementations = new Map<string, AgentToolImplementation>();

  /** Register a tool. Re-registering the same name
   *  REPLACES it — never duplicates (Continue's reload
   *  bug, fixed by construction). */
  register(definition: AgentToolDefinition, implementation: AgentToolImplementation): void {
    this.tools.set(definition.function.name, definition);
    this.implementations.set(definition.function.name, implementation);
  }

  /** Remove a tool (tests / a disabled tool). */
  unregister(name: string): void {
    this.tools.delete(name);
    this.implementations.delete(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get(name: string): AgentToolDefinition | undefined {
    return this.tools.get(name);
  }

  /** Every registered definition, in registration order. */
  list(): AgentToolDefinition[] {
    return [...this.tools.values()];
  }

  /** The names, in registration order. */
  names(): string[] {
    return [...this.tools.keys()];
  }

  /**
   * Call a tool by name. NEVER throws: an unregistered
   * tool, a missing required arg, or an implementation
   * failure all come back as `{ ok: false, error }` —
   * the loop feeds the error back as context and the run
   * continues (Continue's callTool contract).
   */
  async call(
    name: string,
    args: Record<string, unknown>,
    ctx: AgentToolContext,
  ): Promise<AgentToolResult> {
    const definition = this.tools.get(name);
    if (!definition) {
      return {
        ok: false,
        output: '',
        error: `Tool not registered: ${name}`,
      };
    }
    const required = definition.function.parameters.required ?? [];
    for (const key of required) {
      const value = args[key];
      if (value === undefined || value === null || value === '') {
        return {
          ok: false,
          output: '',
          error: `Tool ${name} is missing required argument: ${key}`,
        };
      }
    }
    const implementation = this.implementations.get(name);
    if (!implementation) {
      return {
        ok: false,
        output: '',
        error: `Tool ${name} is registered but has no implementation`,
      };
    }
    try {
      return await implementation(args, ctx);
    } catch (error) {
      return {
        ok: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
