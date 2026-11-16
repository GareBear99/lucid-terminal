/**
 * The session model, in Lucid's own implementation — pure core.
 *
 * Sourced from upstream tmux, not a copy of it:
 *  - tmux.github.io → the tmux/tmux wiki "Getting Started"
 *    (github.com/tmux/tmux/wiki/Getting-Started)
 *  - the tmux.1 man page (installed tmux 3.4, same text as
 *    tmux.1 in github.com/tmux/tmux at master, commit ac7e727)
 *  - the tmux/tmux repo listing at master (cmd-detach-client.c,
 *    cmd-attach-session.c, cmd-new-session.c, cmd-kill-session.c,
 *    cmd-kill-server.c, server-client.c, server.c, session.c,
 *    window.c, window-panes.c, tmux.h)
 *  - verified live against tmux 3.4 on this VM: a session
 *    created detached (`new-session -d`) persists with zero
 *    clients attached; killing its last session ends the server.
 *
 * What tmux actually does (man tmux, DESCRIPTION + CLIENTS AND
 * SESSIONS):
 *  - One server process holds every session, window and pane.
 *    Each client is a separate process that talks to the server
 *    over a socket in /tmp. A session is displayed by a client;
 *    all sessions are managed by the server.
 *  - A session is a collection of pseudo-terminals under tmux's
 *    management. Each session has one or more windows linked to
 *    it; each window is made of one or more panes, each pane a
 *    pseudo-terminal running its own program. A session has one
 *    current window; a window has one active pane. Session names
 *    must be unique (default: numbers from 0); window names need
 *    not be unique — windows are identified by session + index.
 *  - Sessions are persistent: they survive accidental
 *    disconnection or intentional detaching (C-b d). Detaching
 *    ends the client only — the session and its programs keep
 *    running. attach-session [-d] attaches (and -d detaches
 *    every other client); new-session -A attaches if the session
 *    exists, creates it if not (-D also detaches the others);
 *    new-session -d creates detached. attach with no target
 *    prefers the most recently used UNATTACHED session.
 *  - kill-session destroys the session, closing its windows and
 *    detaching its clients. kill-server kills the server, the
 *    clients and all sessions. exit-empty (on by default) makes
 *    the server exit when there are no active sessions.
 *  - What tmux does NOT do: survive a reboot. The server is
 *    in-memory; a reboot ends every session. tmux-resurrect /
 *    tmux-continuum add that by saving layout + cwd to disk and
 *    restoring them (programs opt-in). Lucid copies exactly
 *    that split: see buildRestorePlan.
 *
 * Lucid mapping (this file is the model; the Electron main
 * process is the server — electron/services/tmuxSessionRegistry
 * — and each renderer window is a client):
 *  - tmux session  -> LucidSession: a named workspace.
 *  - tmux window   -> one Lucid tab-strip tab... no: one
 *    WINDOW here is a tab's split group. Lucid tabs are the
 *    windows: each tab is a window, and a split group over tabs
 *    is one window with several panes. The capture mapping lives
 *    in src/stores/lucidSessionStore.ts (tabsToSessionWindows):
 *    an ungrouped tab is a window with one pane; a split group
 *    is one window whose panes are the group's leaves.
 *  - tmux pane     -> one PTY, i.e. one Lucid tab id. A pane's
 *    id IS its tab id, so layout leaves round-trip to tabs.
 *  - tmux client   -> one Lucid renderer window.
 *  - tmux server   -> the Electron main process (owns node-pty).
 *
 * Honest boundary (Gary's call lives here, not hidden): when
 * the APP quits, the PTYs die with the main process — exactly
 * like a tmux server dying on reboot. What survives an app
 * restart is the resurrect-grade snapshot: session/window/pane
 * layout + cwd + titles, restored with FRESH shells. While the
 * app is alive, detaching a session keeps its PTYs running —
 * that half is real tmux semantics, not a snapshot.
 *
 * This module is pure: no Electron, no node-pty, no DOM, no
 * store imports. Every function is total over its inputs and
 * returns a result object ({ ok, state, ... } | { ok: false,
 * error, state }) instead of throwing, so the renderer and the
 * IPC layer can show the error instead of crashing.
 */

