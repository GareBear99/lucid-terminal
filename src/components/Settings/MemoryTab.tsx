/**
 * Memory tab — Settings > Memory (Gary, 2026-11-14 ~14:47 PST:
 * "there need to be a memory tab in settings under the AI tab
 * now"; direction 2026-11-13: AI memory as a whole Settings
 * tab, alongside Security).
 *
 * REAL STORES ONLY — every section reads a store that exists.
 * Nothing here is invented:
 * - Chat memory: aiStore sessions/messages (sessions.json).
 *   Chats are NOT per-profile in this build — sessions.json
 *   is one app-wide file — so the tab says so instead of
 *   pretending otherwise.
 * - Terminal-agent memory: command history
 *   (commandHistoryStore, per-profile, max 500), plans
 *   (planStore, per-profile, max 100), and the terminal
 *   feed's command blocks (historyStore, per tab). One
 *   memory per tab (Gary, 2026-11-13): agent prompts are
 *   blocks in the feed, not a separate store — so the
 *   terminal side counts command blocks and agent blocks
 *   separately out of the same feed.
 * - LLMBuilder memory: the driving intelligence's working
 *   memory — the agent-prompt / agent-response blocks in
 *   the feed. It can ONLY be cleared (Clear agent memory),
 *   never downloaded, and it is never included in the
 *   memory download (Gary, 2026-11-13: "LLMBuilder memory
 *   just cleared (no download)").
 * - Tick stream: the live SPSC rings — the event-log
 *   channel (capacity 512) and the AI chat causal-tick
 *   channel (capacity 256). Both channels, every ring in
 *   Lucid (verified: these are the only two SpscRing
 *   instances in src). Rates are MEASURED live from the
 *   counters' deltas (see ringStats.ts) — nothing is
 *   hardcoded, and Gary's recollection ("15k/s from a 1.8M
 *   run") is unverified, so the view shows whatever the
 *   counters actually measure. The event channel also shows
 *   WHICH producer the refusals came from, by event type —
 *   a flooded producer is visible, not hidden behind the
 *   channel total (ring update, 2026-11-14).
 *
 * GUEST — the blank-slate rule holds: a guest has no memory.
 * In guest the memory sections show the empty state only:
 * no history, no download, no clears, no LLMBuilder memory.
 * The owner's memory is never surfaced (the stores' veils
 * already stash it; the tab does not read the stash). The
 * tick stream IS shown in guest — it is live ring telemetry,
 * not memory; a guest's own ticks flow through it.
 *
 * DOWNLOAD — the profile's memory as JSON (command history,
 * plans, chats, terminal command blocks). Agent blocks are
 * excluded (see above). Built by buildMemoryExport; the
 * download itself is the Settings export pattern (Blob +
 * a.click).
 */
