/**
 * The edit review — Keep/Reject + checkpoints
 * (steal #6 — Zed, 2026-11-14).
 *
 * Shape stolen from Zed's review flow
 * (`crates/agent_ui/src/agent_diff.rs`): after the agent
 * edits, the changed excerpts show in one view with per-
 * hunk Keep / Reject, plus Keep All / Reject All — and
 * checkpoints (`crates/git/src/repository.rs`
 * create_archive_checkpoint / restore_archive_checkpoint)
 * snapshot the state before the edit so it can be
 * restored. Lucid's shape of that, in TS:
 *
 * - The review request: one proposed write (tool call +
 *   diff preview + the diagnostics a fix is about), shown
 *   as an `agent-review` block in the tab's feed — the
 *   feed is where the conversation lives, so the review
 *   lives there too, not in a modal.
 * - The diff preview is computed BEFORE the edit runs,
 *   from the file's current content + the call's args
 *   (multi_edit: the matched regions, old → new, with
 *   context; create_new_file: the whole content as
 *   additions; fix_diagnostics: the diagnostics it is
 *   about — the repairs themselves are computed by the
 *   tool at run time, so the review shows the reason,
 *   not a diff).
 * - The checkpoint: recorded at Keep time, BEFORE the
 *   tool executes (the read happens before the loop's
 *   approve promise resolves — the order is what makes
 *   the checkpoint the pre-edit state). It holds the
 *   file's content before the edit (null when the file
 *   did not exist — a create); Revert restores it, or
 *   deletes the created file. Zed's checkpoints are git
 *   commits; Lucid's are content snapshots — the
 *   workspace may not be a git repo, and the snapshot is
 *   the exact bytes, no commit needed.
 * - Keep All / Reject All set the run's mode: the rest of
 *   that run's writes are auto-kept / auto-rejected
 *   without a block each (the user said so).
 * - "Always allow {tool}" resolves Keep AND sets the
 *   tool to 'auto' in the permission store — the next run
 *   skips the review for that tool.
 *
 * The loop's pause machinery (agentLoop.ts: the
 * `approve` callback + approval-requested/denied events)
 * is the integration point — this module answers the
 * callback, it does not build a second approval path.
 * The module holds the pending requests + resolvers +
 * checkpoints + run modes in memory (per-process, like
 * the loop's index cache — guest-safe: it dies with the
 * app, nothing persists). The feed blocks are the
 * display; this module is the state behind them.
 */

import type { PlannedToolCall } from './agentBrain';
import type { AgentHost } from './agentHost';
import { resolveAgentPath } from './agentHost';
import type { AgentApprovalDetail } from './agentLoop';
import { dropAgentIndex } from './agentLoop';
import {
  applyEditOperation,
  executeMultiEdit,
  findEditMatch,
  type EditOperation,
} from './agentMultiEdit';
import { useHistoryStore } from '../stores/historyStore';
import { useTerminalStore } from '../stores/terminalStore';
import { useAgentPermissionStore } from '../stores/agentPermissionStore';
import { newBlockId } from './terminalBlocks';
import type {
  AgentReviewBlockData,
  AgentReviewDiagnostic,
  AgentReviewHunk,
  TerminalBlock,
} from '../types';

/** The decision the user takes on a review. */
export type AgentReviewDecision = 'keep' | 'reject' | 'keep-all' | 'reject-all';

/** A checkpoint: the file's content before a kept edit
 *  (null when the file did not exist — a create). */
export interface AgentCheckpoint {
  id: string;
  runId: string;
  tabId: string;
  path: string;
  contentBefore: string | null;
  workspaceRoot: string;
  createdAt: number;
  reverted: boolean;
}

/** How many context lines around a changed region. */
const PREVIEW_CONTEXT_LINES = 3;
/** How many hunks one preview shows at most. */
const PREVIEW_MAX_HUNKS = 8;
/** How many lines of one side of a hunk are shown. */
const PREVIEW_MAX_LINES = 60;
/** How many lines of a created file are shown. */
const PREVIEW_MAX_CREATED_LINES = 200;

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count += 1;
    from = at + needle.length;
  }
}

function capLines(lines: string[]): { lines: string[]; truncated: number } {
  if (lines.length <= PREVIEW_MAX_LINES) return { lines, truncated: 0 };
  return { lines: lines.slice(0, PREVIEW_MAX_LINES), truncated: lines.length - PREVIEW_MAX_LINES };
}

