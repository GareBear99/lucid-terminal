import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTerminalStore } from '../../stores/terminalStore';
import { useToastStore } from '../../stores/toastStore';
import { useLoadingStore } from '../../stores/loadingStore';
import { useAIStore } from '../../stores/aiStore';
import { useHistoryStore } from '../../stores/historyStore';
import { usePromptPaceStore } from '../../stores/promptPaceStore';
import { useHornWiggleStore } from '../../stores/hornWiggleStore';
import { XtermSurface, XtermSurfaceHandle } from './XtermSurface';
import { InputArea } from './InputArea';
import { parseCommand, getFallbackMessage, findClosestCommand, requiresLLM } from '../../utils/commandRouter';
import { HelpPanel } from '../Help/HelpPanel';
import { PlanningPanel } from '../Planning/PlanningPanel';
import { SentinelFace } from '../Synth/SentinelFace';
import { shouldDrip } from '../Synth/blood';
import { Heartbeat } from './Heartbeat';
import { LuciferStatusIndicator } from './LuciferStatusIndicator';
import { isLuciferAiEnabled, isLuciferAiSilenced, LUCIFER_AI_SILENCED_NOTE } from '../../lib/luciferAi';
import { checkPromptFocus, ptyWriteFailureReason, TOPOLOGY_FALLBACK_NOTICE, TOPOLOGY_FALLBACK_TITLE } from '../../lib/topologySync';
import { processTerminalBell } from '../../lib/terminalBell';
import { Tooltip } from '../Tooltip/Tooltip';

// Dev console cap — the detached bar's own output keeps only the
// last 200 lines (Gary, 2026-11-07: dev-mode topology).
const DEV_CONSOLE_CAP = 200;

interface TerminalProps {
  tabId: string;
  onOpenHelp?: () => void;
  /** Open the Synth view (the Sentinel's home). */
  onOpenSynth?: () => void;
  /** Open the Forge (the Homunculi roster). */
  onOpenForge?: () => void;
  /** Whether the prompt blood drop (LuciferAI silencer) reads as ON
   * — LuciferAI speaking, not silenced. */
  luciferToggleActive?: boolean;
  /** Silence / un-silence LuciferAI (the prompt blood drop next to
   * the send arrow). It greys the drop; it never turns the plugin
   * off. */
  onToggleLuciferAi?: () => void;
}

/**
 * REAL terminal (Gary, 2026-11-07: "terminal is not a terminal at
 * all"). The surface is xterm.js attached to a node-pty login
 * interactive shell — the shell owns echo, line editing, history,
 * completion and job control. Every keystroke reaches the PTY the
 * moment it is typed; PTY output streams into the terminal as it
 * arrives, for as long as it arrives. There is no Monaco prompt,
 * no send arrow, no block list, no 500ms fake-completion timer,
 * and no dispatcher intercepting bare words.
 *
 * Bare words go to the shell, always. Lucid commands are EXPLICIT
 * slash commands (`/fix`, `/llm`, `/help`, ...): the input handler
 * tracks the current line, and on Enter a line starting with '/'
 * is wiped from the shell's line (Ctrl+U) and run as a Lucid
 * command instead, its output printed into the stream. A slash
 * line that used Tab/arrows cannot be tracked reliably — it falls
 * through to the shell, which reports it as not found.
 *
 * The prompt section keeps its Warp-style whole-section bar
 * (header, blood drop, Sentinel face) around the real surface:
 * NON-DEVMODE it is a solid BLACK bar on a full-black page, like
 * Warp AI (Gary, 2026-11-08 ~07:05 PST — clean page unison); DEV
 * MODE keeps the frosted glass. The bar is the frame, not the
 * terminal.
 */