export type LucidPaneLayout =
  | { type: 'leaf'; paneId: string }
  | {
      type: 'split';
      id: string;
      direction: 'vertical' | 'horizontal';
      sizes: [number, number];
      first: LucidPaneLayout;
      second: LucidPaneLayout;
    };

export interface LucidSessionPane {
  /** The pane's id — for Lucid this IS the tab id (one PTY per tab). */
  id: string;
  /** The Lucid tab this pane renders as. Same as id today. */
  tabId: string;
  /** Working directory the shell runs (or re-starts) in. */
  cwd: string;
  /** Tab title, when the tab was renamed. */
  title?: string;
  /**
   * Is a live PTY behind this pane right now? True while the app
   * is alive and the shell runs; false after an app restart
   * (restore with a fresh shell) or after the shell exited.
   */
  shellAlive: boolean;
}

export interface LucidSessionWindow {
  id: string;
  /** Window index inside the session — tmux fills gaps (0, 2 -> 1). */
  index: number;
  name: string;
  /** Split tree over this window's panes; null means one pane. */
  layout: LucidPaneLayout | null;
  panes: LucidSessionPane[];
  activePaneId: string | null;
}

export interface LucidSession {
  id: string;
  /** Unique across sessions (tmux: "Session name ... must be unique"). */
  name: string;
  createdAt: number;
  lastAttachedAt: number;
  /** Attached to >= 1 client right now. */
  attached: boolean;
  /** How many clients are attached (tmux allows many). */
  clientCount: number;
  /** Session working directory (tmux attach -c): new windows start here. */
  cwd: string;
  windows: LucidSessionWindow[];
  currentWindowId: string | null;
}

export interface LucidSessionRegistryState {
  version: 1;
  sessions: LucidSession[];
  /** The session the current client shows, or null when detached. */
  activeSessionId: string | null;
}

export interface LucidSessionSummary {
  id: string;
  name: string;
  windows: number;
  panes: number;
  attached: boolean;
  clientCount: number;
  createdAt: number;
  lastAttachedAt: number;
}

/** What a relaunch re-creates: layout + cwd, fresh shells. */
export interface LucidRestorePlanWindow {
  id: string;
  index: number;
  name: string;
  layout: LucidPaneLayout | null;
  panes: LucidSessionPane[];
  activePaneId: string | null;
}

export interface LucidRestorePlan {
  sessionId: string;
  sessionName: string;
  cwd: string;
  windows: LucidRestorePlanWindow[];
}

export const TMUX_SESSION_SNAPSHOT_VERSION = 1;

/** tmux session names: no ":" (the target separator), no "/",
 *  no empty name, at most 64 chars. Mirrors what tmux itself
 *  rejects in practice (cmd-new-session / session name checks). */
export const MAX_SESSION_NAME_LENGTH = 64;

export function validateSessionName(name: string): string | null {
  if (typeof name !== 'string' || name.trim().length === 0) {
    return 'session name must not be empty';
  }
  const trimmed = name.trim();
  if (trimmed === '.' || trimmed === '..') return 'session name must not be "." or ".."';
  if (trimmed.length > MAX_SESSION_NAME_LENGTH) {
    return `session name must be at most ${MAX_SESSION_NAME_LENGTH} characters`;
  }
  if (trimmed.includes(':')) return 'session name must not contain ":"';
  if (trimmed.includes('/')) return 'session name must not contain "/"';
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(trimmed)) return 'session name must not contain control characters';
  return null;
}

/** tmux's default names: "0", "1", "2", ... — lowest free number. */
export function defaultSessionName(state: LucidSessionRegistryState): string {
  const used = new Set(state.sessions.map((s) => s.name));
  let n = 0;
  while (used.has(String(n))) n++;
  return String(n);
}

export function emptyRegistryState(): LucidSessionRegistryState {
  return { version: 1, sessions: [], activeSessionId: null };
}

