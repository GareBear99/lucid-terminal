import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Star } from 'lucide-react';
import { EMPTY_BLOCKS, useHistoryStore } from '../../stores/historyStore';
import { useModalStore } from '../../stores/modalStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { copyText, formatBlockDuration } from '../../lib/terminalBlocks';
import { formatGitBranch, formatGitCounts } from '../../lib/gitStatus';
import { AgentReviewBlock } from './AgentReviewBlock';
import type { TerminalBlock } from '../../types';

/** How close to the bottom the feed must be to count as "pinned"
 *  there (and keep following new content) — px. */
const STICK_TO_BOTTOM_PX = 64;

/** Escape a literal string for use in a RegExp (find-in-output). */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * One block's output + actions, with find-in-output and
 * filter-lines (sweep item 5). Owns its search state: the
 * query, whether the find row is open, whether filter-lines
 * is on, and which match is active. Matches are
 * case-insensitive; the active match scrolls into view inside
 * the block's scrolling <pre>. Filter-lines shows only the
 * lines containing the query (the match count is the same
 * either way — lines without the query hold no matches).
 * With no query the output renders exactly as before (raw
 * text in the <pre>), so the common path is untouched.
 */
function BlockOutput({
  tabId,
  block,
  copied,
  onCopy,
  onReinput,
  density,
}: {
  tabId: string;
  block: TerminalBlock;
  copied: string | null;
  onCopy: (key: string, text: string) => void;
  onReinput: (command: string) => void;
  /** Feed density (sweep item 20): compact tightens the output
   *  padding + leading; comfortable is the current spacing. */
  density: 'comfortable' | 'compact';
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filterLines, setFilterLines] = useState(false);
  const [activeMatch, setActiveMatch] = useState(0);

  // Bookmark (sweep item 7): the star in the actions row
  // flips the block's isBookmarked in the store — persisted
  // per tab/profile, and the History panel filters on it.
  const toggleBookmarked = useHistoryStore((s) => s.toggleBlockBookmarked);

  // Per line: the segments to render — plain text, or a match
  // (odd indices of a split on a capturing group). matchIndex
  // counts matches in output order across all lines. Null
  // with no query or with the row closed: the raw-text path
  // below (closing the row clears the highlights; the query
  // itself survives for re-open).
  const segments = useMemo(() => {
    if (!searchOpen || !query) return null;
    const re = new RegExp(`(${escapeRegExp(query)})`, 'gi');
    let counter = 0;
    return block.output.split('\n').map((line) =>
      line.split(re).map((part, i) => {
        const isMatch = i % 2 === 1;
        const matchIndex = isMatch ? counter++ : -1;
        return { text: part, isMatch, matchIndex };
      }),
    );
  }, [block.output, query, searchOpen]);

  const matchCount = useMemo(
    () => segments?.flat().filter((s) => s.isMatch).length ?? 0,
    [segments],
  );
  // Clamp: the output grows while a command streams, and the
  // query changes — the active index never runs past the end.
  const active = matchCount === 0 ? 0 : Math.min(activeMatch, matchCount - 1);
  const goNext = useCallback(
    () => setActiveMatch((a) => (matchCount === 0 ? 0 : (a + 1) % matchCount)),
    [matchCount],
  );
  const goPrev = useCallback(
    () => setActiveMatch((a) => (matchCount === 0 ? 0 : (a - 1 + matchCount) % matchCount)),
    [matchCount],
  );
  // A new query starts at the first match.
  useEffect(() => {
    setActiveMatch(0);
  }, [query]);

  // The active match scrolls into view inside the <pre>.
  const activeMarkRef = useCallback((el: HTMLElement | null) => {
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, []);

  return (
    <>
      {searchOpen && (
        <div data-testid="block-search" className="mt-1 flex items-center gap-1">
          <input
            data-testid="block-search-input"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) goPrev();
                else goNext();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setSearchOpen(false);
              }
            }}
            placeholder="Find in output"
            aria-label="Find in output"
            className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] px-1.5 py-px font-mono text-[11px] text-[var(--text-primary)] outline-none"
          />
          <span
            data-testid="block-search-count"
            className="shrink-0 font-mono text-[11px] text-[var(--text-muted)]"
          >
            {query ? `${matchCount === 0 ? 0 : active + 1}/${matchCount}` : '—'}
          </span>
          <button
            type="button"
            data-testid="block-search-prev"
            aria-label="Previous match"
            onClick={goPrev}
            className="shrink-0 rounded px-1 py-px font-mono text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
          >
            ↑
          </button>
          <button
            type="button"
            data-testid="block-search-next"
            aria-label="Next match"
            onClick={goNext}
            className="shrink-0 rounded px-1 py-px font-mono text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
          >
            ↓
          </button>
          <button
            type="button"
            data-testid="block-search-filter"
            aria-pressed={filterLines}
            title="Show only matching lines"
            onClick={() => setFilterLines((f) => !f)}
            className={`shrink-0 rounded px-1.5 py-px font-mono text-[11px] hover:bg-[var(--bg-primary)] ${filterLines ? 'bg-[var(--bg-primary)] text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
          >
            Filter
          </button>
          <button
            type="button"
            data-testid="block-search-close"
            aria-label="Close find"
            onClick={() => setSearchOpen(false)}
            className="shrink-0 rounded px-1 py-px font-mono text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
          >
            ×
          </button>
        </div>
      )}
      {/* Output: a transcript that scrolls INSIDE its
          block, so one long output never stretches the
          feed. Hidden while the block is collapsed
          (sweep item 3) — the header stays. */}
      {block.output ? (
        <pre
          data-testid="block-output"
          className={`mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[13px] text-[var(--text-primary)] ${density === 'compact' ? 'p-0.5 leading-[1.35]' : 'p-1 leading-[1.5]'}`}
        >
          {segments === null
            ? block.output
            : segments
                .map((lineSegs, lineIdx) => ({ lineSegs, lineIdx }))
                .filter(({ lineSegs }) => !filterLines || lineSegs.some((s) => s.isMatch))
                .map(({ lineSegs, lineIdx }) => (
                  <span key={lineIdx} className="block">
                    {lineSegs.map((seg, i) =>
                      seg.isMatch ? (
                        <mark
                          key={i}
                          ref={seg.matchIndex === active ? activeMarkRef : undefined}
                          className={
                            seg.matchIndex === active
                              ? 'bg-[var(--accent)] text-[var(--bg-primary)]'
                              : 'bg-[var(--accent)]/30 text-inherit'
                          }
                        >
                          {seg.text}
                        </mark>
                      ) : (
                        <span key={i}>{seg.text}</span>
                      ),
                    )}
                  </span>
                ))}
        </pre>
      ) : null}
      {/* Per-block actions: copy command, copy output,
          re-input into the composer, find in output.
          Plain handlers, theme vars only. A scrollback block
          (sweep item 16) is a transcript, not a command — it
          has no command to copy or re-input, so those two
          buttons are hidden for it; copy-out, find and the
          bookmark stay. */}
      <div className="mt-1 flex items-center gap-1">
        {block.kind !== 'scrollback' && (
          <button
            type="button"
            data-testid="block-copy-command"
            onClick={() => void onCopy(`cmd-${block.id}`, block.command)}
            className="rounded px-1.5 py-px font-mono text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
          >
            {copied === `cmd-${block.id}` ? 'Copied' : 'Copy cmd'}
          </button>
        )}
        <button
          type="button"
          data-testid="block-copy-output"
          onClick={() => void onCopy(`out-${block.id}`, block.output)}
          className="rounded px-1.5 py-px font-mono text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
        >
          {copied === `out-${block.id}` ? 'Copied' : 'Copy out'}
        </button>
        {block.kind !== 'scrollback' && (
          <button
            type="button"
            data-testid="block-reinput"
            onClick={() => onReinput(block.command)}
            className="rounded px-1.5 py-px font-mono text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
          >
            Re-input
          </button>
        )}
        <button
          type="button"
          data-testid="block-find"
          aria-expanded={searchOpen}
          onClick={() => setSearchOpen((o) => !o)}
          className="rounded px-1.5 py-px font-mono text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
        >
          Find
        </button>
        <button
          type="button"
          data-testid="block-bookmark"
          aria-label={block.isBookmarked ? 'Remove bookmark' : 'Bookmark block'}
          aria-pressed={block.isBookmarked === true}
          onClick={(e) => {
            e.stopPropagation();
            toggleBookmarked(tabId, block.id);
          }}
          className="rounded px-1 py-px text-[var(--text-muted)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
        >
          <Star
            size={12}
            className={block.isBookmarked ? 'fill-[var(--accent)] text-[var(--accent)]' : ''}
          />
        </button>
      </div>
    </>
  );
}

/**
 * DEFCON 3 Phase 2 — blocks in devmode (Gary, 2026-11-09 ~08:10 PST).
 *
 * RENDERER CHOICE — DOM blocks ABOVE the xterm, recorded with
 * reasoning (dissection §8 Q8): blocks as xterm content was
 * rejected because xterm text cannot carry per-block actions
 * (copy command / copy output / re-input need real DOM buttons)
 * and cannot carry a header. A DOM list above the xterm is the
 * only shape that gives headers, dividers and actions — and it
 * keeps ONE feed: the list lives in the terminal column, in the
 * same vertical flow as the xterm surface below it (not a second
 * panel, not a sidebar), and the non-devmode shape is untouched
 * — this list renders only when the prompter is active
 * (devmode + DEFCON 3+), so non-devmode keeps its exact settle
 * shape for the later Phase 5 landing. The xterm stream is
 * still the live surface in this phase (blocks do not replace
 * it — that is the Phase 5 landing decision); the list is the
 * structured record of composer-submitted commands, so output
 * appears twice (live stream + block transcript) until then.
 * A long output scrolls INSIDE its block (`max-h-48
 * overflow-y-auto` on the output) — the feed itself never
 * grows unboundedly per block.
 *
 * DIVIDERS: a real visible faint line — 1px `var(--border)`,
 * always on, no toggle (decided) — between every two blocks.
 * HEADERS carry cwd + duration (decided): cwd is the live cwd
 * stamped at submit; duration is submit → close (see
 * src/lib/terminalBlocks.ts for the close mechanism). While a
 * block is open the header reads RUNNING and shows no
 * duration. Theme vars only — no hardcoded colors, no new
 * theme tokens, none recolored.
 *
 * Per-block actions (§6.1), minimal: copy command, copy
 * output, re-input (puts the command back into the composer).
 * Exit-code coloring is NOT here: no per-command exit code is
 * capturable cleanly (see terminalBlocks.ts) — deferred, not
 * faked.
 *
 * DEFCON 3 Phase 5 — the landing (Gary,
 * 2026-11-09): the SAME list lands at level
 * 3+, as the feed itself (`fill` — it takes the terminal
 * column, borderless and transparent, per the DEFCON 2 merge:
 * the terminal box is GONE, so the feed is text floating over
 * the mist, not a panel). THE DUPLICATION DECISION (recorded
 * with reasoning): output appeared TWICE in devmode (live
 * xterm stream + block transcript). The smallest change that
 * leaves the feed clean is to UNMOUNT the xterm surface
 * at level 3 in both modes (Terminal.tsx) — the BlockList
 * becomes the sole feed, so output appears exactly once.
 * Why unmount, not suppress-or-hide: suppressing the xterm
 * write while keeping the surface would leave a frozen stale
 * snapshot below the blocks; hiding it with display:none
 * would fire the ResizeObserver fit on a 0-size container and
 * risk a 0-column PTY resize; unmounting is deterministic —
 * XtermSurface's cleanup disposes only the xterm.js instance,
 * the PTY itself lives in the main process keyed by tabId and
 * keeps running, and dropping back to level 2 remounts a
 * fresh surface. KNOWN COSTS (not hidden): scrollback is lost
 * on landing (blocks are the record), and full-screen
 * interactive programs (vim / less / htop) have no live
 * surface at level 3 — their escape sequences
 * land as text in the block transcript. Dropping to level 2
 * restores the live xterm. The sweep settle (2026-11-15)
 * extends the unmount to devmode: the war zone no longer
 * keeps the raw stream visible at level 3+, duplication and
 * all — the feed is the sole surface in both modes.
 */

interface BlockListProps {
  tabId: string;
  /** Put a block's command back into the composer. */
  onReinput: (command: string) => void;
  /** Re-run commands (multi-select bulk action, 2026-11-15):
   *  the caller submits each command in order through the
   *  tab's normal submit path. Optional — when absent the
   *  Re-run all button does not render (e.g. agent mode,
   *  where a re-run would be an agent prompt, not a shell
   *  command). */
  onRerun?: (commands: string[]) => void;
  /** Phase 5: the list IS the feed — it fills the terminal
   *  column (at level 3+ in both modes), borderless and
   *  transparent per the DEFCON 2 merge. Default: the capped
   *  panel above the live xterm (below 3). */
  fill?: boolean;
  /** The unified feed (heavy terminal work, 2026-11-13): when
   *  provided, these blocks render instead of the tab's live
   *  transcript — the same list, the same scroll behaviour, for
   *  any session kind (terminal or agent). When omitted, the
   *  tab's blocks read from historyStore as before. */
  blocks?: TerminalBlock[];
  /** Empty-state content for a `fill` feed with no blocks (the
   *  agent intro card). Renders inside the fill container, so
   *  the prompt stays bottom-pinned. */
  emptyState?: React.ReactNode;
}

export function BlockList({ tabId, onReinput, onRerun, fill = false, blocks: blocksProp, emptyState }: BlockListProps) {
  // The feed is the LIVE session's transcript: restored blocks (last
  // session's record — see historyStore) never render here. Showing
  // them would present commands this shell never ran as if they ran
  // now. They still show in the History panel, which is the record.
  const storeBlocks = useHistoryStore((s) => s.blocksByTab[tabId] ?? EMPTY_BLOCKS).filter(
    (b) => !b.restored,
  );
  // The unified feed: an explicit list wins (the History panel
  // — the record, restored blocks included), otherwise the
  // tab's live transcript (terminal sessions).
  const blocks = blocksProp ?? storeBlocks;
  // Feed density (sweep item 20): the setting drives the
  // block padding + output leading live (Settings >
  // Customization > Terminal customizations). Comfortable is
  // the current spacing; compact tightens it. The feed reads
  // it here so the detached window's feed (same component)
  // follows the same setting.
  const feedDensity = useSettingsStore((s) => s.settings.feedDensity ?? 'comfortable');
  const [copied, setCopied] = useState<string | null>(null);

  // Feed fold (sweep item 3): the chevron in the header flips
  // the block's isCollapsed in the store; the output and the
  // actions hide while collapsed (ported from dead Block.tsx,
  // which already rendered this shape and nothing rendered).
  const toggleCollapsed = useHistoryStore((s) => s.toggleBlockCollapsed);

  // Multi-select (2026-11-15): the selection lives in
  // historyStore (ephemeral, never persisted). The selected
  // blocks are the ones in the CURRENT feed (restored blocks
  // never render here, so they can never be selected).
  const selectedIds = useHistoryStore((s) => s.selectedBlockIdsByTab[tabId] ?? []);
  const toggleBlockSelected = useHistoryStore((s) => s.toggleBlockSelected);
  const selectBlockOnly = useHistoryStore((s) => s.selectBlockOnly);
  const selectBlockRange = useHistoryStore((s) => s.selectBlockRange);
  const clearBlockSelection = useHistoryStore((s) => s.clearBlockSelection);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // Keyboard block navigation (sweep item 4): ⌘↑/⌘↓ (and Ctrl)
  // move a focused-block highlight; ⌘Home/⌘End jump to the
  // first/last block. A window listener so it works from the
  // prompt input too — InputArea ignores modified arrows and
  // the xterm forwarder does the same, so there is no double
  // action. Skipped while an Atom modal is open (the modal
  // owns the arrows then). The listener only exists while this
  // feed is mounted, i.e. while a terminal view is showing.
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Home' && e.key !== 'End') return;
      if (useModalStore.getState().openModal !== null) return;
      // The feed's live blocks (restored blocks never render).
      const live = blocks.filter((b) => !b.restored);
      if (live.length === 0) return;
      e.preventDefault();
      if (e.key === 'Home') {
        setFocusedBlockId(live[0].id);
        return;
      }
      if (e.key === 'End') {
        setFocusedBlockId(live[live.length - 1].id);
        return;
      }
      const current = focusedBlockId === null ? -1 : live.findIndex((b) => b.id === focusedBlockId);
      if (e.key === 'ArrowDown') {
        const next = current < 0 ? 0 : Math.min(current + 1, live.length - 1);
        setFocusedBlockId(live[next].id);
      } else {
        const prev = current < 0 ? live.length - 1 : Math.max(current - 1, 0);
        setFocusedBlockId(live[prev].id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [blocks, focusedBlockId]);

  // Keep the focused block in view.
  useEffect(() => {
    if (focusedBlockId === null) return;
    const el = document.getElementById(`block-${focusedBlockId}`);
    // jsdom has no scrollIntoView — guard, never crash the feed.
    if (typeof el?.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedBlockId]);

  // Feed ordering — newest closest to the prompt, like Warp (Gary,
  // 2026-11-12 ~17:11 PST: "i dont like how it goes to the top and
  // doesnt order closest like warp").
  //
  // The defect: new blocks append at the END of the store array
  // (Terminal.tsx openBlock: [...prev, block]) and render in that
  // order into a plain overflow-y-auto div with NO scroll
  // management anywhere — no scrollTo, no scrollTop, no
  // scrollIntoView in Terminal.tsx or here. So the feed's content
  // starts at the TOP of the column (with one block it sits at
  // the top, empty black below, prompt far below — exactly
  // Gary's screenshot), and once the feed overflows scrollTop
  // stays 0 while new blocks land below the visible fold. Two
  // halves to the fix:
  // (a) bottom-anchor: the container is flex-col and the blocks
  //     wrap in a div with mt-auto — free space is absorbed ABOVE
  //     the blocks, so short content hugs the bottom (newest
  //     right above the prompt); when the content overflows the
  //     auto margin collapses to 0 and normal scrolling works,
  //     top still reachable (justify-end would strand it).
  // (b) sticky follow-scroll: while the user is pinned near the
  //     bottom, new blocks — and streaming output growing the
  //     current block — scroll the feed to the bottom; scrolling
  //     up unpins it, so reading old output is never yanked.
  const listRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const handleFeedScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_TO_BOTTOM_PX;
  };
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [blocks]);

  if (blocks.length === 0) {
    // Empty feed in `fill` mode — the DEFCON 3
    // landing (Gary, 2026-11-09 ~11:41 PST — "see how its at
    // the top" / "After something is input it sets right" /
    // "thats the issue"): at level 3+ the xterm
    // surface is unmounted, so this list is the SOLE feed — and
    // returning null here left nothing above the prompt section
    // to fill the terminal column, so the prompt sat at the TOP
    // on launch (empty feed, 0 commands) and only dropped to
    // the bottom once the first block existed. The empty
    // fill-mode list still occupies the column (the same
    // flex-1 container), so the prompt is bottom-pinned from
    // launch. Below 3 (fill=false) it still returns null — the
    // live xterm below is the filler there.
    if (fill) {
      return (
        <div
          data-testid="terminal-blocks"
          className="mx-4 mb-4 mt-4 min-h-0 flex-1 overflow-y-auto rounded-none border-0 bg-transparent"
        >
          {emptyState ?? null}
        </div>
      );
    }
    return null;
  }

  const handleCopy = async (key: string, text: string) => {
    if (await copyText(text)) {
      setCopied(key);
      setTimeout(() => setCopied((cur) => (cur === key ? null : cur)), 2000);
    }
  };

  // Multi-select bulk actions (2026-11-15): the selected
  // blocks in feed order (oldest first). Copy-all copies
  // every selected block's command, one per line. Re-run-all
  // re-runs only the shell commands (kind 'command' — agent
  // prompts/responses, notices, and scrollback are not
  // re-runnable shell commands, so they are skipped).
  const selectedBlocks = blocks.filter((b) => selectedSet.has(b.id));
  const runnableBlocks = selectedBlocks.filter(
    (b) => b.kind === undefined || b.kind === 'command',
  );

  return (
    <div
      data-testid="terminal-blocks"
      ref={listRef}
      onScroll={handleFeedScroll}
      className={
        fill
          ? 'mx-4 mb-4 mt-4 flex min-h-0 flex-1 flex-col overflow-y-auto rounded-none border-0 bg-transparent'
          : 'mx-4 mt-4 flex max-h-72 shrink-0 flex-col overflow-y-auto rounded-none border border-[var(--border)] bg-[var(--bg-tertiary)]/50'
      }
    >
      {/* Bottom-anchored content (see the ordering note above):
          mt-auto absorbs free space above the blocks, so the
          newest block sits right above the prompt. */}
      <div data-testid="terminal-blocks-content" className="mt-auto">
      {blocks.map((block, index) => (
        <div key={block.id}>
          {/* Faint divider between blocks — a real 1px
              `var(--border)` line, always on, no toggle. */}
          {index > 0 && (
            <div data-testid="block-divider" className="border-t border-[var(--border)]" aria-hidden="true" />
          )}
          {/* A review block is the Keep/Reject surface
              (steal #6 — Zed): the diff preview + the
              decision buttons, rendered by its own
              component. It stays in the feed as the record
              of the decision (and of the checkpoint it can
              revert to). */}
          {block.kind === 'agent-review' && block.review ? (
            <AgentReviewBlock review={block.review} timestamp={block.timestamp} blockId={block.id} />
          ) : block.kind === 'notice' ? (
            /* A notice block is a plain note (the driving-
              intelligence placeholder in an agent session): no
              header, no actions — just the text, muted. */
            <article
              data-testid="terminal-block"
              data-block-kind="notice"
              id={`block-${block.id}`}
              className={feedDensity === 'compact' ? 'px-2 py-1' : 'px-3 py-2'}
            >
              <p className="font-mono text-[12px] leading-[1.5] text-[var(--text-muted)]">
                {block.output}
              </p>
            </article>
          ) : (
          <article
            data-testid="terminal-block"
            data-block-kind={block.kind ?? 'command'}
            data-block-focused={focusedBlockId === block.id ? 'true' : 'false'}
            data-block-selected={selectedSet.has(block.id) ? 'true' : 'false'}
            id={`block-${block.id}`}
            onClick={(e) => {
              setFocusedBlockId(block.id);
              // Multi-select (2026-11-15): plain click selects
              // just this block; Ctrl/Cmd-click toggles it;
              // shift-click selects the range from the anchor.
              // The header buttons and the output actions
              // stopPropagation, so they never reach here.
              if (e.shiftKey) selectBlockRange(tabId, block.id);
              else if (e.ctrlKey || e.metaKey) toggleBlockSelected(tabId, block.id);
              else selectBlockOnly(tabId, block.id);
            }}
            className={`${feedDensity === 'compact' ? 'px-2 py-1' : 'px-3 py-2'} ${selectedSet.has(block.id) ? 'rounded bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]/60' : focusedBlockId === block.id ? 'rounded bg-[var(--bg-primary)]/60 ring-1 ring-[var(--accent)]/40' : ''}`}
          >
            {/* Header: command + cwd + duration + exit code + git
                state. The cwd is the live cwd stamped at submit;
                the duration is submit → close (absent while
                RUNNING). The exit code shows only when the
                opt-in shell integration captured one (see
                terminalBlocks.ts) — never faked. The git state
                shows only when the submit-time lookup found a
                repo. Agent blocks read AGENT, not CMD.
                Sticky (sweep item 14): the header stays visible
                at the top of the feed viewport while its block
                scrolls past, so the output never loses its
                command. The solid background keeps scrolling
                text from showing through while stuck. */}
            <div
              data-testid="block-header"
              className="sticky top-0 z-10 flex items-center gap-2 overflow-hidden bg-[var(--bg-secondary)] font-mono text-[11px] text-[var(--text-secondary)]"
            >
              {/* Fold chevron (sweep item 3) — collapses just
                  this block's output; the header stays. */}
              <button
                type="button"
                data-testid="block-collapse"
                aria-label={block.isCollapsed ? 'Expand block' : 'Collapse block'}
                aria-expanded={!block.isCollapsed}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCollapsed(tabId, block.id);
                }}
                className="shrink-0 rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
              >
                {block.isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              </button>
              {/* Bookmarked (sweep item 7): a filled star in the
                  header, so a bookmarked block stays marked
                  even while collapsed (the actions row hides
                  with the output). */}
              {block.isBookmarked && (
                <Star
                  size={11}
                  data-testid="block-bookmarked"
                  aria-label="Bookmarked"
                  className="shrink-0 fill-[var(--accent)] text-[var(--accent)]"
                />
              )}
              <span className="shrink-0 font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {block.kind === 'agent-prompt' || block.kind === 'agent-response'
                  ? 'AGENT'
                  : block.kind === 'scrollback'
                    ? 'SCROLLBACK'
                    : block.isComplete
                      ? 'CMD'
                      : 'RUNNING'}
              </span>
              <span className="truncate font-semibold text-[var(--text-primary)]" title={block.command}>
                {block.command}
              </span>
              {block.cwd && (
                <span className="ml-auto shrink-0 truncate opacity-80" title={block.cwd}>
                  {block.cwd}
                </span>
              )}
              {block.isComplete && block.durationMs !== undefined ? (
                <span
                  className="shrink-0"
                  title={
                    block.durationIsLowerBound
                      ? `at least ${block.durationMs}ms — closed on output quiescence; the command may have run longer`
                      : `${block.durationMs}ms`
                  }
                >
                  {/* Sweep item 15: a quiescence-closed duration is
                      a lower bound — the "≥" keeps the header from
                      stating a false number. */}
                  {block.durationIsLowerBound ? '≥' : ''}
                  {formatBlockDuration(block.durationMs)}
                </span>
              ) : null}
              {block.exitCode !== undefined && (
                <span
                  data-testid="block-exit-code"
                  title={`Exit code ${block.exitCode}`}
                  className={`shrink-0 font-semibold ${block.exitCode === 0 ? 'text-[var(--text-muted)]' : 'text-red-400'}`}
                >
                  exit {block.exitCode}
                </span>
              )}
              {block.gitState && (
                <span
                  data-testid="block-git-state"
                  title={`${block.gitState.branch} — ${block.gitState.changedFiles} files changed, +${block.gitState.addedLines} -${block.gitState.deletedLines}`}
                  className="shrink-0 truncate opacity-80"
                >
                  {formatGitBranch(block.gitState)} · {formatGitCounts(block.gitState)}
                </span>
              )}
              <span className="shrink-0 opacity-70">
                {new Date(block.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
            {/* Output + actions (BlockOutput): the transcript
                scrolls INSIDE its block; find-in-output and
                filter-lines live there (sweep item 5). Hidden
                while the block is collapsed (sweep item 3) —
                the header stays. */}
            {!block.isCollapsed && (
              <BlockOutput
                tabId={tabId}
                block={block}
                copied={copied}
                onCopy={handleCopy}
                onReinput={onReinput}
                density={feedDensity}
              />
            )}
          </article>
          )}
        </div>
      ))}
      </div>
      {/* Multi-select bulk-action row (2026-11-15): shown
          while the selection is non-empty, pinned to the
          bottom of the feed (sticky, so it stays visible
          above the prompt). Copy all copies the selected
          commands, one per line. Re-run all re-runs the
          selected shell commands in feed order, one at a
          time (the caller submits each through the tab's
          normal submit path); it only renders when the
          caller provided onRerun and a shell command is
          selected. Clear drops the selection. */}
      {selectedBlocks.length > 0 && (
        <div
          data-testid="block-bulk-actions"
          className="sticky bottom-0 z-20 flex items-center gap-2 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 font-mono text-[11px] text-[var(--text-secondary)]"
        >
          <span data-testid="block-bulk-count">
            {selectedBlocks.length} selected
          </span>
          <button
            type="button"
            data-testid="block-bulk-copy-all"
            onClick={() =>
              void handleCopy(
                'bulk-copy',
                selectedBlocks.map((b) => b.command).filter(Boolean).join('\n'),
              )
            }
            className="rounded px-2 py-0.5 hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
          >
            {copied === 'bulk-copy' ? 'Copied' : 'Copy all'}
          </button>
          {onRerun && runnableBlocks.length > 0 && (
            <button
              type="button"
              data-testid="block-bulk-rerun-all"
              onClick={() => {
                onRerun(runnableBlocks.map((b) => b.command));
                clearBlockSelection(tabId);
              }}
              className="rounded px-2 py-0.5 hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
            >
              Re-run all ({runnableBlocks.length})
            </button>
          )}
          <button
            type="button"
            data-testid="block-bulk-clear"
            onClick={() => clearBlockSelection(tabId)}
            className="ml-auto rounded px-2 py-0.5 hover:bg-[var(--bg-primary)] hover:text-[var(--text-primary)]"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
