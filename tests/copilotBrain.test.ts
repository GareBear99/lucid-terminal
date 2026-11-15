/**
 * The GitHub Copilot brain (D9, 2026-11-15) — one chat
 * completions call per plan, with the 13 registry tools as the
 * model's function definitions.
 *
 * The brain never throws: an API failure becomes a reply that
 * says what happened, never a silent empty reply. A tool call
 * the model names that is not in the registry is dropped and
 * named; arguments that are not valid JSON are dropped the
 * same way. The transport is injected — no IPC, no network,
 * no key in these tests.
 *
 * Run with: npx vitest run tests/copilotBrain.test.ts
 */
import { describe, expect, it, vi } from 'vitest';
import { CopilotBrain, copilotFailureReply } from '../src/lib/copilotBrain';
import type { CopilotTransport } from '../src/lib/copilotApi';
import type { BrainContext } from '../src/lib/agentBrain';
import type { AgentToolDefinition } from '../src/lib/agentTools';

const TOOLS: AgentToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'ls',
      description: 'List a directory',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a file',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
  },
];

const CTX: BrainContext = {
  cwd: '/work',
  workspaceRoot: '/work',
  openFiles: [{ path: '/work/a.ts', content: '' }],
  activeFilePath: '/work/a.ts',
};

function transport(result: Awaited<ReturnType<CopilotTransport['chatCompletions']>>): CopilotTransport {
  return {
    listModels: async () => ({ ok: true, models: ['gpt-4o'] }),
    chatCompletions: vi.fn(async () => result),
  };
}

describe('copilotBrain — the GitHub Copilot brain', () => {
  it('turns a content reply + a valid tool call into a plan', async () => {
    const brain = new CopilotBrain({
      model: 'gpt-4o',
      tools: TOOLS,
      transport: transport({
        ok: true,
        content: 'Here are the files.',
        toolCalls: [{ id: 'call_1', name: 'ls', arguments: '{"path": "."}' }],
        model: 'gpt-4o',
      }),
    });
    const plan = await brain.plan('list the files', CTX);
    expect(plan.toolCalls).toEqual([{ name: 'ls', args: { path: '.' } }]);
    expect(plan.reply).toBe('Here are the files.');
  });

  it('sends the registry tools as the model\'s function definitions', async () => {
    const fake = transport({ ok: true, content: 'ok', toolCalls: [], model: 'gpt-4o' });
    const brain = new CopilotBrain({ model: 'gpt-4o', tools: TOOLS, transport: fake });
    await brain.plan('hi', CTX);
    const request = (fake.chatCompletions as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(request.model).toBe('gpt-4o');
    expect(request.tools.map((t: { function: { name: string } }) => t.function.name)).toEqual([
      'ls',
      'read_file',
    ]);
    // The prompt carries the workspace context the loop gives it.
    expect(request.messages[0].content).toContain('/work');
    expect(request.messages[1]).toEqual({ role: 'user', content: 'hi' });
  });

  it('drops an unknown tool call and says so in the reply', async () => {
    const brain = new CopilotBrain({
      model: 'gpt-4o',
      tools: TOOLS,
      transport: transport({
        ok: true,
        content: 'Doing it.',
        toolCalls: [{ id: 'call_1', name: 'run_terminal_command', arguments: '{}' }],
        model: 'gpt-4o',
      }),
    });
    const plan = await brain.plan('run something', CTX);
    expect(plan.toolCalls).toEqual([]);
    expect(plan.reply).toContain('run_terminal_command');
    expect(plan.reply).toContain('Doing it.');
  });

  it('drops a tool call whose arguments are not valid JSON and says so', async () => {
    const brain = new CopilotBrain({
      model: 'gpt-4o',
      tools: TOOLS,
      transport: transport({
        ok: true,
        content: '',
        toolCalls: [{ id: 'call_1', name: 'ls', arguments: '{not json' }],
        model: 'gpt-4o',
      }),
    });
    const plan = await brain.plan('list the files', CTX);
    expect(plan.toolCalls).toEqual([]);
    expect(plan.reply).toContain('ls (bad arguments)');
  });

  it('an empty reply with no calls says so instead of going silent', async () => {
    const brain = new CopilotBrain({
      model: 'gpt-4o',
      tools: TOOLS,
      transport: transport({ ok: true, content: '  ', toolCalls: [], model: 'gpt-4o' }),
    });
    const plan = await brain.plan('hi', CTX);
    expect(plan.toolCalls).toEqual([]);
    expect(plan.reply).toMatch(/empty reply/i);
  });

  it('an API failure becomes a human reply, never a throw', async () => {
    const brain = new CopilotBrain({
      model: 'gpt-4o',
      tools: TOOLS,
      transport: transport({ ok: false, code: 'rate-limited', message: 'slow down' }),
    });
    const plan = await brain.plan('hi', CTX);
    expect(plan.toolCalls).toEqual([]);
    expect(plan.reply).toMatch(/rate-limited/i);
  });

  it('an auth failure names the classic-PAT trap', async () => {
    const brain = new CopilotBrain({
      model: 'gpt-4o',
      tools: TOOLS,
      transport: transport({ ok: false, code: 'auth', message: 'bad credentials' }),
    });
    const plan = await brain.plan('hi', CTX);
    expect(plan.reply).toContain('ghp_');
  });

  it('a transport that throws still answers, never throws', async () => {
    const failing: CopilotTransport = {
      listModels: async () => ({ ok: false, code: 'unavailable', message: 'no bridge' }),
      chatCompletions: async () => {
        throw new Error('bridge exploded');
      },
    };
    const brain = new CopilotBrain({ model: 'gpt-4o', tools: TOOLS, transport: failing });
    const plan = await brain.plan('hi', CTX);
    expect(plan.toolCalls).toEqual([]);
    expect(plan.reply).toMatch(/unavailable/i);
  });

  it('streams the model\'s words through onProgress as they arrive', async () => {
    const streaming: CopilotTransport = {
      listModels: async () => ({ ok: true, models: ['gpt-4o'] }),
      chatCompletions: async (_req, onDelta) => {
        onDelta?.('Hel');
        onDelta?.('lo');
        return { ok: true, content: 'Hello', toolCalls: [], model: 'gpt-4o' };
      },
    };
    const seen: string[] = [];
    const brain = new CopilotBrain({
      model: 'gpt-4o',
      tools: TOOLS,
      transport: streaming,
      onProgress: (text) => seen.push(text),
    });
    const plan = await brain.plan('hi', CTX);
    expect(seen).toEqual(['Hel', 'Hello']);
    expect(plan.reply).toBe('Hello');
  });

  it('an already-aborted signal answers as stopped without calling the API', async () => {
    const fake = transport({ ok: true, content: 'ok', toolCalls: [], model: 'gpt-4o' });
    const controller = new AbortController();
    controller.abort();
    const brain = new CopilotBrain({
      model: 'gpt-4o',
      tools: TOOLS,
      transport: fake,
      signal: controller.signal,
    });
    const plan = await brain.plan('hi', CTX);
    expect(plan.reply).toMatch(/stopped/i);
    expect(fake.chatCompletions).not.toHaveBeenCalled();
  });

  it('copilotFailureReply covers every failure code with words', () => {
    for (const code of ['no-key', 'auth', 'rate-limited', 'bad-request', 'network', 'aborted', 'unavailable', 'upstream']) {
      expect(copilotFailureReply(code)).toMatch(/\S/);
    }
    expect(copilotFailureReply('no-key')).toMatch(/Settings > AI/);
  });
});
