/**
 * The server, in Lucid's own implementation — main-process registry.
 *
 * Upstream tmux keeps ALL state in a single server process
 * (wiki "Getting Started": "tmux keeps all its state in a
 * single main process, called the tmux server ... started
 * automatically ... and by default exits when there are no
 * running programs"). Clients attach/detach over a socket;
 * detaching ends the client only; kill-session destroys one
 * session; kill-server destroys everything; exit-empty (on by
 * default) exits the server when no sessions remain.
 *
 * Here the Electron main process IS the server: it owns the
 * node-pty shells, and each renderer window is a client. This
 * registry is the server's bookkeeping — the session list (the
 * pure model in src/lib/tmuxSession.ts) plus which panes have
 * live PTYs and which clients are attached where. It does NOT
 * create PTYs itself: terminal:create (electron/ipc/terminal.ts)
 * stays the only PTY creator, so output routing
 * (terminalOwners) is untouched. The registry only tracks pane
 * ids (via trackPane, called when a PTY is created) so that
 * killSession/killServer can destroy exactly the right shells,
 * and it owns the disk snapshot that survives an app restart.
 *
 * Both collaborators are injected: the PTY host (main passes
 * shellManager's destroy + the owner clearing) and the file
 * store (main passes a userData JSON file). No Electron import,
 * no node-pty import, no fs import — the registry runs in plain
 * node with fakes, which is how it is tested.
 *
 * Restart semantics (the honest tmux boundary): the app quitting
 * kills the PTYs, exactly like a tmux server dying on reboot.
 * load() therefore restores every pane with shellAlive=false —
 * layout + cwd survive, shells restart fresh (tmux-resurrect
 * semantics). While the app is alive, detach never destroys a
 * PTY: that half is real tmux semantics.
 */

/* eslint-disable no-console */
import {
  attachOrCreateSession,
  attachSession as attachSessionPure,
  buildRestorePlan,
  createSession as createSessionPure,
  detachSession as detachSessionPure,
  emptyRegistryState,
  killAllSessions,
  killSession as killSessionPure,
  listSessions,
  parseSessionsSnapshot,
  renameSession as renameSessionPure,
  serializeSessions,
  setPaneAlive,
  type LucidSession,
  type LucidSessionRegistryState,
  type LucidSessionSummary,
} from '../../src/lib/tmuxSession';

/** The PTY host: how the registry destroys a pane's shell. */
export interface TmuxSessionPtyHost {
  destroyPane: (paneId: string) => void;
}

/** The disk snapshot store: how the registry saves/loads. */
export interface TmuxSessionFileStore {
  read: () => string | null;
  write: (data: string) => void;
}

export class TmuxSessionRegistry {
  private state: LucidSessionRegistryState = emptyRegistryState();
  /** session id -> live pane ids (PTYs that exist right now). */
  private livePanes = new Map<string, Set<string>>();
  /** client id -> session id it is attached to. */
  private clients = new Map<string, string>();

  constructor(
    private readonly ptyHost: TmuxSessionPtyHost,
    private readonly fileStore?: TmuxSessionFileStore,
  ) {}

  /** tmux new-session: create + attach to the creating client. */
  createSession(name?: string, cwd?: string): LucidSession {
    const result = createSessionPure(this.state, { name, cwd, now: Date.now() });
    if (!result.ok) throw new Error(result.error);
    this.state = result.state;
    this.livePanes.set(result.session.id, new Set());
    return result.session;
  }

  /** tmux attach-session: a client attaches to a session. */
  attachSession(sessionId: string, clientId: string, opts?: { detachOthers?: boolean }): LucidSession {
    if (!this.state.sessions.some((s) => s.id === sessionId)) {
      throw new Error(`no such session: ${sessionId}`);
    }
    // Switching sessions (tmux switch-client): leave the old one.
    const previous = this.clients.get(clientId);
    if (previous && previous !== sessionId) this.detachClient(clientId);
    const result = attachSessionPure(this.state, sessionId, {
      detachOthers: opts?.detachOthers,
      now: Date.now(),
    });
    if (!result.ok) throw new Error(result.error);
    this.state = result.state;
    this.clients.set(clientId, sessionId);
    return result.session;
  }

  /** A client leaves (window closed, detach): the session and
   *  its PTYs keep running. When the last client leaves, the
   *  session is detached — never destroyed. */
  detachClient(clientId: string): void {
    const sessionId = this.clients.get(clientId);
    if (!sessionId) return;
    this.clients.delete(clientId);
    const stillAttached = [...this.clients.values()].some((id) => id === sessionId);
    if (stillAttached) return;
    const result = detachSessionPure(this.state, sessionId);
    if (result.ok) this.state = result.state;
  }

  /** tmux detach-client -s: every client leaves this session. */
  detachSession(sessionId: string): void {
    if (!this.state.sessions.some((s) => s.id === sessionId)) {
      throw new Error(`no such session: ${sessionId}`);
    }
    for (const [clientId, attachedId] of [...this.clients.entries()]) {
      if (attachedId === sessionId) this.clients.delete(clientId);
    }
    const result = detachSessionPure(this.state, sessionId);
    if (result.ok) this.state = result.state;
  }

  /** tmux new-session -A. */
  attachOrCreateSession(name: string, cwd?: string): { session: LucidSession; created: boolean } {
    const result = attachOrCreateSession(this.state, name, { cwd, now: Date.now() });
    if (!result.ok) throw new Error(result.error);
    this.state = result.state;
    if (result.created) this.livePanes.set(result.session.id, new Set());
    return { session: result.session, created: result.created };
  }