function resolveCallFilepath(
  args: Record<string, unknown>,
  cwd: string,
  workspaceRoot: string,
): string | undefined {
  const value = args.filepath;
  if (typeof value !== 'string' || !value) return undefined;
  return resolveAgentPath(value, cwd, workspaceRoot);
}

/** The file's current content — an open file's edited
 *  content first (the truth over disk), else disk. Null
 *  when the file does not exist (a create) or cannot be
 *  read. */
async function currentContent(host: AgentHost, path: string): Promise<string | null> {
  const open = host.getOpenFiles().find((f) => f.path === path);
  if (open) return open.content;
  try {
    return await host.readFile(path);
  } catch {
    return null;
  }
}

interface ReviewPreview {
  hunks: AgentReviewHunk[];
  diagnostics?: AgentReviewDiagnostic[];
  previewError?: string;
}

/**
 * The diff preview for a multi_edit, computed in memory
 * from the file's current content + the operations —
 * never touching disk. Each operation's matched region
 * becomes one hunk (removed lines, added lines, context),
 * walked in order like executeMultiEdit applies them, so
 * the preview is what the tool will actually do. A
 * replace_all shows only its first site, and says so.
 * An edit that does not match is a preview error, not a
 * guessed preview — the review still shows, and the user
 * can reject it.
 */
function previewMultiEdit(
  content: string,
  rawEdits: unknown,
): { hunks: AgentReviewHunk[]; previewError?: string } {
  if (!Array.isArray(rawEdits) || rawEdits.length === 0) {
    return { hunks: [], previewError: 'multi_edit needs a non-empty edits array.' };
  }
  const ops: EditOperation[] = [];
  for (const raw of rawEdits) {
    if (
      typeof raw !== 'object' ||
      raw === null ||
      typeof (raw as Record<string, unknown>).old_string !== 'string' ||
      typeof (raw as Record<string, unknown>).new_string !== 'string'
    ) {
      return { hunks: [], previewError: 'Each edit needs old_string and new_string strings.' };
    }
    ops.push({
      old_string: (raw as Record<string, unknown>).old_string as string,
      new_string: (raw as Record<string, unknown>).new_string as string,
      replace_all: (raw as Record<string, unknown>).replace_all === true,
    });
  }
  // Atomic validation first: all ops must apply, or the
  // preview is an error (the tool would fail the same way).
  try {
    executeMultiEdit(content, ops);
  } catch (e) {
    return { hunks: [], previewError: e instanceof Error ? e.message : String(e) };
  }
  let working = content;
  let shift = 0;
  const hunks: AgentReviewHunk[] = [];
  for (const op of ops) {
    if (hunks.length >= PREVIEW_MAX_HUNKS) break;
    const match = findEditMatch(working, op.old_string);
    if (!match) break; // validated above — cannot happen
    const before = working;
    const after = applyEditOperation(working, op).content;
    const startLine = before.slice(0, match.start).split('\n').length;
    const removedAll = match.matched.split('\n');
    // The added text at this site: for an exact replace_all
    // it is the new string itself (every site gets the same
    // replacement); otherwise it is the slice of `after`
    // where the matched text was.
    let addedAll: string[];
    if (op.replace_all && match.kind === 'exact') {
      addedAll = op.new_string.split('\n');
    } else {
      const addedLength = after.length - before.length + match.matched.length;
      addedAll = after.slice(match.start, match.start + addedLength).split('\n');
    }
    const beforeLines = before.split('\n');
    const endLine = startLine + removedAll.length - 1;
    const removed = capLines(removedAll);
    const added = capLines(addedAll);
    // A file ending in '\n' splits to a trailing '' — that
    // is not a line, so it never shows as context (a real
    // blank line mid-file still shows: only the phantom
    // at the file's end is dropped).
    const afterCtx = beforeLines.slice(endLine, endLine + PREVIEW_CONTEXT_LINES);
    while (
      afterCtx.length > 0 &&
      afterCtx[afterCtx.length - 1] === '' &&
      endLine + afterCtx.length >= beforeLines.length
    ) {
      afterCtx.pop();
    }
    const notes: string[] = [];
    if (op.replace_all && match.kind === 'exact') {
      const occurrences = countOccurrences(before, op.old_string);
      if (occurrences > 1) {
        notes.push(`replaces all ${occurrences} occurrences — only the first is shown`);
      }
    }
    if (removed.truncated > 0) notes.push(`… and ${removed.truncated} more removed lines`);
    if (added.truncated > 0) notes.push(`… and ${added.truncated} more added lines`);
    hunks.push({
      line: startLine - shift,
      before: beforeLines.slice(Math.max(0, startLine - 1 - PREVIEW_CONTEXT_LINES), startLine - 1),
      removed: removed.lines,
      added: added.lines,
      after: afterCtx,
      note: notes.length > 0 ? notes.join('; ') : undefined,
    });
    working = after;
    // The shift is the real line-count delta of the whole
    // operation — for a replace_all that touches several
    // sites, the single-site delta would under-count it.
    shift += after.split('\n').length - before.split('\n').length;
  }
  return { hunks };
}

