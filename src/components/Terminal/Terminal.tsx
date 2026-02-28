import { useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { TerminalBlock } from '../../types';
import { Block } from './Block';
import { InputArea } from './InputArea';
import { parseCommand, getFallbackMessage, findClosestCommand, requiresLLM } from '../../utils/commandRouter';
import { HelpPanel } from '../Help/HelpPanel';
import { PlanningPanel } from '../Planning/PlanningPanel';
import { ValidationStepFactory } from './ValidationIndicator';
import { parseTokenStatsFromResponse } from './TokenDisplay';
import { ConversationHistory } from '../Sidebar/ConversationHistory';
import { FixNetStatus } from '../FixNet/FixNetStatus';

interface TerminalProps {
  tabId: string;
  onOpenHelp?: () => void;
}

function Terminal({ tabId, onOpenHelp }: TerminalProps) {
  const { currentTheme } = useSettingsStore();
  const [blocks, setBlocks] = useState<TerminalBlock[]>([]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isProcessing, setIsProcessing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // LuciferAI Plugin State - Dynamic and Optional
  const [luciferAIAvailable, setLuciferAIAvailable] = useState(false);
  const [luciferAIChecking, setLuciferAIChecking] = useState(true);
  
  // Help panel state
  const [showHelpPanel, setShowHelpPanel] = useState(false);
  
  // Planning panel state
  const [showPlanningPanel, setShowPlanningPanel] = useState(false);
  
  // Conversation history sidebar state
  const [showHistorySidebar, setShowHistorySidebar] = useState(true);
  
  // Keyboard shortcut for toggling history (Cmd+B / Ctrl+B)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setShowHistorySidebar(prev => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Initialize LuciferAI Plugin (optional, non-blocking)
  useEffect(() => {
    const initLuciferAI = async () => {
      try {
        console.log('[Plugin] Checking LuciferAI availability...');
        
        // Attempt to initialize LuciferAI backend
        const result = await window.lucidAPI.lucid.init();
        
        if (result.success) {
          console.log('[Plugin] ✅ LuciferAI plugin loaded and ready');
          setLuciferAIAvailable(true);
        } else {
          console.log('[Plugin] ⚠️  LuciferAI plugin unavailable:', result.error);
          setLuciferAIAvailable(false);
        }
      } catch (error) {
        console.log('[Plugin] ⚠️  LuciferAI backend not running - terminal works in standalone mode');
        setLuciferAIAvailable(false);
      } finally {
        setLuciferAIChecking(false);
      }
    };
    
    // Try to connect to plugin
    initLuciferAI();
    
    // Optional: Retry connection every 30s if not available
    const retryInterval = setInterval(() => {
      if (!luciferAIAvailable) {
        console.log('[Plugin] Retrying LuciferAI connection...');
        initLuciferAI();
      }
    }, 30000);
    
    return () => clearInterval(retryInterval);
  }, [luciferAIAvailable]);

  // Initialize first block or listen to PTY
  useEffect(() => {
    // Handler for incoming data from PTY
    const handleData = (id: string, data: string) => {
      if (id !== tabId) return;

      setBlocks(prev => {
        if (prev.length === 0) return prev; // Should have at least one block if active

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

    const cleanup = window.lucidAPI.terminal.onData(handleData);

    // No initial block needed - terminal is ready for input immediately

    return () => {
      cleanup();
    };
  }, [tabId]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [blocks, input]);

  const handleSubmit = async (command: string) => {
    if (!command.trim()) return;

    console.log('[Command Router] Processing:', command);

    // 1. Add command to history
    setHistory(prev => [...prev, command]);
    setHistoryIndex(-1);

    // 2. Parse command with deterministic router
    const parsed = parseCommand(command);
    console.log('[Command Router] Parsed:', parsed);

    // 3. Handle HELP command - open help modal instead of creating block
    if (parsed.type === 'help') {
      console.log('[Help] Opening help modal');
      if (onOpenHelp) {
        onOpenHelp();
      } else {
        // Fallback to old panel if callback not provided
        setShowHelpPanel(true);
      }
      return;
    }

    // 4. Handle PLAN command - open planning panel instead of creating block
    if (parsed.type === 'plan') {
      console.log('[Planning] Opening planning panel');
      setShowPlanningPanel(true);
      return;
    }

    // 5. Generate validation steps based on command type
    let validationSteps = ValidationStepFactory.shellCommand(command);
    
    if (parsed.type === 'fixnet') {
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

    // 8. Set processing state and clear input
    setIsProcessing(true);
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

        case 'fixnet':
          // FixNet commands - route to IPC
          console.log('[FixNet] Processing:', parsed.command);
          if (parsed.command === 'fixnet stats') {
            const stats = await window.lucidAPI.lucid.getFixNetStats();
            setBlocks(prev => {
              const updated = [...prev];
              const lastBlock = updated[updated.length - 1];
              if (lastBlock?.id === newBlock.id) {
                lastBlock.output = JSON.stringify(stats, null, 2);
                lastBlock.isComplete = true;
              }
              return updated;
            });
          } else if (parsed.command.startsWith('fixnet search')) {
            const query = parsed.args.join(' ');
            const result = await window.lucidAPI.lucid.fixnetSearch(query);
            setBlocks(prev => {
              const updated = [...prev];
              const lastBlock = updated[updated.length - 1];
              if (lastBlock?.id === newBlock.id) {
                lastBlock.output = JSON.stringify(result, null, 2);
                lastBlock.isComplete = true;
              }
              return updated;
            });
          } else {
            // Other fixnet commands - route to Python backend
            if (luciferAIAvailable) {
              const result = await window.lucidAPI.lucid.command(command);
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
                  lastBlock.output = '⚠️  LuciferAI plugin required for this command.\nSee "help" for available commands.';
                  lastBlock.isComplete = true;
                }
                return updated;
              });
            }
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
            await window.lucidAPI.lucid.llmSetEnabled(model, true);
            setBlocks(prev => {
              const updated = [...prev];
              const lastBlock = updated[updated.length - 1];
              if (lastBlock?.id === newBlock.id) {
                lastBlock.output = `✅ Enabled model: ${model}`;
                lastBlock.isComplete = true;
              }
              return updated;
            });
          } else if (parsed.command.startsWith('llm disable')) {
            const model = parsed.args[0];
            await window.lucidAPI.lucid.llmSetEnabled(model, false);
            setBlocks(prev => {
              const updated = [...prev];
              const lastBlock = updated[updated.length - 1];
              if (lastBlock?.id === newBlock.id) {
                lastBlock.output = `❌ Disabled model: ${model}`;
                lastBlock.isComplete = true;
              }
              return updated;
            });
          } else {
            // Other LLM commands - route to Python backend
            if (luciferAIAvailable) {
              const result = await window.lucidAPI.lucid.command(command);
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
                  lastBlock.output = '⚠️  LuciferAI plugin required for LLM commands.\nSee "help" for available commands.';
                  lastBlock.isComplete = true;
                }
                return updated;
              });
            }
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
          } else if (parsed.command === 'history') {
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
              const result = await window.lucidAPI.lucid.command(command);
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

  const handleJumpToBlock = (blockId: string) => {
    // Find the block element and scroll to it
    const blockElement = document.getElementById(`block-${blockId}`);
    if (blockElement) {
      blockElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Highlight briefly
      blockElement.style.transition = 'background-color 0.3s';
      blockElement.style.backgroundColor = 'rgba(88, 166, 255, 0.1)';
      setTimeout(() => {
        blockElement.style.backgroundColor = '';
      }, 1000);
    }
  };

  const handleClearHistory = () => {
    if (confirm('Clear all command history? This cannot be undone.')) {
      setBlocks([]);
    }
  };

  return (
    <>
      <div className="h-full w-full flex overflow-hidden">
        {/* Conversation History Sidebar */}
        {showHistorySidebar && (
          <ConversationHistory
            blocks={blocks}
            onJumpToBlock={handleJumpToBlock}
            onClearHistory={handleClearHistory}
          />
        )}

        {/* Terminal Content */}
        <div
          className="flex-1 flex flex-col overflow-hidden"
          style={{ backgroundColor: currentTheme.colors.terminal.background }}
        >
          {/* FixNet Status Bar */}
          <FixNetStatus />
          
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

          {/* Input Area - Glass Effect */}
          <div className="input-container backdrop-blur-xl border-t border-[var(--border)] pb-safe" 
               style={{
                 background: 'rgba(22, 27, 34, 0.85)',
                 boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.2)',
               }}>
            <div className="flex items-center gap-3 px-4 py-3">
              {/* LuciferAI Plugin Status Indicator */}
              {luciferAIChecking ? (
                <span className="text-xs text-yellow-500 animate-pulse" title="Connecting to LuciferAI plugin...">
                  ⏳
                </span>
              ) : luciferAIAvailable ? (
                <span className="text-xs text-green-500" title="LuciferAI plugin connected">
                  🩸
                </span>
              ) : (
                <span className="text-xs text-gray-500" title="LuciferAI plugin offline - terminal works in standalone mode">
                  ⚪
                </span>
              )}
              
              <span className="text-[var(--accent)] font-bold text-lg leading-none select-none" 
                    style={{ textShadow: '0 0 8px rgba(88, 166, 255, 0.5)' }}>
                ➜
              </span>
              <span className="text-[var(--text-secondary)] font-mono text-sm leading-none select-none opacity-70">
                ~
              </span>
              <div className="flex-1 rounded-lg overflow-hidden" 
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