let idCounter = 0;

function newId(prefix: string): string {
  idCounter += 1;
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Date.now().toString(36);
  return `${prefix}-${rand}-${idCounter}`;
}

function lowestFreeWindowIndex(session: LucidSession): number {
  const used = new Set(session.windows.map((w) => w.index));
  let n = 0;
  while (used.has(n)) n++;
  return n;
}

function cloneState(state: LucidSessionRegistryState): LucidSessionRegistryState {
  return {
    version: 1,
    sessions: state.sessions.map((s) => ({
      ...s,
      windows: s.windows.map((w) => ({
        ...w,
        layout: w.layout ? (JSON.parse(JSON.stringify(w.layout)) as LucidPaneLayout) : null,
        panes: w.panes.map((p) => ({ ...p })),
      })),
    })),
    activeSessionId: state.activeSessionId,
  };
}

function findSession(
  state: LucidSessionRegistryState,
  sessionId: string,
): LucidSession | undefined {
  return state.sessions.find((s) => s.id === sessionId);
}

function resolveActiveAfterKill(state: LucidSessionRegistryState): string | null {
  if (state.sessions.length === 0) return null;
  // tmux detaches the client to another session; pick the most
  // recently attached remainder.
  let best = state.sessions[0];
  for (const s of state.sessions) {
    if (s.lastAttachedAt > best.lastAttachedAt) best = s;
  }
  return best.id;
}

function windowNameForCwd(cwd: string): string {
  const base = cwd.replace(/\/+$/, '').split('/').pop() ?? '';
  return base || 'shell';
}

export type CreateSessionResult =
  | { ok: true; state: LucidSessionRegistryState; session: LucidSession }
  | { ok: false; error: string; state: LucidSessionRegistryState };

/**
 * tmux new-session: one session, one window (index 0), one pane
 * running a shell in `cwd`, attached to the creating client.
 * Without a name the session takes the numeric default ("0").
 */
export function createSession(
  state: LucidSessionRegistryState,
  opts: { name?: string; cwd?: string; now?: number } = {},
): CreateSessionResult {
  const now = opts.now ?? Date.now();
  const name = (opts.name ?? defaultSessionName(state)).trim();
  const nameError = validateSessionName(name);
  if (nameError) return { ok: false, error: nameError, state };
  if (state.sessions.some((s) => s.name === name)) {
    return { ok: false, error: `session "${name}" already exists`, state };
  }
  const cwd = opts.cwd ?? '';
  const paneId = newId('pane');
  const session: LucidSession = {
    id: newId('lucid-session'),
    name,
    createdAt: now,
    lastAttachedAt: now,
    attached: true,
    clientCount: 1,
    cwd,
    windows: [
      {
        id: newId('window'),
        index: 0,
        name: windowNameForCwd(cwd),
        layout: { type: 'leaf', paneId },
        panes: [{ id: paneId, tabId: paneId, cwd, shellAlive: true }],
        activePaneId: paneId,
      },
    ],
    currentWindowId: null,
  };
  session.currentWindowId = session.windows[0].id;
  const next = cloneState(state);
  next.sessions.push(session);
  next.activeSessionId = session.id;
  return { ok: true, state: next, session };
}

export type AttachSessionResult =
  | { ok: true; state: LucidSessionRegistryState; session: LucidSession }
  | { ok: false; error: string; state: LucidSessionRegistryState };

/**
 * tmux attach-session: attach this client to an existing session.
 * -d (detachOthers) detaches every other client first, so the
 * client count stays 1 — the takeover. Without it, tmux allows
 * several clients on one session and the count grows.
 */
export function attachSession(
  state: LucidSessionRegistryState,
  sessionId: string,
  opts: { detachOthers?: boolean; now?: number } = {},
): AttachSessionResult {
  const session = findSession(state, sessionId);
  if (!session) return { ok: false, error: `no such session: ${sessionId}`, state };
  const next = cloneState(state);
  const target = findSession(next, sessionId)!;
  target.attached = true;
  target.clientCount = opts.detachOthers ? 1 : target.clientCount + 1;
  target.lastAttachedAt = opts.now ?? Date.now();
  next.activeSessionId = sessionId;
  return { ok: true, state: next, session: target };
}

