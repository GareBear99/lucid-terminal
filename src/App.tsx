import { useEffect, useState, useRef } from 'react';
import { useSettingsStore } from './stores/settingsStore';
import { useTerminalStore } from './stores/terminalStore';
import { useFileStore } from './stores/fileStore';
import TitleBar from './components/Layout/TitleBar';
import Sidebar from './components/Layout/Sidebar';
import StatusBar from './components/Layout/StatusBar';
import Terminal from './components/Terminal/Terminal';
import TerminalTabs from './components/Terminal/TerminalTabs';
import AIChat from './components/AI/AIChat';
import CodeEditor from './components/Editor/CodeEditor';
import SettingsPanel from './components/Settings/SettingsPanel';
import { HelpModal, useHelpModalShortcut } from './components/Help/HelpModal';
// WelcomeScreen removed - always start with terminal
// import WelcomeScreen from './components/Layout/WelcomeScreen';
// import LucidTest from './components/LucidTest'; // Temporarily disabled during audit
import { View } from './types';

function App() {
  const { loadSettings, isLoading } = useSettingsStore();
  const { tabs, activeTabId, createTab } = useTerminalStore();
  const { openFiles, currentDir, setCurrentDir } = useFileStore();

  const [currentView, setCurrentView] = useState<View>('terminal');
  const [showAI, setShowAI] = useState(false); // Hidden by default - use command router instead
  const [showHelp, setShowHelp] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [aiPanelWidth, setAiPanelWidth] = useState(500);
  // showLucidTest removed - workflow test will be accessible via menu

  // Debug logging
  useEffect(() => {
    console.log('🔍 App render - currentDir:', currentDir);
  }, [currentDir]);

  // Track initialization to prevent duplicate tabs in React Strict Mode
  const hasInitialized = useRef(false);

  // Setup help modal keyboard shortcuts (Cmd+/ and F1)
  useEffect(() => {
    return useHelpModalShortcut(() => setShowHelp(true));
  }, []);

  // Instant startup - terminal first, everything else loads in background
  useEffect(() => {
    // Prevent duplicate initialization in React 18 Strict Mode
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    async function init() {
      console.log('[INIT] Loading settings...');
      await loadSettings();
      
      // Create terminal immediately (doesn't need currentDir)
      if (tabs.length === 0) {
        console.log('[INIT] Creating terminal...');
        await createTab(); // Will use home dir by default
        console.log('[INIT] ✅ Terminal ready!');
      }
      
      // Load file explorer in background (non-blocking)
      try {
        const homeDir = await window.lucidAPI.fs.getHomeDir();
        await setCurrentDir(homeDir);
        console.log('[INIT] ✅ File explorer ready');
      } catch (error) {
        console.log('[INIT] File explorer unavailable');
      }
    }
    
    init().catch(error => {
      console.error('[INIT] Startup error:', error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run once, useRef prevents double execution

  // Handle terminal data events
  useEffect(() => {
    window.lucidAPI.terminal.onData((_id, _data) => {
      // Data is handled by individual Terminal components
    });

    window.lucidAPI.terminal.onExit((id, code) => {
      console.log(`Terminal ${id} exited with code ${code}`);
    });
  }, []);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="flex flex-col items-center gap-4">
          <div className="spinner w-8 h-8"></div>
          <span className="text-[var(--text-secondary)]">Loading Lucid Terminal...</span>
        </div>
      </div>
    );
  }

  // LucidTest temporarily disabled during audit
  // TODO: Re-add via menu or command palette

  return (
    <div className="h-screen flex flex-col bg-[var(--bg-primary)] overflow-hidden">
      {/* Title Bar */}
      <TitleBar />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* PHASE 1: No more welcome screen - always show terminal */}
        <>
            {/* Sidebar */}
            <Sidebar
              width={sidebarWidth}
              onWidthChange={setSidebarWidth}
              currentView={currentView}
              onViewChange={setCurrentView}
            />

            {/* Main Panel */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {currentView === 'settings' ? (
                <SettingsPanel onClose={() => setCurrentView('terminal')} />
              ) : currentView === 'editor' && openFiles.length > 0 ? (
                <CodeEditor />
              ) : (
                <>
                  {/* Terminal Tabs */}
                  <TerminalTabs />

                  {/* Terminal Container */}
                  <div className="flex-1 flex overflow-hidden">
                    {/* Terminal */}
                    <div className="flex-1 overflow-hidden">
                      {tabs.map((tab) => (
                        <div
                          key={tab.id}
                          className={`h-full ${tab.id === activeTabId ? 'block' : 'hidden'}`}
                        >
                          <Terminal tabId={tab.id} onOpenHelp={() => setShowHelp(true)} />
                        </div>
                      ))}
                      {tabs.length === 0 && (
                        <div className="h-full flex items-center justify-center text-[var(--text-muted)]">
                          <div className="text-center">
                            <p className="text-lg mb-2">No terminal open</p>
                            <button
                              onClick={() => createTab()}
                              className="btn btn-primary"
                            >
                              Create Terminal
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* AI Panel */}
                    {showAI && (
                      <>
                        {/* Resize Handle */}
                        <div
                          className="w-1 resize-handle"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            const startX = e.clientX;
                            const startWidth = aiPanelWidth;

                            const onMouseMove = (e: MouseEvent) => {
                              const delta = startX - e.clientX;
                              const newWidth = Math.max(400, Math.min(1000, startWidth + delta));
                              setAiPanelWidth(newWidth);
                            };

                            const onMouseUp = () => {
                              document.removeEventListener('mousemove', onMouseMove);
                              document.removeEventListener('mouseup', onMouseUp);
                            };

                            document.addEventListener('mousemove', onMouseMove);
                            document.addEventListener('mouseup', onMouseUp);
                          }}
                        />

                        {/* AI Chat Panel */}
                        <div
                          className="h-full border-l border-[var(--border)]"
                          style={{ width: aiPanelWidth }}
                        >
                          <AIChat onClose={() => setShowAI(false)} />
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
        </>
      </div>

      {/* Status Bar */}
      <StatusBar
        showAI={showAI}
        onToggleAI={() => setShowAI(!showAI)}
        onOpenHelp={() => setShowHelp(true)}
      />

      {/* Help Modal */}
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}

export default App;