/**
 * The preview for a write call: the hunks for an edit,
 * the whole content as additions for a create, the
 * diagnostics for a fix. Anything else gets no preview
 * (only write tools pause for review).
 */
export function computeReviewPreview(
  call: PlannedToolCall,
  content: string | null,
  detail?: AgentApprovalDetail,
): ReviewPreview {
  if (call.name === 'multi_edit') {
    if (content === null) {
      return { hunks: [], previewError: 'The file does not exist (or cannot be read) — the edit cannot apply.' };
    }
    return previewMultiEdit(content, call.args.edits);
  }
  if (call.name === 'create_new_file') {
    const fileContent = call.args.content;
    if (typeof fileContent !== 'string') {
      return { hunks: [], previewError: 'create_new_file needs a content string.' };
    }
    const lines = fileContent.split('\n');
    const shown = lines.slice(0, PREVIEW_MAX_CREATED_LINES);
    return {
      hunks: [
        {
          line: 1,
          before: [],
          removed: [],
          added: shown,
          after: [],
          note:
            lines.length > PREVIEW_MAX_CREATED_LINES
              ? `… and ${lines.length - PREVIEW_MAX_CREATED_LINES} more lines`
              : undefined,
        },
      ],
    };
  }
  if (call.name === 'fix_diagnostics') {
    // The repairs are computed by the tool at run time —
    // the review shows the reason (the diagnostics), not
    // a diff it cannot know yet.
    return { hunks: [], diagnostics: detail?.diagnostics };
  }
  return { hunks: [] };
}

// --- Module state (per-process, in-memory) ----------------

interface InternalRequest {
  requestId: string;
  runId: string;
  tabId: string;
  toolName: string;
  summary: string;
  filepath?: string;
  workspaceRoot: string;
  host: AgentHost;
  resolve: (value: boolean) => void;
  resolved: boolean;
}

const requests = new Map<string, InternalRequest>();
const checkpoints = new Map<string, AgentCheckpoint & { host: AgentHost }>();
const runModes = new Map<string, 'keep-all' | 'reject-all'>();
const runHosts = new Map<string, AgentHost>();

function tabExists(tabId: string): boolean {
  return useTerminalStore.getState().tabs.some((t) => t.id === tabId);
}

function appendReviewBlock(
  tabId: string,
  blockData: AgentReviewBlockData,
  cwd: string | undefined,
): void {
  if (!tabExists(tabId)) return;
  const now = Date.now();
  const block: TerminalBlock = {
    id: newBlockId(now),
    command: blockData.summary,
    output: blockData.summary,
    timestamp: now,
    isComplete: true,
    cwd,
    kind: 'agent-review',
    review: blockData,
  };
  useHistoryStore.getState().setBlocks(tabId, (prev) => [...prev, block]);
}

function updateReviewBlock(
  tabId: string,
  requestId: string,
  patch: Partial<AgentReviewBlockData>,
): void {
  useHistoryStore.getState().setBlocks(tabId, (prev) =>
    prev.map((b) =>
      b.review?.requestId === requestId ? { ...b, review: { ...b.review, ...patch } } : b,
    ),
  );
}

