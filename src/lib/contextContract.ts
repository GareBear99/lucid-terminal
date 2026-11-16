/**
 * The context-window contract (Tabnine S4 — 2026-11-15):
 * what leaves the machine, per brain/path, per request.
 *
 * This is the single source of truth for the "What leaves
 * the machine" section in Settings > Security — the tab
 * renders from this module, and the tests assert the
 * enumerated set against the real payload builders. The
 * list is derived from the builders, not written from
 * memory: each item cites the code path that sends (or
 * reads) it. If a builder changes what it sends, this
 * module is the place to update — and the tests fail
 * until it is.
 *
 * What the audit found (2026-11-15, read from the
 * builders):
 * - NO path sends file contents automatically. Copilot
 *   sends paths only; the AI chat sends only the chat's
 *   own messages (your words). If you paste file contents
 *   into the chat, those contents go — the app never
 *   attaches them for you.
 * - NO path sends types, diagnostics, or error reports.
 * - Tool results are never sent back: the loop plans
 *   once per prompt and never re-plans (agentLoop.ts),
 *   so a Copilot turn's tool results stay local.
 * - The one disclosure to know: Copilot sends your
 *   workspace root, working directory, open file paths,
 *   and active file path to GitHub on every turn — paths
 *   reveal project and directory names. That is inherent
 *   to how Copilot plans (it needs the workspace layout),
 *   and it is stated here plainly rather than hidden.
 * - The driving intelligence IS the local planner today
 *   (the LLMBuilder base). The Tier 5, ARC Server, and
 *   starship driving agents are not connected as planning
 *   brains yet (drivingAgents.ts) — they send nothing and
 *   run no tools.
 *
 * Guest (verified from the gates, not assumed):
 * - The Agent (local planner) is REFUSED in guest — the
 *   terminal flip to agent mode is refused
 *   (Terminal.tsx handoffToAgent), so the local planner
 *   never runs in guest.
 * - Copilot IS allowed in guest (carve-out) and sends
 *   the same payload to GitHub; every write is reviewed.
 * - Nothing a guest does is persisted — the guest veil
 *   drops the history on exit (historyStore,
 *   agentSession, copilotRunner).
 */
export type ContextPathId =
  | 'local-planner'
  | 'driving-intelligence'
  | 'copilot'
  | 'ai-chat-local'
  | 'ai-chat-ping'
  | 'ai-chat-openai'
  | 'ping-health';

export interface ContextContractItem {
  /** The exact item sent (or read locally). */
  item: string;
  /** Where in the code it is sent/built — the citation. */
  source: string;
}

export interface ContextContractEntry {
  id: ContextPathId;
  /** The surface the user sees. */
  surface: string;
  /** Where it goes (or "nowhere"). */
  destination: string;
  /** What leaves the machine per request. Empty = nothing. */
  sends: ContextContractItem[];
  /** What is read on this machine and never sent. */
  staysLocal: ContextContractItem[];
}