export type DetachSessionResult =
  | { ok: true; state: LucidSessionRegistryState }
  | { ok: false; error: string; state: LucidSessionRegistryState };

/**
 * tmux detach-client: the client leaves; the session, its
 * windows, its panes and their programs are untouched. Detaching
 * an already-detached session is a no-op success — there is no
 * client left to kill, and nothing else to do.
 */
export function detachSession(
  state: LucidSessionRegistryState,
  sessionId: string,
  opts: { now?: number } = {},
): DetachSessionResult {
  const session = findSession(state, sessionId);
  if (!session) return { ok: false, error: `no such session: ${sessionId}`, state };
  void opts.now;
  const next = cloneState(state);
  const target = findSession(next, sessionId)!;
  target.attached = false;
  target.clientCount = 0;
  if (next.activeSessionId === sessionId) next.activeSessionId = null;
  return { ok: true, state: next };
}

export type AttachOrCreateResult =
  | { ok: true; state: LucidSessionRegistryState; session: LucidSession; created: boolean }
  | { ok: false; error: string; state: LucidSessionRegistryState };

/**
 * tmux new-session -A: attach if the session exists, create it
 * if it does not. The reliable "attach or create in one step".
 */
export function attachOrCreateSession(
  state: LucidSessionRegistryState,
  name: string,
  opts: { cwd?: string; now?: number } = {},
): AttachOrCreateResult {
  const existing = state.sessions.find((s) => s.name === name.trim());
  if (existing) {
    const attached = attachSession(state, existing.id, { now: opts.now });
    if (!attached.ok) return { ok: false, error: attached.error, state };
    return { ok: true, state: attached.state, session: attached.session, created: false };
  }
  const created = createSession(state, { name, cwd: opts.cwd, now: opts.now });
  if (!created.ok) return { ok: false, error: created.error, state };
  return { ok: true, state: created.state, session: created.session, created: true };
}

export type KillSessionResult =
  | { ok: true; state: LucidSessionRegistryState }
  | { ok: false; error: string; state: LucidSessionRegistryState };

/**
 * tmux kill-session: destroy the session, closing its windows
 * and detaching its clients. Other sessions are untouched.
 * When the last session goes, the registry is empty — tmux's
 * exit-empty: the server exits when no sessions remain.
 */
export function killSession(
  state: LucidSessionRegistryState,
  sessionId: string,
): KillSessionResult {
  if (!findSession(state, sessionId)) {
    return { ok: false, error: `no such session: ${sessionId}`, state };
  }
  const next = cloneState(state);
  next.sessions = next.sessions.filter((s) => s.id !== sessionId);
  if (next.activeSessionId === sessionId) {
    next.activeSessionId = resolveActiveAfterKill(next);
  }
  return { ok: true, state: next };
}

/** tmux kill-server: destroy every session. */
export function killAllSessions(state: LucidSessionRegistryState): LucidSessionRegistryState {
  void state;
  return emptyRegistryState();
}

export type RenameSessionResult =
  | { ok: true; state: LucidSessionRegistryState; session: LucidSession }
  | { ok: false; error: string; state: LucidSessionRegistryState };

/** tmux rename-session (C-b $). Names stay unique. */
export function renameSession(
  state: LucidSessionRegistryState,
  sessionId: string,
  newName: string,
): RenameSessionResult {
  const name = newName.trim();
  const nameError = validateSessionName(name);
  if (nameError) return { ok: false, error: nameError, state };
  const session = findSession(state, sessionId);
  if (!session) return { ok: false, error: `no such session: ${sessionId}`, state };
  if (state.sessions.some((s) => s.id !== sessionId && s.name === name)) {
    return { ok: false, error: `session "${name}" already exists`, state };
  }
  const next = cloneState(state);
  const target = findSession(next, sessionId)!;
  target.name = name;
  return { ok: true, state: next, session: target };
}

