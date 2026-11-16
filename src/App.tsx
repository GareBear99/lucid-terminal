import { useEffect, useState, useRef } from 'react';
import { useSettingsStore } from './stores/settingsStore';
import { useForgeStore } from './stores/forgeStore';
import { isLuciferAiEnabled, isLuciferAiSilenced } from './lib/luciferAi';
import { useToastStore, visibleToastNotifications } from './stores/toastStore';
import { ErrorNotification } from './components/Terminal/ErrorNotification';
import { useTerminalStore } from './stores/terminalStore';
import { useDetachPushListeners } from './lib/detachPushListeners';
import { useFileStore } from './stores/fileStore';
import { autosaveVetoed } from './lib/autosave';
import { useBrowserStore } from './stores/browserStore';
import TitleBar from './components/Layout/TitleBar';
import Sidebar from './components/Layout/Sidebar';
import StatusBar from './components/Layout/StatusBar';
import Terminal from './components/Terminal/Terminal';
import TerminalTabs from './components/Terminal/TerminalTabs';
import { EmptyTerminalState } from './components/Terminal/EmptyTerminalState';
import AIPanel from './components/AI/AIPanel';
import { Dock } from './components/Layout/Dock';
import { GitPanel } from './components/Git/GitPanel';
import { useDockStore } from './stores/dockStore';
import { useWorkspaceStore, readSavedWorkspace } from './stores/workspaceStore';
import CodeEditor from './components/Editor/CodeEditor';
import SettingsPanel, { type SettingsTab } from './components/Settings/SettingsPanel';
import { SynthView } from './components/Synth/SynthView';
import { toggleSynthView } from './lib/synthToggle';
import { ForgeView } from './components/Forge/ForgeView';
import { PersonaPlexView } from './components/PersonaPlex/PersonaPlexView';
import { toggleForgeView } from './lib/forgeView';
import { togglePersonaPlexView } from './lib/personaPlexView';
import { toggleWorldmapView } from './lib/worldmapView';
import { WorldmapView } from './components/Worldmap/WorldmapView';
import { toggleSettingsView } from './lib/settingsView';
import { HelpModal, useHelpModalShortcut } from './components/Help/HelpModal';
import { LuciferAITabPanel } from './components/Help/LuciferAITabPanel';
import { AtomModals } from './components/CommandPalette/CommandPalette';
import { registerBuiltinCommands } from './lib/builtinCommands';
import type { CommandContext } from './lib/commandRegistry';
import { refreshProjectFileIndex } from './lib/projectFileIndex';
import { resolveStartupExplorerRoot } from './lib/explorerStartupRoot';
import { subscribeMenuModals } from './lib/menuModals';
import { ModelMissingBanner } from './components/Layout/ModelMissingBanner';
import { SplashScreen } from './components/Splash/SplashScreen';
import { SplashMist } from './components/Splash/SplashMist';
import { ProfilesScreen } from './components/Profiles/ProfilesScreen';
import { applyPersistedGuestVeil, useProfileStore } from './stores/profileStore';
import { showSplashMistForView } from './lib/mist';
import { FixNetStatus } from './components/FixNet/FixNetStatus';
import { useSplitPaneStore, findGroupForTab, getVisibleTabIds, groupTabIds, orderTabsForRender } from './stores/splitPaneStore';
import { SplitPaneTree } from './components/Terminal/SplitPaneTree';
// WelcomeScreen removed - always start with terminal
// import WelcomeScreen from './components/Layout/WelcomeScreen';
// import LucidTest from './components/LucidTest'; // Temporarily disabled during audit
import { View, type TerminalTab } from './types';
import { SnapshotUpdateAlertDialog } from './components/Settings/SnapshotUpdateAlert';
import { useSnapshotUpdateStore } from './stores/snapshotUpdateStore';