export const CONTEXT_CONTRACT: readonly ContextContractEntry[] = [
  {
    id: 'local-planner',
    surface: 'Agent — the local planner (LLMBuilder base)',
    destination: 'Nowhere — no network, no model, no SP.',
    sends: [],
    staysLocal: [
      {
        item: 'Your prompt (the words you typed)',
        source: 'agentBrain.ts — LocalPlanner.plan(prompt, ctx)',
      },
      {
        item: 'Workspace root path',
        source: 'agentLoop.ts — runAgentTurn brainContext',
      },
      {
        item: 'Working directory',
        source: 'agentLoop.ts — runAgentTurn brainContext',
      },
      {
        item: "Open files' paths",
        source: 'agentLoop.ts — runAgentTurn brainContext',
      },
      {
        item: 'Active file path',
        source: 'agentLoop.ts — runAgentTurn brainContext',
      },
      {
        item: 'Workspace file index (paths)',
        source: 'agentLoop.ts — runAgentTurn brainContext',
      },
      {
        item: 'File contents the planned tools read (read_file, grep, …) — read locally, never sent',
        source: 'agentTools.ts — the registry tools run on this machine',
      },
    ],
  },
  {
    id: 'driving-intelligence',
    surface: 'Driving intelligence (LLMBuilder tab)',
    destination:
      'Nowhere — the LLMBuilder base IS the local planner (above).',
    sends: [],
    staysLocal: [
      {
        item: 'The same local context as the local planner (prompt, paths, index)',
        source: 'drivingAgents.ts — the llmbuilder base runs the local planner brain',
      },
      {
        item: 'Tier 5, ARC Server, and starship agents: not connected as planning brains yet — they send nothing and run no tools',
        source: 'drivingAgents.ts — each shows as not connected yet',
      },
    ],
  },
  {
    id: 'copilot',
    surface: 'Copilot — the Copilot tab (GitHub Copilot)',
    destination:
      'GitHub Copilot, via the main process (the key is read from the OS keychain there — it never touches the renderer).',
    sends: [
      {
        item: 'Your prompt (the words you typed)',
        source: 'copilotBrain.ts — buildMessages, the user message',
      },
      {
        item: 'Workspace root path',
        source: 'copilotBrain.ts — buildMessages, the system message',
      },
      {
        item: 'Working directory',
        source: 'copilotBrain.ts — buildMessages, the system message',
      },
      {
        item: "Open files' paths (not contents)",
        source: 'copilotBrain.ts — buildMessages, the system message',
      },
      {
        item: 'Active file path',
        source: 'copilotBrain.ts — buildMessages, the system message',
      },
      {
        item: 'The system prompt (the copilot\u2019s instructions)',
        source: 'copilotBrain.ts — COPILOT_SYSTEM_PROMPT',
      },
      {
        item: 'The 13 tool definitions (name, description, parameters)',
        source: 'copilotBrain.ts — toChatTools',
      },
    ],
    staysLocal: [
      {
        item: 'File contents — only paths are sent, never contents',
        source: 'copilotBrain.ts — buildMessages sends paths, not contents',
      },
      {
        item: 'Tool results — the loop plans once per prompt and never re-plans, so results are never sent back',
        source: 'agentLoop.ts — "plans ONCE per prompt"',
      },
      {
        item: 'Types, diagnostics, and error reports — not sent',
        source: 'copilotBrain.ts — buildMessages has no such field',
      },
    ],
  },
  {
    id: 'ai-chat-local',
    surface: 'AI chat — local model',
    destination: 'Nowhere — runs on this machine.',
    sends: [],
    staysLocal: [
      {
        item: 'The chat messages (your words + the replies)',
        source: 'AIChat.tsx — history, sent to the local backend only',
      },
      {
        item: 'The context directory (the directory the chat is scoped to)',
        source: 'AIChat.tsx — contextDirectory, local scoping only',
      },
    ],
  },
  {
    id: 'ai-chat-ping',
    surface: 'AI chat — ping server (Cloudflare Worker)',
    destination:
      'The Lucid ping server (Cloudflare Worker, the endpoint in Settings > AI).',
    sends: [
      {
        item: 'The chat messages (role + text — your words + the replies)',
        source: 'pingServer.ts — chatPing, body.messages',
      },
      {
        item: 'The model id',
        source: 'pingServer.ts — chatPing, body.model',
      },
      {
        item: 'The per-install user id (a random UUID, stored in settings) — the x-lucid-user header',
        source: 'pingServer.ts — pingHeaders, getOrCreateUserId',
      },
      {
        item: 'The ping key, when one is saved — the x-lucid-ping-key header',
        source: 'pingServer.ts — pingHeaders, pingKeyStorage',
      },
    ],
    staysLocal: [
      {
        item: 'File contents — the chat sends only its own messages, never file contents',
        source: 'pingServer.ts — chatPing sends messages only',
      },
      {
        item: 'The context directory and the workspace paths — not sent to the ping server',
        source: 'pingServer.ts — chatPing takes messages + model only',
      },
      {
        item: 'Tool definitions — the ping path has no tools',
        source: 'pingServer.ts — chatPing has no tools field',
      },
    ],
  },
  {
    id: 'ai-chat-openai',
    surface: 'AI chat — OpenAI / Tier 5 (your API key)',
    destination: 'OpenAI (api.openai.com), with your API key as the Bearer token.',
    sends: [
      {
        item: 'The system prompt',
        source: 'openai.ts — chat, SYSTEM_PROMPT',
      },
      {
        item: 'The context directory path, when one is set (inside the system prompt)',
        source: 'openai.ts — chat, "CURRENT WORKING DIRECTORY"',
      },
      {
        item: 'The chat messages (role + text — your words + the replies)',
        source: 'openai.ts — chat, body.messages',
      },
      {
        item: 'The tool definitions',
        source: 'openai.ts — chat, body.tools',
      },
      {
        item: 'The model id and temperature',
        source: 'openai.ts — chat, body.model / body.temperature',
      },
    ],
    staysLocal: [
      {
        item: 'File contents — the chat sends only its own messages, never file contents',
        source: 'openai.ts — chat sends messages + tools only',
      },
      {
        item: 'The API key itself is the auth header — it is sent as the Bearer token, as every API key is',
        source: 'openai.ts — chat, Authorization header',
      },
    ],
  },
  {
    id: 'ping-health',
    surface: 'Ping server — health check + status pull',
    destination: 'The Lucid ping server (the endpoint in Settings > AI).',
    sends: [
      {
        item: 'Health check: the literal message "ping" + the per-install user id + the ping key (when saved) — not metered, spends no SP',
        source: 'pingServer.ts — pingServerHealth, POST /ping',
      },
      {
        item: 'Status pull: nothing — a plain GET on the public root, no headers, no key',
        source: 'pingServer.ts — pingServerStatus, GET /',
      },
    ],
    staysLocal: [
      {
        item: 'FixNet sync: nothing — it is local-only and does nothing (the local-only rule stands)',
        source: 'FixNet — sync is a no-op while the rule stands',
      },
    ],
  },
];

/** The guest rule, stated once for the whole contract
 *  (verified from the gates — see the module doc). */
export const CONTEXT_CONTRACT_GUEST =
  'In guest: the Agent (local planner) is refused — the terminal flip to agent mode ' +
  'does not happen, so the local planner never runs. Copilot is allowed (carve-out) ' +
  'and sends the same payload to GitHub; every write is reviewed. Nothing a guest ' +
  'does is persisted — the guest veil drops the history on exit.';