function updateReviewBlockByCheckpoint(
  checkpointId: string,
  patch: Partial<AgentReviewBlockData>,
): void {
  const tabIds = new Set<string>();
  for (const cp of checkpoints.values()) {
    if (cp.id === checkpointId) tabIds.add(cp.tabId);
  }
  for (const tabId of tabIds) {
    useHistoryStore.getState().setBlocks(tabId, (prev) =>
      prev.map((b) =>
        b.review?.checkpointId === checkpointId ? { ...b, review: { ...b.review, ...patch } } : b,
      ),
    );
  }
}

export interface AgentReviewRequestInput {
  runId: string;
  tabId: string;
  call: PlannedToolCall;
  detail?: AgentApprovalDetail;
  host: AgentHost;
  workspaceRoot: string;
  cwd: string;
  signal?: AbortSignal;
}

/**
 * Ask the user about one write call. Returns true when
 * the edit may run, false when it must not. A run in
 * keep-all / reject-all mode answers without a block.
 * The block is the UI surface; the returned promise is
 * what the loop awaits. A tab that closed mid-run, or an
 * aborted run, answers false — the run reports the
 * refusal instead of hanging.
 */
export async function requestAgentReview(input: AgentReviewRequestInput): Promise<boolean> {
  const mode = runModes.get(input.runId);
  if (mode === 'keep-all') return true;
  if (mode === 'reject-all') return false;
  if (!tabExists(input.tabId)) return false;

  const toolName = input.call.name;
  const filepath = resolveCallFilepath(input.call.args, input.cwd, input.workspaceRoot);
  const content = filepath ? await currentContent(input.host, filepath) : null;
  const preview = computeReviewPreview(input.call, content, input.detail);
  const requestId = `review-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const blockData: AgentReviewBlockData = {
    requestId,
    runId: input.runId,
    toolName,
    summary: input.detail?.summary ?? toolName,
    filepath,
    hunks: preview.hunks,
    diagnostics: preview.diagnostics,
    previewError: preview.previewError,
    status: 'pending',
  };
  let resolveFn!: (value: boolean) => void;
  const promise = new Promise<boolean>((resolve) => {
    resolveFn = resolve;
  });
  requests.set(requestId, {
    requestId,
    runId: input.runId,
    tabId: input.tabId,
    toolName,
    summary: blockData.summary,
    filepath,
    workspaceRoot: input.workspaceRoot,
    host: input.host,
    resolve: resolveFn,
    resolved: false,
  });
  runHosts.set(input.runId, input.host);
  appendReviewBlock(input.tabId, blockData, input.cwd);
  if (input.signal) {
    if (input.signal.aborted) {
      void resolveAgentReview(requestId, 'reject');
    } else {
      input.signal.addEventListener('abort', () => void resolveAgentReview(requestId, 'reject'), {
        once: true,
      });
    }
  }
  return promise;
}

/**
 * Record the checkpoint for a kept edit: the file's
 * content BEFORE the edit runs (null when the file did
 * not exist). Called before the loop's promise resolves
 * — the order is what makes the checkpoint the pre-edit
 * state. Returns the checkpoint id, or undefined when
 * the edit has no single file to snapshot.
 */
async function recordCheckpoint(req: InternalRequest): Promise<string | undefined> {
  if (!req.filepath) return undefined;
  const contentBefore = await currentContent(req.host, req.filepath);
  const checkpointId = `checkpoint-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  checkpoints.set(checkpointId, {
    id: checkpointId,
    runId: req.runId,
    tabId: req.tabId,
    path: req.filepath,
    contentBefore,
    workspaceRoot: req.workspaceRoot,
    createdAt: Date.now(),
    reverted: false,
    host: req.host,
  });
  return checkpointId;
}

/**
 * Resolve a pending review. Keep / keep-all record the
 * checkpoint first (the read must land before the tool
 * runs — the loop's promise resolves only after this
 * returns). `alwaysAllowTool` also sets the tool to
 * 'auto' in the permission store. Returns false when the
 * request is unknown or already resolved.
 */
