/**
 * The unified feed (heavy terminal work, 2026-11-13; REBUILT
 * 2026-11-13 ~08:21 PST per Gary — Warp's in-tab agent flow,
 * see ~/workspace/warp-terminal-flow-2026-11-12.md).
 *
 * ONE list per tab: the tab's terminal blocks AND its agent
 * blocks interleaved in the same scroll stream (Warp's
 * BlockList: the agent works IN the terminal tab). One memory
 * per tab — the tab's input/history IS the conversation memory
 * (Gary, 2026-11-13 ~08:20 PST) — so agent prompts are
 * ordinary blocks in the tab's historyStore feed, read the same
 * way as terminal blocks. BlockList filters restored blocks
 * itself (the feed is the live session's transcript, never last
 * session's record). The mode pill only changes what the prompt
 * does; the feed is the same feed in both modes.
 *
 * The xterm stays the live surface for terminal sessions below
 * DEFCON 3 (interactive programs need a live surface — that
 * cost is documented in BlockList.tsx, not silently removed);
 * at DEFCON 3+ and in agent mode the list IS the feed.
 */

import { BlockList } from './BlockList';

interface UnifiedFeedProps {
  /** The terminal tab id (the feed's store path). */
  tabId: string;
  /** Put a block's command back into the composer. */
  onReinput: (command: string) => void;
  /** The list IS the feed — it fills the terminal column
   *  (non-devmode at level 3+, and always in agent mode, which
   *  has no xterm below). Default (devmode terminal):
   *  the capped panel above the live xterm. */
  fill?: boolean;
}

export function UnifiedFeed({ tabId, onReinput, fill = false }: UnifiedFeedProps) {
  // No explicit `blocks` prop: BlockList reads the tab's blocks
  // from historyStore itself and filters restored blocks (the
  // feed is the live session's transcript). Passing the list
  // explicitly would bypass that filter — the old agent-session
  // path did exactly that.
  return (
    <BlockList
      tabId={tabId}
      onReinput={onReinput}
      fill={fill}
    />
  );
}
