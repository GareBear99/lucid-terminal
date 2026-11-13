/**
 * MiniTerminal — a detached terminal window (Gary, 2026-11-09:
 * drag a terminal tab outside the main window and it becomes
 * its own terminal-only screen, keeping its live shell).
 *
 * This is a terminal-only screen, deliberately NOT the full
 * <Terminal>: no agent mode, no Heartbeat, no Sentinel face —
 * the topology failsafe in Terminal.tsx would flip devMode
 * settings, which a detached window must never do. It is the
 * tab strip + a plain XtermSurface wired straight to the PTY,
 * plus a shell-exited banner with a same-id restart. At
 * DEFCON 3 the prompt section is the full prompter (below):
 * the blood drop (LuciferStatusIndicator), the HintLine and
 * the PillRow are all present, same as the main window (Gary,
 * 2026-11-13 ~14:35 PST — the external prompt + pills were
 * all messed up without them, and the drop must be there).
 *
 * DEFCON (Gary, 2026-11-13 — "terminal tabs should always be
 * in the global defcon state, even when pulled out"; "should be
 * no different as defcon proposes"; "should never regress
 * naturally below the current defcon 2 state when external"):
 * - The level comes from the shared settings store (the same
 *   source the main window uses), and a /defcon change in the
 *   main window follows live via settings:changed.
 * - The EFFECTIVE level is floored at 2: whatever the store
 *   says at mount or on a reload (the DEFCON_DEFAULT = 1
 *   fallback, a load race, a degraded store), an external
 *   window never renders below the DEFCON 2 state (merge, mist,
 *   whiter text, no terminal box). Above 2 it follows the
 *   global level. The floor is on the rendering only — the
 *   badge still reads the global level, and the global level
 *   itself never changes here.
 * - At level 3 the detached window gets the FULL prompter, no
 *   different from the main window: the linked composer
 *   (InputArea) is the input and the live blocks feed
 *   (UnifiedFeed) is the terminal surface — in non-devmode the
 *   feed IS the feed (fill, xterm unmounted, output exactly
 *   once), in devmode the capped feed sits above the live
 *   xterm. The block lifecycle (open on composer submit, PTY
 *   chunks append, quiet-timer close, OSC 133 exit codes) is
 *   the same machinery as Terminal.tsx, running here in this
 *   renderer against this window's historyStore.
 * - Slash: /defcon (+ /defcon merge) runs locally — the same
 *   branch as the main window, same output, same event-log
 *   entry. Every other slash line is a Lucid command, never a
 *   shell command, so it never reaches the PTY: the composer
 *   opens a block and says plainly that slash commands run in
 *   the main window. The full runSlashCommand extraction (so
 *   every slash works here) is follow-up work, not this run.
 * - Guest veil: this renderer imports the profile store, whose
 *   module-level check veils a guest session (and MiniTerminal
 *   repeats the check on mount) — so the guest's live blocks
 *   are never persisted over the owner's history. Without it
 *   the detached historyStore would persist guest blocks to
 *   the owner's localStorage.
 *
 * The PTY never moves: main re-targets the owner registry to
 * this window, and this window claims the tab on add. Closing
 * the window (X) pops every tab back into the main window —
 * main delivers them on 'closed', so the tab is never lost.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerUpLeft, X } from 'lucide-react';
import TerminalTabs from './TerminalTabs';
import { XtermSurface, type XtermSurfaceHandle } from './XtermSurface';
import { UnifiedFeed } from './UnifiedFeed';
import { InputArea } from './InputArea';
import { PillRow } from './PillRow';
import { HintLine } from './HintLine';
import { LuciferStatusIndicator } from './LuciferStatusIndicator';
import { Tooltip } from '../Tooltip/Tooltip';
import { useTerminalStore } from '../../stores/terminalStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useSessionStore } from '../../stores/sessionStore';
import { EMPTY_BLOCKS, useHistoryStore } from '../../stores/historyStore';
import { isGuestProfile, useProfileStore } from '../../stores/profileStore';
import { useEventLogStore } from '../../stores/eventLogStore';
import { useDetachPushListeners } from '../../lib/detachPushListeners';
import { MiniLoadingMist } from '../Splash/MiniLoadingMist';
import { DefconBadge } from '../FixNet/DefconBadge';
import {
  DEFCON_DEFAULT,
  DEFCON2_MERGE_IMPLEMENTED,
  DEFCON3_PROMPTER_IMPLEMENTED,
  defconCriteria,
  defconMergeActive,
  defconMergeReadingText,
  defconPrompterActive,
  defconTagline,
  describeDefcon,
  isDefconLevel,
} from '../../lib/defcon';
import { isLuciferAiEnabled, isLuciferAiSilenced } from '../../lib/luciferAi';
import { getPromptHintWords } from '../../lib/promptHintWords';
import { computeGhostSuggestion } from '../../lib/prompterSuggestions';
import { computeHintLine } from '../../lib/hintLine';
import { detectAgentPrompt } from '../../lib/agentPromptDetect';
import { processTerminalBell } from '../../lib/terminalBell';
import {
  appendBlockOutput,
  BLOCK_QUIET_CLOSE_MS,
  closeBlock,
  dropPendingEscape,
  newBlock,
  parseOsc133ExitCodes,
} from '../../lib/terminalBlocks';
import { getCachedGitStatus, useGitStatus } from '../../lib/useGitStatus';
import { parseCommand } from '../../utils/commandRouter';
import type { TerminalBlock } from '../../types';
import { SPLASH_SMOKE_PUFF_COUNT } from '../Splash/SplashScreen';
import '../Splash/SplashScreen.css';

const dragStyle = { WebkitAppRegion: 'drag' } as React.CSSProperties;
const noDragStyle = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

/** What a non-/defcon slash line gets in the detached composer:
 *  Lucid commands run in the main window — never the shell. */
