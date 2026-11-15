// @vitest-environment jsdom
/**
 * The copilot runner — one copilot turn in the AI chat's copilot
 * tab (Gary, 2026-11-13). The copilot runs the agent loop in the
 * tab with the driving-intelligence gate on every tool call and
 * every edit shown for Keep/Reject review — the same loop, tools,
 * and review the terminal path uses, with the copilot's model as
 * the brain.
 *
 * Guest: the runner is called directly with isGuest — never
 * through submitAgentPrompt / setTabMode, whose terminal guards
 * stay. A Copilot copilot with no key shows as unconfigured,
 * never an error; with a key but no model listed yet it shows
 * as not-ready (the tab lists models); with a key and a model
 * it attempts a real connection through the Copilot API client
 * (D9, 2026-11-15), and never runs as the local planner
 * wearing Copilot's name.
 *
 * Run with: npx vitest run tests/copilotRunner.test.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runCopilotTurn, COPILOT_REVIEW_TAB_ID } from '../src/lib/copilotRunner';
import {
  getAgentCheckpoints,
  getPendingAgentReviews,
  resetAgentReviewForTests,
  resolveAgentReview,
} from '../src/lib/agentReview';
import { useHistoryStore } from '../src/stores/historyStore';
import { useAgentPermissionStore } from '../src/stores/agentPermissionStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { MemoryAgentHost, makeTestWorkspace } from './agentTestHost';
import type { AgentBrain, BrainPlan } from '../src/lib/agentBrain';
import type { AgentReviewBlockData, CopilotConfig } from '../src/types';

const LOCAL: CopilotConfig = { id: 'c-local', name: 'Local', model: 'local-planner' };
const COPILOT: CopilotConfig = { id: 'c-copilot', name: 'Copilot', model: 'github-copilot' };

function resetStores() {
  useHistoryStore.setState({ blocksByTab: {}, guestSessionActive: false, guestStash: null });
  useAgentPermissionStore.getState().resetAgentPermissionsForTests();
  resetAgentReviewForTests();
}

async function waitForPendingReview(timeoutMs = 5000) {
  const started = Date.now();
  for (;;) {
    const pending = getPendingAgentReviews();
    if (pending.length > 0) return pending;
    if (Date.now() - started > timeoutMs) {
      throw new Error('timed out waiting for a pending review');
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

const editBrain: AgentBrain = {
  async plan(): Promise<BrainPlan> {
    return {
      toolCalls: [
        {
          name: 'multi_edit',
          args: {
            filepath: 'src/app.ts',
            edits: [{ old_string: 'const answer = 42;', new_string: 'const answer = 43;' }],
          },
        },
      ],
    };
  },
};

describe('copilotRunner — the loop in the copilot tab', () => {
  beforeEach(() => {
    resetStores();
  });

  it('the local planner reads a file and replies with its content', async () => {
    const host = new MemoryAgentHost(makeTestWorkspace());
    const result = await runCopilotTurn({
      copilot: LOCAL,
      prompt: 'read src/app.ts',
      workspaceRoot: '/ws',
      isGuest: false,
      hasCopilotKey: false,
      host,
    });
    expect(result.stopped).toBe('done');
    expect(result.toolCalls.map((c) => c.name)).toContain('read_file');
    expect(result.reply).toContain('hello');
  });

  it('a picked driving agent that cannot run yet answers as not-ready and runs no tools', async () => {
    const host = new MemoryAgentHost(makeTestWorkspace());
    const result = await runCopilotTurn({
      copilot: LOCAL,
      prompt: 'read src/app.ts',
      workspaceRoot: '/ws',
      isGuest: false,
      hasCopilotKey: false,
      host,
      drivingAgent: {
        tab: { id: 't-ship', name: 'Ship', agent: 'starship' },
        agent: 'starship',
        label: 'Starship',
        canRun: false,
        notReadyReason:
          'No starship detected — the detection mechanism is not wired yet (Gary\u2019s call).',
      },
    });
    expect(result.stopped).toBe('failed');
    expect(result.toolCalls).toHaveLength(0);
    expect(result.drivingAgent).toBe('starship');
    expect(result.reply).toContain('"Ship"');
    expect(result.reply).toMatch(/Pick LLMBuilder \(base\)/);
    // The file was never read — the run stopped at the front door.
    expect(await host.readFile('/ws/src/app.ts')).toContain('const answer = 42;');
  });

  it('a write pauses for review; Keep lands the edit and records the checkpoint', async () => {
    const host = new MemoryAgentHost(makeTestWorkspace());
    const reviews: AgentReviewBlockData[] = [];
    const run = runCopilotTurn({
      copilot: LOCAL,
      prompt: 'change the answer to 43',
      workspaceRoot: '/ws',
      isGuest: false,
      hasCopilotKey: false,
      host,
      brain: editBrain,
      onReview: (review) => reviews.push(review),
    });
    const pending = await waitForPendingReview();
    expect(pending).toHaveLength(1);
    expect(pending[0].toolName).toBe('multi_edit');
    // The review card is the copilot tab's copy — real hunks,
    // the copilot's run id, and NO terminal block appended.
    expect(reviews).toHaveLength(1);
    expect(reviews[0].hunks[0].removed).toEqual(['const answer = 42;']);
    expect(reviews[0].hunks[0].added).toEqual(['const answer = 43;']);
    expect(reviews[0].runId.startsWith('copilot-run-')).toBe(true);
    expect(useHistoryStore.getState().blocksByTab[COPILOT_REVIEW_TAB_ID]).toBeUndefined();
    // The edit has NOT landed while the review is pending.
    expect(await host.readFile('/ws/src/app.ts')).toContain('const answer = 42;');

    await resolveAgentReview(pending[0].requestId, 'keep');
    // The edit leaves the file's pre-existing 6133 behind, so
    // the verify step asks about fix_diagnostics too.
    const second = await waitForPendingReview();
    expect(second[0].toolName).toBe('fix_diagnostics');
    expect(reviews).toHaveLength(2);
    await resolveAgentReview(second[0].requestId, 'keep');
    const result = await run;
    expect(result.stopped).toBe('done');
    expect(await host.readFile('/ws/src/app.ts')).toContain('const answer = 43;');
    expect(getAgentCheckpoints().some((c) => c.path === '/ws/src/app.ts')).toBe(true);
  });

  it('Reject denies the edit — nothing lands, the run says so', async () => {
    const host = new MemoryAgentHost(makeTestWorkspace());
    const run = runCopilotTurn({
      copilot: LOCAL,
      prompt: 'change the answer to 43',
      workspaceRoot: '/ws',
      isGuest: false,
      hasCopilotKey: false,
      host,
      brain: editBrain,
    });
    const pending = await waitForPendingReview();
    await resolveAgentReview(pending[0].requestId, 'reject');
    const result = await run;
    expect(await host.readFile('/ws/src/app.ts')).toContain('const answer = 42;');
    expect(result.reply).toMatch(/denied|not made/i);
  });

  it('a guest run works through the runner — the carve-out, not the terminal guards', async () => {
    const host = new MemoryAgentHost(makeTestWorkspace());
    const read = await runCopilotTurn({
      copilot: LOCAL,
      prompt: 'read src/app.ts',
      workspaceRoot: '/ws',
      isGuest: true,
      hasCopilotKey: false,
      host,
    });
    expect(read.stopped).toBe('done');
    expect(read.reply).toContain('hello');
    // A guest write still pauses for review (the gate's guest
    // rule stands) — and Keep lands it.
    const run = runCopilotTurn({
      copilot: LOCAL,
      prompt: 'change the answer to 43',
      workspaceRoot: '/ws',
      isGuest: true,
      hasCopilotKey: false,
      host,
      brain: editBrain,
    });
    const pending = await waitForPendingReview();
    expect(pending[0].toolName).toBe('multi_edit');
    await resolveAgentReview(pending[0].requestId, 'keep');
    const second = await waitForPendingReview();
    await resolveAgentReview(second[0].requestId, 'keep');
    const result = await run;
    expect(result.stopped).toBe('done');
    expect(await host.readFile('/ws/src/app.ts')).toContain('const answer = 43;');
  });

  it('a Copilot copilot with no key is unconfigured — no tools run, no error', async () => {
    const host = new MemoryAgentHost(makeTestWorkspace());
    let reviews = 0;
    const result = await runCopilotTurn({
      copilot: COPILOT,
      prompt: 'read src/app.ts',
      workspaceRoot: '/ws',
      isGuest: false,
      hasCopilotKey: false,
      host,
      onReview: () => {
        reviews += 1;
      },
    });
    expect(result.toolCalls).toHaveLength(0);
    expect(result.reply).toMatch(/not configured/i);
    expect(reviews).toBe(0);
  });

  it('a Copilot copilot WITH a saved key but no model listed yet is not ready — it never runs as the local planner', async () => {
    const host = new MemoryAgentHost(makeTestWorkspace());
    const prev = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: { ...prev, copilotApiModel: null, copilotApiModels: [] },
    });
    try {
      const result = await runCopilotTurn({
        copilot: COPILOT,
        prompt: 'read src/app.ts',
        workspaceRoot: '/ws',
        isGuest: false,
        hasCopilotKey: true,
        host,
      });
      expect(result.toolCalls).toHaveLength(0);
      expect(result.reply).toMatch(/models not listed/i);
    } finally {
      useSettingsStore.setState({ settings: prev });
    }
  });

  it('a Copilot copilot with a key AND a listed model attempts a real connection — the model plans, the loop runs the call', async () => {
    const host = new MemoryAgentHost(makeTestWorkspace());
    const chat = vi.fn(async () => ({
      ok: true,
      content: 'Here is the file.',
      toolCalls: [{ id: 'call_1', name: 'read_file', arguments: '{"path": "src/app.ts"}' }],
      model: 'gpt-4o',
    }));
    (window as unknown as { lucidAPI: unknown }).lucidAPI = {
      copilot: {
        listModels: async () => ({ ok: true, models: ['gpt-4o'] }),
        chatCompletions: chat,
        onChatDelta: () => () => {},
        abortChatCompletions: () => {},
      },
    };
    const prev = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: { ...prev, copilotApiModel: 'gpt-4o', copilotApiModels: ['gpt-4o'] },
    });
    try {
      const result = await runCopilotTurn({
        copilot: COPILOT,
        prompt: 'read src/app.ts',
        workspaceRoot: '/ws',
        isGuest: false,
        hasCopilotKey: true,
        host,
      });
      expect(chat).toHaveBeenCalledTimes(1);
      expect(chat.mock.calls[0][0].model).toBe('gpt-4o');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].name).toBe('read_file');
      expect(result.reply).toContain('Here is the file.');
    } finally {
      useSettingsStore.setState({ settings: prev });
      delete (window as unknown as { lucidAPI?: unknown }).lucidAPI;
    }
  });
});