  /** tmux kill-session: destroy the session's live PTYs, then
   *  drop the session. Other sessions are untouched. */
  killSession(sessionId: string): void {
    if (!this.state.sessions.some((s) => s.id === sessionId)) {
      throw new Error(`no such session: ${sessionId}`);
    }
    const panes = this.livePanes.get(sessionId) ?? new Set<string>();
    for (const paneId of [...panes]) this.destroyPane(paneId);
    this.livePanes.delete(sessionId);
    for (const [clientId, attachedId] of [...this.clients.entries()]) {
      if (attachedId === sessionId) this.clients.delete(clientId);
    }
    const result = killSessionPure(this.state, sessionId);
    if (result.ok) this.state = result.state;
  }

  /** tmux kill-server: destroy every live PTY, drop everything. */
  killServer(): void {
    for (const paneId of this.allLivePaneIds()) this.destroyPane(paneId);
    this.livePanes.clear();
    this.clients.clear();
    this.state = killAllSessions(this.state);
  }

  /** tmux rename-session. */
  renameSession(sessionId: string, name: string): LucidSession {
    const result = renameSessionPure(this.state, sessionId, name);
    if (!result.ok) throw new Error(result.error);
    this.state = result.state;
    return result.session;
  }

  /**
   * Record that a pane's PTY exists in a session (called when
   * terminal:create spawns it). The layout itself lives in the
   * renderer's snapshot; the registry tracks liveness so kill
   * knows exactly which shells to destroy.
   */
  trackPane(sessionId: string, paneId: string): void {
    const session = this.state.sessions.find((s) => s.id === sessionId);
    if (!session) throw new Error(`no such session: ${sessionId}`);
    let set = this.livePanes.get(sessionId);
    if (!set) {
      set = new Set<string>();
      this.livePanes.set(sessionId, set);
    }
    set.add(paneId);
    const marked = setPaneAlive(this.state, sessionId, paneId, true);
    if (marked.ok) this.state = marked.state;
  }

  /** A pane's shell exited on its own: no longer live. */
  markPaneExited(paneId: string): void {
    for (const [sessionId, set] of this.livePanes.entries()) {
      if (set.delete(paneId)) {
        const marked = setPaneAlive(this.state, sessionId, paneId, false);
        if (marked.ok) this.state = marked.state;
      }
    }
  }

  /** Live pane ids in a session (empty after a restart load). */
  getSessionPaneIds(sessionId: string): string[] {
    return [...(this.livePanes.get(sessionId) ?? new Set<string>())];
  }

  getSession(sessionId: string): LucidSession | undefined {
    return this.state.sessions.find((s) => s.id === sessionId);
  }

  /** tmux ls. */
  listSessions(): LucidSessionSummary[] {
    return listSessions(this.state);
  }

  /** The restore plan for a session (layout + cwd, fresh shells
   *  when nothing is live). */
  getRestorePlan(sessionId: string): ReturnType<typeof buildRestorePlan> | null {
    const session = this.getSession(sessionId);
    return session ? buildRestorePlan(session) : null;
  }

  /** True when no sessions remain — tmux's exit-empty. */
  isEmpty(): boolean {
    return this.state.sessions.length === 0;
  }

  /** The serialized snapshot (what save() writes). */
  snapshot(): string {
    return serializeSessions(this.syncShellAlive());
  }

  /** Persist the snapshot to the file store, if one was given. */
  save(): void {
    this.fileStore?.write(this.snapshot());
  }

  /**
   * Load the snapshot from the file store, if one was given.
   * No snapshot / a corrupt one starts empty — never throws.
   * Every restored pane comes back with shellAlive=false: the
   * app quit, so the PTYs died with it (tmux-resurrect
   * semantics — layout + cwd survive, shells restart fresh).
   */
  load(): void {
    let raw: string | null = null;
    try {
      raw = this.fileStore?.read() ?? null;
    } catch (err) {
      console.error('tmux session snapshot read failed:', err);
      return;
    }
    if (!raw) return;
    const parsed = parseSessionsSnapshot(raw);
    if (!parsed.ok) {
      console.error('tmux session snapshot corrupt, starting empty:', parsed.error);
      return;
    }
    this.state = parsed.state;
    this.livePanes.clear();
    this.clients.clear();
    for (const session of this.state.sessions) {
      this.livePanes.set(session.id, new Set());
      for (const win of session.windows) {
        for (const pane of win.panes) pane.shellAlive = false;
      }
    }
    if (parsed.dropped > 0) {
      console.error(`tmux session snapshot: dropped ${parsed.dropped} invalid session(s)`);
    }
  }

  private allLivePaneIds(): string[] {
    const ids: string[] = [];
    for (const set of this.livePanes.values()) ids.push(...set);
    return ids;
  }

  private destroyPane(paneId: string): void {
    try {
      this.ptyHost.destroyPane(paneId);
    } catch (err) {
      console.error(`tmux session registry: failed to destroy pane ${paneId}:`, err);
    }
  }

  /** Fold the live-pane sets back into the pure state before
   *  serializing, so the snapshot never claims a dead shell. */
  private syncShellAlive(): LucidSessionRegistryState {
    const live = new Set(this.allLivePaneIds());
    return {
      ...this.state,
      sessions: this.state.sessions.map((s) => ({
        ...s,
        windows: s.windows.map((w) => ({
          ...w,
          panes: w.panes.map((p) => ({ ...p, shellAlive: live.has(p.id) })),
        })),
      })),
    };
  }
}
