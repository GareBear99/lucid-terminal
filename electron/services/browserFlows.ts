/**
 * Browser flow runner (Area 7) — scripted multi-step flows on one
 * tab, built on the Area 4 page-action API.
 *
 * A flow is a validated definition (src/lib/browserFlows.ts):
 * navigate -> wait -> fill -> click -> verify, in order, with
 * per-step verification from page state (a step that does not
 * do what it says fails the flow, loudly).
 *
 * Supervision gates: before a step that needs approval (explicitly
 * flagged, or matching the money/irreversible heuristic — a click
 * on a buy/checkout/pay/submit control, a navigate to a checkout
 * or payment page) the runner PAUSES and asks Gary in the browser
 * panel. It does not continue until he approves; a rejection ends
 * the flow, and "take over" (stop) ends it and leaves the page
 * exactly where it is for Gary to drive by hand. The AI can start
 * a flow but can never complete a purchase unobserved: the
 * purchase step is always gated.
 *
 * The runner is dependency-injected (actions runner, navigate,
 * webContents lookup, event sinks) so it is testable without
 * Electron.
 */

import {
  describeStep,
  stepNeedsApproval,
  validateFlowDefinition,
  FLOW_DEFAULT_TIMEOUT_MS,
  type FlowApprovalRequest,
  type FlowDefinition,
  type FlowProgressEvent,
  type FlowRunStatus,
  type FlowStep,
} from '../../src/lib/browserFlows';
import type {
  ActionWebContents,
  BrowserActionsRunner,
} from './browserActions';

export type { FlowApprovalRequest, FlowProgressEvent, FlowRunStatus };

