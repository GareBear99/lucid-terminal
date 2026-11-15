// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  isAgentRunInFlight,
  runAgentTurnForTab,
  resetAgentSessionForTests,
  stopAgentRun,
} from '../src/lib/agentSession';
import {
  getPendingAgentReviews,
  resetAgentReviewForTests,
  resolveAgentReview,
} from '../src/lib/agentReview';
import { useHistoryStore } from '../src/stores/historyStore';
import { useTerminalStore } from '../src/stores/terminalStore';
import { useFileStore } from '../src/stores/fileStore';
import { useAgentRunStore } from '../src/stores/agentRunStore';
import { useAgentPermissionStore } from '../src/stores/agentPermissionStore';
import { MemoryAgentHost, makeTestWorkspace } from './agentTestHost';
import type { AgentBrain, BrainPlan } from '../src/lib/agentBrain';

const TAB_1 = { id: 'terminal-1', name: 'Terminal 1', cwd: '/ws', createdAt: 1 };

function resetStores() {
  useTerminalStore.setState({ tabs: [TAB_1 as never], activeTabId: 'terminal-1' });
  useHistoryStore.setState({ blocksByTab: {}, guestSessionActive: false, guestStash: null });
  useFileStore.setState({ currentDir: '/ws' });
  useAgentPermissionStore.getState().resetAgentPermissionsForTests();
  resetAgentReviewForTests();
  resetAgentSessionForTests();
}

function blocks() {
  return useHistoryStore.getState().blocksByTab['terminal-1'] ?? [];
}

/** Poll until a review is pending (the run pauses on it),
 *  or fail — the run cannot finish while one is pending,
 *  so a timeout means the review never appeared. */
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