function Terminal({ tabId, onOpenHelp, onOpenSynth, onOpenForge, luciferToggleActive, onToggleLuciferAi }: TerminalProps) {
  const { settings } = useSettingsStore();
  // The LuciferAI disable rule (Gary, 2026-11-05): when this is
  // false the plugin is completely gone. Every gate below reads
  // this value, never the raw setting (missing key = ON).
  const luciferAiEnabled = isLuciferAiEnabled(settings);
  // The LuciferAI silenced state (Gary, 2026-11-08 ~02:28 PST):
  // the blood drop toggle is JUST a silencer — it greys the drop,
  // it never turns the plugin off. SILENCED = POTENTIAL DAEMON
  // ONLY (Gary, 2026-11-08 ~06:41 PST): while silenced LuciferAI
  // does nothing active — no bubbles on its inputs, no terminal
  // link, no awaiting commands — and its ticks freeze (never
  // reset, never re-numbered) until un-silence resumes them.
  // The gates below read this value wherever LuciferAI would
  // ACT: the heartbeat, the plugin probe, and the plugin slash
  // commands. The plain terminal and the Lucid-local commands
  // (fix / fixnet / browser / workflow / history / devmode) never
  // read it — they work with LuciferAI on, off, or silenced.
  const luciferAiSilenced = isLuciferAiSilenced(settings);
  const { createTab, closeTab, createErrors, clearCreateError, updateTabCwd } = useTerminalStore();
  // This tab's working directory — the prompt section's
  // context line (Warp's attached path, Gary 2026-11-07). It
  // follows the live shell now: the main process reports OSC 7 /
  // cd moves over `terminal:cwd`.
  const tabCwd = useTerminalStore((st) => st.tabs.find((t) => t.id === tabId)?.cwd);
  // A slash command is running (the 'command' loading key). The
  // shell itself never sets this — only Lucid work does.
  const [slashRunning, setSlashRunning] = useState(false);
  // A dev-bar command is running (devmode only). The dev bar never sets
  // slashRunning, so without this the rainbow swirl never shows in
  // devmode — ProcessingGlow only renders while isProcessing is true.
  // (Gary, 2026-11-08: rainbow back in devmode.)
  const [devRunning, setDevRunning] = useState(false);
  // Dev mode (Gary, 2026-11-07): OFF = the prompt section and the
  // xterm surface share one input topology (clicking the section
  // focuses the terminal, typing always lands in the shell);
  // ON = the prompt bar is delinked and a detached command bar +
  // dev console render in the prompt section instead. A missing
  // key in older persisted settings counts as OFF.
  const devMode = settings.devMode === true;
  // Detached dev-bar input + its own submitted-line history
  // (Up/Down), separate from the shell's history.
  const [devInput, setDevInput] = useState('');
  const [devHistory, setDevHistory] = useState<string[]>([]);
  const devHistoryIdx = useRef<number | null>(null);
  // Dev console lines — the detached bar's own output. Never the
  // terminal screen.
  const [devLines, setDevLines] = useState<string[]>([]);
  const termRef = useRef<XtermSurfaceHandle>(null);
  // The current shell line, as typed — tracked so a slash command
  // can be recognised on Enter. `null` means "unknown": Tab,
  // arrows or reverse-search changed the line in a way this
  // tracker cannot follow, so the line is left to the shell.
  const lineBuffer = useRef<string | null>('');
  // Click-and-hold on the face button (Gary, 2026-11-06): holding
  // the main displayed face opens the roster (the Forge); a quick
  // click still toggles the Synth view as before. The timer and the
  // fired flag live in refs so a hold that fires suppresses the
  // click that follows the pointer-up.
  const faceHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const faceHoldFiredRef = useRef(false);
  // Last keystroke in the prompt (ms epoch). The idle heartbeat
  // pauses while the user is typing — the original's smart pausing.
  const lastKeystrokeAt = useRef(0);

  // LuciferAI Plugin State - Dynamic and Optional
  const [luciferAIAvailable, setLuciferAIAvailable] = useState(false);
  const [luciferAIChecking, setLuciferAIChecking] = useState(true);
  // Whether at least one LLM model is actually loaded. The plugin wrapper
  // can be up while no model is — the dot must not claim "connected" then.
  const [modelAvailable, setModelAvailable] = useState(false);
  const [modelNames, setModelNames] = useState<string[]>([]);
  // Busy signals for the idle heartbeat: it shows only while the
  // plugin is active AND idle. A Lucid slash command, an AI-chat
  // generation, or a plugin task all count as busy. EXCEPT: while
  // the fangs drip (AI-chat generation or LuciferAI plugin task)
  // the heartbeat does NOT hide — it shifts to the blood-drop
  // frame and holds it (per Gary, 2026-11-04). The hold is driven
  // by the exact same shouldDrip(...) signal as the fang pixels,
  // computed here once and shared, so the two stay in sync.
  const aiChatLoading = useAIStore((s) => s.isLoading);
  const luciferTaskActive = useLoadingStore((s) => s.active['lucifer-task'] > 0);
  const heartbeatBusy = slashRunning || aiChatLoading || luciferTaskActive;
  const heartbeatDripping = shouldDrip(aiChatLoading, luciferTaskActive);

  // Terminal failed to start (shell would not spawn). Set when the shell
  // exits non-zero shortly after this tab was created.
  const [terminalFailed, setTerminalFailed] = useState<{ code: number; message: string } | null>(null);
  // The shell exited (any code, any time — typing `exit` included).
  // Input stops, the surface reports it, and the banner offers a
  // restart. A live-looking dead terminal is the old bug.
  const [shellExited, setShellExited] = useState<{ code: number } | null>(null);
  const shellExitedRef = useRef(false);
  const terminalCreatedAt = useRef(Date.now());
  const terminalReadyLogged = useRef(false);
  const lastTerminalData = useRef('');
  // PTY echo sequencing for termWriteLines (see waitForPromptEcho):
  // bumped per incoming PTY chunk, captured at slash-Enter, waiters
  // resolved by the next chunk.
  const ptyDataSeqRef = useRef(0);
  const slashPromptSeqRef = useRef(0);
  const promptWaitersRef = useRef<Array<() => void>>([]);
  // Whether this tab is the visible one. Hidden tabs keep their
  // xterm mounted (F2) but must not run timers (F4): the Lucifer
  // retry and the heartbeat below are gated on this.
  const isActiveTab = useTerminalStore((s) => s.activeTabId === tabId);

  // Help panel state
  const [showHelpPanel, setShowHelpPanel] = useState(false);

  // Planning panel state
  const [showPlanningPanel, setShowPlanningPanel] = useState(false);

  // The chats live in the main Sidebar now (paper button, under the
  // Explorer) — Cmd+B toggles that panel from the Sidebar, not here.

  // Initialize LuciferAI Plugin (optional, non-blocking).
  // "Available" means the wrapper loaded AND at least one model is up.
  // The wrapper alone (stdio agent with no model) must not read as
  // "connected" — that is the state that produced raw Python errors.
  useEffect(() => {
    // DISABLED: never probe the plugin, never mark it available -
    // the heartbeat, the blood drop and the plugin routing all read
    // luciferAIAvailable, so staying false here is what makes the
    // plugin completely gone. No retry interval is started either.
    if (!luciferAiEnabled) {
      setLuciferAIAvailable(false);
      setModelAvailable(false);
      setModelNames([]);
      setLuciferAIChecking(false);
      return;
    }
    // SILENCED (Gary, 2026-11-08 ~06:41 PST — potential daemon
    // only): do NOT probe the plugin and do NOT start the retry
    // interval — a dormant daemon does nothing active. The
    // availability state is PRESERVED (not cleared): the daemon
    // still exists in potential, and on un-silence this effect
    // re-runs and probes fresh. This is what freezes LuciferAI
    // while silenced without losing where it was.
    if (luciferAiSilenced) {
      setLuciferAIChecking(false);
      return;
    }
    const initLuciferAI = async () => {
      // Probing the plugin/model status is real background loading — the
      // top-left dot swirls while it runs.
      useLoadingStore.getState().start('lucifer-check');
      try {
        console.log('[Plugin] Checking LuciferAI availability...');

        // Attempt to initialize LuciferAI backend
        const result = await window.lucidAPI.lucid.init();

        if (!result.success) {
          console.log('[Plugin] ⚠️  LuciferAI plugin unavailable:', result.error);
          setLuciferAIAvailable(false);
          setModelAvailable(false);
          setModelNames([]);
          return;
        }

        // The wrapper being up is not enough - check for a real model.
        const statuses = await window.lucidAPI.lucid.getModelStatuses();
        // The setting may have flipped off mid-probe: re-check the
        // LIVE setting (not the effect closure) before marking the
        // plugin available, or a stale probe resurrects it after disable.
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
        if (available.length > 0) {
          console.log(`[Plugin] ✅ LuciferAI connected — model(s) ready: ${available.join(', ')}`);
        } else {
          console.log('[Plugin] ⚠️  LuciferAI plugin loaded but no model is available — AI features unavailable');
        }
      } catch (error) {
        console.log('[Plugin] ⚠️  LuciferAI backend not running - terminal works in standalone mode');
        setLuciferAIAvailable(false);
        setModelAvailable(false);
        setModelNames([]);
      } finally {
        setLuciferAIChecking(false);
        useLoadingStore.getState().finish('lucifer-check');
      }
    };

    // Try to connect to plugin
    initLuciferAI();

    // Retry every 30s while the plugin is down or no model is loaded, so a
    // model installed later is picked up without a restart. Gated on
    // this tab being the visible one and the window being visible
    // (zero-latency F4): N mounted tabs used to retry in parallel,
    // and a hidden window retried forever for a dot nobody sees.
    // The probe itself is now the cheap cached health check (F1),
    // so a retry that does fire costs one cached IPC read.
    const retryInterval = setInterval(() => {
      if (document.hidden) return;
      if (useTerminalStore.getState().activeTabId !== tabId) return;
      if (!luciferAIAvailable || !modelAvailable) {
        console.log('[Plugin] Retrying LuciferAI connection...');
        initLuciferAI();
      }
    }, 30000);

    return () => clearInterval(retryInterval);
  }, [luciferAIAvailable, modelAvailable, luciferAiEnabled, luciferAiSilenced]);

  // PTY stream in, PTY exit, live cwd — straight into the surface.
  useEffect(() => {
    // Handler for incoming data from PTY
    const handleData = (id: string, data: string) => {
      if (id !== tabId) return;
      // PTY echo sequencing (see waitForPromptEcho): every chunk
      // bumps the sequence and releases any slash output waiting
      // for the prompt echo.
      ptyDataSeqRef.current += 1;
      const waiters = promptWaitersRef.current;
      promptWaitersRef.current = [];
      waiters.forEach((resolve) => resolve());
      // The bell: a BEL (\x07) in PTY data rings when the toggle is
      // on, and never prints — processTerminalBell returns the chunk
      // with BEL stripped. The toggle is read fresh per chunk, so
      // flipping it in Settings takes effect immediately, mid-tab.
      const cleaned = processTerminalBell(
        data,
        useSettingsStore.getState().settings.bellSound,
      );
      lastTerminalData.current = cleaned.slice(-500);

      // First data from the shell proves it actually spawned — only now is
      // the terminal genuinely ready (App.tsx must not claim readiness
      // before this).
      if (!terminalReadyLogged.current) {
        terminalReadyLogged.current = true;
        console.log('[INIT] ✅ Terminal ready!');
      }

      // Streamed, as it arrives, for as long as it arrives. No
      // timer, no block completion, no re-parse: xterm.js owns the
      // screen and the ANSI.
      termRef.current?.write(cleaned);
    };

    // Any shell exit — `exit`, Ctrl+D, a crash, a spawn failure —
    // stops input and says so on the surface. The old code only
    // surfaced an early non-zero exit and left the rest looking
    // live.
    const handleExit = (id: string, code: number) => {
      if (id !== tabId) return;
      shellExitedRef.current = true;
      setShellExited({ code });
      termRef.current?.write(`\r\n\x1b[31mShell exited (code ${code}).\x1b[0m\r\n`);
      if (code !== 0 && Date.now() - terminalCreatedAt.current <= 10000) {
        const message = (lastTerminalData.current || '').trim()
          || `Shell exited with code ${code}`;
        console.log(`[INIT] ❌ Terminal failed to start (exit code ${code}): ${message}`);
        setTerminalFailed({ code, message });
        useToastStore.getState().error(`Terminal failed to start: ${message}`);
      }
    };

    // The shell moved (OSC 7 / cd): the prompt section's context
    // line follows the live cwd.
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
  }, [tabId, updateTabCwd]);

  // Write Lucid output into the terminal stream, as its own lines.
  // Ordering guarantee (zero-latency F5): the shell already printed
  // a fresh prompt for the wiped slash line, and the output must land
  // after it. The old code waited a fixed 80 ms wall-clock sleep
  // before EVERY slash output — ~5 frames of pure latency on every
  // /fix, /llm, /help. Now it waits for the prompt's actual PTY echo
  // instead: handleData bumps ptyDataSeqRef per chunk, and the Enter
  // handler records the sequence at the moment the slash line was
  // wiped. If the echo already arrived (slow command), this returns
  // immediately — 0 ms. Otherwise it resolves on the next PTY chunk
  // (sub-ms in the measured echo path) with the old 80 ms as a
  // fallback cap, so a shell that never echoes can never hang output.
  // The 80 ms was NOT intentional pacing — it was an ordering hack —
  // so replacing it with the real ordering signal removes latency
  // without changing what the user sees.
  const waitForPromptEcho = useCallback(async () => {
    if (ptyDataSeqRef.current > slashPromptSeqRef.current) return;
    await Promise.race([
      new Promise<void>((resolve) => {
        promptWaitersRef.current.push(resolve);
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 80)),
    ]);
  }, []);

  const termWriteLines = useCallback(async (text: string) => {
    await waitForPromptEcho();
    const normalized = text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    termRef.current?.write(`\r\n${normalized}\r\n`);
  }, [waitForPromptEcho]);

  // Write into the dev console (dev mode ON only): appends lines,
  // capped at the last DEV_CONSOLE_CAP. The terminal screen is
  // never touched — this is the detached bar's own output.
  const devWrite = useCallback(async (text: string) => {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    setDevLines((prev) => [...prev, ...lines].slice(-DEV_CONSOLE_CAP));
  }, []);
  const devClear = useCallback(() => setDevLines([]), []);

  // TOPOLOGY FAILSAFE (Gary, 2026-11-08 ~07:05 PST): if the topology
  // sync fails or desyncs while in non-devmode, the app FALLS INTO
  // dev mode — dev mode ON, detached bar + dev console — so the
  // terminal still works. It must never be left with a broken,
  // synced-but-dead prompt bar. The detached bar runs commands
  // through terminal:executeCommand (one-shot, no PTY), so it still
  // works when the PTY write path or the surface focus is what broke.
  // The reason is kept in state so the fallback is VISIBLE: an amber
  // notice above the dev bar AND a line in the dev console. The
  // guard ref fires one fallback per desync episode; turning dev
  // mode off (the retry) resets it, so a still-broken sync falls
  // back again instead of silently dying. A dead SHELL is not a
  // topology failure — the shell-exited banner already offers a
  // restart — so the failsafe never fires for it.
  const [topologyFallbackReason, setTopologyFallbackReason] = useState<string | null>(null);
  const topologyFallbackFiredRef = useRef(false);
  const fallBackToDevMode = useCallback(async (reason: string) => {
    // Already in dev mode (chosen, or a previous fallback): the safe
    // mode is already on — nothing to fall into.
    if (useSettingsStore.getState().settings.devMode === true) return;
    if (topologyFallbackFiredRef.current) return;
    topologyFallbackFiredRef.current = true;
    setTopologyFallbackReason(reason);
    setDevLines((prev) => [...prev, `${TOPOLOGY_FALLBACK_NOTICE} Reason: ${reason}`].slice(-DEV_CONSOLE_CAP));
    await useSettingsStore.getState().updateSetting('devMode', true);
  }, []);
  // Turning dev mode off is the retry: reset the guard and clear the
  // stale reason, so a still-broken sync falls back again.
  useEffect(() => {
    if (!devMode) {
      topologyFallbackFiredRef.current = false;
      setTopologyFallbackReason(null);
    }
  }, [devMode]);

  // Write keystrokes to the PTY — the input half of the topology
  // sync. A throw means the input path is dead: fall into dev mode
  // (the detached bar's one-shot path still works) instead of
  // leaving the user typing into a dead prompt bar. Returns false
  // when the write did not reach the shell.
  const ptyWrite = useCallback((data: string): boolean => {
    try {
      window.lucidAPI.terminal.write(tabId, data);
      return true;
    } catch (error) {
      if (!shellExitedRef.current) {
        void fallBackToDevMode(ptyWriteFailureReason(error));
      }
      return false;
    }
  }, [tabId, fallBackToDevMode]);

  // Run a command through the LuciferAI plugin (LucidCore.processCommand
  // → workflow orchestrator → plugin backend). While it runs, the
  // 'lucifer-task' loading key is active — the Sentinel face's fangs
  // drip for plugin work. Plain shell commands never touch this helper
  // (they write straight to the PTY), so the drip does not fire for
  // them. The finally guarantees the key clears even if the plugin
  // call throws — a leaked count would leave the fangs dripping
  // forever.
  const runPluginCommand = async (cmd: string) => {
    useLoadingStore.getState().start('lucifer-task');
    try {
      return await window.lucidAPI.lucid.command(cmd);
    } finally {
      useLoadingStore.getState().finish('lucifer-task');
    }
  };

  // Local commands (fix / fixnet) go through the same `lucid:command`
  // IPC but WITHOUT the 'lucifer-task' loading key: they run in the
  // local FixNet path, not the LuciferAI plugin, so the Sentinel face
  // must not drip for them.
  const runLocalCommand = async (cmd: string) => {
    return await window.lucidAPI.lucid.command(cmd);
  };

  // Render a `lucid:command` result as plain text: the formatted
  // terminal output when the workflow ran, else the error.
  const renderLocalResult = (result: any): string => {
    if (!result) return '❌ No response from the local workflow.';
    if (typeof result.terminalOutput === 'string' && result.terminalOutput) {
      return result.terminalOutput;
    }
    if (typeof result.error === 'string' && result.error) {
      return `❌ ${result.error}`;
    }
    if (typeof result.output === 'string' && result.output) {
      return result.output;
    }
    return '❌ No response from the local workflow.';
  };

  // A Lucid slash command, already wiped from the shell's line.
  // Only slash lines reach here — bare words never do. Lucid-local
  // commands (fix, fixnet, browser diagnose, workflow, history)
  // run whether LuciferAI is on or off; plugin commands (help,
  // plan, llm, tokens, agent, build, create, github, env, install,
  // daemon) need it on, and say so in one line when it is off.
  // (That note answers an EXPLICIT slash invocation — bare LuciferAI
  // words still go to the shell with no LuciferAI message at all.)
  // `opts` is the dev-mode sink: when the line came from the
  // detached dev bar, output goes to the dev console (`write`)
  // and `/history clear` clears the dev console (`clearScreen`)
  // instead of the terminal screen. Panels (/help, /plan) still
  // open — panels are not the terminal screen — only their notes
  // go through the sink. Default (no opts) is the stream.
  const runSlashCommand = async (
    line: string,
    opts?: { write?: (text: string) => Promise<void>; clearScreen?: () => void },
  ) => {
    const write = opts?.write ?? termWriteLines;
    const clearScreen = opts?.clearScreen ?? (() => termRef.current?.clear());
    // A submitted prompt feeds the Sentinel face's horns — the prompting
    // pace grows them, and the pace decays when prompting slows.
    usePromptPaceStore.getState().recordPrompt();

    const parsed = parseCommand(line);
    console.log('[Slash] Processing:', parsed);

    // Help / plan open panels, not the stream.
    if (parsed.type === 'help') {
      if (!luciferAiEnabled) {
        await write('/help needs LuciferAI — enable it in Settings → Plugins.');
        return;
      }
      // SILENCED (Gary, 2026-11-08 ~06:41 PST — potential daemon
      // only): LuciferAI commands are not accepted while silenced
      // — not queued, not awaited, not run. The note tells the
      // user the one action that restores them (click the grey
      // blood drop). Local commands below are NOT gated this way.
      if (luciferAiSilenced) {
        await write(LUCIFER_AI_SILENCED_NOTE);
        return;
      }
      console.log('[Help] Opening help modal');
      if (onOpenHelp) {
        onOpenHelp();
      } else {
        setShowHelpPanel(true);
      }
      return;
    }
    if (parsed.type === 'plan') {
      if (!luciferAiEnabled) {
        await write('/plan needs LuciferAI — enable it in Settings → Plugins.');
        return;
      }
      if (luciferAiSilenced) {
        await write(LUCIFER_AI_SILENCED_NOTE);
        return;
      }
      console.log('[Planning] Opening planning panel');
      setShowPlanningPanel(true);
      return;
    }

    // Dev mode — Lucid-local, works with LuciferAI on or off.
    // `/devmode on|off` flips the setting (persisted via
    // updateSetting, like the Settings toggle). The confirmation
    // goes through the caller's sink — except when turning OFF
    // from the dev bar: the bar unmounts with the flip, so the
    // confirmation goes to the terminal stream instead, which is
    // the prompt again once the topology re-syncs.
    if (parsed.type === 'devmode') {
      const arg = (parsed.args[0] ?? '').toLowerCase();
      if (arg !== 'on' && arg !== 'off') {
        await write('Usage: /devmode on|off\n\nOn delinks the prompt bar from the terminal screen (detached command bar + dev console, for troubleshooting). Off re-syncs them into one input topology (clicking the prompt section focuses the terminal).');
        return;
      }
      const next = arg === 'on';
      await useSettingsStore.getState().updateSetting('devMode', next);
      const msg = next
        ? 'Dev mode ON — prompt bar delinked from the terminal screen. The detached command bar runs slash commands and one-shot shell commands into its own dev console; the terminal screen runs independently.'
        : 'Dev mode OFF — prompt bar and terminal topology-synced. Clicking anywhere in the prompt section focuses the terminal; typing always lands in the shell.';
      if (next) {
        await write(msg);
      } else {
        await termWriteLines(msg);
      }
      return;
    }

    setSlashRunning(true);
    useLoadingStore.getState().start('command');
    try {
      switch (parsed.type) {
        case 'fix':
        case 'fixnet': {
          console.log('[FixNet] Processing:', parsed.command);
          const result = await runLocalCommand(line.slice(1));
          await write(renderLocalResult(result));
          break;
        }

        case 'llm': {
          console.log('[LLM] Processing:', parsed.command);
          if (!luciferAiEnabled) {
            await write('/llm needs LuciferAI — enable it in Settings → Plugins.');
            break;
          }
          if (luciferAiSilenced) {
            await write(LUCIFER_AI_SILENCED_NOTE);
            break;
          }
          const bare = line.slice(1);
          if (parsed.command === 'llm list') {
            const result = await window.lucidAPI.lucid.llmList();
            await write(JSON.stringify(result, null, 2));
          } else if (parsed.command.startsWith('llm enable')) {
            const model = parsed.args[0];
            let output: string;
            if (!model) {
              output = 'Usage: /llm enable <model>';
            } else {
              try {
                const result = await window.lucidAPI.lucid.llmSetEnabled(model, true);
                output = result?.success
                  ? `✅ Enabled model: ${model}`
                  : `❌ Failed to enable model: ${model}: ${result?.error || result?.message || 'unknown error'}`;
              } catch (error: any) {
                output = `❌ Failed to enable model: ${model}: ${error?.message ?? String(error)}`;
              }
            }
            await write(output);
          } else if (parsed.command.startsWith('llm disable')) {
            const model = parsed.args[0];
            let output: string;
            if (!model) {
              output = 'Usage: /llm disable <model>';
            } else {
              try {
                const result = await window.lucidAPI.lucid.llmSetEnabled(model, false);
                output = result?.success
                  ? `❌ Disabled model: ${model}`
                  : `❌ Failed to disable model: ${model}: ${result?.error || result?.message || 'unknown error'}`;
              } catch (error: any) {
                output = `❌ Failed to disable model: ${model}: ${error?.message ?? String(error)}`;
              }
            }
            await write(output);
          } else if (luciferAIAvailable) {
            const result = await runPluginCommand(bare);
            await write(result.terminalOutput || result.output || '');
          } else {
            await write('⚠️  LuciferAI plugin required for LLM commands.\nSee /help for available commands.');
          }
          break;
        }

        case 'browser': {
          console.log('[Browser] Processing:', parsed.command);
          if (parsed.command === 'browser diagnose') {
            let output: string;
            try {
              const result =
                await window.lucidAPI.browser.diagnoseActive();
              if (!result?.ok || !result.diagnose) {
                output = `❌ Browser diagnose failed: ${result?.error ?? result?.screenshotError ?? 'unknown error'}`;
              } else {
                const d = result.diagnose;
                output =
                  `Browser diagnose (active tab ${d.tabId ?? 'none'}):\n` +
                  JSON.stringify(d, null, 2) +
                  (result.screenshotPath
                    ? `\nScreenshot: ${result.screenshotPath}`
                    : `\nScreenshot: failed (${result.screenshotError ?? 'unknown error'})`);
              }
            } catch (error: any) {
              output = `❌ Browser diagnose failed: ${error?.message ?? String(error)}`;
            }
            await write(output);
          } else {
            await write('Usage: /browser diagnose');
          }
          break;
        }

        case 'workflow': {
          console.log('[Workflow] Processing:', parsed.command);
          if (parsed.command === 'workflow' && parsed.args[0] === 'status') {
            const status = await window.lucidAPI.lucid.workflowStatus();
            await write(JSON.stringify(status, null, 2));
          } else {
            await write('Usage: /workflow status');
          }
          break;
        }

        case 'tokens': {
          console.log('[Tokens] Processing:', parsed.command);
          if (!luciferAiEnabled) {
            await write('/tokens needs LuciferAI — enable it in Settings → Plugins.');
            break;
          }
          if (luciferAiSilenced) {
            await write(LUCIFER_AI_SILENCED_NOTE);
            break;
          }
          const stats = await window.lucidAPI.lucid.getTokenStats();
          await write(JSON.stringify(stats, null, 2));
          break;
        }

        case 'history': {
          console.log('[History] Processing:', parsed.command);
          if (parsed.args[0] === 'clear') {
            await window.lucidAPI.lucid.clearHistory();
            // Clear the VISIBLE history too — the terminal surface
            // (or the dev console, when the line came from the
            // detached dev bar) and the History panel (which reads
            // this tab's blocks from the history store). The screen
            // going empty IS the confirmation, like Unix `clear`.
            useHistoryStore.getState().clearBlocks(tabId);
            clearScreen();
          } else if (parsed.command === 'history') {
            const hist = await window.lucidAPI.lucid.getHistory();
            await write(JSON.stringify(hist, null, 2));
          }
          break;
        }

        case 'install':
        case 'github':
        case 'env':
        case 'daemon':
        case 'agent':
        case 'build':
        case 'create':
        case 'unknown':
        default: {
          console.log('[Backend] Command type:', parsed.type);
          if (!luciferAiEnabled) {
            await write(`${line} needs LuciferAI — enable it in Settings → Plugins.`);
            break;
          }
          if (luciferAiSilenced) {
            await write(LUCIFER_AI_SILENCED_NOTE);
            break;
          }
          if (luciferAIAvailable) {
            console.log('[Plugin] Routing to LuciferAI:', parsed.type);
            try {
              const result = await runPluginCommand(line.slice(1));
              if (result.success) {
                await write(result.terminalOutput || result.output || '');
              } else {
                await write(`❌ Command failed: ${result.error || 'Unknown error'}\n\nTry: /help for available commands`);
              }
            } catch (error) {
              console.error('[Plugin] LuciferAI error:', error);
              await write(`❌ LuciferAI plugin error: ${String(error)}\n\nThe plugin may have disconnected. Retrying in 30s...`);
              setLuciferAIAvailable(false);
            }
          } else if (luciferAIChecking) {
            await write('⏳ Connecting to LuciferAI plugin...\n\nPlease wait while we establish connection.');
          } else {
            console.log('[Fallback] Plugin unavailable, checking alternatives');
            const commandRequiresLLM = requiresLLM(parsed.type);
            if (commandRequiresLLM) {
              await write(getFallbackMessage(parsed));
            } else {
              const suggestion = findClosestCommand(line.slice(1));
              if (suggestion && suggestion !== line.slice(1).split(/\s+/)[0]) {
                await write(`❓ Unknown command: "${line}"\n\n💡 Did you mean: /${suggestion}\n\nTry: /help for available commands`);
              } else {
                await write(getFallbackMessage(parsed));
              }
            }
          }
          break;
        }
      }
    } catch (error) {
      console.error('[Slash] Error:', error);
      await write(`❌ Error: ${String(error)}\n\nTry: /help for available commands`);
    } finally {
      setSlashRunning(false);
      useLoadingStore.getState().finish('command');
      // A command completing wiggles the Sentinel face's horns inward
      // once — a little celebration that the task is done.
      useHornWiggleStore.getState().wiggle();
    }
  };

  // Submit from the detached dev bar (dev mode ON only). Slash
  // lines run through runSlashCommand with the dev console as
  // their output sink (panels still open; /history clear clears
  // the dev console, not the screen). Bare lines run detached
  // via terminal:executeCommand — a one-shot shell call that
  // never touches any PTY screen. Either way the visible terminal
  // screen is untouched; it keeps running on its own.
  const handleDevSubmit = async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    setDevHistory((prev) => [...prev, trimmed].slice(-100));
    devHistoryIdx.current = null;
    setDevInput('');
    setDevRunning(true);
    try {
      await devWrite(`$ ${trimmed}`);
      if (trimmed.startsWith('/')) {
        await runSlashCommand(trimmed, { write: devWrite, clearScreen: devClear });
        return;
      }
      try {
        const executeCommand = window.lucidAPI.terminal.executeCommand;
        if (typeof executeCommand !== 'function') {
          await devWrite('❌ Detached execution is unavailable (terminal:executeCommand is not exposed).');
          return;
        }
        const result = await executeCommand(trimmed);
        if (result?.output) await devWrite(result.output);
        if (!result?.success && result?.error) await devWrite(`❌ ${result.error}`);
        if (result?.success && !result?.output) await devWrite('(no output)');
      } catch (error) {
        await devWrite(`❌ ${String(error)}`);
      }
    } finally {
      setDevRunning(false);
    }
  };

  // Dev-bar history: Up/Down walk submitted lines, like the shell.
  const devHistoryUp = () => {
    if (devHistory.length === 0) return;
    const idx = devHistoryIdx.current === null
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

  // Per-keystroke input to the PTY. Every key reaches the shell the
  // moment it is typed — the shell owns echo, history, completion
  // and line editing, so this handler never re-implements them. It
  // only watches the line so a slash command can be recognised on
  // Enter: the typed line was already echoed by the shell, so it is
  // wiped with Ctrl+U and an empty line submitted for a fresh
  // prompt, then the Lucid command runs and its output is printed
  // into the stream. Tab, arrows and reverse-search change the
  // line in ways this tracker cannot follow — after any of those
  // the line is unknown (null) and left to the shell.
  const handleXtermInput = (data: string) => {
    if (shellExitedRef.current) return;
    lastKeystrokeAt.current = Date.now();
    let pending = '';
    const flush = () => {
      if (pending) {
        const data = pending;
        pending = '';
        // A failed write falls into dev mode (see ptyWrite) — the
        // keystroke never reached the shell, so it is dropped, not
        // retried into a dead path.
        ptyWrite(data);
      }
    };
    for (const ch of data) {
      if (ch === '\r' || ch === '\n') {
        flush();
        const line = lineBuffer.current;
        lineBuffer.current = '';
        if (line !== null && line.trim().startsWith('/')) {
          // Record the PTY sequence BEFORE the wipe: termWriteLines
          // waits for echo data newer than this (see waitForPromptEcho).
          slashPromptSeqRef.current = ptyDataSeqRef.current;
          // The wipe must reach the shell before the Lucid command
          // runs — if it did not (write failed, fell back to dev
          // mode), do not run the command: the line is still on the
          // shell's line and the user can re-run it from the bar.
          if (ptyWrite('\x15\r')) {
            void runSlashCommand(line.trim());
          }
        } else {
          ptyWrite(ch);
        }
        continue;
      }
      if (lineBuffer.current !== null) {
        if (ch === '\x7f') {
          lineBuffer.current = lineBuffer.current.slice(0, -1);
        } else if (ch === '\x03' || ch === '\x04' || ch === '\x0c' || ch === '\x15') {
          // Ctrl+C / Ctrl+D / Ctrl+L / Ctrl+U: the line is gone.
          lineBuffer.current = '';
        } else if (ch === '\x1b' || ch === '\t' || ch === '\x12' || ch === '\x1a' || ch === '\x17') {
          // Escape sequences, Tab completion, Ctrl+R, Ctrl+Z,
          // Ctrl+W: the line changed beyond what this tracker knows.
          lineBuffer.current = null;
        } else if (ch >= ' ') {
          lineBuffer.current += ch;
        }
      }
      pending += ch;
    }
    flush();
  };

  // Real resize: the surface measures itself and the PTY follows.
  const handleResize = useCallback(
    (cols: number, rows: number) => {
      window.lucidAPI.terminal.resize?.(tabId, cols, rows);
    },
    [tabId],
  );

  // Restart a dead shell: close this tab and open a fresh one.
  const restartShell = () => {
    shellExitedRef.current = false;
    setShellExited(null);
    setTerminalFailed(null);
    clearCreateError(tabId);
    closeTab(tabId);
    createTab();
  };

  // Prompt-section click (topology sync, dev mode OFF): the section
  // IS the terminal's input, so a click anywhere in it focuses the
  // xterm surface and typing lands in the shell. If the focus cannot
  // be handed over — the surface is not mounted, or focusing throws —
  // the sync has failed: FALL INTO dev mode (the failsafe), so the
  // user gets the detached bar instead of a dead prompt bar. Dev
  // mode ON (delinked): a click must NOT focus the terminal, or the
  // detached bar could never be typed in.
  const handlePromptSectionClick = () => {
    if (devMode) return;
    const check = checkPromptFocus(
      termRef.current !== null,
      () => termRef.current?.focus(),
    );
    if (!check.ok) {
      void fallBackToDevMode(check.reason ?? 'the terminal could not be focused');
    }
  };

  return (
    <>
      {/* Non-devmode clean page unison (Gary, 2026-11-08 ~07:05 PST):
          the terminal page is FULL BLACK — an opaque black root, so
          the splash mist behind it never shows through — and the
          prompt bar below is solid black, like Warp AI. Dev mode
          keeps the old look (transparent, mist showing through,
          glass panels): the glass is the troubleshooting mode's
          look now, not the default's. Coherence (Gary, 2026-11-08
          ~07:08 PST): one unison black page, no mismatched panels. */}
      <div data-testid="terminal-page" className={`h-full w-full flex overflow-hidden${devMode ? '' : ' bg-black'}`}>
        {/* Terminal Content (the chats live in the main Sidebar now).
            Non-devmode: the page root above is opaque black, so this
            stays transparent — the black is the page, not a panel. */}
        <div
          className="flex-1 flex flex-col overflow-hidden"
          data-testid="terminal-content"
        >
          {/* Terminal failed to start (shell would not spawn). Covers both
              the async spawn error (onExit) and a synchronous spawn throw
              (bad cwd), which the store records as a create error. */}
          {(terminalFailed || createErrors[tabId]) && (
            <div className="mx-4 mt-4 rounded-lg border border-red-500/40 bg-red-500/15 p-3">
              <p className="text-sm font-semibold text-red-300">Terminal failed to start</p>
              <p className="mt-1 font-mono text-xs text-red-200/80 whitespace-pre-wrap">{terminalFailed ? terminalFailed.message : createErrors[tabId]}</p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={restartShell}
                  className="btn btn-primary text-sm py-1 px-3"
                >
                  New Terminal
                </button>
                <button
                  onClick={() => {
                    setTerminalFailed(null);
                    clearCreateError(tabId);
                  }}
                  className="btn text-sm py-1 px-3"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* The shell exited (typing `exit`, Ctrl+D, a crash). The
              surface already printed the exit line; this banner stops
              the tab looking live and offers a restart. */}
          {shellExited && !terminalFailed && !createErrors[tabId] && (
            <div className="mx-4 mt-4 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3">
              <p className="text-sm font-semibold text-yellow-200">Shell exited (code {shellExited.code})</p>
              <p className="mt-1 text-xs text-yellow-200/70">This terminal is no longer accepting input.</p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={restartShell}
                  className="btn btn-primary text-sm py-1 px-3"
                >
                  New Terminal
                </button>
              </div>
            </div>
          )}

          {/* Real terminal surface — xterm.js on the PTY stream.
              Non-devmode: the backwall is SOLID BLACK, not glass —
              the terminal IS the prompt, so its panel is the
              prompt's panel, square corners, with the 2px top edge
              marking where the output ends and the prompt begins.
              Dev mode keeps the squared glass backwall (frosted
              translucent, backdrop blur) over the mist. */}
          <div className="flex-1 overflow-hidden p-4">
            <div data-testid="prompt-input-wrap"
                 className={devMode
                   ? 'h-full w-full overflow-hidden rounded-none border border-[var(--border)] border-t-2 border-t-[var(--text-muted)] bg-[var(--bg-tertiary)]/50 backdrop-blur-md'
                   : 'h-full w-full overflow-hidden rounded-none border border-[var(--border)] border-t-2 border-t-[var(--text-muted)] bg-black'}>
              <XtermSurface
                ref={termRef}
                onInput={handleXtermInput}
                onResize={handleResize}
                disabled={shellExited !== null}
              />
            </div>
          </div>

          {/* Idle heartbeat — the original "Idle • Awaiting Commands..."
              animation (blood drop only where the demon head was, per Gary),
              restored above the prompt. Shows only while the
              LuciferAI plugin is active and idle; while the fangs
              drip it holds on the blood-drop frame instead of
              hiding (same shouldDrip signal as the fang pixels);
              busy WITHOUT dripping (plain shell) still hides it.
              SILENCED (Gary, 2026-11-08 ~06:41 PST — potential
              daemon only): awaiting commands is DISABLED while
              silenced, so the heartbeat is gone — the daemon is
              not awaiting anything. It returns on un-silence. */}
          <Heartbeat active={luciferAIAvailable && isActiveTab && !luciferAiSilenced} busy={heartbeatBusy} dripping={heartbeatDripping} lastKeystrokeAt={lastKeystrokeAt} />

          {/* Prompt SECTION — a whole section, not a thin input
              bar (Gary, 2026-11-07 ~08:34 PST): "see how their prompt
              box is a whole section make ours significantly more
              vantage glass for our section". Warp's prompt box is a
              full-width panel with its own header/identity line and
              context lines — ours is the same shape. NON-DEVMODE
              (Gary, 2026-11-08 ~07:05 PST): the section is a BLACK
              prompt bar — solid black, flat, no gradient, no shadow
              — like Warp AI, one unison with the full-black page.
              DEV MODE keeps the glass: a frosted section with a
              header row (identity + the tab's working directory, the
              attached-path context line), a 2px top divider that
              marks where the output ends and the prompt begins, and
              a stronger blur, translucent over the mist.
              The input itself is the terminal surface above now —
              there is no Monaco prompt and no send arrow any more
              (that was the simulation's input). This row keeps the
              prompt-section controls: the blood drop (LuciferAI's
              quick disable, on-state only) and the Sentinel face. */}
          <div data-testid="prompt-section"
               onClick={handlePromptSectionClick}
               className="input-container border-t-2 border-t-[var(--text-muted)] pb-safe"
               style={devMode ? {
                 background: 'linear-gradient(180deg, rgba(38, 45, 56, 0.55), rgba(22, 27, 34, 0.65))',
                 boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.35)',
               } : {
                 background: '#000000',
               }}>
            {/* Section header — identity + context, Warp-style.
                Dev mode ON: the header shows the delinked badge and
                a static note instead of the live cwd — the detached
                bar never reads the terminal's cwd. */}
            <div className="flex items-center gap-2 px-5 pt-3" data-testid="prompt-section-header">
              {devMode ? (
                <>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Terminal</span>
                  <span className="rounded border border-amber-500/50 bg-amber-500/15 px-1.5 py-px text-[11px] font-semibold uppercase tracking-wider text-amber-300">DEV — prompt bar delinked</span>
                  <span className="ml-auto truncate font-mono text-[11px] text-[var(--text-secondary)] opacity-80" title="The detached prompt bar has no live working directory — it never reads the terminal's cwd.">
                    delinked — no live cwd
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Terminal</span>
                  <span className="text-[11px] text-[var(--text-muted)] opacity-70">plain shell</span>
                  {tabCwd && (
                    <span className="ml-auto truncate font-mono text-[11px] text-[var(--text-secondary)] opacity-80" title={tabCwd}>
                      {tabCwd}
                    </span>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-3 px-5 py-4">
              {/* LuciferAI Plugin Status Indicator (the blood drop).
                  It renders ONLY while LuciferAI is on (Gary,
                  2026-11-07 ~20:17 PST): a plain terminal has no
                  blood drop, so when the plugin is off (the
                  Settings toggle, Settings → Plugins — Gary,
                  2026-11-08 ~02:29 PST: "off like in settings
                  toggle") there is no drop here at all — not
                  darkened, not clickable — and the flex row
                  reflows with the hint stretching to fill the gap.
                  It is LuciferAI's silencer (Gary, 2026-11-08
                  ~02:28 PST): lit while on and speaking, GREYED
                  OUT while silenced — clicking it silences /
                  un-silences, it never turns the plugin off and
                  never makes the drop disappear; it never prints
                  or repeats the "awaiting commands" line.
                  Re-enable from Settings → Plugins. The blood
                  drop PANEL opens from the tab-strip drop, not
                  here. */}
              {luciferAiEnabled && (
                <LuciferStatusIndicator
                  enabled={luciferAiEnabled}
                  checking={luciferAIChecking}
                  modelAvailable={modelAvailable}
                  modelNames={modelNames}
                  available={luciferAIAvailable}
                  silenced={luciferAiSilenced}
                  toggleActive={luciferToggleActive}
                  onToggleBloodDrop={onToggleLuciferAi}
                />
              )}

              {/* The terminal surface above IS the input now — type
                  straight into it. Slash commands (`/fix`, `/llm`,
                  `/help`) are Lucid's; everything else is the shell. */}
              <span className="flex-1 truncate font-mono text-[12px] text-[var(--text-muted)] opacity-80">
                Real shell — type /help for Lucid commands
              </span>

              {/* Sentinel face — press to toggle the Synth view, the Sentinel's home.
                  A LuciferAI surface: gone while the plugin is disabled, so the
                  hint stretches into the space it leaves too. */}
              {onOpenSynth && luciferAiEnabled && (
                <Tooltip content="Toggle the Synth view — hold to open the roster">
                  <button
                    type="button"
                    onClick={() => {
                      // A hold already opened the roster — the click
                      // that follows the pointer-up must not also
                      // toggle the Synth view.
                      if (faceHoldFiredRef.current) return;
                      onOpenSynth?.();
                    }}
                    onPointerDown={() => {
                      if (!onOpenForge) return;
                      faceHoldFiredRef.current = false;
                      faceHoldTimerRef.current = setTimeout(() => {
                        faceHoldFiredRef.current = true;
                        onOpenForge();
                      }, 500);
                    }}
                    onPointerUp={() => {
                      if (faceHoldTimerRef.current !== null) {
                        clearTimeout(faceHoldTimerRef.current);
                        faceHoldTimerRef.current = null;
                      }
                    }}
                    onPointerLeave={() => {
                      if (faceHoldTimerRef.current !== null) {
                        clearTimeout(faceHoldTimerRef.current);
                        faceHoldTimerRef.current = null;
                      }
                    }}
                    aria-label="Toggle Synth view — hold to open the roster"
                    className="shrink-0 rounded-full p-0.5 hover:bg-white/10 transition-colors"
                  >
                    <SentinelFace size={32} />
                  </button>
                </Tooltip>
              )}
            </div>
            {/* Topology fallback notice (Gary, 2026-11-08 ~07:05
                PST): the failsafe FIRED — the sync failed and the
                app fell into dev mode. The notice says so plainly
                (the reason, what still works, how to retry), so the
                user is never left wondering why the bar detached.
                Dismiss hides the banner; dev mode stays on until
                the user turns it off (Settings → General, or
                /devmode off from the bar). */}
            {devMode && topologyFallbackReason && (
              <div data-testid="topology-fallback-notice" className="mx-5 mb-3 rounded-none border border-amber-500/50 bg-amber-500/10 px-3 py-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-amber-300">{TOPOLOGY_FALLBACK_TITLE}</p>
                    <p className="mt-1 text-xs leading-5 text-amber-200/80">
                      Reason: {topologyFallbackReason}. The detached bar below still works — it runs commands without the terminal screen. Turn dev mode off in Settings → General, or run /devmode off from the bar, to try syncing again.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTopologyFallbackReason(null)}
                    aria-label="Dismiss topology fallback notice"
                    className="shrink-0 text-[11px] text-amber-300 underline hover:text-amber-200"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
            {/* Detached command bar (dev mode ON only) — the prompt
                bar delinked from the terminal screen. Its own
                Monaco input (plain-textarea fallback) and its own
                dev console below it; nothing here writes to the
                terminal screen or reads its cwd, and the terminal
                keeps running independently. No blood drop, no
                heartbeat, no Sentinel face is added here — the
                plain-terminal rule still holds with LuciferAI off. */}
            {devMode && (
              <div data-testid="dev-command-bar" className="px-5 pb-4">
                {/* Original prompt when LuciferAI is disabled (Gary,
                    2026-11-08): the ORIGINAL Lucid terminal prompt
                    (pre-ec33aa9, 4d8ef4e) — flat, no box: the ~
                    tilde + a bare input, no background, no border,
                    no glass. When LuciferAI is on, the squared
                    bottom-drop section. The rainbow glow still shows
                    either way (platform trait). */}
                {luciferAiEnabled ? (
                  <div className="rounded-none border border-[var(--border)] bg-[var(--bg-tertiary)]/50">
                    <InputArea
                      input={devInput}
                      setInput={setDevInput}
                      onSubmit={(value) => void handleDevSubmit(value)}
                      onHistoryUp={devHistoryUp}
                      onHistoryDown={devHistoryDown}
                      isProcessing={devRunning}
                      flat={false}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--text-secondary)] font-mono text-sm leading-none select-none opacity-70">~</span>
                    <div className="flex-1 overflow-hidden">
                      <InputArea
                        input={devInput}
                        setInput={setDevInput}
                        onSubmit={(value) => void handleDevSubmit(value)}
                        onHistoryUp={devHistoryUp}
                        onHistoryDown={devHistoryDown}
                        isProcessing={devRunning}
                        flat={true}
                      />
                    </div>
                  </div>
                )}
                <div data-testid="dev-console" className="mt-2 rounded-none border border-[var(--border)] bg-black/30">
                  <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Dev console — detached output</span>
                    <button
                      type="button"
                      onClick={devClear}
                      aria-label="Clear dev console"
                      className="ml-auto text-[11px] text-[var(--text-muted)] underline hover:text-[var(--text-primary)]"
                    >
                      Clear
                    </button>
                  </div>
                  <pre data-testid="dev-console-output" className="m-0 max-h-40 overflow-y-auto whitespace-pre-wrap px-3 py-2 font-mono text-[12px] leading-5 text-[var(--text-primary)]">
                    {devLines.length > 0 ? devLines.join('\n') : 'Detached output appears here. Slash commands run Lucid; bare lines run one-shot in the shell. The terminal screen is untouched.'}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Help Panel */}
      {showHelpPanel && (
        <HelpPanel onClose={() => setShowHelpPanel(false)} />
      )}

      {/* Planning Panel */}
      {showPlanningPanel && (
        <PlanningPanel onClose={() => setShowPlanningPanel(false)} />
      )}
    </>
  );
}

export default Terminal;
