/**
 * The GitHub Copilot brain — D9 (2026-11-15).
 *
 * An `AgentBrain` backed by the Copilot API client: one chat
 * completions call per plan (the loop plans once per turn), with
 * the 13 registry tools as the model's function definitions.
 * The model returns text and/or tool calls; the loop executes
 * the calls through the same policy gate + review flow as the
 * local planner's calls — the brain only PLANS, it never runs
 * a tool itself.
 *
 * The brain never throws: an API failure becomes a reply that
 * says what happened (auth / rate-limited / network / upstream),
 * never a silent empty reply and never a faked tool call. A tool
 * call the model names that is not in the registry is dropped
 * and named in the reply; arguments that are not valid JSON are
 * dropped the same way. The loop's registry would refuse an
 * unknown tool anyway — the brain says so up front instead of
 * letting the loop report a failure it could have prevented.
 *
 * The key never touches this file: the transport (src/lib/
 * copilotApi.ts) talks IPC to main, which reads the key from
 * the OS keychain. Tests inject a fake transport — no IPC, no
 * network, no key.
 */
import type { AgentBrain, BrainContext, BrainPlan, PlannedToolCall } from './agentBrain';
import {
  realCopilotTransport,
  type CopilotChatMessage,
  type CopilotChatTool,
  type CopilotTransport,
} from './copilotApi';
import type { AgentToolDefinition } from './agentTools';

/** The human words for each API failure code — the reply the
 *  tab shows, in the tab's own voice. */
export function copilotFailureReply(code: string): string {
  switch (code) {
    case 'no-key':
      return 'No GitHub Copilot key is saved — add it in Settings > AI.';
    case 'auth':
      return (
        'GitHub rejected the Copilot key — check it in Settings > AI. ' +
        'A classic personal access token (ghp_…) does not work here; use an OAuth token ' +
        'or a fine-grained token with Copilot access.'
      );
    case 'rate-limited':
      return 'GitHub Copilot is rate-limited right now — try again in a bit.';
    case 'bad-request':
      return 'GitHub Copilot refused the request — the model or the request is not allowed for this subscription.';
    case 'network':
      return "Couldn't reach GitHub Copilot — check the connection and try again.";
    case 'aborted':
      return 'The Copilot request was stopped.';
    case 'unavailable':
      return 'Copilot is unavailable in this environment.';
    default:
      return 'GitHub Copilot had a problem answering — try again.';
  }
}

export interface CopilotBrainOptions {
  /** The Copilot API model id (from the API's model list — the
   *  picker in the tab, never a hardcoded roster). */
  model: string;
  /** The tools the model may call — the registry's definitions. */
  tools: AgentToolDefinition[];
  /** The transport (default: the real IPC client). */
  transport?: CopilotTransport;
  /** Called with the model's streamed text, as it arrives. */
  onProgress?: (text: string) => void;
  signal?: AbortSignal;
}

const COPILOT_SYSTEM_PROMPT =
  'You are the copilot for the Lucid editor, working on the user\'s workspace. ' +
  'You can call tools to read, list, search, create, and edit files in the workspace. ' +
  'Rules:\n' +
  '- Only call tools that exist, with the arguments they require. Never invent a tool name.\n' +
  '- Only touch paths inside the workspace. Never invent a file path — use the open files, ' +
  'the workspace listing, or a search to find the file first.\n' +
  '- When the user asks a question instead of a file task, answer in text and call no tools.\n' +
  '- Keep replies short. When you call tools, say what you are about to do in one line first.\n' +
  '- You get one round of tool calls per turn: the loop runs them and shows the results. ' +
  'If the task needs a follow-up, say so in your reply instead of guessing.';

function buildMessages(prompt: string, ctx: BrainContext): CopilotChatMessage[] {
  const openFiles = ctx.openFiles.map((f) => f.path).join(', ') || '(none)';
  const system =
    `${COPILOT_SYSTEM_PROMPT}\n\n` +
    `Workspace root: ${ctx.workspaceRoot}\n` +
    `Working directory: ${ctx.cwd}\n` +
    `Open files: ${openFiles}\n` +
    `Active file: ${ctx.activeFilePath ?? '(none)'}`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: prompt },
  ];
}

function toChatTools(definitions: AgentToolDefinition[]): CopilotChatTool[] {
  return definitions.map((d) => ({
    type: 'function' as const,
    function: {
      name: d.function.name,
      description: d.function.description,
      parameters: d.function.parameters,
    },
  }));
}

export class CopilotBrain implements AgentBrain {
  private readonly model: string;
  private readonly tools: AgentToolDefinition[];
  private readonly knownToolNames: Set<string>;
  private readonly transport: CopilotTransport;
  private readonly onProgress?: (text: string) => void;
  private readonly signal?: AbortSignal;

  constructor(options: CopilotBrainOptions) {
    this.model = options.model;
    this.tools = options.tools;
    this.knownToolNames = new Set(options.tools.map((t) => t.function.name));
    this.transport = options.transport ?? realCopilotTransport;
    this.onProgress = options.onProgress;
    this.signal = options.signal;
  }

  async plan(prompt: string, ctx: BrainContext): Promise<BrainPlan> {
    if (this.signal?.aborted) {
      return { toolCalls: [], reply: 'The Copilot request was stopped.' };
    }
    let streamed = '';
    const onDelta = (text: string) => {
      streamed += text;
      this.onProgress?.(streamed);
    };
    let result;
    try {
      result = await this.transport.chatCompletions(
        {
          model: this.model,
          messages: buildMessages(prompt, ctx),
          tools: toChatTools(this.tools),
        },
        onDelta,
        this.signal,
      );
    } catch {
      return { toolCalls: [], reply: copilotFailureReply('unavailable') };
    }
    if (!result.ok) {
      return { toolCalls: [], reply: copilotFailureReply(result.code) };
    }

    const toolCalls: PlannedToolCall[] = [];
    const dropped: string[] = [];
    for (const call of result.toolCalls) {
      if (!this.knownToolNames.has(call.name)) {
        dropped.push(call.name);
        continue;
      }
      let args: Record<string, unknown>;
      try {
        const parsed: unknown = call.arguments ? JSON.parse(call.arguments) : {};
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new Error('arguments are not an object');
        }
        args = parsed as Record<string, unknown>;
      } catch {
        dropped.push(`${call.name} (bad arguments)`);
        continue;
      }
      toolCalls.push({ name: call.name, args });
    }

    const replyParts: string[] = [];
    const content = result.content.trim();
    if (content) replyParts.push(content);
    if (dropped.length > 0) {
      replyParts.push(
        `I dropped ${dropped.length === 1 ? 'a call' : 'some calls'} I couldn't use: ${dropped.join(', ')}.`,
      );
    }
    if (toolCalls.length === 0 && replyParts.length === 0) {
      return { toolCalls: [], reply: 'Copilot returned an empty reply — try again.' };
    }
    return {
      toolCalls,
      ...(replyParts.length > 0 ? { reply: replyParts.join('\n') } : {}),
    };
  }
}
