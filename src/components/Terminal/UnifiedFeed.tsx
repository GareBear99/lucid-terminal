/**
 * The unified feed (heavy terminal work, 2026-11-13 — Warp is one
 * ordered list of blocks; Lucid had two surfaces taking turns:
 * the xterm grid below DEFCON 3, the BlockList at 3+).
 *
 * ONE list, one block model, per session: the feed reads the
 * active session's blocks — the live terminal transcript for a
 * terminal session (historyStore, restored blocks excluded,
 * exactly as BlockList read it), the agent session's own blocks
 * for an agent session — and renders them through the same
 * BlockList (same bottom-anchoring, same sticky follow-scroll,
 * same dividers, same per-block actions). The xterm stays the
 * live surface for terminal sessions below DEFCON 3 (interactive
 * programs need a live surface — that cost is documented in
 * BlockList.tsx, not silently removed); at DEFCON 3+ and in
 * agent sessions the list IS the feed.
 */

import { BlockList } from './BlockList';
import { AgentIntroCard } from './AgentIntroCard';
import {
  getFeedBlocksForSession,
  type TerminalSession,
} from '../../stores/sessionStore';
import { useHistoryStore } from '../../stores/historyStore';
import { useSessionStore } from '../../stores/sessionStore';

interface UnifiedFeedProps {
  /** The active session (null = no session — renders nothing). */
  session: TerminalSession | null;
  /** The terminal tab id (the BlockList's store path for terminal
   *  sessions). */
  tabId: string;
  /** Put a block's command back into the composer. */
  onReinput: (command: string) => void;
  /** The list IS the feed — it fills the terminal column
   *  (non-devmode at level 3+, and always for agent sessions,
   *  which have no xterm below). Default (devmode terminal):
   *  the capped panel above the live xterm. */
  fill?: boolean;
}

export function UnifiedFeed({ session, tabId, onReinput, fill = false }: UnifiedFeedProps) {
  const blocksByTab = useHistoryStore((s) => s.blocksByTab);
  const agentBlocksBySession = useSessionStore((s) => s.agentBlocksBySession);
  if (!session) return null;
  const blocks = getFeedBlocksForSession(session, blocksByTab, agentBlocksBySession);
  const isAgent = session?.kind === 'agent';
  const emptyState = isAgent ? (
    <AgentIntroCard
      cwd={session?.cwd}
      attachedCount={session?.attachedBlockIds?.length ?? 0}
    />
  ) : undefined;
  return (
    <BlockList
      tabId={tabId}
      onReinput={onReinput}
      fill={fill}
      blocks={blocks}
      emptyState={emptyState}
    />
  );
}
