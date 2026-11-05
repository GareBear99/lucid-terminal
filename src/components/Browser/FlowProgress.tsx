import { useEffect, useState } from 'react';
import { Check, Loader, Play, ShieldAlert, Square, X } from 'lucide-react';
import type {
  FlowApprovalRequest,
  FlowProgressEvent,
} from '../../types';

/**
 * Flow progress bar (Area 7): shows while a scripted flow is
 * running on the active tab — flow name, step x/y, the current
 * step, and its state. When the runner pauses on a supervision
 * gate, Approve / Reject appear for that step; Take over (stop)
 * ends the flow at any time and leaves the page where it is for
 * Gary to drive by hand.
 *
 * The component owns its state: it subscribes to
 * `browser:flow-progress` and `browser:flow-approval-needed` and
 * renders nothing when no flow is active. A finished flow (done /
 * failed / rejected / stopped) stays visible until dismissed, so
 * Gary sees how it ended.
 */

function FlowProgress() {
  const [progress, setProgress] = useState<FlowProgressEvent | null>(null);
  const [approval, setApproval] = useState<FlowApprovalRequest | null>(null);

  useEffect(() => {
    const cleanupProgress = window.lucidAPI.browser.onFlowProgress(
      (event) => {
        setProgress(event);
        // A terminal event clears any pending approval for that flow.
        if (
          event.status === 'done' ||
          event.status === 'failed' ||
          event.status === 'rejected' ||
          event.status === 'stopped'
        ) {
          setApproval((current) =>
            current && current.flowId === event.flowId ? null : current,
          );
        }
      },
    );
    const cleanupApproval =
      window.lucidAPI.browser.onFlowApprovalNeeded((request) => {
        setApproval(request);
      });
    return () => {
      cleanupProgress();
      cleanupApproval();
    };
  }, []);

  if (!progress) return null;
  const active =
    progress.status === 'running' || progress.status === 'waiting-approval';
  const waiting =
    progress.status === 'waiting-approval' && approval?.flowId === progress.flowId;

  const statusLabel =
    progress.status === 'running'
      ? 'Running'
      : progress.status === 'waiting-approval'
        ? 'Waiting for approval'
        : progress.status === 'done'
          ? 'Done'
          : progress.status === 'failed'
            ? `Failed: ${progress.error ?? 'step failed'}`
            : progress.status === 'rejected'
              ? 'Rejected'
              : 'Stopped — you have the page';

  return (
    <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5">
      <div className="flex items-center gap-2 text-xs">
        {active ? (
          <Loader size={14} className="animate-spin shrink-0" />
        ) : progress.status === 'done' ? (
          <Check size={14} className="shrink-0 text-green-500" />
        ) : (
          <ShieldAlert size={14} className="shrink-0 text-amber-500" />
        )}
        <span className="font-medium truncate">{progress.name}</span>
        <span className="text-[var(--text-muted)] shrink-0">
          Step {Math.min(progress.stepIndex + 1, progress.totalSteps)}/
          {progress.totalSteps}
        </span>
        <span className="text-[var(--text-muted)] truncate">
          {progress.currentStep ?? statusLabel}
        </span>
        <span className="flex-1" />
        {waiting && approval ? (
          <>
            <span className="hidden sm:inline text-[var(--text-muted)]">
              Approve this step?
            </span>
            <button
              type="button"
              onClick={() =>
                void window.lucidAPI.browser.approveFlowStep(approval.flowId)
              }
              className="px-2 py-0.5 rounded bg-green-600 text-white hover:bg-green-500 flex items-center gap-1"
            >
              <Play size={12} />
              Approve
            </button>
            <button
              type="button"
              onClick={() =>
                void window.lucidAPI.browser.rejectFlowStep(approval.flowId)
              }
              className="px-2 py-0.5 rounded bg-red-600 text-white hover:bg-red-500 flex items-center gap-1"
            >
              <X size={12} />
              Reject
            </button>
          </>
        ) : null}
        {active ? (
          <button
            type="button"
            title="Stop the flow and take over the page yourself"
            onClick={() =>
              void window.lucidAPI.browser.stopFlow(progress.flowId)
            }
            className="px-2 py-0.5 rounded hover:bg-[var(--bg-tertiary)] flex items-center gap-1"
          >
            <Square size={12} />
            Take over
          </button>
        ) : (
          <button
            type="button"
            title="Dismiss"
            onClick={() => setProgress(null)}
            className="p-1 rounded hover:bg-[var(--bg-tertiary)]"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {waiting && approval ? (
        <div className="mt-1 text-xs text-amber-500">
          Paused before: {approval.description} — nothing happens
          until you approve.
        </div>
      ) : null}
    </div>
  );
}

export default FlowProgress;
