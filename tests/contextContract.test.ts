/**
 * The context-window contract (Tabnine S4 — 2026-11-15):
 * what leaves the machine, per brain/path, per request.
 *
 * These tests assert the enumerated set against the REAL
 * payload builders — not against the contract's own data.
 * The Copilot test captures the request the brain actually
 * sends (via a fake transport) and checks the enumerated
 * items are in it and file contents are not. The local
 * planner test runs the planner and checks its plan is
 * local tool calls only. The contract test checks the
 * module covers every path and cites every item.
 *
 * Run with: npx vitest run tests/contextContract.test.ts
 */
import { describe, expect, it, vi } from 'vitest';
import { CopilotBrain } from '../src/lib/copilotBrain';
import type {
  CopilotChatRequest,
  CopilotTransport,
} from '../src/lib/copilotApi';
import { LocalPlanner, type BrainContext } from '../src/lib/agentBrain';
import type { AgentFileIndex } from '../src/lib/agentIndex';
import {
  CONTEXT_CONTRACT,
  CONTEXT_CONTRACT_GUEST,
} from '../src/lib/contextContract';

/** A file index that knows one file (so the planner can
 *  resolve it). */
const INDEX = {
  getKnownPaths: () => ['/work/my-secret-project/src/app.ts'],
  glob: () => [],
} as unknown as AgentFileIndex;

function ctx(): BrainContext {
  return {
    workspaceRoot: '/work/my-secret-project',
    cwd: '/work/my-secret-project/src',
    openFiles: [
      {
        path: '/work/my-secret-project/src/app.ts',
        name: 'app.ts',
        // A distinctive file CONTENT, carried in the context
        // on purpose: the builder must NOT send it. (The
        // real BrainContext has no content field; the test
        // adds one to prove the builder only ever reads the
        // path.)
        content: 'const SECRET_CONTENTS = 42;',
      } as BrainContext['openFiles'][number],
    ],
    activeFilePath: '/work/my-secret-project/src/app.ts',
    index: INDEX,
  };
}

describe('context contract — Copilot (the builder)', () => {
  it('sends the prompt + paths, never file contents', async () => {
    let captured: CopilotChatRequest | null = null;
    const transport: CopilotTransport = {
      listModels: async () => ({ ok: true, models: ['gpt-4o'] }),
      chatCompletions: vi.fn(async (req: CopilotChatRequest) => {
        captured = req;
        return { ok: true, content: 'ok', toolCalls: [], model: 'gpt-4o' };
      }),
    };
    const brain = new CopilotBrain({ model: 'gpt-4o', tools: [], transport });
    await brain.plan('read the app file', ctx());

    expect(captured).not.toBeNull();
    const text = JSON.stringify(captured);
    // The enumerated sends are present.
    expect(text).toContain('read the app file'); // the prompt
    expect(text).toContain('/work/my-secret-project'); // workspace root
    expect(text).toContain('/work/my-secret-project/src'); // cwd
    expect(text).toContain('/work/my-secret-project/src/app.ts'); // open + active file
    // File contents are NOT sent — the distinctive content
    // string must not appear, even though the context
    // carried it.
    expect(text).not.toContain('SECRET_CONTENTS');
    // One round only: system + user, no tool results, no
    // diagnostics, no types.
    expect(captured!.messages).toHaveLength(2);
    expect(captured!.messages[0].role).toBe('system');
    expect(captured!.messages[1].role).toBe('user');
    expect(text).not.toMatch(/diagnostic|error report/i);
  });
});

describe('context contract — local planner (the builder)', () => {
  it('sends nothing — its plan is local tool calls only', async () => {
    const planner = new LocalPlanner();
    const plan = await planner.plan('read src/app.ts', ctx());
    expect(plan.toolCalls.length).toBeGreaterThan(0);
    for (const call of plan.toolCalls) {
      // Only local file-operation tools.
      expect(call.name).toMatch(
        /^(read_file|ls|grep_search|codebase_search|find_symbol|go_to_definition|create_new_file|multi_edit|multi_file_edit|view_diff|read_currently_open_file|fix_diagnostics)$/,
      );
      // No call carries a URL, an endpoint, or an API key —
      // there is nothing network-bound in a plan.
      expect(JSON.stringify(call.args)).not.toMatch(
        /https?:\/\/|api[_-]?key|endpoint/i,
      );
    }
  });
});

describe('context contract — the module', () => {
  it('covers every path', () => {
    const ids = CONTEXT_CONTRACT.map((e) => e.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'local-planner',
        'driving-intelligence',
        'copilot',
        'ai-chat-local',
        'ai-chat-ping',
        'ai-chat-openai',
        'ping-health',
      ]),
    );
  });

  it('every entry names its surface + destination, and every item cites its code path', () => {
    for (const entry of CONTEXT_CONTRACT) {
      expect(entry.surface).toBeTruthy();
      expect(entry.destination).toBeTruthy();
      for (const item of [...entry.sends, ...entry.staysLocal]) {
        expect(item.item).toBeTruthy();
        expect(item.source).toBeTruthy();
      }
    }
  });

  it('the local planner and the driving intelligence send nothing', () => {
    for (const id of ['local-planner', 'driving-intelligence', 'ai-chat-local'] as const) {
      const entry = CONTEXT_CONTRACT.find((e) => e.id === id)!;
      expect(entry.sends).toHaveLength(0);
    }
  });

  it('the Copilot entry names the paths the builder actually sends', () => {
    const copilot = CONTEXT_CONTRACT.find((e) => e.id === 'copilot')!;
    const items = copilot.sends.map((s) => s.item).join(' ');
    expect(items).toContain('Workspace root path');
    expect(items).toContain('Working directory');
    expect(items).toContain("Open files' paths (not contents)");
    expect(items).toContain('Active file path');
    expect(items).toContain('The 13 tool definitions');
  });

  it('the guest rule states the refusal, the carve-out, and no persistence', () => {
    expect(CONTEXT_CONTRACT_GUEST).toContain('the Agent (local planner) is refused');
    expect(CONTEXT_CONTRACT_GUEST).toContain('Copilot is allowed (carve-out)');
    expect(CONTEXT_CONTRACT_GUEST).toContain('Nothing a guest does is persisted');
  });
});