export async function resolveAgentReview(
  requestId: string,
  decision: AgentReviewDecision,
  opts: { alwaysAllowTool?: boolean } = {},
): Promise<boolean> {
  const req = requests.get(requestId);
  if (!req || req.resolved) return false;
  req.resolved = true;
  const status =
    decision === 'keep'
      ? 'kept'
      : decision === 'reject'
        ? 'rejected'
        : decision === 'keep-all'
          ? 'kept-all'
          : 'rejected-all';
  if (decision === 'keep-all') runModes.set(req.runId, 'keep-all');
  if (decision === 'reject-all') runModes.set(req.runId, 'reject-all');
  if (opts.alwaysAllowTool) {
    useAgentPermissionStore.getState().setToolPermission(req.toolName, 'auto');
  }
  let checkpointId: string | undefined;
  if (decision === 'keep' || decision === 'keep-all') {
    checkpointId = await recordCheckpoint(req);
  }
  updateReviewBlock(req.tabId, requestId, { status, checkpointId });
  req.resolve(decision === 'keep' || decision === 'keep-all');
  return true;
}

/**
 * Restore a checkpoint: the file goes back to its
 * pre-edit content (or is deleted, when it did not exist
 * before the edit). An open file keeps its editor state
 * (content replaced, saved, dirty flag cleared) — the
 * same persist path the edit tools use. The workspace
 * index is dropped so the next run rebuilds from the
 * restored content instead of trusting the stale cache.
 * Returns false when the checkpoint is unknown, already
 * reverted, or the restore fails.
 */
export async function revertAgentCheckpoint(checkpointId: string): Promise<boolean> {
  const cp = checkpoints.get(checkpointId);
  if (!cp || cp.reverted || !cp.path) return false;
  try {
    if (cp.contentBefore === null) {
      await cp.host.deleteFile(cp.path);
    } else {
      const isOpen = cp.host.getOpenFiles().some((f) => f.path === cp.path);
      if (isOpen) {
        cp.host.updateOpenFileContent(cp.path, cp.contentBefore);
        await cp.host.saveOpenFile(cp.path);
      } else {
        await cp.host.writeFile(cp.path, cp.contentBefore);
      }
    }
  } catch {
    return false;
  }
  cp.reverted = true;
  dropAgentIndex(cp.workspaceRoot);
  updateReviewBlockByCheckpoint(checkpointId, { checkpointReverted: true });
  return true;
}

/** Resolve every still-pending review of a run as denied
 *  (the run ended — a tab closed, the run aborted — and
 *  a review must not linger as pending in the feed). */
export function cancelAgentReviewsForRun(runId: string): void {
  for (const req of [...requests.values()]) {
    if (req.runId === runId && !req.resolved) {
      req.resolved = true;
      updateReviewBlock(req.tabId, req.requestId, { status: 'rejected' });
      req.resolve(false);
    }
  }
  runModes.delete(runId);
  runHosts.delete(runId);
}

/** The pending reviews (tests + the UI's badge counts).
 *  A snapshot, not live — resolve to change it. */
export function getPendingAgentReviews(): Array<{
  requestId: string;
  runId: string;
  tabId: string;
  toolName: string;
  summary: string;
}> {
  const out: Array<{ requestId: string; runId: string; tabId: string; toolName: string; summary: string }> = [];
  for (const req of requests.values()) {
    if (!req.resolved) {
      out.push({
        requestId: req.requestId,
        runId: req.runId,
        tabId: req.tabId,
        toolName: req.toolName,
        summary: req.summary,
      });
    }
  }
  return out;
}

/** The checkpoints (tests + a future checkpoints list).
 *  Reverted ones are included — the flag says so. The
 *  host is internal (the revert path), so it is stripped
 *  from the returned records. */
export function getAgentCheckpoints(runId?: string): AgentCheckpoint[] {
  const out: AgentCheckpoint[] = [];
  for (const cp of checkpoints.values()) {
    if (runId === undefined || cp.runId === runId) {
      out.push({
        id: cp.id,
        runId: cp.runId,
        tabId: cp.tabId,
        path: cp.path,
        contentBefore: cp.contentBefore,
        workspaceRoot: cp.workspaceRoot,
        createdAt: cp.createdAt,
        reverted: cp.reverted,
      });
    }
  }
  return out;
}

/** Test reset: forget every request, checkpoint, run mode
 *  and run host. Pending promises are resolved as denied
 *  first, so no test run hangs on a forgotten review. */
export function resetAgentReviewForTests(): void {
  for (const req of [...requests.values()]) {
    if (!req.resolved) {
      req.resolved = true;
      req.resolve(false);
    }
  }
  requests.clear();
  checkpoints.clear();
  runModes.clear();
  runHosts.clear();
}
