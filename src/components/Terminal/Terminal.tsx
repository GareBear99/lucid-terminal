import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useTerminalStore } from '../../stores/terminalStore';
import { useToastStore } from '../../stores/toastStore';
import { useLoadingStore } from '../../stores/loadingStore';
import { useAIStore } from '../../stores/aiStore';
import { useHistoryStore, EMPTY_BLOCKS, BlocksUpdater } from '../../stores/historyStore';
import { usePromptPaceStore } from '../../stores/promptPaceStore';
import { useGazeStore, ATTENTION_DURATION_MS } from '../../stores/gazeStore';
import { useHornWiggleStore } from '../../stores/hornWiggleStore';
import { TerminalBlock } from '../../types';
import { Block } from './Block';
import { InputArea } from './InputArea';
import { parseCommand, getFallbackMessage, findClosestCommand, requiresLLM } from '../../utils/commandRouter';
import { HelpPanel } from '../Help/HelpPanel';
import { PlanningPanel } from '../Planning/PlanningPanel';
import { ValidationStepFactory } from './ValidationIndicator';
import { parseTokenStatsFromResponse } from './TokenDisplay';
import { FixNetStatus } from '../FixNet/FixNetStatus';
import { SentinelFace } from '../Synth/SentinelFace';
import { shouldDrip } from '../Synth/blood';
import { Heartbeat } from './Heartbeat';
import { LuciferStatusIndicator } from './LuciferStatusIndicator';
import { isLuciferAiEnabled, LUCIFER_AI_DISABLED_MESSAGE } from '../../lib/luciferAi';
import { Tooltip } from '../Tooltip/Tooltip';

interface TerminalProps {
  tabId: string;
  onOpenHelp?: () => void;
  /** Open the Synth view (the Sentinel's home). */
  onOpenSynth?: () => void;
}