describe('agentSession — the loop in a tab', () => {
  beforeEach(() => {
    resetStores();
  });

  it('runs the prompt and lands the result as an agent-response block in the tab feed', async () => {
    const host = new MemoryAgentHost(makeTestWorkspace());
    const result = await runAgentTurnForTab('terminal-1', 'read src/app.ts', '/ws', { host });
    expect(result).not.toBeNull();
    expect(result?.stopped).toBe('done');

    // The runner owns only the response block — the prompt
    // block comes from submitAgentPrompt (the composer),
    // which Terminal.tsx calls before this runner.
    const all = blocks();
    expect(all).toHaveLength(1);
    expect(all[0].kind).toBe('agent-response');
    expect(all[0].output).toContain('greet');
    expect(all[0].output).toContain('src/app.ts');
  });

  it('a picked driving agent that cannot run yet answers as not-ready in the feed', async () => {
    const host = new MemoryAgentHost(makeTestWorkspace());
    const result = await runAgentTurnForTab('terminal-1', 'read src/app.ts', '/ws', {
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
    expect(result).not.toBeNull();
    expect(result?.stopped).toBe('failed');
    expect(result?.toolCalls).toHaveLength(0);
    expect(result?.drivingAgent).toBe('starship');
    const last = blocks()[blocks().length - 1];
    expect(last?.kind).toBe('agent-response');
    expect(last?.output).toMatch(/No starship detected/);
    expect(last?.output).toMatch(/Pick LLMBuilder \(base\)/);
  });

  it('refuses in guest — the terminal guard stays, nothing is appended', async () => {
    useHistoryStore.setState({ guestSessionActive: true });
    const host = new MemoryAgentHost(makeTestWorkspace());
    const result = await runAgentTurnForTab('terminal-1', 'read src/app.ts', '/ws', { host });
    expect(result).toBeNull();
    expect(blocks()).toHaveLength(0);
    // No run started, so the reactive signal never fires —
    // the Stop button has nothing to show in guest.
    expect(useAgentRunStore.getState().inFlightByTab['terminal-1']).toBeUndefined();
  });

  it('with no workspace open it says to open a folder first', async () => {
    useFileStore.setState({ currentDir: '' });
    const host = new MemoryAgentHost(makeTestWorkspace());
    const result = await runAgentTurnForTab('terminal-1', 'read src/app.ts', undefined, { host });
    expect(result).toBeNull();
    const all = blocks();
    expect(all).toHaveLength(1);
    expect(all[0].kind).toBe('agent-response');
    expect(all[0].output).toContain('Open a folder');
  });

  it('a write pauses for review; Keep lands the edit and records the checkpoint', async () => {
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
    const host = new MemoryAgentHost(makeTestWorkspace());
    const run = runAgentTurnForTab('terminal-1', 'change the answer to 43', '/ws', { host, brain: editBrain });
    const pending = await waitForPendingReview();
    expect(pending).toHaveLength(1);
    expect(pending[0].toolName).toBe('multi_edit');
    // The edit has NOT landed while the review is pending.
    expect(await host.readFile('/ws/src/app.ts')).toContain('const answer = 42;');
    const reviewBlock = blocks().find((b) => b.kind === 'agent-review');
    expect(reviewBlock?.review?.status).toBe('pending');
    expect(reviewBlock?.review?.hunks[0].removed).toEqual(['const answer = 42;']);
    expect(reviewBlock?.review?.hunks[0].added).toEqual(['const answer = 43;']);

    await resolveAgentReview(pending[0].requestId, 'keep');
    // The edit leaves the file's pre-existing 6133
    // (never-read `answer`) behind, so the verify step
    // asks about fix_diagnostics too — resolve that one
    // as well, or the run stays paused on it.
    const second = await waitForPendingReview();
    expect(second[0].toolName).toBe('fix_diagnostics');
    await resolveAgentReview(second[0].requestId, 'keep');
    const result = await run;
    expect(result?.stopped).toBe('done');
    expect(await host.readFile('/ws/src/app.ts')).toContain('const answer = 43;');
    expect(blocks().find((b) => b.kind === 'agent-review')?.review?.status).toBe('kept');
    expect(blocks().find((b) => b.kind === 'agent-review')?.review?.checkpointId).toBeTruthy();
  });

  it('Reject denies the edit — nothing lands, the run says so', async () => {
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
    const host = new MemoryAgentHost(makeTestWorkspace());
    const run = runAgentTurnForTab('terminal-1', 'change the answer to 43', '/ws', { host, brain: editBrain });
    const pending = await waitForPendingReview();
    await resolveAgentReview(pending[0].requestId, 'reject');
    const result = await run;
    expect(result?.stopped).toBe('done');
    expect(await host.readFile('/ws/src/app.ts')).toContain('const answer = 42;');
    expect(result?.toolCalls[0].outcome).toBe('approval-denied');
    expect(result?.reply).toContain('approval denied');
    expect(blocks().find((b) => b.kind === 'agent-review')?.review?.status).toBe('rejected');
  });

  it('Keep All auto-keeps the second edit in the same run', async () => {
    const twoEditBrain: AgentBrain = {
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
            {
              name: 'multi_edit',
              args: {
                filepath: 'src/util.ts',
                edits: [{ old_string: "export const helper = () => 'help';", new_string: "export const helper = () => 'helped';" }],
              },
            },
          ],
        };
      },
    };
    const host = new MemoryAgentHost(makeTestWorkspace());
    const run = runAgentTurnForTab('terminal-1', 'change both files', '/ws', { host, brain: twoEditBrain });
    const pending = await waitForPendingReview();
    await resolveAgentReview(pending[0].requestId, 'keep-all');
    const result = await run;
    expect(result?.stopped).toBe('done');
    expect(await host.readFile('/ws/src/app.ts')).toContain('const answer = 43;');
    expect(await host.readFile('/ws/src/util.ts')).toContain('helped');
    // Only one review block — the second edit never asked.
    expect(blocks().filter((b) => b.kind === 'agent-review')).toHaveLength(1);
  });

  it('a fix review carries the diagnostics the edit left behind', async () => {
    const dirtyBrain: AgentBrain = {
      async plan(): Promise<BrainPlan> {
        return {
          toolCalls: [
            {
              name: 'multi_edit',
              args: {
                filepath: 'src/app.ts',
                edits: [{ old_string: 'const answer = 42;', new_string: 'const answer: string = 42;' }],
              },
            },
          ],
        };
      },
    };
    const host = new MemoryAgentHost(makeTestWorkspace());
    const run = runAgentTurnForTab('terminal-1', 'change the answer type', '/ws', { host, brain: dirtyBrain });
    const first = await waitForPendingReview();
    expect(first[0].toolName).toBe('multi_edit');
    await resolveAgentReview(first[0].requestId, 'keep');
    // The verify step now asks about fix_diagnostics.
    const second = await waitForPendingReview();
    expect(second[0].toolName).toBe('fix_diagnostics');
    const fixBlock = blocks().find(
      (b) => b.kind === 'agent-review' && b.review?.toolName === 'fix_diagnostics',
    );
    expect(fixBlock?.review?.diagnostics?.length).toBeGreaterThan(0);
    expect(fixBlock?.review?.diagnostics?.[0].code).toBe(2322);
    await resolveAgentReview(second[0].requestId, 'keep');
    const result = await run;
    expect(result?.stopped).toBe('done');
    expect(result?.reply).toContain('no safe automatic repair');
  });

  it('a tool set to auto in the permission store skips the review', async () => {
    // Both write tools in this run are auto — the edit
    // leaves the pre-existing 6133 behind, so the verify
    // step's fix_diagnostics would ask too if it were not.
    useAgentPermissionStore.getState().setToolPermission('multi_edit', 'auto');
    useAgentPermissionStore.getState().setToolPermission('fix_diagnostics', 'auto');
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
    const host = new MemoryAgentHost(makeTestWorkspace());
    const result = await runAgentTurnForTab('terminal-1', 'change the answer to 43', '/ws', {
      host,
      brain: editBrain,
    });
    expect(result?.stopped).toBe('done');
    expect(await host.readFile('/ws/src/app.ts')).toContain('const answer = 43;');
    expect(blocks().filter((b) => b.kind === 'agent-review')).toHaveLength(0);
    expect(getPendingAgentReviews()).toHaveLength(0);
  });

  it('stopAgentRun aborts a run paused on a review — nothing lands', async () => {
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
    const host = new MemoryAgentHost(makeTestWorkspace());
    const run = runAgentTurnForTab('terminal-1', 'change the answer to 43', '/ws', { host, brain: editBrain });
    const pending = await waitForPendingReview();
    expect(pending).toHaveLength(1);
    expect(isAgentRunInFlight('terminal-1')).toBe(true);
    // The reactive signal mirrors the module-level map while
    // the run is live — this is what the Stop button reads.
    expect(useAgentRunStore.getState().inFlightByTab['terminal-1']).toBe(true);
    expect(stopAgentRun('terminal-1')).toBe(true);
    const result = await run;
    expect(result?.stopped).toBe('aborted');
    expect(await host.readFile('/ws/src/app.ts')).toContain('const answer = 42;');
    expect(blocks().find((b) => b.kind === 'agent-review')?.review?.status).toBe('rejected');
    expect(isAgentRunInFlight('terminal-1')).toBe(false);
    // The signal clears in the run's finally, so the button
    // disappears the moment the run ends.
    expect(useAgentRunStore.getState().inFlightByTab['terminal-1']).toBeUndefined();
    expect(stopAgentRun('terminal-1')).toBe(false);
  });

  it('the reactive signal clears when a run ends normally, not just on abort', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slowBrain: AgentBrain = {
      async plan(): Promise<BrainPlan> {
        await gate;
        return { toolCalls: [{ name: 'ls', args: { dirPath: '/ws' } }] };
      },
    };
    const host = new MemoryAgentHost(makeTestWorkspace());
    const run = runAgentTurnForTab('terminal-1', 'list', '/ws', { host, brain: slowBrain });
    // The run is in flight (the brain is gated) — the signal
    // is set before the first tool runs.
    await new Promise((r) => setTimeout(r, 25));
    expect(useAgentRunStore.getState().inFlightByTab['terminal-1']).toBe(true);
    release();
    const result = await run;
    expect(result?.stopped).toBe('done');
    expect(useAgentRunStore.getState().inFlightByTab['terminal-1']).toBeUndefined();
  });

  it('a second run while one is in flight is dropped', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slowBrain: AgentBrain = {
      async plan(): Promise<BrainPlan> {
        await gate;
        return { toolCalls: [{ name: 'ls', args: { dirPath: '/ws' } }] };
      },
    };
    const host = new MemoryAgentHost(makeTestWorkspace());
    const first = runAgentTurnForTab('terminal-1', 'list', '/ws', { host, brain: slowBrain });
    const second = await runAgentTurnForTab('terminal-1', 'list', '/ws', { host, brain: slowBrain });
    expect(second).toBeNull();
    release();
    const result = await first;
    expect(result?.stopped).toBe('done');
    // One prompt block is missing here on purpose: the
    // prompt blocks come from submitAgentPrompt (the
    // composer), not from this runner — this runner only
    // owns the response block.
    expect(blocks()).toHaveLength(1);
    expect(blocks()[0].kind).toBe('agent-response');
  });
});
