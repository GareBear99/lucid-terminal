import { useEffect, useState, useRef } from 'react';
import { useSettingsStore } from './stores/settingsStore';
import { isLuciferAiEnabled, isLuciferAiSilenced } from './lib/luciferAi';
import { useToastStore, visibleToastNotifications } from './stores/toastStore';
import { ErrorNotification } from './components/Terminal/ErrorNotification';
import { useTerminalStore } from './stores/terminalStore';
import { useFileStore } from './stores/fileStore';
import { useBrowserStore } from './stores/browserStore';
import TitleBar from './components/Layout/TitleBar';
import Sidebar from './components/Layout/Sidebar';
import StatusBar from './components/Layout/StatusBar';
import Terminal from './components/Terminal/Terminal';
import TerminalTabs from './components/Terminal/TerminalTabs';
import { EmptyTerminalState } from './components/Terminal/EmptyTerminalState';
import AIPanel from './components/AI/AIPanel';
import CodeEditor from './components/Editor/CodeEditor';
import SettingsPanel from './components/Settings/SettingsPanel';
import { SynthView } from './components/Synth/SynthView';
import { toggleSynthView } from './lib/synthToggle';
import { ForgeView } from './components/Forge/ForgeView';
import { PersonaPlexView } from './components/PersonaPlex/PersonaPlexView';
import { toggleForgeView } from './lib/forgeView';
import { togglePersonaPlexView } from './lib/personaPlexView';
import { toggleSettingsView } from './lib/settingsView';
import { HelpModal, useHelpModalShortcut } from './components/Help/HelpModal';
import { LuciferAITabPanel } from './components/Help/LuciferAITabPanel';
import { ModelMissingBanner } from './components/Layout/ModelMissingBanner';
import { SplashScreen } from './components/Splash/SplashScreen';
import { SplashMist } from './components/Splash/SplashMist';
import { applyTheme } from './themes/themes';
import { themeForView, showSplashMistForView } from './lib/filesScreen';
import { FixNetStatus } from './components/FixNet/FixNetStatus';
// WelcomeScreen removed - always start with terminal
// import WelcomeScreen from './components/Layout/WelcomeScreen';
// import LucidTest from './components/LucidTest'; // Temporarily disabled during audit
import { View } from './types';