function App() {
  const { loadSettings, isLoading, storageDegraded, settings, updateSetting } = useSettingsStore();
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
  // Split panes (2026-11-14, sweep fix 2): which tabs the terminal
  // view shows (the active tab's whole group when split, else just
  // the active tab) and their render order (group order first — a
  // group's order is the split order, which can differ from strip
  // order when a middle pane is split again). With no split these
  // are the single active tab / the strip order, so the render is
  // exactly as before.
  const splitGroups = useSplitPaneStore((s) => s.groups);
  const visibleTabIds = getVisibleTabIds(splitGroups, activeTabId);
  const visibleTabIdSet = new Set(visibleTabIds);
  const isSplitVisible = visibleTabIds.length > 1;
  const renderTabs = orderTabsForRender(tabs, splitGroups);
  // The active tab's split group, when it is split — the tree
  // the terminal view renders (PaneAxis, Atom steal #9). Null
  // when the active tab is not in a group.
  const activeGroup = activeTabId ? findGroupForTab(splitGroups, activeTabId) : null;
  const tabById = new Map(renderTabs.map((t) => [t.id, t]));
  // One terminal pane: the element the flat render and the split
  // tree both render for a tab. The tree wraps it in its own
  // sized boxes; the flat render wraps it in the h-full div below.
  const terminalForTab = (tab: TerminalTab) => (
    <Terminal tabId={tab.id} onOpenHelp={openHelp} onOpenSynth={toggleSynth} onOpenForge={toggleForge} onOpenFiles={() => setCurrentView('editor')} luciferToggleActive={!luciferAiSilenced} onToggleLuciferAi={() => void updateSetting('luciferAiSilenced', !isLuciferAiSilenced(useSettingsStore.getState().settings))} />
  );
  // P1 (2026-11-15) — one stable home per tab: a tab's
  // <Terminal> is a NORMAL child of exactly one wrapper,
  // and that wrapper never changes parents. A tab in a split
  // group renders inside its group's tree (the leaf div,
  // keyed by tab id); a tab in no group renders in its flat
  // host div. Every group's tree stays mounted while the
  // group exists — the active one lays out, the rest are
  // hidden with CSS — so clicking off a split tab and back
  // never unmounts a pane. The old code swapped two render
  // branches on isSplitVisible (tree vs flat divs, different
  // parents), so React unmounted and remounted every pane on
  // every click off: xterm disposed, scrollback gone, a
  // running command's output dropped, the draft lost.
  // Portals were tried first and REJECTED (same day): React
  // 18 unmounts and remounts a portal's children when its
  // container changes, so moving a Terminal between a leaf
  // slot and a host div remounted it exactly like the branch
  // swap did (proven by a minimal repro: state lost on the
  // first container change). A portal container must never
  // change — so there are no portals here at all.
  // Known limits, both pre-existing (the old branch swap
  // did the same): joining a group (split) and leaving one
  // (the final unsplit, when the group dissolves) move the
  // pane between the tree and its flat host, so that pane's
  // Terminal remounts — its tab and session survive, but its
  // xterm scrollback resets. Clicking off a split, closing
  // a pane, shrinking a group, or switching groups never
  // remounts anything: the trees and their leaf divs persist
  // by key.
  const groupedTabIdSet = new Set(
    Object.values(splitGroups).flatMap((group) => groupTabIds(group)),
  );
  // Tab detach + remount pushes (Gary, 2026-11-09): tabs/files
  // returning to the main window land here.
  useDetachPushListeners();
  const { currentDir, setCurrentDir, openFiles, activeFilePath } = useFileStore();
  // Snapshot update alert (Gary, 2026-11-12 ~08:22 PST):
  // the dialog shows when the launch check (or a manual
  // check) finds the manifest differs and this version was
  // not dismissed. The store owns the check + download;
  // App only renders the dialog and logs that it showed.
  const snapshotStatus = useSnapshotUpdateStore((s) => s.status);
  const snapshotManifest = useSnapshotUpdateStore((s) => s.manifest);
  const snapshotCheckResult = useSnapshotUpdateStore((s) => s.checkResult);
  useEffect(() => {
    if (
      snapshotStatus === 'update-available' &&
      snapshotCheckResult?.showAlert === true
    ) {
      useSnapshotUpdateStore.getState().markAlertShown();
    }
  }, [snapshotStatus, snapshotCheckResult]);

  const [currentView, setCurrentView] = useState<View>('terminal');
  // The command palette's focus point (Atom steal #1): which
  // view is showing, whether a file is active, whether
  // LuciferAI is on — the registry filters on this. It is
  // rebuilt every render so the palette always sees the
  // current view and file state.
  const commandContext: CommandContext = {
    view: currentView,
    hasActiveFile: Boolean(activeFilePath),
    hasOpenFiles: openFiles.length > 0,
    luciferAiEnabled,
    luciferAiSilenced,
  };
  // Register the built-in palette commands once (Atom steal
  // #1): view switches, editor + terminal actions, the four
  // Atom modals. The handlers are the same store calls the
  // buttons and slash commands use — the palette lists them,
  // it adds no new powers.
  useEffect(() => {
    registerBuiltinCommands({
      switchView: (view) => setCurrentView(view),
      toggleAI: () => handleToggleAI(),
      openHelp: () => openHelp(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The theme is the stored theme everywhere (Gary, 2026-11-09:
  // solid theme like before). It is applied by loadSettings at
  // startup and by setTheme / setCustomTheme on change — there is
  // no per-view override any more (the Full Glass-on-Editor rule
  // is deleted; Full Glass stays a locked reward, seen only when
  // unlocked and selected). The mist rule for a view is
  // showSplashMistForView (src/lib/mist.ts).
  // The Synth button toggles: first press opens the Synth view, a
  // second press exits back to the terminal.
  const toggleSynth = () =>
    setCurrentView((view) => toggleSynthView(view));
  // The Forge button toggles the same way: first press opens the
  // Forge view, a second press exits back to the terminal.
  const toggleForge = () =>
    setCurrentView((view) => toggleForgeView(view));
  // Summons (Gary, 2026-11-09): the top-bar Summons entry opens the
  // Forge view at the Summons section — the view scrolls to it on
  // the store's scroll request (see ForgeView). Unlike the toggle,
  // it always lands on the Forge (never toggles back to terminal).
  const openSummons = () => {
    setCurrentView('forge');
    useForgeStore.getState().requestSummonsScroll();
  };
  // The Persona Plex button toggles the same way: first press opens
  // the Plex setup page, a second press exits back to the terminal.
  const togglePersonaPlex = () =>
    setCurrentView((view) => togglePersonaPlexView(view));
  // The Worldmap button toggles the same way: first press opens
  // the full-screen worldmap view, a second press exits back to
  // the terminal. The worldmap is an add-on + plugin, not a
  // LuciferAI surface, so the toggle never checks LuciferAI.
  const toggleWorldmap = () =>
    setCurrentView((view) => toggleWorldmapView(view));
  // The Settings button toggles the same way: first press opens
  // the Settings view, a second press exits back to the terminal.
  // Opening Settings from its own icon always lands on the default
  // tab — a Modules landing from the Mouse button must not leak
  // into the next plain Settings open.
  const toggleSettings = () => {
    setSettingsInitialTab(undefined);
    setCurrentView((view) => toggleSettingsView(view));
  };
  // The Mouse toolbar button lands on Settings at the Modules tab,
  // where the Mouse segment lives (Gary, 2026-11-09). It always
  // lands (never toggles back), like the Summons entry.
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab | undefined>(undefined);
  const openMouse = () => {
    setSettingsInitialTab('modules');
    setCurrentView('settings');
  };
  // The Worldmap view's "not installed / turned off" fallback
  // opens Settings at the Plugins tab, where the add-on is
  // installed and its toggle lives.
  const openWorldmapPlugins = () => {
    setSettingsInitialTab('plugins');
    setCurrentView('settings');
  };
  // The AI panel lives in the right dock (Atom steal #12): its
  // visibility is the dock's, not a local boolean. Hidden by
  // default — use the command router instead.
  const showAI = useDockStore((s) => s.docks.right.visible);
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
      useDockStore.getState().showDock('right');
    } else if (useBrowserStore.getState().panelTab === 'browser') {
      useBrowserStore.getState().setPanelTab('ai');
    } else {
      useDockStore.getState().hideDock('right');
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
  // Never close it here. The Worldmap view is NOT one of them
  // either, for the same reason — an add-on + plugin (Gary,
  // 2026-11-15), not a LuciferAI surface.
  // The daemon and the homunculi are NOT one of them either — they
  // continue with LuciferAI disabled (Gary, 2026-11-07 ~07:32 PST);
  // nothing here touches them.
  useEffect(() => {
    if (luciferAiEnabled) return;
    if (currentView === 'synth') setCurrentView('terminal');
    if (showHelp) setShowHelp(false);
    if (bloodDropActive) setBloodDropActive(false);
  }, [luciferAiEnabled, currentView, showHelp, bloodDropActive]);
  // SILENCED (Gary, 2026-11-08 ~06:41 PST — potential daemon
  // only): the terminal link is disabled while silenced, so the
  // blood drop panel closes if it was open when silenced — the
  // panel is the LuciferAI terminal path, and it is inert while
  // the daemon is dormant. It is NOT unmounted like the disabled
  // case (the Synth view stays where it was); only the blood
  // drop panel closes, and it reopens on un-silence by clicking
  // the tab. The drop itself stays visible and clickable to
  // un-silence.
  useEffect(() => {
    if (!luciferAiSilenced) return;
    if (bloodDropActive) setBloodDropActive(false);
  }, [luciferAiSilenced, bloodDropActive]);
  // Boot phases (Gary, 2026-11-12 ~10:52 PST, reaffirmed 12:26 PST):
  // splashscreen → profile → splashscreen → Lucid, window fullscreen,
  // clean switch over. The dashboard mounts underneath the first
  // splash (as before) and stays mounted under the profile step and
  // the second splash too — the phases are opaque overlays, never an
  // unmount, so the terminal's always-mounted rule is untouched.
  // A "don't show again" setting for the splash is a one-line
  // follow-up — the splash shows on every launch for now.
  const [bootPhase, setBootPhase] = useState<
    'splash1' | 'profiles' | 'splash2' | 'lucid'
  >('splash1');
  // The boot overlays are one shared fragment (2026-11-13 ~01:34
  // PST): they render identically while settings are still loading
  // and after. They used to live only in the main return — while
  // isLoading the profiles phase was invisible (the branch showed
  // only the spinner), so on a slow settings load the profile step
  // never appeared until the load resolved. The boot sequence must
  // not depend on settings timing: splash → profiles → splash →
  // Lucid, every launch, loading or not.
  const bootOverlays = (
    <>
      {bootPhase === 'splash1' && (
        // fadeOut={false}: splash1 fades its CONTENT out on black and
        // profiles fades in on black — a clean black-to-black
        // handoff. It must NEVER do a full fade — the fade would
        // turn the overlay transparent and show the terminal
        // underneath for ~1s before profiles appears (Gary,
        // 2026-11-13: "opens lucid first briefly"). And it must
        // never hard-cut either (Gary, 2026-11-13 ~02:19 PST:
        // "thats not a clean transition to spashcreen to screen").
        <SplashScreen fadeOut={false} onDone={() => setBootPhase('profiles')} />
      )}
      {bootPhase === 'profiles' && (
        <ProfilesScreen
          onDone={(profileId) => {
            useProfileStore.getState().selectProfile(profileId);
            setBootPhase('splash2');
          }}
        />
      )}
      {bootPhase === 'splash2' && (
        // fadeOut={true} (the default): splash2 cross-fades into the
        // dashboard, which is the phase that follows it.
        <SplashScreen fadeOut={true} onDone={() => setBootPhase('lucid')} />
      )}
    </>
  );
  // Logout (Gary, 2026-11-16): Settings > General "Log out of
  // profile" requests a return to the Profiles screen. The request
  // is a timestamp in the profile store (requestLogout) because
  // Settings has no access to this local bootPhase. App clears
  // the request and shows the Profiles screen; picking a profile
  // proceeds through splash2 → lucid exactly as on boot, and
  // selectProfile handles the guest-veil transitions.
  const logoutRequestedAt = useProfileStore((s) => s.logoutRequestedAt);
  useEffect(() => {
    if (logoutRequestedAt === null) return;
    useProfileStore.getState().clearLogoutRequest();
    setBootPhase('profiles');
  }, [logoutRequestedAt]);
  const [sidebarWidth, setSidebarWidth] = useState(250);
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

  // Application menu actions (Atom steal #13 — menus): the
  // menu sends 'menu:open-modal' for Help and New Terminal
  // Tab; the three modals are handled by AtomModals. openHelp
  // is already gated on LuciferAI; createTab is the same call
  // the + button uses.
  useEffect(() => {
    return subscribeMenuModals((kind) => {
      if (kind === 'help') openHelp();
      else if (kind === 'new-terminal-tab') void createTab();
    });
  }, [createTab]);

  // Workspace save on quit (Atom steal #14): the debounced
  // save covers the session, but a quit inside the 500 ms
  // window would lose the last change — flush on unload.
  useEffect(() => {
    const onBeforeUnload = () => useWorkspaceStore.getState().saveNow();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Autosave (Atom steal #20): when the window loses focus,
  // dirty files save through the existing save path. Off by
  // default; a registered dontSaveIf veto blocks the save
  // (a modal over unsaved work, a transient state). The
  // setting is read at blur time, so flipping the switch
  // takes effect without a reload.
  useEffect(() => {
    const onBlur = () => {
      if (useSettingsStore.getState().settings.editorAutosave !== true) return;
      if (autosaveVetoed()) return;
      void useFileStore.getState().saveAllFiles();
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, []);

  // Keymap → menu (Atom steal #13): the menu's accelerators
  // come from the keymap, so a user rebind reaches main and
  // the menu is rebuilt with the new labels. Sent on mount
  // and whenever the overrides change; a no-op without the
  // bridge (web build, tests, detached windows).
  useEffect(() => {
    window.lucidAPI?.menu?.setKeybindings?.(settings.customKeybindings ?? []);
  }, [settings.customKeybindings]);

  // File menu Save enablement (Gary, 2026-11-16): File > Save
  // is greyed out when there is no file open to save — a menu
  // that promises Save with nothing to save is "not user
  // friendly". Sent on mount and whenever the active file
  // changes; a no-op without the bridge (web build, tests,
  // detached windows). Main rebuilds the menu with Save
  // enabled/disabled; a rebind never resets it (main keeps
  // both pieces of menu state).
  useEffect(() => {
    window.lucidAPI?.menu?.setSaveEnabled?.(activeFilePath !== null);
  }, [activeFilePath]);

  // Instant startup - terminal first, everything else loads in background
  useEffect(() => {
    // DEFCON sync (disabled-broken audit §3.4): a /defcon in a
    // detached window broadcasts `settings:changed` from main —
    // without a subscription here the main window keeps the old
    // level until reload. Mirrors MiniTerminal's subscription
    // (same keys); no new IPC channel. Subscribed BEFORE the
    // StrictMode guard below so the dev double-invoke
    // (subscribe → cleanup → subscribe) can't leave main
    // unsubscribed; in production the effect runs once.
    const unsubscribeSettingsChanged = window.lucidAPI?.settings?.onChanged?.((key) => {
      if (
        key === 'defconLevel' ||
        key === 'defconMergeReading' ||
        key === 'theme' ||
        key === 'customTheme'
      ) {
        void loadSettings();
      }
    });

    // Prevent duplicate initialization in React 18 Strict Mode
    if (hasInitialized.current) return () => { unsubscribeSettingsChanged?.(); };
    hasInitialized.current = true;

    async function init() {
      // Persisted-guest veil (2026-11-15): a relaunch with a guest
      // still active veils the owner's chats + history before
      // anything reads them. This MUST run first, before
      // loadSettings / createTab / the file-explorer load, and it
      // must run here — not at module scope in profileStore — so
      // every store module is initialized before it touches them
      // (the old module-level block hit the profileStore ↔
      // workspaceStore cycle in TDZ and blanked the app).
      applyPersistedGuestVeil();
      console.log('[INIT] Loading settings...');
      await loadSettings();
      // Snapshot manifest check on launch (Gary, 2026-11-12
      // ~08:22 PST): when the snapshot doesn't match the
      // manifest, Lucid grabs it directly. Best-effort and
      // never blocking — a failed check leaves the app
      // exactly as it was, and the Security tab's "Check
      // now" re-runs it on demand.
      void useSnapshotUpdateStore.getState().checkNow();
      void checkModels();

      // Initialize the LucidCore workflow (FixNet stats, etc.) at
      // startup, independent of the LuciferAI plugin toggle (Gary,
      // 2026-11-09 — online indicator: the FixNet line must render
      // even when LuciferAI is off/silenced, or the indicator has
      // nowhere to live). The core is pure construction (FixNet
      // router, intent parser, tool registry) and needs no model
      // server. Best-effort: a failed init must never block
      // startup; the FixNet line simply stays hidden. This does
      // NOT enable LuciferAI and does NOT touch the toggle — the
      // plugin probe in Terminal.tsx still owns that.
      try {
        const coreResult = await window.lucidAPI.lucid.init();
        if (!coreResult.success) {
          console.log('[INIT] LucidCore init unavailable:', coreResult.error);
        }
      } catch (error) {
        console.log('[INIT] LucidCore init unavailable:', error);
      }
      
      // Tabs/files popped back in while the main window was gone
      // (a detached window closed, or a pop-in with no main
      // window): main holds them as pending. Add them here and do
      // NOT mint a fresh tab alongside them — a fresh tab could
      // take the popped-in tab's number and destroy its live PTY.
      let pendingTabsAdded = false;
      try {
        const detach = window.lucidAPI?.terminal?.detach;
        if (detach) {
          const pending = await detach.getPendingMainTabs();
          for (const { tab, index } of pending) {
            useTerminalStore.getState().addDetachedTab({ ...tab, isActive: true }, index);
            // A pane popping back rejoins its split at its
            // recorded position (P3) — no stash, no rejoin.
            useSplitPaneStore.getState().rejoinDetachedPane(tab.id);
            detach.claimTab(tab.id);
          }
          pendingTabsAdded = pending.length > 0;
        }
        const filesDetach = window.lucidAPI?.filesDetach;
        if (filesDetach) {
          const pendingFiles = await filesDetach.getPendingMainFiles();
          for (const file of pendingFiles) {
            useFileStore.getState().addDetachedFile(file);
          }
        }
      } catch {
        // Pending fetch is best-effort: a failed fetch just means
        // a fresh tab is created below.
      }

      // Create terminal immediately (doesn't need currentDir)
      if (tabs.length === 0 && !pendingTabsAdded) {
        console.log('[INIT] Creating terminal...');
        await createTab(); // Will use home dir by default
        // Readiness is logged by the Terminal itself on first shell
        // output — the shell may still fail to spawn after this.
        console.log('[INIT] Terminal created — waiting for shell...');
      }
      
      // Load file explorer in background (non-blocking).
      // Origin 'startup': the walk is logged as an initial
      // event — it is the cause of the 3 macOS TCC prompts
      // (Gary, 2026-11-08 — track when + why).
      try {
        const homeDir = await window.lucidAPI.fs.getHomeDir();
        // Files-section fix step 1 (2026-11-15): resolve the
        // explorer root BEFORE loading it — settings.explorerRoot,
        // then the active profile's saved workspace dir, then
        // home. The old code loaded home first and let workspace
        // restore re-root after, so the owner paid for a wasted
        // home load and a guest stayed home-rooted (and the
        // Finder with it). A guest has no saved workspace, so
        // step 2 yields nothing for guests by construction.
        const resolved = await resolveStartupExplorerRoot({
          explorerRoot: useSettingsStore.getState().settings.explorerRoot ?? null,
          profileId: useProfileStore.getState().activeProfileId,
          readSavedWorkspace,
          homeDir,
          exists: (path) => window.lucidAPI.fs.exists(path),
        });
        await setCurrentDir(resolved.root, 'startup');
        // Warm the fuzzy finder's project index (Atom steal
        // #2) so the first ⌘P is instant. Best-effort, no
        // await — a failed read keeps the empty list, and the
        // finder warms on first open as a fallback. Seeded
        // from the RESOLVED root (not home), so the warm
        // roots at the project when the explorer does; the
        // finder re-roots to the project on first file open.
        void refreshProjectFileIndex(resolved.root);
        console.log(`[INIT] ✅ File explorer ready (${resolved.source}: ${resolved.root})`);
      } catch (error) {
        console.log('[INIT] File explorer unavailable');
      }

      // Workspace restore (Atom steal #14): reopen the last
      // session's files + active file + cursor + projects, and
      // start tracking changes for the debounced save. Best-
      // effort, never blocks startup — a missing saved workspace
      // is the normal first-launch case, and a guest restores
      // nothing (the veil). The terminal stays the landing:
      // restore never switches the view to the editor.
      useWorkspaceStore.getState().startTracking();
      try {
        const restored = await useWorkspaceStore.getState().restore();
        if (restored.restored) {
          console.log(`[INIT] Workspace restored: ${restored.files} files, active ${restored.activeFile}`);
        }
      } catch (error) {
        console.log('[INIT] Workspace restore unavailable:', error);
      }
    }
    
    init().catch(error => {
      console.error('[INIT] Startup error:', error);
    });
    return () => { unsubscribeSettingsChanged?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run once, useRef prevents double execution

  // Handle terminal data events
  useEffect(() => {
    window.lucidAPI.terminal.onData((_id, _data) => {
      // Data is handled by individual Terminal components
    });

    window.lucidAPI.terminal.onExit((id, code) => {
      console.log(`Terminal ${id} exited with code ${code}`);
      // The online indicator reads this (Gary, 2026-11-09): the
      // PTY for this tab really exited, so the terminal is no longer
      // active within the system to the computer. The tab itself
      // stays (the Terminal shows its "Shell exited" banner), so
      // the store needs this record to tell dead from live.
      useTerminalStore.getState().markTabExited(id, code);
    });
  }, []);

  if (isLoading) {
    return (
      <>
        {bootOverlays}
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
    // being the splashscreen. EXCEPTION (Gary, 2026-11-09): the
    // Files screen (Editor view) shows the solid stored theme with
    // no mist by default — the mist there is behind the Files mist
    // toggle in the Mist section of Settings (default off), so it
    // appears only when the user switches it on.
    <div className="relative isolate h-screen flex flex-col bg-black overflow-hidden">
      {/* Boot phases - opaque overlays until Lucid is entered. The
          first splash fades into the profile step, the profile step
          into the mist splashscreen AGAIN, and that into Lucid. */}
      {bootOverlays}
      {showSplashMistForView(currentView, settings.filesMist ?? false) && <SplashMist />}

      {/* Title Bar */}
      <TitleBar onOpenSummons={openSummons} />

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
              bloodDropDisabled={luciferAiSilenced}
              onOpenBloodDrop={() => {
                // DISABLED (Gary, 2026-11-09 ~12:38 PST — the blood
                // drop screen must NOT exist when LuciferAI is
                // disabled): the toolbar drop is filtered out of the
                // sidebar in that state, but the handler must fail
                // safe on its own too — a stale or future caller
                // must never open the panel while the plugin is
                // off. Read the LIVE setting, not the render's
                // closure, like the silenced check below it.
                if (!isLuciferAiEnabled(useSettingsStore.getState().settings)) return;
                // SILENCED (Gary, 2026-11-08 ~06:41 PST — potential
                // daemon only): the terminal link is disabled while
                // silenced, so the toolbar drop does nothing — it
                // does not open the blood drop terminal. The drop
                // itself (in the terminal prompt row) stays clickable
                // to un-silence; this toolbar drop is the panel
                // opener, and it is inert while dormant.
                if (isLuciferAiSilenced(useSettingsStore.getState().settings)) return;
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
              onToggleMouse={openMouse}
              onTogglePersonaPlex={togglePersonaPlex}
              onToggleWorldmap={toggleWorldmap}
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
              {currentView === 'worldmap' && (
                <WorldmapView onOpenPlugins={openWorldmapPlugins} />
              )}
              {currentView === 'settings' && (
                <SettingsPanel initialTab={settingsInitialTab} onClose={() => setCurrentView('terminal')} onOpenPersonaPlex={() => setCurrentView('persona-plex')} />
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
                    bloodDropDisabled={luciferAiSilenced}
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
                    {/* Terminal — split panes (2026-11-14) + P1
                        stable tree (2026-11-15): the inner
                        container is a flex row only while a split
                        is visible; otherwise it renders exactly as
                        before (one visible tab, the rest hidden).
                        Every group's tree stays mounted while the
                        group exists — the active one lays out, the
                        rest are hidden with CSS — and every pane
                        is a NORMAL child of its tree's leaf div
                        (keyed by tab id), so clicking off a split
                        tab never unmounts a pane. Tabs in no group
                        render in their flat host divs below. The
                        blood drop panel is a SIBLING, not a branch:
                        the terminal div is hidden, never unmounted,
                        while the panel is up — the old ternary
                        unmounted the whole terminal subtree despite
                        the comment claiming the terminals stayed
                        mounted (P1c). */}
                    <div className={`flex-1 overflow-hidden${isSplitVisible ? ' flex' : ''}${bloodDropActive && luciferAiEnabled ? ' hidden' : ''}`}>
                      {Object.values(splitGroups).map((group) => {
                        const isActiveGroup = activeGroup?.id === group.id;
                        return (
                          <div
                            key={group.id}
                            className={isActiveGroup && isSplitVisible ? 'flex-1 flex min-h-0 min-w-0' : 'hidden'}
                          >
                            <SplitPaneTree
                              group={group}
                              renderPane={(tabId) => {
                                const tab = tabById.get(tabId);
                                if (!tab) return null;
                                return (
                                  <div key={tab.id} className="h-full w-full block min-w-0">
                                    {terminalForTab(tab)}
                                  </div>
                                );
                              }}
                            />
                          </div>
                        );
                      })}
                      {renderTabs
                        .filter((tab) => !groupedTabIdSet.has(tab.id))
                        .map((tab) => {
                          const visible = visibleTabIdSet.has(tab.id);
                          return (
                            <div
                              key={tab.id}
                              className={`h-full ${visible ? 'block' : 'hidden'}`}
                            >
                              {terminalForTab(tab)}
                            </div>
                          );
                        })}
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
                          // (not in the strip, not here). SILENCED
                          // (Gary, 2026-11-08 ~06:41 PST): also no
                          // handler while silenced — the terminal link
                          // is disabled, so the empty-state drop is
                          // inert too.
                          onOpenBloodDrop={luciferAiEnabled && !luciferAiSilenced ? () => setBloodDropActive(true) : undefined}
                        />
                      )}
                    </div>
                    {bloodDropActive && luciferAiEnabled && (
                      // Blood drop tab selected: the blood drop panel,
                      // not a terminal. Render-gated on the plugin
                      // being enabled (Gary, 2026-11-09 ~12:38 PST —
                      // the blood drop screen must NOT exist when
                      // LuciferAI is disabled): the effect below only
                      // closes the state AFTER a render, so without
                      // this gate the panel flashed for one frame on
                      // the toggle itself. With the gate, disabling
                      // falls back to the terminals (or the default
                      // create screen when there are no tabs) in the
                      // same render.
                      <div className="flex-1 overflow-hidden">
                        <LuciferAITabPanel />
                      </div>
                    )}
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
            {/* AI Panel — tabbed: AI Chat + Copilot + Browser — in the
                right dock (Atom steal #12). The dock owns the toggle
                chevron, the resize handle and the open/close mask;
                the panel's own Minus hides it. Its allowed edge is
                'right' (see dockLocations.ts). */}
            <Dock edge="right" label="AI Panel">
              <AIPanel
                onClose={() => useDockStore.getState().hideDock('right')}
                onOpenSettings={(tab) => {
                  setSettingsInitialTab(tab);
                  setCurrentView('settings');
                }}
              />
            </Dock>
        </>
      </div>

      {/* Git panel — the staging area (Atom steal #21), in the
          bottom dock. The dock owns the toggle chevron, the
          resize handle and the open/close mask; the panel's
          own X hides it. Its allowed edge is 'bottom' (see
          dockLocations.ts). Opened from the palette
          (`Git: Open Git Panel`) or the dock chevron. */}
      <Dock edge="bottom" label="Git">
        <GitPanel />
      </Dock>

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

      {/* The command palette + fuzzy finder + go-to modals
          (Atom steals #1/#2/#8): one host, mounted once, the
          modals open from their shortcuts or the registry. */}
      <AtomModals context={commandContext} switchView={(view) => setCurrentView(view)} />

      {/* Snapshot update alert — a new snapshot is required
          (the manifest differs from the installed snapshot)
          and this version was not dismissed. "Update
          snapshot" starts the download → hash verify →
          flip; "Not now" closes without updating. */}
      {snapshotStatus === 'update-available' &&
        snapshotCheckResult?.showAlert === true &&
        snapshotManifest !== null && (
          <SnapshotUpdateAlertDialog
            manifest={snapshotManifest}
            installedVersion={settings.installedSnapshotVersion ?? null}
            onUpdate={() =>
              void useSnapshotUpdateStore.getState().startUpdate()
            }
            onDismiss={(dontAsk) =>
              void useSnapshotUpdateStore.getState().dismiss(dontAsk)
            }
          />
        )}

      {/* Error toasts (file, terminal, backend, Monaco fallback).
          Dismissing a toast only hides it from this stack - the
          notification stays in the store so the bell panel in the
          terminal tab bar (the persistent home) can still list it. */}
      <ErrorNotification notifications={visibleToastNotifications(notifications)} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