export type AddWindowResult =
  | { ok: true; state: LucidSessionRegistryState; window: LucidSessionWindow }
  | { ok: false; error: string; state: LucidSessionRegistryState };

/**
 * tmux new-window: the window takes the lowest free index in the
 * session (gaps are filled) and becomes the current window. The
 * caller's index is a hint only — the registry owns numbering.
 */
export function addWindow(
  state: LucidSessionRegistryState,
  sessionId: string,
  window: LucidSessionWindow,
): AddWindowResult {
  const session = findSession(state, sessionId);
  if (!session) return { ok: false, error: `no such session: ${sessionId}`, state };
  const next = cloneState(state);
  const target = findSession(next, sessionId)!;
  const placed: LucidSessionWindow = {
    ...window,
    index: lowestFreeWindowIndex(target),
    layout: window.layout ? (JSON.parse(JSON.stringify(window.layout)) as LucidPaneLayout) : null,
    panes: window.panes.map((p) => ({ ...p })),
  };
  target.windows.push(placed);
  target.windows.sort((a, b) => a.index - b.index);
  target.currentWindowId = placed.id;
  return { ok: true, state: next, window: placed };
}

export type RemoveWindowResult =
  | { ok: true; state: LucidSessionRegistryState; sessionDestroyed: boolean }
  | { ok: false; error: string; state: LucidSessionRegistryState };

/**
 * tmux kill-window: remove the window. Removing the LAST window
 * destroys the session — tmux has no session with no windows.
 * Otherwise the current window re-resolves to the lowest-index
 * remaining window when the current one was removed.
 */
export function removeWindow(
  state: LucidSessionRegistryState,
  sessionId: string,
  windowIndex: number,
): RemoveWindowResult {
  const session = findSession(state, sessionId);
  if (!session) return { ok: false, error: `no such session: ${sessionId}`, state };
  if (!session.windows.some((w) => w.index === windowIndex)) {
    return { ok: false, error: `no window ${windowIndex} in session ${session.name}`, state };
  }
  const next = cloneState(state);
  const target = findSession(next, sessionId)!;
  const removed = target.windows.find((w) => w.index === windowIndex)!;
  target.windows = target.windows.filter((w) => w.index !== windowIndex);
  if (target.windows.length === 0) {
    next.sessions = next.sessions.filter((s) => s.id !== sessionId);
    if (next.activeSessionId === sessionId) {
      next.activeSessionId = resolveActiveAfterKill(next);
    }
    return { ok: true, state: next, sessionDestroyed: true };
  }
  if (target.currentWindowId === removed.id) {
    target.currentWindowId = [...target.windows].sort((a, b) => a.index - b.index)[0].id;
  }
  return { ok: true, state: next, sessionDestroyed: false };
}

export type AddPaneResult =
  | { ok: true; state: LucidSessionRegistryState }
  | { ok: false; error: string; state: LucidSessionRegistryState };

/**
 * tmux split-window: add a pane to a window. The new pane becomes
 * the active pane. The layout wraps: the old tree becomes the
 * first child of a new 50/50 split, the new pane the second.
 */
export function addPane(
  state: LucidSessionRegistryState,
  sessionId: string,
  windowIndex: number,
  pane: LucidSessionPane,
): AddPaneResult {
  const session = findSession(state, sessionId);
  if (!session) return { ok: false, error: `no such session: ${sessionId}`, state };
  const win = session.windows.find((w) => w.index === windowIndex);
  if (!win) {
    return { ok: false, error: `no window ${windowIndex} in session ${session.name}`, state };
  }
  if (win.panes.some((p) => p.id === pane.id)) {
    return { ok: false, error: `pane ${pane.id} already exists in window ${windowIndex}`, state };
  }
  const next = cloneState(state);
  const target = findSession(next, sessionId)!;
  const targetWin = target.windows.find((w) => w.index === windowIndex)!;
  const oldLayout = targetWin.layout ?? { type: 'leaf', paneId: targetWin.panes[0]?.id ?? pane.id };
  targetWin.layout = {
    type: 'split',
    id: newId('split'),
    direction: 'vertical',
    sizes: [50, 50],
    first: oldLayout,
    second: { type: 'leaf', paneId: pane.id },
  };
  targetWin.panes.push({ ...pane });
  targetWin.activePaneId = pane.id;
  return { ok: true, state: next };
}