function App() {
  const { loadSettings, isLoading, storageDegraded, settings, updateSetting, currentTheme } = useSettingsStore();
  // The LuciferAI disable rule (Gary, 2026-11-05): when this is
  // false the plugin is completely gone - its surfaces, its Help,
  // its commands. Every gate in this file reads this value. This
  // is the Settings toggle (Settings → Plugins) — the ONLY thing
  // that makes the blood drop disappear (Gary, 2026-11-08
  // ~02:29 PST: "off like in settings toggle").
  const luciferAiEnabled = isLuciferAiEnabled(settings);
  // The LuciferAI silenced state (Gary, 2026-11-08 ~02:28 PST):
  // the blood drop toggle is JUST a silencer — it greys the drop,
  // it never turns the plugin off and never stops the runtime
  // (causal ticks keep running, causal order is held). Silenced
  // only changes how the drop renders; no gate in this file reads
  // it as a disable.
  const luciferAiSilenced = isLuciferAiSilenced(settings);
  const { notifications, dismissToast } = useToastStore();
  const { tabs, activeTabId, createTab } = useTerminalStore();
  const { currentDir, setCurrentDir } = useFileStore();

  const [currentView, setCurrentView] = useState<View>('terminal');
  // The Files screen (Editor view) is Full Glass, no splash back
  // (Gary, 2026-11-08 — see src/lib/filesScreen.ts): it shows just
  // the theme, the full glass theme, not the splashscreen misty
  // black. The applied theme follows the view (Full Glass on the
  // Files screen, the user's theme everywhere else); the mist is
  // hidden on the same condition below, so the translucent Full
  // Glass surfaces composite over plain black, not over the smoke.
  useEffect(() => {
    applyTheme(themeForView(currentView, currentTheme));
  }, [currentView, currentTheme]);
  // The Synth button toggles: first press opens the Synth view, a
  // second press exits back to the terminal.
  const toggleSynth = () =>
    setCurrentView((view) => toggleSynthView(view));
  // The Forge button toggles the same way: first press opens the
  // Forge view, a second press exits back to the terminal.
  const toggleForge = () =>
    setCurrentView((view) => toggleForgeView(view));
  // The Persona Plex button toggles the same way: first press opens
  // the Plex setup page, a second press exits back to the terminal.
  const togglePersonaPlex = () =>
    setCurrentView((view) => togglePersonaPlexView(view));
  // The Settings button toggles the same way: first press opens
  // the Settings view, a second press exits back to the terminal.
  const toggleSettings = () =>
    setCurrentView((view) => toggleSettingsView(view));
  const [showAI, setShowAI] = useState(false); // Hidden by default - use command router instead
  // The AI button always lands on AI Chat: opening the panel from the
  // Browser tab (or with the panel already open on Browser) switches to
  // the chat tab first - it never reopens on Browser. Clicking it while
  // already on AI Chat closes the panel, as before.
  // The panel is Lucid AI, its own plugin (Gary, 2026-11-07) — it is
  // NOT a LuciferAI surface, so the toggle never checks LuciferAI:
  // it works with the plugin on or off. The panel's own dependencies
  // are the chat routes (ping server / API key / local model), which
  // the chat itself verifies before answering.
  const handleToggleAI = () => {
    if (!showAI) {
      useBrowserStore.getState().setPanelTab('ai');
      setShowAI(true);
    } else if (useBrowserStore.getState().panelTab === 'browser') {
      useBrowserStore.getState().setPanelTab('ai');
    } else {
      setShowAI(false);
    }
  };
  const [showHelp, setShowHelp] = useState(false);
  // Blood drop tab (Gary, 2026-11-07): a visible tab in the terminal
  // tab strip. When true the main panel shows the blood drop panel
  // instead of the terminals; picking a terminal tab (or creating
  // one) sets it false again. It is NOT a terminal tab — no PTY, no
  // entry in the terminal store — and it is NOT the Help modal (that
  // is the toolbar drop's surface). The daemon and the homunculi do
  // not live here and are not gated on this state.
  const [bloodDropActive, setBloodDropActive] = useState(false);
  // Help is bound to LuciferAI: when the plugin is off, Help is
  // inaccessible. Every Help opener (the StatusBar button, the
  // terminal `help` command, the model banner's tiers link) goes
  // through this guard and does nothing while disabled. It reads
  // the LIVE setting so the once-registered keyboard shortcut
  // below never closes over a stale value.
  const openHelp = () => {
    if (isLuciferAiEnabled(useSettingsStore.getState().settings)) setShowHelp(true);
  };
  // When LuciferAI is disabled, ITS surfaces close: the Synth view,
  // the Help modal, and the blood drop tab. They cannot be reopened
  // while off (the buttons, the shortcut and the `help` command are
  // all gated), so this only fires on the toggle itself.
  // The AI panel is NOT one of them — it is Lucid AI, its own plugin
  // (Gary, 2026-11-07), so it stays open and working with the plugin
  // off. Never close it here.
  // The Persona Plex view is NOT one of them either — it is an add-on
  // (Gary, 2026-11-07 ~06:22 PST), not a LuciferAI surface, so it
  // stays open and working with the plugin off. Disabling the plugin
  // used to close it as if it belonged to it, which was the bug.
  // Never close it here.
  // The daemon and the homunculi are NOT one of them either — they
  // continue with LuciferAI disabled (Gary, 2026-11-07 ~07:32 PST);
  // nothing here touches them.
  useEffect(() => {
    if (luciferAiEnabled) return;
    if (currentView === 'synth') setCurrentView('terminal');
    if (showHelp) setShowHelp(false);
    if (bloodDropActive) setBloodDropActive(false);
  }, [luciferAiEnabled, currentView, showHelp, bloodDropActive]);
  // Boot splash: the high-tech intro (smoke -> "Lucid" -> dashboard).
  // Shows on every launch for now; a "don't show again" setting is a
  // one-line follow-up. The dashboard mounts underneath, so the splash
  // fading out is just the overlay going transparent.
  const [showSplash, setShowSplash] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [aiPanelWidth, setAiPanelWidth] = useState(500);
  const [storageBannerDismissed, setStorageBannerDismissed] = useState(false);
  // Startup model check: null while the check has not resolved yet.
  // Dismissing the banner hides it for this session only — it comes
  // back on the next launch while no model is installed.
  const [modelCheck, setModelCheck] = useState<{ installed: boolean } | null>(null);
  const [modelBannerDismissed, setModelBannerDismissed] = useState(false);
  // Help category to land on when the modal opens (the "?" in the model
  // banner opens 'tiers'); null means "open as before".
  const [helpInitialCategory, setHelpInitialCategory] = useState<string | null>(null);
  // showLucidTest removed - workflow test will be accessible via menu

  // Debug logging
  useEffect(() => {
    console.log('🔍 App render - currentDir:', currentDir);
  }, [currentDir]);

  // Track initialization to prevent duplicate tabs in React Strict Mode
  const hasInitialized = useRef(false);

  // Startup model check: is any model file installed? Plain
  // filesystem scan in the main process — it only sets state, so
  // the app opens whether it succeeds or not. A failed check is
  // "unknown" (no banner), never "missing" (banner on a guess).
  const checkModels = async () => {
    try {
      const result = await window.lucidAPI.lucid.checkModelsInstalled();
      setModelCheck({ installed: result.installed });
    } catch (error) {
      console.log('[INIT] Model check unavailable:', error);
      setModelCheck(null);
    }
  };

  // Setup help modal keyboard shortcuts (Cmd+/ and F1)
  useEffect(() => {
    return useHelpModalShortcut(openHelp);
  }, []);

  // Instant startup - terminal first, everything else loads in background
  useEffect(() => {
    // Prevent duplicate initialization in React 18 Strict Mode
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    async function init() {
      console.log('[INIT] Loading settings...');
      await loadSettings();
      void checkModels();
      
      // Create terminal immediately (doesn't need currentDir)
      if (tabs.length === 0) {
        console.log('[INIT] Creating terminal...');
        await createTab(); // Will use home dir by default
        // Readiness is logged by the Terminal itself on first shell
        // output — the shell may still fail to spawn after this.
        console.log('[INIT] Terminal created — waiting for shell...');
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
      <>
        {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
        {/* Main screen is always splashscreen misty black (Gary,
            2026-11-07): pure black + the splash's own smoke, behind
            the content — same treatment as the main root below. */}
        <div className="relative isolate h-screen flex items-center justify-center bg-black">
        <SplashMist />
        <div className="flex flex-col items-center gap-4">
          <div className="spinner w-8 h-8"></div>
          <span className="text-[var(--text-secondary)]">Loading Lucid Terminal...</span>
        </div>
      </div>
      </>
    );
  }

  // LucidTest temporarily disabled during audit
  // TODO: Re-add via menu or command palette

  return (
    // Main screen is always splashscreen misty black (Gary,
    // 2026-11-07): the root is pure black #000 — the splash's own
    // background — with the splash's smoke mist behind the content
    // (SplashMist, -z-10 inside this isolated root, so it sits above
    // the black and below every panel). The theme still colours text,
    // accents and borders; the screen itself is mist in both
    // LuciferAI states. The boot splash overlays this until it fades;
    // what it fades into is the same mist, so the screen never stops
    // being the splashscreen. EXCEPTION (Gary, 2026-11-08): the
    // Files screen (Editor view) has no splash back — just the
    // theme, the full glass theme — so the mist is hidden while the
    // Editor is the current view (and the Full Glass theme is
    // applied by the effect above).
    <div className="relative isolate h-screen flex flex-col bg-black overflow-hidden">
      {/* Boot splash - overlays the dashboard until it fades out. */}
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
      {showSplashMistForView(currentView) && <SplashMist />}

      {/* Title Bar */}
      <TitleBar />

      {/* No local model installed — command passes and AI chat need one.
          Session-only dismiss: it comes back on the next launch while no
          model is installed. */}
      {luciferAiEnabled && modelCheck && !modelCheck.installed && !modelBannerDismissed && (
        <ModelMissingBanner
          onDismiss={() => setModelBannerDismissed(true)}
          onInstalled={() => void checkModels()}
          onShowTiers={() => {
            setHelpInitialCategory('tiers');
            setShowHelp(true);
          }}
        />
      )}

      {/* Read-only app data — settings fell back to memory and will not
          persist. The app still runs; this is a warning, not a failure. */}
      {storageDegraded && !storageBannerDismissed && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-yellow-500/15 border-b border-yellow-500/40 text-yellow-200 text-xs">
          <span>⚠️ Settings could not be saved — the app data folder is read-only. Changes won't persist.</span>
          <button
            onClick={() => setStorageBannerDismissed(true)}
            className="shrink-0 rounded px-2 py-0.5 hover:bg-white/10"
            title="Dismiss"
          >
            Dismiss
          </button>
        </div>
      )}

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
              showAI={showAI}
              onToggleAI={handleToggleAI}
              onOpenBloodDrop={() => {
                // Both blood drops go to the same creation place
                // (Gary, 2026-11-07 ~09:18 PST): the toolbar drop
                // opens the blood drop terminal, like the create
                // drop. The terminal view IS the creation place, so
                // switch to it first when coming from another view.
                setCurrentView('terminal');
                setBloodDropActive(true);
              }}
              onToggleSynth={toggleSynth}
              onToggleForge={toggleForge}
              onTogglePersonaPlex={togglePersonaPlex}
              onToggleSettings={toggleSettings}
            />

            {/* Main Panel — the terminal branch is ALWAYS mounted
                (zero-latency F2): view switches used to unmount the
                terminal entirely, disposing xterm (5,000-line
                scrollback gone) while the PTY kept emitting into a
                detached listener, so output emitted while away was
                silently dropped. Now the terminal lives in a hidden
                div when another view is showing — same pattern as
                the tab strip, which already keeps hidden tabs
                mounted — so switching to Synth/Forge/Settings and
                back loses nothing. The other views stay exclusive
                (mounted only when shown): only the terminal pays the
                always-mounted cost, and it is the one whose state
                must survive. Its per-tab timers are gated on the
                active tab + visible window (F4), so a hidden
                terminal does not poll. */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {currentView === 'synth' && (
                <SynthView />
              )}
              {currentView === 'forge' && (
                // Full-page scroll (Gary, 2026-11-07): the Forge is
                // one flowing page, not a fixed-height column. The
                // main panel is overflow-hidden, so the Forge view
                // gets its own scroll container here; ForgeView
                // itself is a plain flow container (see its root
                // comment). In Settings the scroll container is the
                // Settings content area instead — same page, one
                // scroll, never nested.
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <ForgeView />
                </div>
              )}
              {currentView === 'persona-plex' && (
                <PersonaPlexView />
              )}
              {currentView === 'settings' && (
                <SettingsPanel onClose={() => setCurrentView('terminal')} onOpenPersonaPlex={() => setCurrentView('persona-plex')} />
              )}
              {currentView === 'editor' && (
                // The editor renders even with no files open yet — its
                // own empty state points at the Explorer to pick a
                // file. (The old openFiles.length > 0 gate sent the
                // editor icon to the terminal instead whenever no
                // file was open, so the editor was unreachable from
                // a fresh start.)
                <CodeEditor />
              )}
              {/* Terminal — always mounted, hidden unless it is the
                  current view (see the Main Panel comment above). */}
              <div className={currentView === 'terminal' ? 'flex-1 flex flex-col overflow-hidden' : 'hidden'}>
                <>
                  {/* Terminal Tabs — the blood drop tab (Gary,
                      2026-11-07): it renders in this strip while
                      LuciferAI is enabled and is gone when the plugin
                      is off. */}
                  <TerminalTabs
                    showBloodDrop={luciferAiEnabled}
                    bloodDropActive={bloodDropActive}
                    onBloodDropActiveChange={setBloodDropActive}
                  />

                  {/* FixNet Status Bar — hoisted out of Terminal
                      (zero-latency F4): it used to render inside
                      EVERY tab, so N tabs ran N identical 30 s
                      pollers. One instance here serves all tabs.
                      It sits below the tab strip, where it was. */}
                  <FixNetStatus />

                  {/* Terminal Container */}
                  <div className="flex-1 flex overflow-hidden">
                    {/* Terminal */}
                    <div className="flex-1 overflow-hidden">
                      {bloodDropActive ? (
                        // Blood drop tab selected: the blood drop panel,
                        // not a terminal. The terminals stay mounted
                        // underneath (hidden), so switching back is
                        // instant and nothing is lost.
                        <LuciferAITabPanel />
                      ) : (
                        <>
                      {tabs.map((tab) => (
                        <div
                          key={tab.id}
                          className={`h-full ${tab.id === activeTabId ? 'block' : 'hidden'}`}
                        >
                          <Terminal tabId={tab.id} onOpenHelp={openHelp} onOpenSynth={toggleSynth} onOpenForge={toggleForge} luciferToggleActive={!luciferAiSilenced} onToggleLuciferAi={() => void updateSetting('luciferAiSilenced', !isLuciferAiSilenced(useSettingsStore.getState().settings))} />
                        </div>
                      ))}
                      {tabs.length === 0 && (
                        <EmptyTerminalState
                          onCreateTerminal={() => createTab()}
                          onCreateEditor={() => setCurrentView('editor')}
                          // Blood drop (Gary, 2026-11-07): as an option
                          // in the empty state — a tab you open. It
                          // selects the blood drop tab in the strip
                          // (the blood drop panel); it does NOT open
                          // the Help modal — that is the toolbar drop's
                          // surface. Only when LuciferAI is enabled;
                          // when off, no handler and no drop anywhere
                          // (not in the strip, not here).
                          onOpenBloodDrop={luciferAiEnabled ? () => setBloodDropActive(true) : undefined}
                        />
                      )}
                        </>
                      )}
                    </div>
                  </div>
                </>
              </div>
            </div>

            {/* AI Panel — Lucid AI, its own plugin (Gary, 2026-11-07):
                unmounted from LuciferAI and mounted HERE, as a sibling
                of the main panel, so it shows on EVERY view — terminal,
                editor, Synth, Forge, Persona Plex, Settings — not just
                the terminal. It used to live inside the terminal view
                branch, which is why it never appeared on the other
                pages: never nest it in a view again.
                Its dependencies (what it needs, and what it does not):
                it needs a chat route — the ping server, an API key, or
                a local model — which the chat verifies before answering
                and reports honestly when none can answer (the "No model
                loaded" screen, the SP base display). It does NOT need
                LuciferAI: nothing here reads the plugin, and the panel
                works with it on or off. */}
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

                {/* AI Panel — tabbed: AI Chat + Browser */}
                <div
                  className="h-full border-l border-[var(--border)]"
                  style={{ width: aiPanelWidth }}
                >
                  <AIPanel onClose={() => setShowAI(false)} />
                </div>
              </>
            )}
        </>
      </div>

      {/* Status Bar */}
      <StatusBar
        showAI={showAI}
        onToggleAI={handleToggleAI}
        onOpenHelp={openHelp}
      />

      {/* Help Modal */}
      <HelpModal
        isOpen={showHelp}
        initialCategoryId={helpInitialCategory}
        onClose={() => {
          setShowHelp(false);
          setHelpInitialCategory(null);
        }}
      />

      {/* Error toasts (file, terminal, backend, Monaco fallback).
          Dismissing a toast only hides it from this stack - the
          notification stays in the store so the bell panel in the
          terminal tab bar (the persistent home) can still list it. */}
      <ErrorNotification notifications={visibleToastNotifications(notifications)} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