function Terminal({ tabId, onOpenHelp, onOpenSynth }: TerminalProps) {
  const { currentTheme, settings } = useSettingsStore();
  // The LuciferAI disable rule (Gary, 2026-11-05): when this is
  // false the plugin is completely gone. Every gate below reads
  // this value, never the raw setting (missing key = ON).
  const luciferAiEnabled = isLuciferAiEnabled(settings);
  const { createTab, closeTab, createErrors, clearCreateError } = useTerminalStore();
  // Command blocks live in the history store, keyed by this tab — the
  // chats (Conversation History) render in the main Sidebar, outside
  // this component, so local state can't reach them. This wrapper keeps
  // the exact setState signature, so every existing setBlocks call site
  // below works unchanged; the store is the single source of truth.
  const blocks = useHistoryStore((s) => s.blocksByTab[tabId] ?? EMPTY_BLOCKS);
  const setBlocks = useCallback(
    (updater: BlocksUpdater) =>
      useHistoryStore.getState().setBlocks(tabId, updater),
    [tabId]
  );
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isProcessing, setIsProcessing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  // The prompt input wrapper (InputArea). The send arrow is a button next
  // to the editor, so after it submits we return keyboard focus here —
  // Enter keeps focus in the editor naturally, a mouse click would
  // otherwise leave focus on the button.
  const inputWrapRef = useRef<HTMLDivElement>(null);
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
  // plugin is active AND idle. A terminal command, an AI-chat
  // generation, or a plugin task all count as busy. EXCEPT: while
  // the fangs drip (AI-chat generation or LuciferAI plugin task)
  // the heartbeat does NOT hide — it shifts to the blood-drop
  // frame and holds it (per Gary, 2026-11-04). The hold is driven
  // by the exact same shouldDrip(...) signal as the fang pixels,
  // computed here once and shared, so the two stay in sync.
  const aiChatLoading = useAIStore((s) => s.isLoading);
  const luciferTaskActive = useLoadingStore((s) => s.active['lucifer-task'] > 0);
  const heartbeatBusy = isProcessing || aiChatLoading || luciferTaskActive;
  const heartbeatDripping = shouldDrip(aiChatLoading, luciferTaskActive);

  // Terminal failed to start (shell would not spawn). Set when the shell
  // exits non-zero shortly after this tab was created.
  const [terminalFailed, setTerminalFailed] = useState<{ code: number; message: string } | null>(null);
  const terminalCreatedAt = useRef(Date.now());
  const terminalReadyLogged = useRef(false);
  const lastTerminalData = useRef('');
  
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
    // model installed later is picked up without a restart.
    const retryInterval = setInterval(() => {
      if (!luciferAIAvailable || !modelAvailable) {
        console.log('[Plugin] Retrying LuciferAI connection...');
        initLuciferAI();
      }
    }, 30000);
    
    return () => clearInterval(retryInterval);
  }, [luciferAIAvailable, modelAvailable, luciferAiEnabled]);

  // Initialize first block or listen to PTY
  useEffect(() => {
    // Handler for incoming data from PTY
    const handleData = (id: string, data: string) => {
      if (id !== tabId) return;
      lastTerminalData.current = data.slice(-500);

      // First data from the shell proves it actually spawned — only now is
      // the terminal genuinely ready (App.tsx must not claim readiness
      // before this).
      if (!terminalReadyLogged.current) {
        terminalReadyLogged.current = true;
        console.log('[INIT] ✅ Terminal ready!');
      }

      setBlocks(prev => {
        // No blocks yet: the shell's first output (including a spawn error
        // such as "Error: spawn ... ENOENT") used to be dropped here, so a
        // dead shell looked like an empty, working terminal. Keep it as a
        // block so the error is visible.
        if (prev.length === 0) {
          return [{
            id: `terminal-${Date.now()}`,
            command: 'Terminal error',
            output: data,
            timestamp: Date.now(),
            isComplete: true,
            isCollapsed: false,
            isProcessing: false,
          }];
        }

        const lastBlock = prev[prev.length - 1];
        if (lastBlock.isComplete) return prev; // Data arrived after completion? (Race condition)

        // Create new array with updated last block
        const newBlocks = [...prev];
        newBlocks[newBlocks.length - 1] = {
          ...lastBlock,
          output: lastBlock.output + data
        };
        return newBlocks;
      });
    };

    // A shell that exits non-zero shortly after the tab was created never
    // spawned (bad SHELL, missing binary). Surface it instead of leaving a
    // normal-looking but dead terminal.
    const handleExit = (id: string, code: number) => {
      if (id !== tabId || code === 0) return;
      if (Date.now() - terminalCreatedAt.current > 10000) return;
      const message = (lastTerminalData.current || '').trim()
        || `Shell exited with code ${code}`;
      console.log(`[INIT] ❌ Terminal failed to start (exit code ${code}): ${message}`);
      setTerminalFailed({ code, message });
      useToastStore.getState().error(`Terminal failed to start: ${message}`);
    };

    const cleanupData = window.lucidAPI.terminal.onData(handleData);
    const cleanupExit = window.lucidAPI.terminal.onExit(handleExit);

    // No initial block needed - terminal is ready for input immediately

    return () => {
      cleanupData();
      cleanupExit();
    };
  }, [tabId]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [blocks, input]);

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
  // must not drip for them. (The 'command' key is already started by
  // handleSubmit for every submission, so the top-left swirl still
  // shows while a local command runs.)
  const runLocalCommand = async (cmd: string) => {
    return await window.lucidAPI.lucid.command(cmd);
  };

  // Render a `lucid:command` result into a terminal block: the
  // formatted terminal output when the workflow ran, else the error.
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

  const handleSubmit = async (command: string) => {
    if (!command.trim()) return;

    // A submitted prompt feeds the Sentinel face's horns — the prompting
    // pace grows them, and the pace decays when prompting slows.
    usePromptPaceStore.getState().recordPrompt();

    // The Sentinel face's eyes follow your actions — on submit they
    // look at the prompt input for a beat, then drift back to
    // wandering once the attention expires.
    const wrapRect = inputWrapRef.current?.getBoundingClientRect();
    if (wrapRect) {
      useGazeStore.getState().setAttention(
        wrapRect.left + wrapRect.width / 2,
        wrapRect.top + wrapRect.height / 2,
        ATTENTION_DURATION_MS,
      );
    }

    console.log('[Command Router] Processing:', command);

    // 1. Add command to history
    setHistory(prev => [...prev, command]);
    setHistoryIndex(-1);

    // 2. Parse command with deterministic router
    const parsed = parseCommand(command);
    console.log('[Command Router] Parsed:', parsed);

    // 3. Handle HELP command - open help modal instead of creating block
    if (parsed.type === 'help') {
      if (!luciferAiEnabled) {
        // Help is bound to LuciferAI: when the plugin is off, Help
        // stays closed. No return here — the command falls through
        // to the switch below, whose disabled refusal answers it
        // in a block instead of opening anything.
      } else {
        console.log('[Help] Opening help modal');
        if (onOpenHelp) {
          onOpenHelp();
        } else {
          // Fallback to old panel if callback not provided
          setShowHelpPanel(true);
        }
        return;
      }
    }

    // 4. Handle PLAN command - open planning panel instead of creating block
    if (parsed.type === 'plan') {
      console.log('[Planning] Opening planning panel');
      setShowPlanningPanel(true);
      return;
    }

    // 5. Generate validation steps based on command type
    let validationSteps = ValidationStepFactory.shellCommand(command);
    
    if (parsed.type === 'fixnet' || parsed.type === 'fix') {
      if (command.startsWith('fix ')) {
        validationSteps = ValidationStepFactory.fixNetAutoFix(command);
      } else {
        validationSteps = ValidationStepFactory.directSystemCommand(command);
      }
    } else if (parsed.type === 'llm') {
      validationSteps = ValidationStepFactory.llmManagement(command);
    } else if (parsed.type === 'install') {
      validationSteps = ValidationStepFactory.modelInstallation(command);
    } else if (command.includes('make') && command.includes('script')) {
      // Extract script name from command
      const scriptMatch = command.match(/\b(\w+\.\w+)\b/);
      const scriptName = scriptMatch ? scriptMatch[1] : 'script.py';
      validationSteps = ValidationStepFactory.multiStepScriptCreation(scriptName);
    } else if (parsed.type === 'daemon') {
      validationSteps = ValidationStepFactory.shellCommand(command); // Will add daemon-specific factory later
    } else if (parsed.type === 'agent' || parsed.type === 'unknown') {
      validationSteps = ValidationStepFactory.generalLLMQuery();
    }
    
    // 6. Create new Block with validation
    const newBlock: TerminalBlock = {
      id: Date.now().toString(),
      command: command,
      output: '',
      timestamp: Date.now(),
      isComplete: false,
      isCollapsed: false,
      isProcessing: true,
      validation: {
        steps: validationSteps,
        currentStep: 0,
        status: 'running'
      }
    };

    // 7. Mark previous block as complete (if any)
    setBlocks(prev => {
      const completed = prev.map(b => ({ ...b, isComplete: true, isProcessing: false }));
      return [...completed, newBlock];
    });

    // 8. Set processing state and clear input. The command key is the
    // background-loading signal for the top-left dot — it is finished in
    // the finally below, so it can never stick on (several branches below
    // never clear isProcessing themselves).
    setIsProcessing(true);
    useLoadingStore.getState().start('command');
    setInput('');

    // 8. Route based on command type
    try {
      switch (parsed.type) {
        case 'shell':
          // Execute directly in PTY (ls, git, npm, etc.)
          console.log('[Shell] Direct execution:', command);
          window.lucidAPI.terminal.write(tabId, command + '\n');
          setTimeout(() => {
            setBlocks(prev => prev.map(b => 
              b.id === newBlock.id ? { ...b, isComplete: true, isProcessing: false } : b
            ));
            setIsProcessing(false);
          }, 500);
          break;

        case 'fix':
          // `fix <file|error>` — the local FixNet path. It used to have
          // no case here at all, so it fell to the default branch and
          // was sent to the plugin (or to the shell). It now runs the
          // workflow orchestrator's dual-form fix directly.
          console.log('[Fix] Processing:', parsed.command);
          {
            const result = await runLocalCommand(command);
            setBlocks(prev => {
              const updated = [...prev];
              const lastBlock = updated[updated.length - 1];
              if (lastBlock?.id === newBlock.id) {
                lastBlock.output = renderLocalResult(result);
                lastBlock.isComplete = true;
              }
              return updated;
            });
          }
          break;

        case 'fixnet':
          // FixNet commands — ALL local now (stats, search, report,
          // apply, delete, and the honest `fixnet sync` answer). They
          // used to render raw JSON from direct IPC branches that could
          // never match (the renderer router stored only the first word),
          // and anything else fell through to the plugin with a
          // "LuciferAI plugin required" lie. The orchestrator formats
          // the output, so the Terminal renders terminalOutput.
          console.log('[FixNet] Processing:', parsed.command);
          {
            const result = await runLocalCommand(command);
            setBlocks(prev => {
              const updated = [...prev];
              const lastBlock = updated[updated.length - 1];
              if (lastBlock?.id === newBlock.id) {
                lastBlock.output = renderLocalResult(result);
                lastBlock.isComplete = true;
              }
              return updated;
            });
          }
          break;

        case 'llm':
          // LLM management commands
          console.log('[LLM] Processing:', parsed.command);
          if (parsed.command === 'llm list') {
            const result = await window.lucidAPI.lucid.llmList();
            setBlocks(prev => {
              const updated = [...prev];
              const lastBlock = updated[updated.length - 1];
              if (lastBlock?.id === newBlock.id) {
                lastBlock.output = JSON.stringify(result, null, 2);
                lastBlock.isComplete = true;
              }
              return updated;
            });
          } else if (parsed.command.startsWith('llm enable')) {
            const model = parsed.args[0];
            // Print success ONLY when the backend confirms it — the
            // old code printed success unconditionally while the
            // backend was a no-op.
            let output: string;
            if (!model) {
              output = 'Usage: llm enable <model>';
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
            setBlocks(prev => {
              const updated = [...prev];
              const lastBlock = updated[updated.length - 1];
              if (lastBlock?.id === newBlock.id) {
                lastBlock.output = output;
                lastBlock.isComplete = true;
              }
              return updated;
            });
          } else if (parsed.command.startsWith('llm disable')) {
            const model = parsed.args[0];
            let output: string;
            if (!model) {
              output = 'Usage: llm disable <model>';
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
            setBlocks(prev => {
              const updated = [...prev];
              const lastBlock = updated[updated.length - 1];
              if (lastBlock?.id === newBlock.id) {
                lastBlock.output = output;
                lastBlock.isComplete = true;
              }
              return updated;
            });
          } else {
            // Other LLM commands - route to Python backend
            if (luciferAIAvailable) {
              const result = await runPluginCommand(command);
              setBlocks(prev => {
                const updated = [...prev];
                const lastBlock = updated[updated.length - 1];
                if (lastBlock?.id === newBlock.id) {
                  lastBlock.output = result.terminalOutput || result.output || '';
                  lastBlock.isComplete = true;
                }
                return updated;
              });
            } else {
              setBlocks(prev => {
                const updated = [...prev];
                const lastBlock = updated[updated.length - 1];
                if (lastBlock?.id === newBlock.id) {
                  lastBlock.output = luciferAiEnabled
                    ? '⚠️  LuciferAI plugin required for LLM commands.\nSee "help" for available commands.'
                    : LUCIFER_AI_DISABLED_MESSAGE;
                  lastBlock.isComplete = true;
                }
                return updated;
              });
            }
          }
          break;

        case 'browser':
          // `browser diagnose` — where the active BrowserView is
          // attached, its bounds, the window's bounds and focus,
          // and a capturePage screenshot saved to disk. Built to
          // answer "the page loaded but the view shows blank white".
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
            setBlocks(prev => {
              const updated = [...prev];
              const lastBlock = updated[updated.length - 1];
              if (lastBlock?.id === newBlock.id) {
                lastBlock.output = output;
                lastBlock.isComplete = true;
              }
              return updated;
            });
          } else {
            setBlocks(prev => {
              const updated = [...prev];
              const lastBlock = updated[updated.length - 1];
              if (lastBlock?.id === newBlock.id) {
                lastBlock.output = 'Usage: browser diagnose';
                lastBlock.isComplete = true;
              }
              return updated;
            });
          }
          break;

        case 'workflow':
          // Workflow status commands
          console.log('[Workflow] Processing:', parsed.command);
          if (parsed.command === 'workflow status') {
            const status = await window.lucidAPI.lucid.workflowStatus();
            setBlocks(prev => {
              const updated = [...prev];
              const lastBlock = updated[updated.length - 1];
              if (lastBlock?.id === newBlock.id) {
                lastBlock.output = JSON.stringify(status, null, 2);
                lastBlock.isComplete = true;
              }
              return updated;
            });
          } else if (parsed.command === 'tokens') {
            const stats = await window.lucidAPI.lucid.getTokenStats();
            setBlocks(prev => {
              const updated = [...prev];
              const lastBlock = updated[updated.length - 1];
              if (lastBlock?.id === newBlock.id) {
                lastBlock.output = JSON.stringify(stats, null, 2);
                lastBlock.isComplete = true;
              }
              return updated;
            });
          }
          break;

        case 'history':
          // `history` / `clear history` - the router returns type
          // 'history' for both (see MULTI_WORD_COMMANDS). These
          // branches used to live under case 'workflow', where they
          // could never run.
          console.log('[History] Processing:', parsed.command);
          if (parsed.command === 'history') {
            const hist = await window.lucidAPI.lucid.getHistory();
            setBlocks(prev => {
              const updated = [...prev];
              const lastBlock = updated[updated.length - 1];
              if (lastBlock?.id === newBlock.id) {
                lastBlock.output = JSON.stringify(hist, null, 2);
                lastBlock.isComplete = true;
              }
              return updated;
            });
          } else if (parsed.command === 'clear history') {
            await window.lucidAPI.lucid.clearHistory();
            setBlocks(prev => {
              const updated = [...prev];
              const lastBlock = updated[updated.length - 1];
              if (lastBlock?.id === newBlock.id) {
                lastBlock.output = '✅ Conversation history cleared';
                lastBlock.isComplete = true;
              }
              return updated;
            });
          }
          break;

        case 'install':
        case 'github':
        case 'env':
        case 'daemon':
        case 'agent':
        case 'unknown':
        default:
          // All other commands - route to LuciferAI plugin if available
          console.log('[Backend] Command type:', parsed.type);
          
          if (luciferAIAvailable) {
            // LuciferAI plugin is available - use it
            console.log('[Plugin] Routing to LuciferAI:', parsed.type);
            try {
              const result = await runPluginCommand(command);
              const tokens = parseTokenStatsFromResponse(result);
              
              if (result.success) {
                setBlocks(prev => {
                  const updated = [...prev];
                  const lastBlock = updated[updated.length - 1];
                  if (lastBlock?.id === newBlock.id) {
                    lastBlock.output = result.terminalOutput || result.output || '';
                    lastBlock.isComplete = true;
                    lastBlock.isProcessing = false;
                    if (tokens) lastBlock.tokens = tokens;
                  }
                  return updated;
                });
                setIsProcessing(false);
              } else {
                setBlocks(prev => {
                  const updated = [...prev];
                  const lastBlock = updated[updated.length - 1];
                  if (lastBlock?.id === newBlock.id) {
                    lastBlock.output = `❌ Command failed: ${result.error || 'Unknown error'}\n\nTry: help for available commands`;
                    lastBlock.isComplete = true;
                  }
                  return updated;
                });
              }
            } catch (error) {
              console.error('[Plugin] LuciferAI error:', error);
              setBlocks(prev => {
                const updated = [...prev];
                const lastBlock = updated[updated.length - 1];
                if (lastBlock?.id === newBlock.id) {
                  lastBlock.output = `❌ LuciferAI plugin error: ${String(error)}\n\nThe plugin may have disconnected. Retrying in 30s...`;
                  lastBlock.isComplete = true;
                }
                return updated;
              });
              // Plugin might have died - mark as unavailable
              setLuciferAIAvailable(false);
            }
          } else if (luciferAIChecking) {
            // Still checking if plugin is available
            setBlocks(prev => {
              const updated = [...prev];
              const lastBlock = updated[updated.length - 1];
              if (lastBlock?.id === newBlock.id) {
                lastBlock.output = '⏳ Connecting to LuciferAI plugin...\n\nPlease wait while we establish connection.';
                lastBlock.isComplete = true;
              }
              return updated;
            });
          } else {
            // LuciferAI plugin not available - use fallback system
            console.log('[Fallback] Plugin unavailable, checking alternatives');

            if (!luciferAiEnabled) {
              // DISABLED, not just down: refuse outright. The fallback
              // below would write the command to the shell PTY - a back
              // door that must not run plugin commands (`install ...`
              // is a real Unix command). No activation while off.
              const refusal =
                LUCIFER_AI_DISABLED_MESSAGE +
                (parsed.type === 'help'
                  ? '\n\nHelp is part of LuciferAI and is unavailable while the plugin is disabled.'
                  : '');
              setBlocks(prev => {
                const updated = [...prev];
                const lastBlock = updated[updated.length - 1];
                if (lastBlock?.id === newBlock.id) {
                  lastBlock.output = refusal;
                  lastBlock.isComplete = true;
                }
                return updated;
              });
              break;
            }
            
            const commandRequiresLLM = requiresLLM(parsed.type);
            
            if (commandRequiresLLM) {
              // Command definitely needs LLM - show helpful message with typo correction
              const fallbackMsg = getFallbackMessage(parsed);
              setBlocks(prev => {
                const updated = [...prev];
                const lastBlock = updated[updated.length - 1];
                if (lastBlock?.id === newBlock.id) {
                  lastBlock.output = fallbackMsg;
                  lastBlock.isComplete = true;
                  lastBlock.isProcessing = false;
                }
                return updated;
              });
              setIsProcessing(false);
            } else {
              // Unknown command - try fuzzy match first
              const suggestion = findClosestCommand(command);
              
              if (suggestion && suggestion !== command.split(/\s+/)[0]) {
                // Found typo - suggest correction
                setBlocks(prev => {
                  const updated = [...prev];
                  const lastBlock = updated[updated.length - 1];
                  if (lastBlock?.id === newBlock.id) {
                    lastBlock.output = `❓ Unknown command: "${command}"\n\n💡 Did you mean: ${suggestion}\n\nTry: help for available commands`;
                    lastBlock.isComplete = true;
                    lastBlock.isProcessing = false;
                  }
                  return updated;
                });
                setIsProcessing(false);
              } else {
                // No typo detected - try shell as fallback
                console.log('[Fallback] Trying shell execution');
                window.lucidAPI.terminal.write(tabId, command + '\n');
                setTimeout(() => {
                  setBlocks(prev => prev.map(b => 
                    b.id === newBlock.id ? { ...b, isComplete: true, isProcessing: false } : b
                  ));
                  setIsProcessing(false);
                }, 500);
              }
            }
          }
          break;
      }
    } catch (error) {
      console.error('[Command Router] Error:', error);
      setBlocks(prev => {
        const updated = [...prev];
        const lastBlock = updated[updated.length - 1];
        if (lastBlock?.id === newBlock.id) {
          lastBlock.output = `❌ Error: ${String(error)}\n\nTry: help for available commands`;
          lastBlock.isComplete = true;
        }
        return updated;
      });
    } finally {
      // Always clear: the fixnet / llm / workflow cases and the failure
      // branches never clear isProcessing themselves, which used to leave
      // the processing glow stuck on after a command finished.
      setIsProcessing(false);
      useLoadingStore.getState().finish('command');
      // A command completing wiggles the Sentinel face's horns inward
      // once — a little celebration that the task is done.
      useHornWiggleStore.getState().wiggle();
    }
  };

  const handleHistoryUp = () => {
    if (history.length > 0) {
      const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(newIndex);
      setInput(history[newIndex]);
    }
  };

  const handleHistoryDown = () => {
    if (historyIndex !== -1) {
      const newIndex = historyIndex + 1;
      if (newIndex >= history.length) {
        setHistoryIndex(-1);
        setInput('');
      } else {
        setHistoryIndex(newIndex);
        setInput(history[newIndex]);
      }
    }
  };

  const handleToggleBlock = (id: string) => {
    setBlocks(prev => prev.map(b =>
      b.id === id ? { ...b, isCollapsed: !b.isCollapsed } : b
    ));
  };


  return (
    <>
      <div className="h-full w-full flex overflow-hidden">
        {/* Terminal Content (the chats live in the main Sidebar now) */}
        <div
          className="flex-1 flex flex-col overflow-hidden"
          style={{ backgroundColor: currentTheme.colors.terminal.background }}
        >
          {/* FixNet Status Bar */}
          <FixNetStatus />
          
          {/* Terminal failed to start (shell would not spawn). Covers both
              the async spawn error (onExit) and a synchronous spawn throw
              (bad cwd), which the store records as a create error. */}
          {(terminalFailed || createErrors[tabId]) && (
            <div className="mx-4 mt-4 rounded-lg border border-red-500/40 bg-red-500/15 p-3">
              <p className="text-sm font-semibold text-red-300">Terminal failed to start</p>
              <p className="mt-1 font-mono text-xs text-red-200/80 whitespace-pre-wrap">{terminalFailed ? terminalFailed.message : createErrors[tabId]}</p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => {
                    closeTab(tabId);
                    createTab();
                  }}
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
          
          {/* Blocks List */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {blocks.map(block => (
              <div key={block.id} id={`block-${block.id}`}>
                <Block
                  block={block}
                  isActive={!block.isComplete}
                  onToggle={() => handleToggleBlock(block.id)}
                />
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Idle heartbeat — the original "Idle • Awaiting Commands..."
              animation (blood drop only where the demon head was, per Gary),
              restored above the prompt. Shows only while the
              LuciferAI plugin is active and idle; while the fangs
              drip it holds on the blood-drop frame instead of
              hiding (same shouldDrip signal as the fang pixels);
              busy WITHOUT dripping (plain shell) still hides it. */}
          <Heartbeat active={luciferAIAvailable} busy={heartbeatBusy} dripping={heartbeatDripping} lastKeystrokeAt={lastKeystrokeAt} />

          {/* Input Area - Glass Effect */}
          <div className="input-container backdrop-blur-xl border-t border-[var(--border)] pb-safe"
               onKeyDown={() => { lastKeystrokeAt.current = Date.now(); }}
               style={{
                 background: 'rgba(22, 27, 34, 0.85)',
                 boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.2)',
               }}>
            <div className="flex items-center gap-3 px-4 py-3">
              {/* LuciferAI Plugin Status Indicator (the blood drop).
                  Honest states: the wrapper being up is NOT "connected" -
                  only a loaded model is. A wrapper with no model says so.
                  When the plugin is DISABLED the indicator renders
                  nothing at all - the flex row reflows and the input
                  stretches to fill the gap. */}
              <LuciferStatusIndicator
                enabled={luciferAiEnabled}
                checking={luciferAIChecking}
                modelAvailable={modelAvailable}
                modelNames={modelNames}
                available={luciferAIAvailable}
              />
              
              {/* Send arrow — this used to be a decorative span, so clicking it
                  did nothing and the prompt could only be sent with Enter.
                  It now submits exactly like Enter: the current prompt text,
                  read from the same `input` state both editor modes sync to,
                  so it works whether Monaco loaded or the plain-textarea
                  fallback is active. Disabled while the prompt is empty. */}
              <Tooltip content="Send" shortcut="Enter">
                <button
                  type="button"
                  onClick={() => {
                    handleSubmit(input);
                    // Return keyboard focus to the prompt so the next command
                    // can be typed without clicking back into the editor.
                    inputWrapRef.current?.querySelector('textarea')?.focus();
                  }}
                  disabled={!input.trim()}
                  aria-label="Send command"
                  className="shrink-0 rounded px-1 text-[var(--accent)] font-bold text-lg leading-none select-none hover:bg-white/10 transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
                  style={{ textShadow: '0 0 8px rgba(88, 166, 255, 0.5)' }}>
                  ➜
                </button>
              </Tooltip>
              <span className="text-[var(--text-secondary)] font-mono text-sm leading-none select-none opacity-70">
                ~
              </span>
              <div ref={inputWrapRef} data-glow-anchor="prompt-input" className="flex-1 rounded-lg overflow-hidden" 
                   style={{
                     background: 'rgba(33, 38, 45, 0.5)',
                     border: '1px solid rgba(48, 54, 61, 0.6)',
                   }}>
                <InputArea
                  input={input}
                  setInput={setInput}
                  onSubmit={handleSubmit}
                  onHistoryUp={handleHistoryUp}
                  onHistoryDown={handleHistoryDown}
                  isProcessing={isProcessing}
                />
              </div>

              {/* Sentinel face — press to toggle the Synth view, the Sentinel's home.
                  A LuciferAI surface: gone while the plugin is disabled, so the
                  input stretches into the space it leaves too. */}
              {onOpenSynth && luciferAiEnabled && (
                <Tooltip content="Toggle the Synth view">
                  <button
                    type="button"
                    onClick={onOpenSynth}
                    aria-label="Toggle Synth view"
                    className="shrink-0 rounded-full p-0.5 hover:bg-white/10 transition-colors"
                  >
                    <SentinelFace size={32} />
                  </button>
                </Tooltip>
              )}
            </div>
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