export type SetPaneAliveResult =
  | { ok: true; state: LucidSessionRegistryState }
  | { ok: false; error: string; state: LucidSessionRegistryState };

/** Mark a pane's shell live/dead (PTY exit, or restore after restart). */
export function setPaneAlive(
  state: LucidSessionRegistryState,
  sessionId: string,
  paneId: string,
  alive: boolean,
): SetPaneAliveResult {
  const session = findSession(state, sessionId);
  if (!session) return { ok: false, error: `no such session: ${sessionId}`, state };
  if (!session.windows.some((w) => w.panes.some((p) => p.id === paneId))) {
    return { ok: false, error: `no pane ${paneId} in session ${session.name}`, state };
  }
  const next = cloneState(state);
  const target = findSession(next, sessionId)!;
  for (const w of target.windows) {
    for (const p of w.panes) {
      if (p.id === paneId) p.shellAlive = alive;
    }
  }
  return { ok: true, state: next };
}

/** tmux ls: one summary per session, in creation order. */
export function listSessions(state: LucidSessionRegistryState): LucidSessionSummary[] {
  return state.sessions.map((s) => ({
    id: s.id,
    name: s.name,
    windows: s.windows.length,
    panes: s.windows.reduce((n, w) => n + w.panes.length, 0),
    attached: s.attached,
    clientCount: s.clientCount,
    createdAt: s.createdAt,
    lastAttachedAt: s.lastAttachedAt,
  }));
}

/** tmux ls output: "name: N windows (created ...)". */
export function formatSessionList(state: LucidSessionRegistryState): string {
  return listSessions(state)
    .map((s) => `${s.name}: ${s.windows} windows (created ${new Date(s.createdAt).toString()})`)
    .join('\n');
}

/** Serialize the registry for disk (the resurrect snapshot). */
export function serializeSessions(state: LucidSessionRegistryState): string {
  return JSON.stringify({
    version: TMUX_SESSION_SNAPSHOT_VERSION,
    activeSessionId: state.activeSessionId,
    sessions: state.sessions,
  });
}

export type ParseSessionsResult =
  | { ok: true; state: LucidSessionRegistryState; dropped: number }
  | { ok: false; error: string; state: LucidSessionRegistryState };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidLayout(value: unknown): value is LucidPaneLayout {
  if (!isRecord(value)) return false;
  if (value.type === 'leaf') return typeof value.paneId === 'string';
  if (value.type === 'split') {
    return (
      typeof value.id === 'string' &&
      (value.direction === 'vertical' || value.direction === 'horizontal') &&
      Array.isArray(value.sizes) &&
      value.sizes.length === 2 &&
      typeof value.sizes[0] === 'number' &&
      typeof value.sizes[1] === 'number' &&
      isValidLayout(value.first) &&
      isValidLayout(value.second)
    );
  }
  return false;
}

function parsePane(value: unknown): LucidSessionPane | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || typeof value.tabId !== 'string') return null;
  if (typeof value.cwd !== 'string' || typeof value.shellAlive !== 'boolean') return null;
  if (value.title !== undefined && typeof value.title !== 'string') return null;
  return {
    id: value.id,
    tabId: value.tabId,
    cwd: value.cwd,
    ...(value.title !== undefined ? { title: value.title as string } : {}),
    shellAlive: value.shellAlive,
  };
}