const SLASH_NOT_HERE_NOTE =
  'Slash commands run in the main window — this composer sends shell commands. (/defcon works here.)';

export default function MiniTerminal() {
  const { tabs, activeTabId, addDetachedTab, clearTabExited, updateTabCwd, markTabExited } =
    useTerminalStore();
  const [shellExited, setShellExited] = useState<{ code: number } | null>(null);
  const [waiting, setWaiting] = useState(true);
  const termRef = useRef<XtermSurfaceHandle>(null);
  const hadTabsRef = useRef(false);
  // Global DEFCON state (Gary, 2026-11-13 — "terminal tabs
  // should always be in the global defcon state, even when
  // pulled out"): a detached tab is in the SAME level as the
  // main window — not its own level, not the default. The level
  // is read from the shared settings store (the same source the
  // main window uses), and the merge below renders from it.
  // XtermSurface already follows the level for its foreground
  // (whiter text at DEFCON 2+) from this same store.
  // THE FLOOR (Gary, 2026-11-13 ~13:55 PST — an external window
  // "should never regress naturally below the current defcon 2
  // state"): the EFFECTIVE level is max(global, 2) — the
  // rendering never drops below the DEFCON 2 state, whatever
  // the store says at mount or on a reload. The badge still
  // reads the global level (it reads the store directly); the
  // floor touches rendering only, never the global level.
  const settings = useSettingsStore((s) => s.settings);
  const defconLevel = settings.defconLevel ?? DEFCON_DEFAULT;
  const effectiveDefconLevel = Math.max(defconLevel, 2) as 2 | 3;
  const defconMerge = defconMergeActive(effectiveDefconLevel);
  const prompterActive = defconPrompterActive(effectiveDefconLevel);
  const devMode = settings.devMode ?? false;
  const luciferAiEnabled = isLuciferAiEnabled(settings);
  const luciferAiSilenced = isLuciferAiSilenced(settings);
  // Guest (same rule as the main window's PillRow): guests stay
  // terminal-only, so the mode pill is disabled for them.
  const profiles = useProfileStore((s) => s.profiles);
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  const isGuest = isGuestProfile(profiles.find((p) => p.id === activeProfileId));
  // LuciferAI status for the blood drop (same probe as
  // Terminal.tsx: init + model statuses, gated on enabled /
  // silenced). Without it the drop would show the offline dot
  // instead of the red drop even while the plugin is up.
  const [luciferAIAvailable, setLuciferAIAvailable] = useState(false);
  const [luciferAIChecking, setLuciferAIChecking] = useState(true);
  const [modelAvailable, setModelAvailable] = useState(false);
  const [modelNames, setModelNames] = useState<string[]>([]);
  // Ref mirror of prompterActive for the PTY callbacks (same
  // shape as Terminal.tsx's prompterActiveRef).
  const prompterActiveRef = useRef(prompterActive);
  useEffect(() => {
    prompterActiveRef.current = prompterActive;
  }, [prompterActive]);

  useDetachPushListeners();

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0] ?? null;

  // Live git state for the PillRow (same hook as Terminal.tsx).
  const gitStatus = useGitStatus(activeTab?.cwd);

  // --- DEFCON 3 prompter: block lifecycle (same machinery as
  // Terminal.tsx, running here in this renderer) ---
  const currentBlockIdRef = useRef<string | null>(null);
  const currentBlockClosedRef = useRef(false);
  const osc133PendingRef = useRef('');
  const blockQuietTimerRef = useRef<number | null>(null);

  const clearBlockQuietTimer = () => {
    if (blockQuietTimerRef.current !== null) {
      window.clearTimeout(blockQuietTimerRef.current);
      blockQuietTimerRef.current = null;
    }
  };

  const updateCurrentBlock = (tabId: string, fn: (b: TerminalBlock) => TerminalBlock) => {
    const id = currentBlockIdRef.current;
    if (id === null) return;
    const prev = useHistoryStore.getState().blocksByTab[tabId] ?? EMPTY_BLOCKS;
    const idx = prev.findIndex((b) => b.id === id);
    if (idx === -1) return;
    const nextBlock = fn(prev[idx]);
    if (nextBlock === prev[idx]) return;
    const next = [...prev];
    next[idx] = nextBlock;
    useHistoryStore.getState().setBlocks(tabId, next);
  };

  /** Close the current block: stamp it complete with
   *  durationMs = close − submit. No-op when there is no
   *  current block or it already closed — the first close
   *  wins. The block is looked up in the given tab's list, so
   *  a block opened for another tab is never touched. */
  const closeCurrentBlock = (tabId: string) => {
    if (currentBlockIdRef.current === null || currentBlockClosedRef.current) return;
    currentBlockClosedRef.current = true;
    clearBlockQuietTimer();
    const now = Date.now();
    updateCurrentBlock(tabId, (b) => closeBlock(b, now));
  };

  /** Re-arm the quiet timer: when the PTY stream stays quiet
   *  for BLOCK_QUIET_CLOSE_MS the prompt is taken to have
   *  returned and the block closes. */
  const armBlockQuietClose = (tabId: string) => {
    clearBlockQuietTimer();
    blockQuietTimerRef.current = window.setTimeout(() => {
      blockQuietTimerRef.current = null;
      closeCurrentBlock(tabId);
    }, BLOCK_QUIET_CLOSE_MS);
  };

  /** Append transcript text to the current block (capped). */
  const appendToCurrentBlock = (tabId: string, text: string, source: 'pty' | 'write' = 'pty') => {
    updateCurrentBlock(tabId, (b) => appendBlockOutput(b, text, { source }));
  };

  /** Open a block for a composer submit: the previous block
   *  closes first, then the new block is written to the store
   *  with the command + submit stamp + live cwd. Composer
   *  submits only, at DEFCON 3+ — below 3 this is a no-op. */
  const openBlock = (tabId: string, command: string) => {
    if (!prompterActiveRef.current) return;
    const prevBlockId = currentBlockIdRef.current;
    closeCurrentBlock(tabId);
    if (prevBlockId !== null) dropPendingEscape(prevBlockId);
    const cwd = useTerminalStore.getState().tabs.find((t) => t.id === tabId)?.cwd;
    const block = newBlock(command, cwd, Date.now());
    currentBlockIdRef.current = block.id;
    currentBlockClosedRef.current = false;
    useHistoryStore.getState().setBlocks(tabId, (prev) => [...prev, block]);
    // Git state stamped at submit (same as Terminal.tsx):
    // fire-and-forget — the block already exists, the status
    // lands when it resolves. No repo / no git → no stamp.
    if (cwd) {
      const blockId = block.id;
      void getCachedGitStatus(cwd).then((gitState) => {
        if (!gitState) return;
        useHistoryStore.getState().setBlocks(tabId, (prev) => {
          const idx = prev.findIndex((b) => b.id === blockId);
          if (idx === -1 || prev[idx].gitState) return prev;
          const next = [...prev];
          next[idx] = { ...prev[idx], gitState };
          return next;
        });
      });
    }
  };

  // --- DEFCON 3 prompter: the linked composer ---
  const [devInput, setDevInput] = useState('');
  const [devHistory, setDevHistory] = useState<string[]>([]);
  const devHistoryIdx = useRef<number | null>(null);
  const [devRunning, setDevRunning] = useState(false);
  const composerRunningRef = useRef(false);
  const prompterComposerWrapRef = useRef<HTMLDivElement | null>(null);

  // Write Lucid output into the feed: into the current block,
  // and onto the xterm surface when it is mounted (devmode).
  // In non-devmode at level 3 the surface is unmounted, so the
  // block is the only sink — output appears exactly once.
  // The capture condition is the BLOCK, not the level: a block
  // opened at level 3 can outlive the level that opened it —
  // /defcon 2's own confirmation is written after the level
  // already dropped, and it belongs in the block. (Gating on
  // the live level dropped exactly that output.)
  const miniWriteLines = (tabId: string, text: string, opts?: { captureToBlock?: boolean }) => {
    const normalized = text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    termRef.current?.write(`\r\n${normalized}\r\n`);
    if (opts?.captureToBlock !== false && currentBlockIdRef.current !== null) {
      appendToCurrentBlock(tabId, text.replace(/\r\n/g, '\n'), 'write');
    }
  };

  /** /defcon in the detached composer — the same branch as the
   *  main window (Terminal.tsx runSlashCommand), same output,
   *  same event-log entry. The level changes on Gary's explicit
   *  order only, nothing auto-escalates. */
  const runMiniDefconCommand = async (tabId: string, line: string) => {
    const parsed = parseCommand(line);
    const write = (text: string) => {
      miniWriteLines(tabId, text);
    };
    const settingsNow = useSettingsStore.getState().settings;
    const level = settingsNow.defconLevel;
    const mergeReading = settingsNow.defconMergeReading;
    const arg = (parsed.args[0] ?? '').toLowerCase();
    if (arg === 'merge') {
      const reading = (parsed.args[1] ?? '').toLowerCase();
      if (reading !== 'a' && reading !== 'b' && reading !== 'c') {
        write(
          `DEFCON 2 merge reading — ${mergeReading === null ? 'not picked yet' : `picked: ${defconMergeReadingText(mergeReading)}`}\n\n${defconMergeReadingText('a')}\n${defconMergeReadingText('b')}\n${defconMergeReadingText('c')}\n\nUsage: /defcon merge a|b|c — pick the DEFCON 2 merge reading. The merge (reading (b)) is built: at DEFCON 2+ the mist is the back layer, the terminal box is gone, and the text is whiter.`,
        );
        return;
      }
      await useSettingsStore.getState().updateSetting('defconMergeReading', reading);
      write(
        `DEFCON 2 merge reading picked: ${defconMergeReadingText(reading)}\n\nThe merge is built (reading (b)) — it takes effect at DEFCON 2: set the level with /defcon 2 to see it.`,
      );
      return;
    }
    if (arg === '') {
      write(
        `${describeDefcon(level, { mergeReading, mergeImplemented: DEFCON2_MERGE_IMPLEMENTED, currentLevel: level, prompterImplemented: DEFCON3_PROMPTER_IMPLEMENTED })}\n\nUsage: /defcon 1|2|3 — set the level (your order only, nothing auto-escalates). /defcon merge a|b|c — pick the DEFCON 2 merge reading.`,
      );
      return;
    }
    const next = Number(arg);
    if (!isDefconLevel(next)) {
      write(
        'Usage: /defcon [1|2|3] — set the level. /defcon — show the current level. /defcon merge a|b|c — pick the DEFCON 2 merge reading.',
      );
      return;
    }
    if (next === level) {
      write(`Already at ${describeDefcon(level, { mergeReading, mergeImplemented: DEFCON2_MERGE_IMPLEMENTED, currentLevel: level, prompterImplemented: DEFCON3_PROMPTER_IMPLEMENTED })}`);
      return;
    }
    await useSettingsStore.getState().updateSetting('defconLevel', next);
    useEventLogStore.getState().log({
      phase: 'throughout',
      type: 'defcon.level-change',
      what: `DEFCON level ${level} → ${next}`,
      why: 'Gary’s explicit order — /defcon command',
      outcome: 'completed',
      detail: null,
    });
    const unmet = defconCriteria(next, { mergeReading, mergeImplemented: DEFCON2_MERGE_IMPLEMENTED, currentLevel: level, prompterImplemented: DEFCON3_PROMPTER_IMPLEMENTED }).filter((c) => !c.met);
    write(
      `DEFCON ${next} — ${defconTagline(next)}${unmet.length > 0 ? `\n\nStill open:\n${unmet.map((c) => `  [ ] ${c.text}`).join('\n')}` : ''}\n\nLevels gate nothing — they are readiness milestones, not locks.`,
    );
  };

  // Write to the PTY: true unless the send throws. A detached
  // window NEVER falls back to dev mode on a failed write (the
  // topology failsafe in Terminal.tsx would flip devMode
  // settings, which a detached window must never do) — the
  // failure surfaces as the ❌ line in the block instead.
  const ptyWrite = (tabId: string, data: string): boolean => {
    try {
      window.lucidAPI.terminal.write(tabId, data);
      return true;
    } catch {
      return false;
    }
  };

  // Submit from the LINKED composer — DEFCON 3 prompter (same
  // shape as Terminal.tsx handleComposerSubmit, terminal mode
  // only — no agent mode in a detached window). Bare lines go
  // composed `text + '\r'` via ptyWrite, so the shell owns
  // echo, history and execution; the block opens at submit and
  // its output arrives as PTY chunks. Slash lines: /defcon
  // runs locally (above); every other slash is a Lucid command
  // and never reaches the shell — the block carries the note.
  const handleComposerSubmit = async (line: string) => {
    const tabId = activeTab?.id;
    if (!tabId || shellExited) return;
    const trimmed = line.trim();
    if (!trimmed) return;
    // Submit guard: one composer submit in flight at a time.
    if (composerRunningRef.current) return;
    composerRunningRef.current = true;
    // First prompt to this tab — mark it before the submit
    // runs: the ghost words are gone for this tab after its
    // first prompt.
    useTerminalStore.getState().markTabPrompted(tabId);
    setDevHistory((prev) => [...prev, trimmed].slice(-100));
    devHistoryIdx.current = null;
    setDevInput('');
    setDevRunning(true);
    try {
      if (trimmed.startsWith('/')) {
        // DEFCON 3 Phase 2: open the block FIRST — the output
        // lands in it, and the block closes exactly when the
        // command resolves.
        openBlock(tabId, trimmed);
        if (parseCommand(trimmed).type === 'defcon') {
          await runMiniDefconCommand(tabId, trimmed);
        } else {
          miniWriteLines(tabId, SLASH_NOT_HERE_NOTE);
        }
        closeCurrentBlock(tabId);
        return;
      }
      // DEFCON 3 Phase 2: the block opens at submit; its
      // output arrives as PTY chunks (handleData) and it
      // closes on next-prompt detection (quiet timer) or at
      // the next submit.
      openBlock(tabId, trimmed);
      if (!ptyWrite(tabId, `${trimmed}\r`)) {
        miniWriteLines(tabId, '❌ Could not write to the terminal — the input path is down.');
      }
    } finally {
      composerRunningRef.current = false;
      setDevRunning(false);
    }
  };

  // DEFCON 3 Phase 3 — the rest of the prompter: ghost
  // suggestion, Ctrl+C / Ctrl+D forwarding. The ghost comes
  // from the composer's own submitted history (devHistory
  // prefix match) and from known slash-command names — see
  // src/lib/prompterSuggestions.ts. Computed only while the
  // prompter is active: below level 3 there is no composer.
  const ghostSuggestion = prompterActive ? computeGhostSuggestion(devInput, devHistory) : null;

  // Hint line (Warp §5, same as Terminal.tsx): what the next
  // keystroke does, for this terminal session and draft.
  const agentPromptDetected = useMemo(
    () => detectAgentPrompt(devInput).isPrompt,
    [devInput],
  );
  const hintLineText = computeHintLine({
    sessionKind: 'terminal',
    prompterActive,
    devMode,
    draft: devInput.trim(),
    agentPromptDetected,
  });
  const acceptGhostSuggestion = () => {
    if (ghostSuggestion) setDevInput(ghostSuggestion);
  };
  // Ctrl+C / Ctrl+D from the composer: the xterm-input gate
  // drops ALL xterm input at level 3, so the composer forwards
  // them to the PTY via ptyWrite — '\x03' interrupts the
  // running shell command, '\x04' is EOF. The composer text
  // itself is NOT cleared.
  const handleComposerInterrupt = () => {
    const tabId = activeTab?.id;
    if (tabId) ptyWrite(tabId, '\x03');
  };
  const handleComposerEof = () => {
    const tabId = activeTab?.id;
    if (tabId) ptyWrite(tabId, '\x04');
  };

  const devHistoryUp = () => {
    if (devHistory.length === 0) return;
    const idx =
      devHistoryIdx.current === null
        ? devHistory.length - 1
        : Math.max(0, devHistoryIdx.current - 1);
    devHistoryIdx.current = idx;
    setDevInput(devHistory[idx]);
  };
  const devHistoryDown = () => {
    if (devHistoryIdx.current === null) return;
    const idx = devHistoryIdx.current + 1;
    if (idx >= devHistory.length) {
      devHistoryIdx.current = null;
      setDevInput('');
    } else {
      devHistoryIdx.current = idx;
      setDevInput(devHistory[idx]);
    }
  };

  // The ghost words (Gary, 2026-11-13 ~02:02 PST — Warp
  // reference): true-placeholder words inside the composer,
  // non-devmode prompter only, words exist for this state,
  // input empty, and this tab has not had its first prompt
  // yet. Terminal mode words appear ONLY when the LuciferAI
  // icon is enabled (getPromptHintWords returns null when it
  // is off — zero residue).
  const hasPrompted = activeTab?.hasPrompted ?? false;
  const hintWords = getPromptHintWords('terminal', luciferAiEnabled, luciferAiSilenced);
  const composerHintPlaceholder =
    !devMode && prompterActive && hintWords !== null && devInput.length === 0 && !hasPrompted
      ? hintWords
      : null;

  // The linked composer (same shape as Terminal.tsx's
  // renderPrompterComposer, terminal mode only — no agent
  // handoff, no agent escape; no dragState — the input keeps
  // its own, as before). When LuciferAI is off the ➜ send
  // arrow + ~ sit beside it, exactly as in the main window.
  const renderPrompterComposer = (hintPlaceholder: string | null) => (
    <div data-testid="prompter-composer" className={luciferAiEnabled ? (!devMode && prompterActive ? 'rounded-none bg-[var(--bg-tertiary)]/50' : 'rounded-none border border-[var(--border)] bg-[var(--bg-tertiary)]/50') : 'flex items-center gap-2'}>
      {!luciferAiEnabled && (
        <>
          <Tooltip content="Send" shortcut="Enter">
            <button
              type="button"
              data-testid="dev-send-arrow"
              onClick={() => void handleComposerSubmit(devInput)}
              disabled={!devInput.trim()}
              aria-label="Send command"
              className="shrink-0 rounded px-1 text-[var(--warning)] font-bold text-lg leading-none select-none hover:bg-white/10 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
              style={{ textShadow: '0 0 8px rgba(251, 191, 36, 0.5)' }}
            >
              ➜
            </button>
          </Tooltip>
          <span className="text-[var(--text-secondary)] font-mono text-sm leading-none select-none opacity-70">~</span>
        </>
      )}
      <div className={luciferAiEnabled ? '' : 'flex-1 rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--bg-tertiary)]/50'}>
        <InputArea
          input={devInput}
          setInput={setDevInput}
          onSubmit={(value) => void handleComposerSubmit(value)}
          onHistoryUp={devHistoryUp}
          onHistoryDown={devHistoryDown}
          isProcessing={devRunning}
          flat={!luciferAiEnabled}
          // Gary, 2026-11-10 ~03:58 PST: no extend drag tab when
          // devMode is OFF — the non-devmode view is clean black.
          // Devmode keeps the handle exactly as it was.
          showDragHandle={devMode}
          ghostSuggestion={ghostSuggestion}
          hintPlaceholder={hintPlaceholder}
          onAcceptSuggestion={acceptGhostSuggestion}
          onInterrupt={handleComposerInterrupt}
          onEof={handleComposerEof}
        />
      </div>
    </div>
  );

  // Focus the composer's input (Monaco in production, the plain
  // textarea fallback in tests — either way the first textarea
  // in the wrapper is the composer's input).
  const focusPrompterComposer = () => {
    const wrap = prompterComposerWrapRef.current;
    if (!wrap) return false;
    const target = wrap.querySelector('textarea') as HTMLElement | null;
    if (!target) return false;
    target.focus();
    return document.activeElement === target;
  };

  // Mode pill (same as Terminal.tsx's handleModePill): flip
  // this tab's session mode and refocus the composer. A
  // detached window has no agent UI — the flip is recorded in
  // the session store and takes effect where agent mode exists
  // (the main window, when the tab pops back in). In guest the
  // pill is disabled, so this never fires there.
  const handleModePill = () => {
    if (!activeTab) return;
    useSessionStore.getState().toggleTabMode(activeTab.id);
    setTimeout(() => focusPrompterComposer(), 0);
  };

  // Focus follows the input owner: the composer at level 3, the
  // xterm surface below it.
  useEffect(() => {
    if (!activeTab) return;
    if (prompterActive) {
      const t = setTimeout(() => focusPrompterComposer(), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => termRef.current?.focus(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompterActive, activeTab?.id]);

  // Theme: the detached window loads the same settings as the
  // main window (loadSettings applies the theme) and follows
  // later theme flips via the settings:changed push (§6.1).
  // The DEFCON level follows the same way: a /defcon change in
  // the main window broadcasts settings:changed with the key,
  // and this window reloads — so the level, the merge and the
  // badge below track the main window live, never a stale
  // copy from mount time.
  // Guest veil (see the header): this renderer imports the
  // profile store, whose module-level check veils a guest
  // session — and the check repeats here on mount, so the
  // guest's live blocks are never persisted over the owner's
  // history even if the import order ever changes.
  useEffect(() => {
    void useSettingsStore.getState().loadSettings();
    const profileState = useProfileStore.getState();
    if (isGuestProfile(profileState.profiles.find((p) => p.id === profileState.activeProfileId))) {
      useHistoryStore.getState().enterGuestSession();
    }
    const onChanged = window.lucidAPI?.settings?.onChanged?.((key) => {
      if (
        key === 'theme' ||
        key === 'customTheme' ||
        key === 'defconLevel' ||
        key === 'defconMergeReading'
      ) {
        void useSettingsStore.getState().loadSettings();
      }
    });
    return () => {
      onChanged?.();
    };
  }, []);

  // LuciferAI status probe for the blood drop (same probe as
  // Terminal.tsx, adapted: init + model statuses, gated on
  // enabled / silenced, retried every 30s while down). The
  // drop's glyph depends on it — without the probe it would
  // show the offline dot even while the plugin is up. No
  // loading-store calls: the main window's top-left dot does
  // not exist here.
  useEffect(() => {
    if (!luciferAiEnabled) {
      setLuciferAIAvailable(false);
      setModelAvailable(false);
      setModelNames([]);
      setLuciferAIChecking(false);
      return;
    }
    if (luciferAiSilenced) {
      setLuciferAIChecking(false);
      return;
    }
    const initLuciferAI = async () => {
      try {
        const result = await window.lucidAPI.lucid.init();
        if (!result.success) {
          setLuciferAIAvailable(false);
          setModelAvailable(false);
          setModelNames([]);
          return;
        }
        const statuses = await window.lucidAPI.lucid.getModelStatuses();
        if (!isLuciferAiEnabled(useSettingsStore.getState().settings)) {
          setLuciferAIAvailable(false);
          setModelAvailable(false);
          setModelNames([]);
          return;
        }
        const available = Object.entries(statuses || {})
          .filter(([, up]) => up)
          .map(([name]) => name);
        setLuciferAIAvailable(true);
        setModelAvailable(available.length > 0);
        setModelNames(available);
      } catch {
        setLuciferAIAvailable(false);
        setModelAvailable(false);
        setModelNames([]);
      } finally {
        setLuciferAIChecking(false);
      }
    };
    void initLuciferAI();
    const retryInterval = setInterval(() => {
      if (document.hidden) return;
      if (!luciferAIAvailable || !modelAvailable) {
        void initLuciferAI();
      }
    }, 30000);
    return () => clearInterval(retryInterval);
  }, [luciferAIAvailable, modelAvailable, luciferAiEnabled, luciferAiSilenced]);

  // The tab this window was created for: main stores it as
  // pending detach state; fetch it on mount (the push is the
  // backup). A window opened with no state (manual ?mini=)
  // shows the waiting state instead of a dead terminal.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const detach = window.lucidAPI?.terminal?.detach;
      if (!detach) {
        setWaiting(false);
        return;
      }
      try {
        const tab = await detach.getDetachState();
        if (cancelled) return;
        if (tab) {
          addDetachedTab({ ...tab, isActive: true });
          detach.claimTab(tab.id);
        }
      } catch {
        // No state — the waiting screen stays.
      }
      setWaiting(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close when the last tab leaves (remount / pop-in / close):
  // an empty detached window is useless. Gated on having had a
  // tab, so the load race (no tab yet) never closes the window.
  useEffect(() => {
    if (tabs.length > 0) hadTabsRef.current = true;
    if (hadTabsRef.current && tabs.length === 0) {
      window.lucidAPI.window.close();
    }
  }, [tabs.length]);

  // Plain PTY wiring for the active tab: raw data straight to
  // xterm (no cleaning — the shell's echo/backspace stream
  // renders correctly in a live xterm; the doubling only shows
  // in sanitised transcripts), exit + cwd filtered by tab id.
  // DEFCON 3 Phase 2 — blocks: every PTY chunk while a composer
  // block is current is that block's output (the shell echo +
  // the command's output, as a transcript), and each chunk
  // re-arms the quiet timer — when the stream goes quiet the
  // prompt is taken to have returned and the block closes.
  // The block capture uses the BEL-cleaned chunk (same as
  // Terminal.tsx); the xterm keeps the raw stream, as before.
  useEffect(() => {
    if (!activeTab) return;
    if (!window.lucidAPI?.terminal) return;
    const tabId = activeTab.id;
    const handleData = (id: string, data: string) => {
      if (id !== tabId) return;
      const cleaned = processTerminalBell(
        data,
        useSettingsStore.getState().settings.bellSound,
      );
      // OSC 133 shell-integration exit codes (same as
      // Terminal.tsx): the opt-in script emits one D sequence
      // per prompt; parse it out of the raw chunk and stamp
      // the current block. A block that already closed still
      // takes it (same rule as late output).
      if (prompterActiveRef.current && currentBlockIdRef.current !== null) {
        const { codes, pending } = parseOsc133ExitCodes(cleaned, osc133PendingRef.current);
        osc133PendingRef.current = pending;
        if (codes.length > 0) {
          const code = codes[codes.length - 1];
          updateCurrentBlock(tabId, (b) => (b.exitCode === code ? b : { ...b, exitCode: code }));
        }
      }
      termRef.current?.write(data);
      if (prompterActiveRef.current && currentBlockIdRef.current !== null) {
        appendToCurrentBlock(tabId, cleaned, 'pty');
        armBlockQuietClose(tabId);
      }
    };
    const handleExit = (id: string, code: number) => {
      if (id !== tabId) return;
      // DEFCON 3 Phase 2: the shell exiting closes any open block.
      closeCurrentBlock(tabId);
      markTabExited(tabId, code);
      setShellExited({ code });
      termRef.current?.write(`\r\n\x1b[31mShell exited (code ${code}).\x1b[0m\r\n`);
    };
    const handleCwd = (id: string, cwd: string) => {
      if (id !== tabId) return;
      updateTabCwd(tabId, cwd);
    };
    const cleanupData = window.lucidAPI.terminal.onData(handleData);
    const cleanupExit = window.lucidAPI.terminal.onExit(handleExit);
    const cleanupCwd = window.lucidAPI.terminal.onCwd?.(handleCwd) ?? (() => {});
    return () => {
      cleanupData();
      cleanupExit();
      cleanupCwd();
    };
  }, [activeTab?.id, updateTabCwd, markTabExited]);

  // Focus the surface when the active tab changes (below level
  // 3 — at level 3 the composer owns focus, see above).
  useEffect(() => {
    if (!activeTab) return;
    if (prompterActiveRef.current) return;
    const t = setTimeout(() => termRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [activeTab?.id]);

  // DEFCON 3 input ownership (same as Terminal.tsx): while the
  // prompter owns typing, xterm keystrokes must not also reach
  // the PTY — the two inputs must not fight. In non-devmode at
  // level 3 the surface is unmounted anyway; this covers the
  // devmode surface that stays mounted below the feed.
  const handleXtermInput = (data: string) => {
    if (prompterActiveRef.current) return;
    if (!activeTab || shellExited) return;
    window.lucidAPI.terminal.write(activeTab.id, data);
  };

  const handleResize = (cols: number, rows: number) => {
    if (!activeTab) return;
    window.lucidAPI.terminal.resize(activeTab.id, cols, rows);
  };

  // Restart re-creates the SAME tab id (NOT closeTab+createTab
  // — that would mint a new id and break the detach
  // bookkeeping): createTerminal destroys the old PTY first.
  const restartShell = async () => {
    if (!activeTab) return;
    setShellExited(null);
    clearTabExited(activeTab.id);
    try {
      await window.lucidAPI.terminal.create(activeTab.id, activeTab.cwd);
    } catch {
      // The create error surfaces via createErrors in the store.
    }
    termRef.current?.focus();
  };

  const popInActive = () => {
    if (!activeTab) return;
    const detach = window.lucidAPI?.terminal?.detach;
    if (!detach) return;
    void detach.popIn({
      id: activeTab.id,
      title: activeTab.title,
      cwd: activeTab.cwd,
      hasPrompted: activeTab.hasPrompted,
    });
  };

  // The DEFCON merge back layer uses the exact same seven
  // drifting smoke puffs as the boot splash and the loading
  // mist (SplashScreen.css) — no new look invented.
  const puffs = Array.from({ length: SPLASH_SMOKE_PUFF_COUNT }, (_, i) => i);

  return (
    <div
      data-testid="mini-terminal"
      className="relative h-screen w-screen flex flex-col overflow-hidden"
    >
      {/* DEFCON merge back layer (Gary, 2026-11-13 — "terminal
          tabs should always be in the global defcon state, even
          when pulled out"): the splash mist is this window's
          persistent background, exactly as it is behind the
          main terminal — always rendered, revealed by the merge
          veil on the content layer at DEFCON 2+. At DEFCON 1
          the content layer is opaque, so the mist stays hidden,
          as in the main window. (The effective level is floored
          at 2, so this window never renders the DEFCON 1 state
          — see above.) */}
      <div className="mini-defcon-mist" aria-hidden="true" data-testid="mini-defcon-mist">
        <div className="splash-smoke" aria-hidden="true">
          {puffs.map((i) => (
            <div
              key={i}
              className={`splash-puff splash-puff-${i}${i === 2 ? ' splash-puff-accent' : ''}`}
            />
          ))}
        </div>
      </div>
      {/* Loading mist (Gary, 2026-11-13): the window loads into
          the splash mist and fades out once the detach state has
          settled — never an instant cut to the terminal. */}
      <MiniLoadingMist ready={!waiting} />
      {/* Content layer: the merge veil at DEFCON 2+ (the same
          `bg-black/25 backdrop-blur-sm` as Terminal.tsx's
          terminal page — it darkens and blurs the mist behind
          it), the theme background at DEFCON 1. */}
      <div
        data-testid="mini-terminal-content"
        className={`relative z-10 flex min-h-0 flex-1 flex-col text-[var(--text-primary)]${
          defconMerge ? ' bg-black/25 backdrop-blur-sm' : ' bg-[var(--bg-primary)]'
        }`}
      >
      {/* Chrome: drag region + pop-back-in + close (mirrors the
          browser mini's chrome). The DEFCON badge shows the
          global level this tab is in — the same badge as the
          main terminal, reading the same store.
          Traffic lights (Gary, 2026-11-13 ~14:06 PST — "have
          the terminal wording start past the circles"): this
          window is frameless (titleBarStyle hidden) so macOS
          draws the red/yellow/green circles over the top-left
          of the chrome — the title used to start under them,
          its first letter clipped. The left padding clears
          the whole cluster (~64px) plus a gap, so the wording
          starts past the circles, never under them. */}
      <div
        data-testid="mini-terminal-chrome"
        style={dragStyle}
        className="h-9 shrink-0 flex items-center justify-between border-b border-[var(--border)] bg-black/50 backdrop-blur-md pl-[76px] pr-2"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-sm text-[var(--text-muted)] truncate">
            {activeTab ? activeTab.title : 'Terminal'}
          </span>
          <DefconBadge />
        </span>
        <span className="flex items-center gap-1" style={noDragStyle}>
          <button
            type="button"
            title="Pop back into the main window"
            aria-label="Pop back into the main window"
            onClick={popInActive}
            disabled={!activeTab}
            className="p-1.5 rounded hover:bg-[var(--bg-secondary)] disabled:opacity-30"
          >
            <CornerUpLeft size={16} />
          </button>
          <button
            type="button"
            title="Close window (tab pops back in)"
            aria-label="Close window (tab pops back in)"
            onClick={() => window.lucidAPI.window.close()}
            className="p-1.5 rounded hover:bg-[var(--bg-secondary)]"
          >
            <X size={16} />
          </button>
        </span>
      </div>

      <TerminalTabs detachedWindow showBloodDrop={false} />

      {waiting && tabs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-[var(--text-muted)]">Waiting for the tab…</p>
        </div>
      ) : activeTab ? (
        <>
          {shellExited && (
            <div className="mx-4 mt-4 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3">
              <p className="text-sm font-semibold text-yellow-200">
                Shell exited (code {shellExited.code})
              </p>
              <p className="mt-1 text-xs text-yellow-200/70">
                This terminal is no longer accepting input.
              </p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => void restartShell()} className="btn btn-primary text-sm py-1 px-3">
                  Restart Shell
                </button>
              </div>
            </div>
          )}
          {/* DEFCON 3 prompter — the live blocks feed (same as
              Terminal.tsx: renders when the prompter is active).
              DEFCON 3 Phase 5 — the non-devmode landing: at
              level 3+ in NON-devmode the list IS the feed
              (`fill` — it takes the terminal column, and the
              xterm surface below is unmounted, so output
              appears exactly once). In devmode it stays the
              capped panel above the live xterm. */}
          {prompterActive && (
            <UnifiedFeed tabId={activeTab.id} onReinput={(command) => setDevInput(command)} fill={!devMode} />
          )}
          {/* DEFCON 3 Phase 5 — the xterm surface is UNMOUNTED
              at level 3+ in NON-devmode (see the duplication
              decision in BlockList.tsx): the BlockList above is
              the sole feed, so output appears exactly once — no
              live stream duplicating the block transcript, no
              flashing cursor as the input. The PTY keeps
              running in the main process (it is tab-owned, not
              surface-owned), so dropping back below 3 remounts
              a fresh surface on the live shell. In devmode the
              surface stays: the war zone keeps the raw stream
              visible, duplication and all. */}
          {!((prompterActive) && !devMode) && (
          <div className="flex-1 overflow-hidden p-4">
            {/* DEFCON 2 merge (same as Terminal.tsx): at DEFCON
                2+ the terminal box is GONE — this wrap drops its
                border, its 2px top edge and its background
                entirely, so the text floats clear over the mist
                with nothing framing it. At DEFCON 1 the solid
                black box stands, exactly as it stands. (The
                effective level is floored at 2, so this window
                never renders the solid box.) */}
            <div
              data-testid="mini-terminal-surface-wrap"
              className={
                defconMerge
                  ? 'h-full w-full overflow-hidden rounded-none border-0 bg-transparent'
                  : 'h-full w-full overflow-hidden rounded-none border border-[var(--border)] border-t-2 border-t-[var(--text-muted)] bg-black'
              }
            >
              <XtermSurface
                key={activeTab.id}
                ref={termRef}
                onInput={handleXtermInput}
                onResize={handleResize}
                disabled={shellExited !== null}
              />
            </div>
          </div>
          )}
          {/* DEFCON 3 prompter — the prompt section (same shape
              as Terminal.tsx's: a whole section, not a thin
              input bar). Non-devmode: a BLACK prompt bar — solid
              black, flat — like Warp AI; the prompt section is
              NOT part of the merge, so the mist stays out of it.
              Dev mode keeps the glass. The linked composer IS
              the input here, flex-1 in the row, with the live
              cwd chip — and the blood drop, HintLine and PillRow
              are all present, same as the main window (Gary,
              2026-11-13 ~14:35 PST). No Sentinel face, no agent
              mode in a detached window (see header). */}
          {prompterActive && (
            <div
              data-testid="mini-prompt-section"
              className="shrink-0 border-t-2 border-t-[var(--text-muted)]"
              style={devMode ? {
                background: 'linear-gradient(180deg, rgba(38, 45, 56, 0.55), rgba(22, 27, 34, 0.65))',
                boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.35)',
              } : {
                background: '#000000',
              }}
            >
              <div className="flex items-center gap-2 px-5 pt-3" data-testid="mini-prompt-section-header">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Terminal</span>
                {devMode ? (
                  <span className="rounded border border-amber-500/50 bg-amber-500/15 px-1.5 py-px text-[11px] font-semibold uppercase tracking-wider text-amber-300">DEFCON 3 — prompt linked</span>
                ) : (
                  <span className="text-[11px] text-[var(--text-muted)] opacity-70">plain shell</span>
                )}
                {activeTab.cwd && (
                  <span data-testid="cwd-chip" className="ml-auto shrink-0 truncate rounded-full border border-[var(--border)] bg-[var(--bg-tertiary)]/50 px-2 py-px font-mono text-[11px] text-[var(--text-secondary)]" title={activeTab.cwd}>
                    {activeTab.cwd}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 px-5 py-4" data-testid="mini-prompt-input-row">
                {/* LuciferAI blood drop (Gary, 2026-11-13 ~14:35
                    PST — the drop must be there too): the
                    silencer, same as the main window's prompt
                    row — lit red while speaking, grey while
                    silenced, and it renders NOTHING when
                    LuciferAI is off (plain terminal, zero
                    residue), so the composer stretches to fill
                    the gap. */}
                {luciferAiEnabled && (
                  <LuciferStatusIndicator
                    enabled={luciferAiEnabled}
                    checking={luciferAIChecking}
                    modelAvailable={modelAvailable}
                    modelNames={modelNames}
                    available={luciferAIAvailable}
                    silenced={luciferAiSilenced}
                    toggleActive={!luciferAiSilenced}
                    onToggleBloodDrop={() =>
                      void useSettingsStore
                        .getState()
                        .updateSetting(
                          'luciferAiSilenced',
                          !isLuciferAiSilenced(useSettingsStore.getState().settings),
                        )
                    }
                  />
                )}
                <div className="min-w-0 flex-1" data-testid="prompter-composer-wrap" ref={prompterComposerWrapRef}>
                  {renderPrompterComposer(composerHintPlaceholder)}
                </div>
              </div>
              {/* Hint line + pill row (Gary, 2026-11-13 ~14:35
                  PST — the external prompt + pills were all
                  messed up without them): same as the main
                  window — the hint line teaches the next
                  keystroke, the pill row is the mode pill, the
                  driving-agent pill, the cwd / branch / counts
                  pills and the version pill. */}
              <HintLine text={hintLineText} />
              <PillRow
                mode="terminal"
                cwd={activeTab.cwd}
                gitStatus={gitStatus}
                onModePill={handleModePill}
                modePillDisabled={isGuest}
              />
            </div>
          )}
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-[var(--text-muted)]">No terminal tab</p>
        </div>
      )}
      </div>
    </div>
  );
}