export interface BrowserFlowRunnerDeps {
  /** The Area 4 actions runner. */
  actions: BrowserActionsRunner;
  /** Open a URL in a tab (the ipc/browser navigate). */
  navigate: (
    tabId: string,
    url: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  /** The tab's webContents, or null when the tab is gone. */
  getWebContents: (tabId: string) => ActionWebContents | null;
  onProgress: (event: FlowProgressEvent) => void;
  onApprovalNeeded: (request: FlowApprovalRequest) => void;
}

export interface BrowserFlowRunner {
  startFlow(
    definition: FlowDefinition,
    tabId: string,
  ): { ok: true; flowId: string } | { ok: false; error: string; errors?: string[] };
  stopFlow(flowId: string): { ok: boolean; error?: string };
  approveStep(flowId: string): { ok: boolean; error?: string };
  rejectStep(flowId: string): { ok: boolean; error?: string };
}

interface FlowRun {
  definition: FlowDefinition;
  tabId: string;
  stepIndex: number;
  status: FlowRunStatus;
  stopped: boolean;
  /** Resolves the pending approval: true = approved, false = no. */
  pendingApproval: ((approved: boolean) => void) | null;
}

let flowCounter = 0;

export function createBrowserFlowRunner(
  deps: BrowserFlowRunnerDeps,
): BrowserFlowRunner {
  const runs = new Map<string, FlowRun>();

  const emit = (run: FlowRun, flowId: string, event: FlowProgressEvent) => {
    run.status = event.status;
    deps.onProgress(event);
  };

  const executeStep = async (
    run: FlowRun,
    step: FlowStep,
  ): Promise<{ ok: boolean; error?: string }> => {
    const wc = deps.getWebContents(run.tabId);
    if (!wc) return { ok: false, error: 'no-such-tab' };
    switch (step.kind) {
      case 'navigate':
        return deps.navigate(run.tabId, step.url ?? '');
      case 'wait':
        return deps.actions.waitForSelector(
          wc,
          step.selector ?? '',
          step.timeout ?? FLOW_DEFAULT_TIMEOUT_MS,
        );
      case 'fill':
        return deps.actions.fill(wc, step.selector ?? '', step.value ?? '');
      case 'click':
        return deps.actions.click(wc, step.selector ?? '');
      case 'verify': {
        if (step.expectedText) {
          const read = await deps.actions.readText(wc);
          if (!read.ok || !read.text) {
            return { ok: false, error: read.error ?? 'read-failed' };
          }
          const found = read.text.text
            .toLowerCase()
            .includes(step.expectedText.toLowerCase());
          return found
            ? { ok: true }
            : { ok: false, error: 'verify-failed' };
        }
        return deps.actions.waitForSelector(
          wc,
          step.selector ?? '',
          step.timeout ?? FLOW_DEFAULT_TIMEOUT_MS,
        );
      }
    }
  };

  const finish = (
    run: FlowRun,
    flowId: string,
    status: FlowRunStatus,
    error?: string,
  ) => {
    run.pendingApproval = null;
    emit(run, flowId, {
      flowId,
      name: run.definition.name,
      stepIndex: run.stepIndex,
      totalSteps: run.definition.steps.length,
      status,
      ...(error ? { error } : {}),
    });
    runs.delete(flowId);
  };

  const runFlow = async (run: FlowRun, flowId: string) => {
    const { definition } = run;
    for (let i = 0; i < definition.steps.length; i++) {
      run.stepIndex = i;
      if (run.stopped) {
        finish(run, flowId, 'stopped');
        return;
      }
      const step = definition.steps[i];
      if (stepNeedsApproval(step)) {
        emit(run, flowId, {
          flowId,
          name: definition.name,
          stepIndex: i,
          totalSteps: definition.steps.length,
          status: 'waiting-approval',
          currentStep: describeStep(step, i),
        });
        deps.onApprovalNeeded({
          flowId,
          name: definition.name,
          stepIndex: i,
          totalSteps: definition.steps.length,
          step,
          description: describeStep(step, i),
        });
        const approved = await new Promise<boolean>((resolve) => {
          run.pendingApproval = resolve;
        });
        run.pendingApproval = null;
        if (!approved) {
          finish(run, flowId, run.stopped ? 'stopped' : 'rejected');
          return;
        }
        emit(run, flowId, {
          flowId,
          name: definition.name,
          stepIndex: i,
          totalSteps: definition.steps.length,
          status: 'running',
          currentStep: describeStep(step, i),
        });
      }
      const result = await executeStep(run, step);
      if (!result.ok) {
        finish(run, flowId, 'failed', result.error ?? 'step-failed');
        return;
      }
      const next = definition.steps[i + 1];
      emit(run, flowId, {
        flowId,
        name: definition.name,
        stepIndex: i + 1,
        totalSteps: definition.steps.length,
        status: 'running',
        ...(next ? { currentStep: describeStep(next, i + 1) } : {}),
      });
    }
    // Every step ran: the done event reports all steps complete.
    run.stepIndex = definition.steps.length;
    finish(run, flowId, 'done');
  };

  return {
    startFlow(definition, tabId) {
      const errors = validateFlowDefinition(definition);
      if (errors.length > 0) {
        return { ok: false, error: 'invalid-definition', errors };
      }
      const flowId = `flow-${Date.now().toString(36)}-${++flowCounter}`;
      const run: FlowRun = {
        definition,
        tabId,
        stepIndex: 0,
        status: 'running',
        stopped: false,
        pendingApproval: null,
      };
      runs.set(flowId, run);
      emit(run, flowId, {
        flowId,
        name: definition.name,
        stepIndex: 0,
        totalSteps: definition.steps.length,
        status: 'running',
        currentStep: describeStep(definition.steps[0], 0),
      });
      void runFlow(run, flowId);
      return { ok: true, flowId };
    },

    stopFlow(flowId) {
      const run = runs.get(flowId);
      if (!run) return { ok: false, error: 'no-such-flow' };
      run.stopped = true;
      // A pending approval resolves "no" — the run loop finishes
      // as stopped, and the tab is left exactly where it is.
      run.pendingApproval?.(false);
      return { ok: true };
    },

    approveStep(flowId) {
      const run = runs.get(flowId);
      if (!run) return { ok: false, error: 'no-such-flow' };
      if (!run.pendingApproval) {
        return { ok: false, error: 'not-waiting' };
      }
      run.pendingApproval(true);
      return { ok: true };
    },

    rejectStep(flowId) {
      const run = runs.get(flowId);
      if (!run) return { ok: false, error: 'no-such-flow' };
      if (!run.pendingApproval) {
        return { ok: false, error: 'not-waiting' };
      }
      run.pendingApproval(false);
      return { ok: true };
    },
  };
}