function parseWindow(value: unknown): LucidSessionWindow | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || typeof value.index !== 'number') return null;
  if (typeof value.name !== 'string' || !Array.isArray(value.panes)) return null;
  if (value.layout !== null && !isValidLayout(value.layout)) return null;
  if (value.activePaneId !== null && typeof value.activePaneId !== 'string') return null;
  const panes: LucidSessionPane[] = [];
  for (const raw of value.panes as unknown[]) {
    const pane = parsePane(raw);
    if (!pane) return null;
    panes.push(pane);
  }
  return {
    id: value.id,
    index: value.index,
    name: value.name,
    layout: (value.layout as LucidPaneLayout | null) ?? null,
    panes,
    activePaneId: (value.activePaneId as string | null) ?? null,
  };
}

function parseSession(value: unknown): LucidSession | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || typeof value.name !== 'string') return null;
  if (validateSessionName(value.name) !== null) return null;
  if (typeof value.createdAt !== 'number' || typeof value.lastAttachedAt !== 'number') return null;
  if (!Array.isArray(value.windows)) return null;
  const windows: LucidSessionWindow[] = [];
  for (const raw of value.windows as unknown[]) {
    const win = parseWindow(raw);
    if (!win) return null;
    windows.push(win);
  }
  return {
    id: value.id,
    name: value.name,
    createdAt: value.createdAt,
    lastAttachedAt: value.lastAttachedAt,
    attached: value.attached === true,
    clientCount: typeof value.clientCount === 'number' ? value.clientCount : 0,
    cwd: typeof value.cwd === 'string' ? value.cwd : '',
    windows,
    currentWindowId: typeof value.currentWindowId === 'string' ? value.currentWindowId : null,
  };
}

/**
 * Parse a disk snapshot. Tolerant like historyStore's reader:
 * corrupt JSON or a wrong version is an error; a single bad
 * session/window/pane is DROPPED (counted) while the valid ones
 * load — one bad entry must never eat the whole restore. Unknown
 * fields are dropped. A parsed session is always detached on
 * load: the client that wrote it is gone.
 */
export function parseSessionsSnapshot(raw: unknown): ParseSessionsResult {
  const empty = emptyRegistryState();
  let parsed: unknown;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return { ok: false, error: 'session snapshot is not valid JSON', state: empty };
  }
  if (!isRecord(parsed)) return { ok: false, error: 'session snapshot is not an object', state: empty };
  if (parsed.version !== TMUX_SESSION_SNAPSHOT_VERSION) {
    return {
      ok: false,
      error: `unsupported session snapshot version: ${String(parsed.version)}`,
      state: empty,
    };
  }
  if (!Array.isArray(parsed.sessions)) {
    return { ok: false, error: 'session snapshot has no sessions array', state: empty };
  }
  const sessions: LucidSession[] = [];
  const seenNames = new Set<string>();
  let dropped = 0;
  for (const entry of parsed.sessions as unknown[]) {
    const session = parseSession(entry);
    if (!session || seenNames.has(session.name)) {
      dropped++;
      continue;
    }
    seenNames.add(session.name);
    // A loaded session is detached: whoever wrote the snapshot
    // is gone. Re-attach is explicit (attachSession).
    session.attached = false;
    session.clientCount = 0;
    sessions.push(session);
  }
  const activeSessionId =
    typeof parsed.activeSessionId === 'string' &&
    sessions.some((s) => s.id === parsed.activeSessionId)
      ? (parsed.activeSessionId as string)
      : null;
  return { ok: true, state: { version: 1, sessions, activeSessionId }, dropped };
}

/**
 * What a relaunch re-creates from a session: the full layout +
 * cwd per pane. Panes with shellAlive=false get FRESH shells in
 * their recorded cwd — the session-restore half of the model.
 * Panes with shellAlive=true keep their PTY (attach rebinds the
 * owner; the shell is never re-created).
 */
export function buildRestorePlan(session: LucidSession): LucidRestorePlan {
  return {
    sessionId: session.id,
    sessionName: session.name,
    cwd: session.cwd,
    windows: session.windows.map((w) => ({
      id: w.id,
      index: w.index,
      name: w.name,
      layout: w.layout ? (JSON.parse(JSON.stringify(w.layout)) as LucidPaneLayout) : null,
      panes: w.panes.map((p) => ({ ...p })),
      activePaneId: w.activePaneId,
    })),
  };
}