import { useEffect, useRef, useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { useAIStore } from '../../stores/aiStore';
import {
  useCommandHistoryStore,
} from '../../stores/commandHistoryStore';
import {
  usePlanStore,
  clearProfilePlans,
  planStepCounts,
} from '../../stores/planStore';
import { useHistoryStore } from '../../stores/historyStore';
import { useProfileStore, isGuestProfile } from '../../stores/profileStore';
import { useEventLogStore, eventRing } from '../../stores/eventLogStore';
import {
  aiChatTickRing,
  aiChatTickCounts,
  getRecentAiChatTicks,
} from '../../lib/aiChatTicks';
import { EVENT_RING_CAPACITY } from '../../lib/eventLog';
import { AI_CHAT_TICK_RING_CAPACITY } from '../../lib/aiChatTicks';
import { computeRatePerSec, formatRatePerSec } from '../../lib/ringStats';
import { buildMemoryExport, memoryExportFilename } from '../../lib/memoryExport';
import { Tooltip } from '../Tooltip/Tooltip';
import type { TerminalBlock } from '../../types';

/** One channel's live reading for the tick-stream view. */
interface ChannelLive {
  id: 'event' | 'tick';
  label: string;
  capacity: number;
  inFlight: number;
  accepted: number;
  drained: number;
  refused: number;
  /** Top refused producers (event channel only — the tick
   *  channel has one producer, tick issuance, so it has no
   *  breakdown). Most-refused first, at most 3. */
  refusedBy: { label: string; count: number }[];
  acceptedPerSec: number;
  drainedPerSec: number;
  latest: string | null;
}

interface RawChannel {
  capacity: number;
  inFlight: number;
  accepted: number;
  drained: number;
  refused: number;
  refusedBy: { label: string; count: number }[];
  latest: string | null;
}

function readChannels(): { event: RawChannel; tick: RawChannel } {
  const eventState = useEventLogStore.getState();
  const tickCounts = aiChatTickCounts();
  const recentTicks = getRecentAiChatTicks();
  const lastTick = recentTicks[recentTicks.length - 1];
  const lastEvent = eventState.events[0];
  // The flooded producer, most-refused first (top 3) — the
  // per-type refusal map the store keeps. A type absent from
  // the map was never refused.
  const refusedBy = Object.entries(eventState.refusedByType)
    .map(([label, count]) => ({ label, count: count ?? 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  return {
    event: {
      capacity: EVENT_RING_CAPACITY,
      inFlight: eventRing.length,
      accepted: eventState.acceptedCount,
      drained: eventState.drainedCount,
      refused: eventState.refusedCount,
      refusedBy,
      latest: lastEvent ? lastEvent.what : null,
    },
    tick: {
      capacity: AI_CHAT_TICK_RING_CAPACITY,
      inFlight: aiChatTickRing.length,
      accepted: tickCounts.accepted,
      drained: tickCounts.drained,
      refused: tickCounts.refused,
      refusedBy: [],
      latest: lastTick
        ? `tick ${lastTick.tick} · chat ${lastTick.sessionId.slice(0, 12)}`
        : null,
    },
  };
}

function toLive(
  id: 'event' | 'tick',
  label: string,
  raw: RawChannel,
  prev: { atMs: number; accepted: number; drained: number } | null,
  nowMs: number,
): ChannelLive {
  return {
    id,
    label,
    capacity: raw.capacity,
    inFlight: raw.inFlight,
    accepted: raw.accepted,
    drained: raw.drained,
    refused: raw.refused,
    refusedBy: raw.refusedBy,
    acceptedPerSec: computeRatePerSec(
      prev ? { count: prev.accepted, atMs: prev.atMs } : null,
      { count: raw.accepted, atMs: nowMs },
    ),
    drainedPerSec: computeRatePerSec(
      prev ? { count: prev.drained, atMs: prev.atMs } : null,
      { count: raw.drained, atMs: nowMs },
    ),
    latest: raw.latest,
  };
}

/** Live ring stats, polled — the tick-stream view's data.
 *  Polls the rings' counters (reads only — sampling never
 *  writes into either channel). */
function useRingStreamStats(pollMs = 500): ChannelLive[] {
  const [stats, setStats] = useState<ChannelLive[]>(() => {
    const raw = readChannels();
    const now = Date.now();
    return [
      toLive('event', 'Event log', raw.event, null, now),
      toLive('tick', 'AI chat ticks', raw.tick, null, now),
    ];
  });
  const prevRef = useRef<{
    atMs: number;
    event: { accepted: number; drained: number };
    tick: { accepted: number; drained: number };
  } | null>(null);

  useEffect(() => {
    const sample = () => {
      const now = Date.now();
      const raw = readChannels();
      const prev = prevRef.current;
      prevRef.current = {
        atMs: now,
        event: { accepted: raw.event.accepted, drained: raw.event.drained },
        tick: { accepted: raw.tick.accepted, drained: raw.tick.drained },
      };
      setStats([
        toLive(
          'event',
          'Event log',
          raw.event,
          prev ? { atMs: prev.atMs, ...prev.event } : null,
          now,
        ),
        toLive(
          'tick',
          'AI chat ticks',
          raw.tick,
          prev ? { atMs: prev.atMs, ...prev.tick } : null,
          now,
        ),
      ]);
    };
    sample();
    const id = setInterval(sample, pollMs);
    return () => clearInterval(id);
  }, [pollMs]);

  return stats;
}

/** Count feed blocks by kind across all tabs. */
function countFeedBlocks(blocksByTab: Record<string, TerminalBlock[]>): {
  tabs: number;
  commands: number;
  agentPrompts: number;
  agentResponses: number;
} {
  let commands = 0;
  let agentPrompts = 0;
  let agentResponses = 0;
  for (const blocks of Object.values(blocksByTab)) {
    for (const b of blocks) {
      if (b.kind === 'agent-prompt') agentPrompts += 1;
      else if (b.kind === 'agent-response') agentResponses += 1;
      else commands += 1;
    }
  }
  return {
    tabs: Object.values(blocksByTab).filter((b) => b.length > 0).length,
    commands,
    agentPrompts,
    agentResponses,
  };
}

export function MemoryTab() {
  const profiles = useProfileStore((s) => s.profiles);
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  const sessions = useAIStore((s) => s.sessions);
  const isSessionsLoaded = useAIStore((s) => s.isSessionsLoaded);
  const clearSessions = useAIStore((s) => s.clearSessions);
  const commandEntries = useCommandHistoryStore((s) => s.entries);
  const clearCommandHistory = useCommandHistoryStore((s) => s.clear);
  const plans = usePlanStore((s) => s.plans);
  const blocksByTab = useHistoryStore((s) => s.blocksByTab);
  const clearBlocks = useHistoryStore((s) => s.clearBlocks);
  const clearAgentBlocks = useHistoryStore((s) => s.clearAgentBlocks);
  const ringStats = useRingStreamStats();

  const active =
    profiles.find((p) => p.id === activeProfileId) ?? profiles[0] ?? null;
  const isGuest = isGuestProfile(active);

  // The chat list loads on first open (the AI chat loads it on
  // its own mount; the tab must not show "0 chats" for a loaded
  // owner who never opened the chat this session). Guarded by
  // the store's loaded flag, and never in guest — a guest never
  // loads the owner's sessions off disk.
  const loadSessions = useAIStore((s) => s.loadSessions);
  useEffect(() => {
    if (!isGuest && !isSessionsLoaded) {
      void loadSessions();
    }
  }, [isGuest, isSessionsLoaded, loadSessions]);

  const feedCounts = countFeedBlocks(blocksByTab);
  const totalMessages = sessions.reduce(
    (n, s) => n + (s.messages?.length ?? 0),
    0,
  );
  const planSteps = plans.reduce(
    (acc, p) => {
      const c = planStepCounts(p);
      return { done: acc.done + c.done, total: acc.total + c.total };
    },
    { done: 0, total: 0 },
  );

  const handleDownload = () => {
    if (!active || isGuest) return;
    const data = buildMemoryExport(active.id, active.name);
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = memoryExportFilename(active.id);
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearChats = async () => {
    if (!confirm('Clear all chats? This cannot be undone.')) return;
    await clearSessions();
  };

  const handleClearCommands = () => {
    if (!confirm('Clear the command history? This cannot be undone.')) return;
    clearCommandHistory();
  };

  const handleClearPlans = () => {
    if (!active) return;
    if (!confirm('Clear all plans? This cannot be undone.')) return;
    clearProfilePlans(active.id);
  };

  const handleClearFeed = () => {
    if (
      !confirm(
        'Clear the whole terminal feed — every tab’s blocks? This cannot be undone.',
      )
    ) {
      return;
    }
    for (const tabId of Object.keys(blocksByTab)) clearBlocks(tabId);
  };

  const handleClearAgentMemory = () => {
    if (
      !confirm(
        'Clear the driving intelligence’s working memory — all agent prompts and replies? Terminal commands are kept. This cannot be undone.',
      )
    ) {
      return;
    }
    clearAgentBlocks();
  };

  return (
    <div data-testid="memory-tab" className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">
          Memory
        </h3>
        <p className="text-xs leading-[1.5] text-[var(--text-muted)] mb-3">
          {active
            ? `What Lucid remembers for ${active.name} — chat memory and terminal-agent memory, kept separate.`
            : 'What Lucid remembers — chat memory and terminal-agent memory, kept separate.'}
        </p>
        {!isGuest && active && (
          <Tooltip content="Download this profile’s memory as JSON">
            <button
              onClick={handleDownload}
              className="btn btn-primary"
              data-testid="memory-download"
            >
              <Download size={16} />
              Download memory
            </button>
          </Tooltip>
        )}
      </section>

      {isGuest ? (
        <section>
          <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">
            No memory in guest
          </h3>
          <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
            Guests are a blank slate: no history, no plans, no chats, no
            LLMBuilder memory. Anything typed in this session is dropped
            when the guest leaves, and nothing here is downloaded.
          </p>
        </section>
      ) : (
        <>
          <section>
            <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">
              Chat memory
            </h3>
            <p className="text-xs leading-[1.5] text-[var(--text-muted)] mb-3">
              {sessions.length} {sessions.length === 1 ? 'chat' : 'chats'} ·{' '}
              {totalMessages} {totalMessages === 1 ? 'message' : 'messages'}.
              Chats live in sessions.json (app-wide) — they are not scoped
              to one profile in this build.
            </p>
            {sessions.length > 0 && (
              <ul className="space-y-2 mb-3">
                {sessions.slice(0, 20).map((s) => (
                  <li
                    key={s.id}
                    data-testid="memory-chat-row"
                    className="flex items-center gap-3 px-3 py-2 bg-[var(--bg-tertiary)] rounded-md"
                  >
                    <span className="flex-1 min-w-0 truncate text-sm text-[var(--text-primary)]">
                      {s.title || 'Untitled chat'}
                    </span>
                    <span className="shrink-0 text-xs text-[var(--text-muted)]">
                      {s.messages?.length ?? 0}{' '}
                      {(s.messages?.length ?? 0) === 1 ? 'message' : 'messages'}
                    </span>
                  </li>
                ))}
                {sessions.length > 20 && (
                  <li className="text-xs text-[var(--text-muted)] px-3">
                    +{sessions.length - 20} more
                  </li>
                )}
              </ul>
            )}
            <Tooltip content="Clear all chats">
              <button
                onClick={() => void handleClearChats()}
                className="btn btn-danger"
                data-testid="memory-clear-chats"
              >
                <Trash2 size={16} />
                Clear chats
              </button>
            </Tooltip>
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">
              Terminal-agent memory
            </h3>
            <p className="text-xs leading-[1.5] text-[var(--text-muted)] mb-3">
              The terminal side: commands, plans, and the feed. One memory
              per tab — agent prompts are blocks in the feed, not a
              separate store.
            </p>
            <ul className="space-y-2 mb-3">
              <li className="flex items-center gap-3 px-3 py-2 bg-[var(--bg-tertiary)] rounded-md">
                <span className="flex-1 min-w-0 text-sm text-[var(--text-primary)]">
                  Command history
                </span>
                <span className="shrink-0 text-xs text-[var(--text-muted)]">
                  {commandEntries.length} commands
                </span>
                <Tooltip content="Clear the command history">
                  <button
                    onClick={handleClearCommands}
                    className="btn btn-danger"
                    data-testid="memory-clear-commands"
                  >
                    <Trash2 size={16} />
                    Clear
                  </button>
                </Tooltip>
              </li>
              <li className="flex items-center gap-3 px-3 py-2 bg-[var(--bg-tertiary)] rounded-md">
                <span className="flex-1 min-w-0 text-sm text-[var(--text-primary)]">
                  Plans
                </span>
                <span className="shrink-0 text-xs text-[var(--text-muted)]">
                  {plans.length} {plans.length === 1 ? 'plan' : 'plans'} ·{' '}
                  {planSteps.done}/{planSteps.total} steps done
                </span>
                <Tooltip content="Clear all plans">
                  <button
                    onClick={handleClearPlans}
                    className="btn btn-danger"
                    data-testid="memory-clear-plans"
                  >
                    <Trash2 size={16} />
                    Clear
                  </button>
                </Tooltip>
              </li>
              <li className="flex items-center gap-3 px-3 py-2 bg-[var(--bg-tertiary)] rounded-md">
                <span className="flex-1 min-w-0 text-sm text-[var(--text-primary)]">
                  Terminal feed
                </span>
                <span className="shrink-0 text-xs text-[var(--text-muted)]">
                  {feedCounts.commands} command{' '}
                  {feedCounts.commands === 1 ? 'block' : 'blocks'} ·{' '}
                  {feedCounts.tabs} {feedCounts.tabs === 1 ? 'tab' : 'tabs'}
                </span>
                <Tooltip content="Clear the whole terminal feed (every tab)">
                  <button
                    onClick={handleClearFeed}
                    className="btn btn-danger"
                    data-testid="memory-clear-feed"
                  >
                    <Trash2 size={16} />
                    Clear
                  </button>
                </Tooltip>
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">
              LLMBuilder memory
            </h3>
            <p className="text-xs leading-[1.5] text-[var(--text-muted)] mb-3">
              The driving intelligence’s working memory — agent prompts and
              replies in the terminal feed: {feedCounts.agentPrompts}{' '}
              prompts · {feedCounts.agentResponses} replies. It can only be
              cleared, never downloaded, and it is never included in the
              memory download.
            </p>
            <Tooltip content="Clear the agent’s working memory (prompts and replies only — terminal commands are kept)">
              <button
                onClick={handleClearAgentMemory}
                className="btn btn-danger"
                data-testid="memory-clear-agent"
              >
                <Trash2 size={16} />
                Clear agent memory
              </button>
            </Tooltip>
          </section>
        </>
      )}

      <section>
        <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">
          Tick stream — live
        </h3>
        <p className="text-xs leading-[1.5] text-[var(--text-muted)] mb-3">
          The stream ring, ticking live — every channel Lucid tracks (2
          rings: the event log and the AI chat ticks). Rates are measured
          from the counters, never a stored number.
        </p>
        <ul className="space-y-2">
          {ringStats.map((ch) => (
            <li
              key={ch.id}
              data-testid={`memory-ring-${ch.id}`}
              className="px-3 py-2 bg-[var(--bg-tertiary)] rounded-md"
            >
              <div className="flex items-center gap-3">
                <span className="flex-1 min-w-0 text-sm text-[var(--text-primary)]">
                  {ch.label}
                </span>
                <span className="shrink-0 text-xs text-[var(--text-muted)]">
                  {formatRatePerSec(ch.acceptedPerSec)} in ·{' '}
                  {formatRatePerSec(ch.drainedPerSec)} out
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-[var(--text-muted)]">
                  in flight {ch.inFlight}/{ch.capacity}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  accepted {ch.accepted} · drained {ch.drained} · refused{' '}
                  {ch.refused}
                </span>
              </div>
              {ch.refusedBy.length > 0 && (
                <p
                  data-testid={`memory-ring-${ch.id}-refused-by`}
                  className="mt-1 text-xs text-[var(--text-muted)] truncate"
                >
                  refused by:{' '}
                  {ch.refusedBy
                    .map((r) => `${r.label} ×${r.count}`)
                    .join(' · ')}
                </p>
              )}
              <div
                className="mt-2 h-1.5 rounded bg-[var(--bg-primary)] overflow-hidden"
                aria-label={`${ch.label} ring depth ${ch.inFlight} of ${ch.capacity}`}
              >
                <div
                  className="h-full bg-[var(--accent)]"
                  style={{
                    width: `${
                      ch.capacity > 0
                        ? Math.min(100, (ch.inFlight / ch.capacity) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
              {ch.latest && (
                <p className="mt-1 text-xs text-[var(--text-muted)] truncate">
                  latest: {ch.latest}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default MemoryTab;
