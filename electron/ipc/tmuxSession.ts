/**
 * IPC for Lucid sessions — the client/server wire.
 *
 * tmux's wire is a Unix socket in /tmp carrying commands from
 * short-lived clients to the long-lived server. Lucid's wire is
 * Electron IPC: the renderer (client) invokes these channels,
 * the main process (server, TmuxSessionRegistry) answers.
 *
 * Handlers validate their arguments and return `{ ok }` result
 * objects. Domain errors (unknown session, duplicate name) are
 * VALUES, never throws, so the renderer can show them instead
 * of surfacing an IPC exception. Only a missing handler or a
 * registry without a file store can throw, and neither happens
 * through these channels.
 *
 * Channels (all `lucid-session:*` — distinct from the existing
 * `terminal:*` PTY channels and the `terminal:detach` window
 * channels, which this does not replace):
 *  - list            -> { ok, sessions: summaries }   (tmux ls)
 *  - create          -> { ok, session }               (tmux new)
 *  - attach          -> { ok, session }               (tmux attach)
 *  - detach          -> { ok }                        (tmux detach)
 *  - attach-or-create-> { ok, session, created }      (tmux new -A)
 *  - kill            -> { ok }                        (tmux kill-session)
 *  - rename          -> { ok, session }               (tmux rename-session)
 *  - snapshot        -> { ok, snapshot }              (serialized registry)
 *  - save            -> { ok }                        (write the disk snapshot)
 *  - track-pane      -> { ok }                        (a PTY now lives in a session)
 *  - mark-pane-exited-> { ok }                        (a pane's shell exited on its own)
 *
 * track-pane / mark-pane-exited are the liveness bridge: the
 * renderer tells main which PTYs belong to which session (called
 * from terminalStore on tab create / close / shell exit), so
 * kill-session destroys exactly those shells. They are
 * fire-and-forget from the renderer — a failure never breaks tab
 * creation — and idempotent in the registry.
 */
import type { IpcMain } from 'electron';
import type { TmuxSessionRegistry } from '../services/tmuxSessionRegistry';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

type Result = { ok: boolean; error?: string; [key: string]: unknown };

function fail(error: string): Result {
  return { ok: false, error };
}

export function setupTmuxSessionHandlers(
  ipcMain: IpcMain,
  registry: TmuxSessionRegistry,
  opts?: {
    /**
     * Called when a client attaches to a session, with the
     * session id and the attaching sender. Main uses it to
     * re-target the session's PTY output at the new window
     * (setTerminalOwner per pane) — the PTYs themselves never
     * move, are never re-created, and are never destroyed by
     * an attach.
     */
    onAttach?: (sessionId: string, sender: Electron.WebContents) => void;
  },
): void {
  ipcMain.handle('lucid-session:list', () => {
    return { ok: true, sessions: registry.listSessions() };
  });

  ipcMain.handle('lucid-session:create', (_event, name?: unknown, cwd?: unknown) => {
    if (!isOptionalString(name) || !isOptionalString(cwd)) {
      return fail('lucid-session:create expects (name?: string, cwd?: string)');
    }
    try {
      const session = registry.createSession(name, cwd);
      return { ok: true, session };
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle('lucid-session:attach', (_event, sessionId?: unknown, detachOthers?: unknown) => {
    if (!isNonEmptyString(sessionId)) {
      return fail('lucid-session:attach expects a session id');
    }
    if (detachOthers !== undefined && typeof detachOthers !== 'boolean') {
      return fail('lucid-session:attach expects detachOthers to be a boolean');
    }
    try {
      // One client id per window: the sender's WebContents id is
      // stable for the window's life, so re-attaching from the
      // same window switches it instead of stacking clients.
      const senderId = (_event as { sender?: { id?: unknown } })?.sender?.id;
      const clientId =
        typeof senderId === 'number' ? `webcontents-${senderId}` : 'ipc-unknown';
      const session = registry.attachSession(sessionId, clientId, {
        detachOthers: detachOthers === true,
      });
      opts?.onAttach?.(sessionId, _event.sender);
      return { ok: true, session };
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle('lucid-session:detach', (_event, sessionId?: unknown) => {
    if (!isNonEmptyString(sessionId)) {
      return fail('lucid-session:detach expects a session id');
    }
    try {
      registry.detachSession(sessionId);
      return { ok: true };
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle('lucid-session:attach-or-create', (_event, name?: unknown, cwd?: unknown) => {
    if (!isNonEmptyString(name) || !isOptionalString(cwd)) {
      return fail('lucid-session:attach-or-create expects (name: string, cwd?: string)');
    }
    try {
      const { session, created } = registry.attachOrCreateSession(name, cwd);
      opts?.onAttach?.(session.id, _event.sender);
      return { ok: true, session, created };
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle('lucid-session:kill', (_event, sessionId?: unknown) => {
    if (!isNonEmptyString(sessionId)) {
      return fail('lucid-session:kill expects a session id');
    }
    try {
      registry.killSession(sessionId);
      return { ok: true };
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle('lucid-session:rename', (_event, sessionId?: unknown, name?: unknown) => {
    if (!isNonEmptyString(sessionId) || !isNonEmptyString(name)) {
      return fail('lucid-session:rename expects (sessionId: string, name: string)');
    }
    try {
      const session = registry.renameSession(sessionId, name);
      return { ok: true, session };
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle('lucid-session:snapshot', () => {
    return { ok: true, snapshot: registry.snapshot() };
  });

  ipcMain.handle('lucid-session:save', () => {
    try {
      registry.save();
      return { ok: true };
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle('lucid-session:track-pane', (_event, sessionId?: unknown, paneId?: unknown) => {
    if (!isNonEmptyString(sessionId) || !isNonEmptyString(paneId)) {
      return fail('lucid-session:track-pane expects (sessionId: string, paneId: string)');
    }
    try {
      registry.trackPane(sessionId, paneId);
      return { ok: true };
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });

  ipcMain.handle('lucid-session:mark-pane-exited', (_event, paneId?: unknown) => {
    if (!isNonEmptyString(paneId)) {
      return fail('lucid-session:mark-pane-exited expects a pane id');
    }
    registry.markPaneExited(paneId);
    return { ok: true };
  });
}
