import { useState, useEffect, useRef, type DragEvent as ReactDragEvent } from 'react';
import {
  X,
  Palette,
  Terminal,
  Sparkles,
  Settings,
  Download,
  Upload,
  Trash2,
  Check,
  Sliders,
  Package,
  Eye,
  Boxes,
  Puzzle,
  Bot,
  Usb,
  Smartphone,
  Monitor,
  Hammer,
  Lock,
  Unlock,
  Shield,
  ShieldCheck,
  User,
  Brain,
  Volume2,
  Pause,
} from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { isGuestProfile, useProfileStore } from '../../stores/profileStore';
import { parseRulers } from '../../lib/whitespace';
import { useAIStore } from '../../stores/aiStore';
import { themes, fullGlassTheme, allBlackTheme, isThemeUnlocked, createDefaultCustomTheme } from '../../themes/themes';
import { Theme, type CopilotModelId, type DrivingAgentId } from '../../types';
import { COPILOT_MODELS, copilotModelLabel, newCopilotId } from '../../lib/copilotModels';
import {
  DRIVING_AGENTS,
  detectDrivingAgent,
  drivingAgentLabel,
  drivingAgentPickerOptions,
  liveDrivingAgentDetection,
  newDrivingAgentTabId,
} from '../../lib/drivingAgents';
import { ProcessingGlowSettings } from '../Terminal/ProcessingGlow';
import {
  TERMINAL_FONT_FAMILIES,
  TERMINAL_FONT_WEIGHTS,
  TERMINAL_FONT_SIZE_MIN,
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_LINE_HEIGHT_MIN,
  TERMINAL_LINE_HEIGHT_MAX,
  TERMINAL_LETTER_SPACING_MIN,
  TERMINAL_LETTER_SPACING_MAX,
  WARP_PRESET,
  clampTerminalFontSize,
  clampTerminalLineHeight,
  clampTerminalLetterSpacing,
  warpPresetSettings,
} from '../../lib/terminalFont';
import { ModelInstaller } from './ModelInstaller';
import { ModulesTab } from '../Modules/ModulesTab';
import { ForgeView } from '../Forge/ForgeView';
import { TOOLBAR_PLUGINS } from '../../data/toolbarPlugins';
import { PLUGIN_ADDONS, isAddonInstalled, addonAnchorLabel } from '../../data/pluginAddons';
import {
  ARC_SERVER_ADDON_ID,
  ARC_SERVER_BUILD_NOTE,
  arcServerInstallStateText,
} from '../../lib/arcServerAddon';
import {
  WORLDMAP_ADDON_ID,
  WORLDMAP_BUILD_NOTE,
  worldmapInstallStateText,
} from '../../lib/worldmapAddon';
import { AddonVoiceButton } from './AddonVoiceButton';
import { DEVICES_PLUGIN } from '../../data/devices';
import { MODULES_PLUGIN } from '../../data/modules';
import { CUSTOM_PLUGINS, CUSTOM_PLUGIN_FALLBACK_ICON, resolvePluginIcon, isCustomPluginEnabled } from '../../data/customPlugins';
import { COMMAND_CATEGORIES, searchCommandCatalogue } from '../../data/commands';
import { useDevicesStore } from '../../stores/devicesStore';
import { useEventLogStore } from '../../stores/eventLogStore';
import { useToastStore } from '../../stores/toastStore';
import { isLuciferAiEnabled } from '../../lib/luciferAi';
import {
  playTerminalBell,
  TERMINAL_BELL_DURATION_MS,
} from '../../lib/terminalBell';
import { resolveSettingsTabOrder, moveSettingsTab } from '../../lib/settingsTabOrder';
import { Toggle } from './Toggle';
import { DaemonLogViewer } from '../Daemon/DaemonLogViewer';
import { Tooltip } from '../Tooltip/Tooltip';
import { PermissionsTab } from './PermissionsTab';
import { AgentPermissionsTab } from './AgentPermissionsTab';
import { SecurityTab } from './SecurityTab';
import { ProfileTab } from './ProfileTab';
import { MemoryTab } from './MemoryTab';
import { DevicesVoiceButton } from './DevicesVoiceButton';
import { PluginsVoiceButton } from './PluginsVoiceButton';
import { AppearanceVoiceButton } from './AppearanceVoiceButton';
import { CustomizationVoiceButton } from './CustomizationVoiceButton';

interface SettingsPanelProps {
  onClose: () => void;
  /** Which tab opens first. Defaults to 'appearance'. */
  initialTab?: SettingsTab;
  /** Open the Persona Plex setup page (the add-on's settings).
   *  Passed by App; absent in tests, where the settings button
   *  falls back to a toast. */
  onOpenPersonaPlex?: () => void;
}

export type SettingsTab = 'appearance' | 'terminal' | 'ai' | 'memory' | 'customization' | 'models' | 'daemon' | 'general' | 'plugins' | 'devices' | 'forge' | 'modules' | 'permissions' | 'agent-permissions' | 'security' | 'profile';

function SettingsPanel({ onClose, initialTab, onOpenPersonaPlex }: SettingsPanelProps) {
  const {
    settings,
    currentTheme,
    setTheme,
    setCustomTheme,
    updateSetting,
    updateSettings,
    hasApiKey,
    setApiKey,
    deleteApiKey,
    hasPingKey,
    setPingKey,
    deletePingKey,
    hasCopilotApiKey,
    setCopilotApiKey,
    deleteCopilotApiKey,
    exportSettings,
    importSettings,
    runOnStartup,
    setRunOnStartup,
    syncRunOnStartup,
  } = useSettingsStore();
  // Run on startup shows the real macOS login-item state — re-read
  // it every time Settings opens, so a flip in System Settings never
  // leaves the toggle stale (Gary, 2026-11-12).
  useEffect(() => {
    void syncRunOnStartup();
  }, [syncRunOnStartup]);
  // Logout (Gary, 2026-11-16): "Log out of profile" lives in
  // General. The active profile + the logout actions come from the
  // profile store; the confirmation + "Don't ask again" are local
  // state for the modal at the bottom of this panel. The prompt
  // shows unless this profile checked "Don't ask again"
  // (skipLogoutConfirm, saved per profile); the General toggle
  // below turns the confirmation back on.
  const activeProfile = useProfileStore((s) =>
    s.profiles.find((p) => p.id === s.activeProfileId),
  );
  const requestLogout = useProfileStore((s) => s.requestLogout);
  const setSkipLogoutConfirm = useProfileStore((s) => s.setSkipLogoutConfirm);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [logoutDontAskAgain, setLogoutDontAskAgain] = useState(false);
  const handleLogoutClick = () => {
    if (!activeProfile) return;
    // A profile that checked "Don't ask again" skips the prompt.
    if (activeProfile.skipLogoutConfirm === true) {
      requestLogout();
      return;
    }
    setLogoutDontAskAgain(false);
    setLogoutConfirmOpen(true);
  };
  const handleLogoutConfirm = () => {
    if (!activeProfile) return;
    if (logoutDontAskAgain) {
      setSkipLogoutConfirm(activeProfile.id, true);
    }
    setLogoutConfirmOpen(false);
    requestLogout();
  };
  // The LuciferAI disable rule: the Synth / AI Chat toolbar toggles
  // below cannot be switched on while the plugin is off, and the
  // LuciferAI row's own switch is what turns it off.
  const luciferAiEnabled = isLuciferAiEnabled(settings);
  // Add-on settings (Gary, 2026-11-06): every installed add-on gets
  // a Settings button that opens that add-on's settings. Persona Plex
  // opens its setup page; Android Connect and Segments open their
  // anchor plugin's tab (Devices / Modules); an add-on with no
  // settings page yet just says so (no invented page). ARC Server
  // has no settings page by design (Gary, 2026-11-14: it has 0 to
  // do with Lucid beyond the catalogue entry) — it falls through
  // to the default toast below.
  //
  // Sweep item 18: the button only renders where a settings surface
  // exists (addonHasSettings, below) — an add-on with no surface
  // shows NO Settings button instead of one that only toasts. The
  // handler's toast stays as the fallback for any caller that
  // reaches it without a surface (no UI path does now).
  const { info: toastInfo } = useToastStore();
  /** The add-ons with a settings surface — MUST match the routes
   *  in handleAddonSettings below. When a new add-on gains a
   *  settings surface, add its route there AND its id here, or
   *  its button stays hidden. */
  const addonHasSettings = (addonId: string): boolean =>
    addonId === 'persona-plex' ||
    addonId === 'android-emulator' ||
    addonId === 'segments' ||
    addonId === 'offline-worldmap';
  const handleAddonSettings = (addonId: string, addonName: string) => {
    if (addonId === 'persona-plex') {
      if (onOpenPersonaPlex) onOpenPersonaPlex();
      else toastInfo('Open Persona Plex from the sidebar icon.');
      return;
    }
    if (addonId === 'android-emulator') {
      setActiveTab('devices');
      return;
    }
    if (addonId === 'segments') {
      setActiveTab('modules');
      return;
    }
    if (addonId === 'offline-worldmap') {
      // The worldmap's settings live in its Modules segment
      // (the map + the settings form below it).
      setActiveTab('modules');
      return;
    }
    toastInfo(`No settings yet for ${addonName}.`);
  };

  // ARC Server add-on (Gary, 2026-11-14 ~14:53 PST): the ONE
  // add-on fetched at install time. Install downloads the repo
  // tarball in the main process and only then records the id
  // in `installedAddons`; a failed fetch records the error in
  // `arcServerInstall` and installs nothing. Remove deletes
  // the fetched files in the main process first, then clears
  // the state and the id. The build is NOT done here: the
  // fetched directory is source, `make` in it is the user's
  // step (see src/lib/arcServerAddon.ts).
  const [arcServerInstalling, setArcServerInstalling] = useState(false);
  const handleArcServerInstall = async () => {
    if (arcServerInstalling) return;
    setArcServerInstalling(true);
    await updateSetting('arcServerInstall', { status: 'downloading', version: null, path: null, error: null });
    try {
      const api = window.lucidAPI.arcServer;
      if (!api) {
        await updateSetting('arcServerInstall', { status: 'failed', version: null, path: null, error: 'ARC Server install is not available in this build.' });
        return;
      }
      const result = await api.install();
      if (result.ok && result.version && result.path) {
        await updateSetting('arcServerInstall', { status: 'installed', version: result.version, path: result.path, error: null });
        await updateSetting('installedAddons', [...(settings.installedAddons ?? []), ARC_SERVER_ADDON_ID]);
      } else {
        await updateSetting('arcServerInstall', { status: 'failed', version: null, path: null, error: result.error ?? 'Fetch failed.' });
      }
    } catch (err) {
      await updateSetting('arcServerInstall', { status: 'failed', version: null, path: null, error: err instanceof Error ? err.message : 'Fetch failed.' });
    } finally {
      setArcServerInstalling(false);
    }
  };
  const handleArcServerRemove = async () => {
    if (arcServerInstalling) return;
    setArcServerInstalling(true);
    try {
      const api = window.lucidAPI.arcServer;
      if (!api) {
        toastInfo('ARC Server removal is not available in this build.');
        return;
      }
      const result = await api.uninstall();
      if (!result.ok) {
        toastInfo(`Could not remove ARC Server: ${result.error ?? 'unknown error'}.`);
        return;
      }
      await updateSetting('arcServerInstall', null);
      await updateSetting('installedAddons', (settings.installedAddons ?? []).filter((id) => id !== ARC_SERVER_ADDON_ID));
    } finally {
      setArcServerInstalling(false);
    }
  };

  // Offline Worldmap add-on (Gary, 2026-11-15): the SECOND
  // add-on fetched at install time — the ARC Server pattern.
  // Install downloads the repo tarball in the main process
  // (the package lives at arc_serverless_v10_complete/ on
  // main) and only then records the id in `installedAddons`;
  // a failed fetch records the error in `worldmapInstall`
  // and installs nothing. Remove deletes the fetched files
  // in the main process first, then clears the state and
  // the id. The fetched copy must be the offline build (the
  // shape check enforces it — see
  // electron/services/worldmapDownload.ts).
  const [worldmapInstalling, setWorldmapInstalling] = useState(false);
  const handleWorldmapInstall = async () => {
    if (worldmapInstalling) return;
    setWorldmapInstalling(true);
    await updateSetting('worldmapInstall', { status: 'downloading', version: null, path: null, error: null });
    try {
      const api = window.lucidAPI.worldmap;
      if (!api) {
        await updateSetting('worldmapInstall', { status: 'failed', version: null, path: null, error: 'Worldmap install is not available in this build.' });
        return;
      }
      const result = await api.install();
      if (result.ok && result.version && result.path) {
        await updateSetting('worldmapInstall', { status: 'installed', version: result.version, path: result.path, error: null });
        await updateSetting('installedAddons', [...(settings.installedAddons ?? []), WORLDMAP_ADDON_ID]);
      } else {
        await updateSetting('worldmapInstall', { status: 'failed', version: null, path: null, error: result.error ?? 'Fetch failed.' });
      }
    } catch (err) {
      await updateSetting('worldmapInstall', { status: 'failed', version: null, path: null, error: err instanceof Error ? err.message : 'Fetch failed.' });
    } finally {
      setWorldmapInstalling(false);
    }
  };
  const handleWorldmapRemove = async () => {
    if (worldmapInstalling) return;
    setWorldmapInstalling(true);
    try {
      const api = window.lucidAPI.worldmap;
      if (!api) {
        toastInfo('Worldmap removal is not available in this build.');
        return;
      }
      const result = await api.uninstall();
      if (!result.ok) {
        toastInfo(`Could not remove Offline Worldmap: ${result.error ?? 'unknown error'}.`);
        return;
      }
      await updateSetting('worldmapInstall', null);
      await updateSetting('installedAddons', (settings.installedAddons ?? []).filter((id) => id !== WORLDMAP_ADDON_ID));
    } finally {
      setWorldmapInstalling(false);
    }
  };
  // Fetched-at-install add-ons share one JSX branch (below):
  // dispatch the in-flight flag and the install/remove
  // handlers by add-on id.
  const installingFor = (id: string): boolean =>
    id === 'arc-server' ? arcServerInstalling : id === 'offline-worldmap' ? worldmapInstalling : false;
  const handleFetchedInstall = (id: string): Promise<void> | void => {
    if (id === 'arc-server') return handleArcServerInstall();
    if (id === 'offline-worldmap') return handleWorldmapInstall();
  };
  const handleFetchedRemove = (id: string): Promise<void> | void => {
    if (id === 'arc-server') return handleArcServerRemove();
    if (id === 'offline-worldmap') return handleWorldmapRemove();
  };

  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab ?? 'appearance');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [pingKeyInput, setPingKeyInput] = useState('');
  // Copilots (Gary, 2026-11-13): the add form for the copilot
  // tab's dropdown — a name + a model per copilot, as many as
  // desired. The key input below is Gary's own Copilot key.
  const [copilotNameInput, setCopilotNameInput] = useState('');
  const [copilotModelInput, setCopilotModelInput] = useState<CopilotModelId>('local-planner');
  const [copilotKeyInput, setCopilotKeyInput] = useState('');
  // Driving-agent tabs (Gary, 2026-11-13 ~12:27 PST): the add
  // form for the LLMBuilder tab's picker — a name + a driving
  // agent per tab, as many as desired, no cap. The ARC Server
  // agent takes an endpoint (Gary's example: "from lets say
  // arc server input"); the other agents need nothing typed.
  const [drivingAgentTabNameInput, setDrivingAgentTabNameInput] = useState('');
  const [drivingAgentTabAgentInput, setDrivingAgentTabAgentInput] =
    useState<DrivingAgentId>('llmbuilder');
  const [drivingAgentTabEndpointInput, setDrivingAgentTabEndpointInput] = useState('');
  const [pingTesting, setPingTesting] = useState(false);
  const [pingTestResult, setPingTestResult] = useState<string | null>(null);
  const [commandFilter, setCommandFilter] = useState('');
  // Bell preview (Gary, 2026-11-07): the play button next to the
  // "Terminal bell sound" toggle plays the exact tone the terminal
  // rings — even when the toggle is OFF, so you can hear what it
  // sounds like before enabling it. The playing state is just the
  // beep's duration; a second click while it plays is ignored.
  const [bellPreviewPlaying, setBellPreviewPlaying] = useState(false);
  const bellPreviewTimeout = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  useEffect(() => {
    return () => {
      if (bellPreviewTimeout.current) {
        clearTimeout(bellPreviewTimeout.current);
      }
    };
  }, []);
  const previewBell = () => {
    if (bellPreviewPlaying) return;
    playTerminalBell();
    setBellPreviewPlaying(true);
    if (bellPreviewTimeout.current) {
      clearTimeout(bellPreviewTimeout.current);
    }
    bellPreviewTimeout.current = setTimeout(
      () => setBellPreviewPlaying(false),
      TERMINAL_BELL_DURATION_MS,
    );
  };
  // Devices tab: the store behind it. The first time the tab opens
  // it scans once; Refresh re-scans after that. No hotplug events
  // in v1 - detection is on demand only.
  const devicesState = useDevicesStore();
  const devicesTabOpened = useRef(false);
  useEffect(() => {
    if (activeTab !== 'devices' || devicesTabOpened.current) return;
    devicesTabOpened.current = true;
    void devicesState.refresh();
  }, [activeTab]);

  // Ping server health check — POST /ping is unmetered and reports the
  // remaining SP balance, so this shows the balance for free.
  const testPingServer = async () => {
    setPingTesting(true);
    setPingTestResult(null);
    try {
      const health = await window.lucidAPI.ai.pingServerHealth();
      if (health.quota) {
        const reset = new Date(health.quota.reset * 1000);
        const hh = String(reset.getUTCHours()).padStart(2, '0');
        const mm = String(reset.getUTCMinutes()).padStart(2, '0');
        // The health check is a quota source too: a restock the
        // server reports here resets the restock timer.
        useAIStore.getState().setPingQuota(health.quota);
        setPingTestResult(`Connected — ${health.quota.remaining}/${health.quota.limit} left, next SP refill ${hh}:${mm} UTC.`);
      } else {
        setPingTestResult('Connected — SP balance unknown (no user id sent).');
      }
    } catch (error) {
      // The server is unreachable — the SP balance is the KNOWN
      // base 100 (a non-connected user carries a temp, and through
      // that temp their SP is base 100), not an error and not a
      // stale balance. The restock timer clears with it.
      useAIStore.getState().setPingQuotaBase();
      setPingTestResult('Not connected — SP is base 100 (known).');
    } finally {
      setPingTesting(false);
    }
  };
  const [customTheme, setCustomThemeState] = useState<Theme>(
    settings.customTheme || createDefaultCustomTheme()
  );
  const [showCustomThemeEditor, setShowCustomThemeEditor] = useState(false);

  // File-watcher daemon state (Daemon tab). Loaded when the tab opens.
  const [watchPaths, setWatchPaths] = useState<string[]>([]);
  const [daemonStatus, setDaemonStatus] = useState<{ running: boolean; mode: 'watch' | 'autofix' | null; pids: string[]; commitTracking?: boolean } | null>(null);
  const [daemonBusy, setDaemonBusy] = useState(false);
  const [daemonError, setDaemonError] = useState<string | null>(null);
  const [showDaemonLogs, setShowDaemonLogs] = useState(false);

  // LuciferAI backend condition (Plugins tab). Best-effort, same status
  // call SynthView uses (lucid.getModelStatuses): any backend up reads
  // as awake, otherwise dormant. The Sentinel's mount state is not
  // visible here — nothing mounts in Settings — so this is the backend
  // condition only, not the full SentinelCondition.
  const [luciferCondition, setLuciferCondition] = useState<
    'checking' | 'awake' | 'dormant' | 'unavailable'
  >('checking');

  useEffect(() => {
    if (activeTab !== 'plugins') return;
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const api = window.lucidAPI?.lucid;
        if (!api || typeof api.getModelStatuses !== 'function') {
          if (!cancelled) setLuciferCondition('unavailable');
          return;
        }
        const result = await api.getModelStatuses();
        if (cancelled || !result || typeof result !== 'object') return;
        const anyUp = Object.values(result as Record<string, boolean>).some(
          (v) => v === true,
        );
        if (!cancelled) setLuciferCondition(anyUp ? 'awake' : 'dormant');
      } catch {
        if (!cancelled) setLuciferCondition('unavailable');
      }
    };
    fetchStatus();
    const timer = setInterval(fetchStatus, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeTab]);

  const refreshDaemon = async () => {
    if (!window.lucidAPI.daemon) return;
    try {
      const [paths, status] = await Promise.all([
        window.lucidAPI.daemon.getPaths(),
        window.lucidAPI.daemon.status(),
      ]);
      setWatchPaths(paths);
      setDaemonStatus(status);
    } catch (error) {
      setDaemonError(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    if (activeTab !== 'daemon') return;
    refreshDaemon();
    // Keep the status line and the Enable toggle truthful while the
    // tab is open: the daemon can start/stop outside Settings
    // (terminal `daemon` commands, auto-start), and the tab would
    // otherwise show a stale state until it is reopened.
    const timer = setInterval(refreshDaemon, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleDaemonEnabledChange = async (enabled: boolean) => {
    await updateSetting('daemonEnabled', enabled);
    if (!window.lucidAPI.daemon) return;
    setDaemonBusy(true);
    setDaemonError(null);
    try {
      const result = enabled
        ? await window.lucidAPI.daemon.start()
        : await window.lucidAPI.daemon.stop();
      if (!result.success && result.error) setDaemonError(result.error);
    } catch (error) {
      setDaemonError(error instanceof Error ? error.message : String(error));
    } finally {
      setDaemonBusy(false);
      await refreshDaemon();
    }
  };

  const handleDaemonAutoFixChange = async (autoFix: boolean) => {
    await updateSetting('daemonAutoFix', autoFix);
    // The mode only takes effect when the daemon (re)starts, so restart
    // a running daemon to apply it. Default stays watch (suggest-only).
    if (!window.lucidAPI.daemon) return;
    const status = await window.lucidAPI.daemon.status();
    if (status.running) {
      setDaemonBusy(true);
      try {
        await window.lucidAPI.daemon.stop();
        const result = await window.lucidAPI.daemon.start();
        if (!result.success && result.error) setDaemonError(result.error);
      } finally {
        setDaemonBusy(false);
        await refreshDaemon();
      }
    }
  };

  const handleDaemonCommitTrackingChange = async (commitTracking: boolean) => {
    // The setting is saved through the daemon IPC so a running daemon
    // restarts with the new flag; a stopped daemon picks it up on its
    // next start. The value persists in the settings store.
    if (!window.lucidAPI.daemon) {
      await updateSetting('daemonCommitTracking', commitTracking);
      return;
    }
    setDaemonBusy(true);
    setDaemonError(null);
    try {
      const result = await window.lucidAPI.daemon.setCommitTracking(commitTracking);
      await updateSetting('daemonCommitTracking', result.commitTracking);
    } catch (error) {
      setDaemonError(error instanceof Error ? error.message : String(error));
    } finally {
      setDaemonBusy(false);
      await refreshDaemon();
    }
  };

  const handleAddWatchDirectory = async () => {
    const dir = await window.lucidAPI.fs.selectDirectory();
    // Track + diagnose the folder picker: WHEN it opened and
    // WHY (the user added a daemon watch folder here).
    // (Gary, 2026-11-08 — track when + why.)
    useEventLogStore.getState().logDirectoryDialog(
      'Settings — add a daemon watch folder',
      dir ? 'completed' : 'cancelled',
    );
    if (!dir || !window.lucidAPI.daemon) return;
    setDaemonBusy(true);
    try {
      const { paths } = await window.lucidAPI.daemon.addPath(dir);
      setWatchPaths(paths);
    } catch (error) {
      setDaemonError(error instanceof Error ? error.message : String(error));
    } finally {
      setDaemonBusy(false);
      await refreshDaemon();
    }
  };

  const handleRemoveWatchDirectory = async (dir: string) => {
    if (!window.lucidAPI.daemon) return;
    setDaemonBusy(true);
    try {
      const { paths } = await window.lucidAPI.daemon.removePath(dir);
      setWatchPaths(paths);
    } catch (error) {
      setDaemonError(error instanceof Error ? error.message : String(error));
    } finally {
      setDaemonBusy(false);
      await refreshDaemon();
    }
  };

  const handleExport = async () => {
    const data = await exportSettings();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lucid-terminal-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const text = await file.text();
        await importSettings(text);
      }
    };
    input.click();
  };

  const handleSaveCustomTheme = async () => {
    await setCustomTheme(customTheme);
    setShowCustomThemeEditor(false);
  };

  const updateCustomThemeColor = (
    path: string,
    value: string
  ) => {
    setCustomThemeState((prev) => {
      const newTheme = { ...prev, colors: { ...prev.colors } };
      const keys = path.split('.');

      if (keys.length === 1) {
        (newTheme.colors as Record<string, unknown>)[keys[0]] = value;
      } else if (keys.length === 2 && keys[0] === 'terminal') {
        newTheme.colors.terminal = {
          ...newTheme.colors.terminal,
          [keys[1]]: value,
        };
      }

      return newTheme;
    });
  };

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'appearance', label: 'Appearance', icon: <Palette size={18} /> },
    { id: 'security', label: 'Security', icon: <Lock size={18} /> },
    { id: 'permissions', label: 'Permissions', icon: <Shield size={18} /> },
    { id: 'agent-permissions', label: 'Agent Permissions', icon: <ShieldCheck size={18} /> },
    { id: 'profile', label: 'Profile', icon: <User size={18} /> },
    { id: 'customization', label: 'Customization', icon: <Sliders size={18} /> },
    { id: 'plugins', label: 'Plugins', icon: <Puzzle size={18} /> },
    { id: 'devices', label: 'Devices', icon: <Usb size={18} /> },
    { id: 'forge', label: 'Forge', icon: <Hammer size={18} /> },
    { id: 'modules', label: 'Modules', icon: <Boxes size={18} /> },
    { id: 'models', label: 'Models', icon: <Package size={18} /> },
    { id: 'terminal', label: 'Terminal', icon: <Terminal size={18} /> },
    { id: 'ai', label: 'AI', icon: <Sparkles size={18} /> },
    { id: 'memory', label: 'Memory', icon: <Brain size={18} /> },
    { id: 'daemon', label: 'Daemon', icon: <Eye size={18} /> },
    { id: 'general', label: 'General', icon: <Settings size={18} /> },
  ];

  // --- Settings tab order + drag-reorder (Gary, 2026-11-06) --------
  // The tabs are drag-reorderable, same pattern as the toolbar icons
  // (see src/lib/settingsTabOrder.ts): drag a tab onto another tab
  // to move it before that tab (or onto the end zone to move it
  // last). There used to be a 500ms press-and-hold gate at the drop
  // (removed 2026-11-07, same root cause as the toolbar icons): a
  // natural drag takes ~200-400ms total, so the gate silently
  // rejected the overwhelmingly common gesture and the tabs "didn't
  // move" (Gary, 2026-11-07, real mouse). A completed drop on a
  // different tab is already unambiguous — a plain click can never
  // produce a drop on another tab — so the drop commits without a
  // hold. A plain click still switches to the tab. The drop is
  // midpoint-aware: the pointer's half of the target decides whether
  // the tab lands before or after it, so dragging DOWN one slot onto
  // the next tab swaps them instead of silently doing nothing. The
  // order is stored immediately on drop via
  // updateSetting('settingsTabOrder', ...) — updated AND stored — so
  // it survives a reload/restart. The lock (settingsTabsLocked)
  // only prevents dragging; the order is persisted whenever it
  // changes, locked or not.
  const settingsTabsLocked = settings.settingsTabsLocked ?? false;
  const orderedTabs = resolveSettingsTabOrder(settings.settingsTabOrder)
    .map((id) => tabs.find((t) => t.id === id))
    .filter((t): t is (typeof tabs)[number] => t !== undefined);
  const [draggedSettingsTab, setDraggedSettingsTab] = useState<SettingsTab | null>(null);
  const [dropSettingsTabTarget, setDropSettingsTabTarget] = useState<string | null>(null);
  // (No hold gate any more — see the header comment above. A
  // completed drop on a different tab commits; a plain click can
  // never produce one.)
  // Whether the drop will land AFTER the hovered tab (the pointer
  // is in its lower half) rather than before it. A drag DOWN onto
  // the tab immediately below the dragged one lands after it (they
  // swap); without this, that drop was a silent no-op — inserting
  // before the next tab is the order you already have — which reads
  // as "the tabs don't move". Same fix as the toolbar icons.
  const [dropSettingsTabInsertAfter, setDropSettingsTabInsertAfter] = useState(false);

  // Where the drop lands relative to the target tab: the pointer's
  // position within the tab. Lower half -> after the target, upper
  // half -> before it. No usable geometry (e.g. jsdom, where rects
  // are all zeros) -> before it, the long-standing behaviour.
  const settingsTabDropInsertAfterFromEvent = (e: ReactDragEvent): boolean => {
    const target = e.currentTarget as HTMLElement | null;
    const rect = target?.getBoundingClientRect?.();
    if (!rect || rect.height <= 0) return false;
    return e.clientY > rect.top + rect.height / 2;
  };

  // Drop: move the dragged tab to the target and STORE the new order
  // immediately — one updateSetting call persists it (settings IPC)
  // and updates the store state, so the new order survives a reload
  // (updated AND stored, not updated-only). A null target is the end
  // zone: the tab moves last. A completed drop on a different tab
  // always commits — there is no hold gate here any more (see the
  // header comment): the 500ms gate silently rejected every natural
  // quick drag, so the tabs "didn't move".
  const handleSettingsTabDrop = async (
    e: ReactDragEvent,
    targetId: SettingsTab | null,
    insertAfter: boolean = false,
  ) => {
    e.preventDefault();
    const fromData = e.dataTransfer?.getData('text/plain') || undefined;
    const draggedId = fromData ?? draggedSettingsTab;
    setDropSettingsTabInsertAfter(false);
    setDraggedSettingsTab(null);
    setDropSettingsTabTarget(null);
    if (!draggedId || draggedId === targetId) return;
    const currentOrder = orderedTabs.map((t) => t.id);
    const next = moveSettingsTab(currentOrder, draggedId, targetId, insertAfter);
    if (next.join(',') === currentOrder.join(',')) return;
    await updateSetting('settingsTabOrder', [...next]);
  };

  const handleSettingsTabDragEnd = () => {
    setDropSettingsTabInsertAfter(false);
    setDraggedSettingsTab(null);
    setDropSettingsTabTarget(null);
  };

  return (
    // No background here: the main screen is always splashscreen
    // misty black (Gary, 2026-11-07), so the App root's mist shows
    // through — the sections keep their own fills.
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <h2 className="text-lg font-semibold">Settings</h2>
        <div className="flex items-center gap-1">
          <Tooltip content={settingsTabsLocked ? 'Unlock tab order' : 'Lock tab order'}>
            <button
              onClick={() => void updateSetting('settingsTabsLocked', !settingsTabsLocked)}
              className="btn-ghost p-1 rounded"
              aria-label={settingsTabsLocked ? 'Unlock Settings tab order' : 'Lock Settings tab order'}
              data-settings-tabs-lock={settingsTabsLocked ? 'locked' : 'unlocked'}
            >
              {settingsTabsLocked ? <Lock size={18} /> : <Unlock size={18} />}
            </button>
          </Tooltip>
          <Tooltip content="Close Settings">
            <button onClick={onClose} className="btn-ghost p-1 rounded">
              <X size={20} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-48 border-r border-[var(--border)] p-2">
          {orderedTabs.map((tab) => (
            <div
              key={tab.id}
              data-settings-tab={tab.id}
              className={`relative ${draggedSettingsTab === tab.id ? 'opacity-40' : ''}`}
              draggable={!settingsTabsLocked}
              onDragStart={(e) => {
                // Locked: no dragging at all.
                if (settingsTabsLocked) {
                  e.preventDefault();
                  return;
                }
                // The drag starts on movement. A plain click (or an
                // accidental nudge) never reorders — it produces no
                // drop on another tab, and still switches to the tab
                // on release. dataTransfer is null in jsdom (no
                // DataTransfer); the dragged id also lives in state,
                // so the drop falls back.
                if (e.dataTransfer) {
                  e.dataTransfer.setData('text/plain', tab.id);
                  e.dataTransfer.effectAllowed = 'move';
                }
                setDraggedSettingsTab(tab.id);
              }}
              onDragOver={(e) => {
                if (settingsTabsLocked) return;
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                setDropSettingsTabTarget(tab.id);
                // Midpoint-aware drop: the pointer's half of the
                // target decides whether the tab lands before or
                // after it.
                setDropSettingsTabInsertAfter(settingsTabDropInsertAfterFromEvent(e));
              }}
              onDrop={(e) => handleSettingsTabDrop(e, tab.id, settingsTabDropInsertAfterFromEvent(e))}
              onDragEnd={handleSettingsTabDragEnd}
            >
              {dropSettingsTabTarget === tab.id && (
                <div className={`absolute ${dropSettingsTabInsertAfter ? '-bottom-0.5' : '-top-0.5'} left-2 right-2 h-0.5 rounded bg-[var(--accent)]`} aria-hidden="true" />
              )}
              <Tooltip content={`${tab.label} settings`}>
                <button
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${activeTab === tab.id
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                    }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              </Tooltip>
            </div>
          ))}
          {/* End zone: dropping a tab here moves it last. */}
          <div
            data-settings-tab-end-zone
            className={`w-full shrink-0 ${draggedSettingsTab ? 'h-4' : 'h-0'} ${dropSettingsTabTarget === 'end' ? 'bg-[var(--bg-tertiary)]' : ''}`}
            onDragOver={(e) => {
              if (settingsTabsLocked || !draggedSettingsTab) return;
              e.preventDefault();
              if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
              setDropSettingsTabTarget('end');
            }}
            onDrop={(e) => handleSettingsTabDrop(e, null)}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <section>
                {/* Voice explanation (Gary, 2026-11-07 ~05:38 PST):
                    Appearance gets one flagship voice recording,
                    like Devices has. */}
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Theme</h3>
                  <AppearanceVoiceButton />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {themes.map((theme) => (
<Tooltip key={theme.id} content={`Use the ${theme.name} theme`}>
                      <button
                        onClick={() => setTheme(theme.id)}
                        className={`p-3 rounded-lg border transition-all ${currentTheme.id === theme.id
                          ? 'border-[var(--accent)] ring-2 ring-[var(--accent)] ring-opacity-50'
                          : 'border-[var(--border)] hover:border-[var(--text-muted)]'
                          }`}
                      >
                        <div
                          className="h-16 rounded-md mb-2"
                          style={{
                            background: `linear-gradient(135deg, ${theme.colors.bgPrimary} 50%, ${theme.colors.bgSecondary} 50%)`,
                            border: `1px solid ${theme.colors.border}`,
                          }}
                        >
                          <div
                            className="w-3 h-3 rounded-full m-2"
                            style={{ backgroundColor: theme.colors.accent }}
                          />
                        </div>
                        <span className="text-sm">{theme.name}</span>
                      </button>
</Tooltip>
                  ))}

                  {/* Custom Theme */}
<Tooltip content="Create a custom theme">
                    <button
                      onClick={() => setShowCustomThemeEditor(true)}
                      className={`p-3 rounded-lg border transition-all ${currentTheme.id === 'custom'
                        ? 'border-[var(--accent)] ring-2 ring-[var(--accent)] ring-opacity-50'
                        : 'border-[var(--border)] hover:border-[var(--text-muted)] border-dashed'
                        }`}
                    >
                      <div className="h-16 rounded-md mb-2 flex items-center justify-center bg-[var(--bg-tertiary)]">
                        <Palette size={24} className="text-[var(--text-muted)]" />
                      </div>
                      <span className="text-sm">Custom</span>
                    </button>
</Tooltip>
                </div>
              </section>


              {/* Full Glass — its own separate section UNDER the theme
                  selection (Gary, 2026-11-07). NOT another entry in the
                  theme list: it is the referral + active purchase tier
                  reward theme, gated (see isThemeUnlocked). Locked until
                  the user has referrals AND an active purchase tier;
                  the section shows the unlock progress so the path is
                  visible, and the theme becomes selectable once unlocked.
                  The picker and setTheme both refuse a locked theme. */}
              <section data-testid="full-glass-section">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Full Glass</h3>
                  {isThemeUnlocked(fullGlassTheme, settings) ? (
                    <Unlock size={14} className="text-[var(--success)]" aria-label="Full Glass unlocked" />
                  ) : (
                    <Lock size={14} className="text-[var(--text-muted)]" aria-label="Full Glass locked" />
                  )}
                  <span className="text-xs leading-[1.5] text-[var(--text-muted)]">Referral + purchase tier reward</span>
                </div>
                <p className="text-xs leading-[1.5] text-[var(--text-muted)] mb-3">
                  Frosted glass throughout. Unlocks with referrals and an active purchase tier.
                </p>
                <div className={`p-3 rounded-lg border transition-all ${currentTheme.id === fullGlassTheme.id
                  ? 'border-[var(--accent)] ring-2 ring-[var(--accent)] ring-opacity-50'
                  : 'border-[var(--border)]'
                  }`}>
                  <div
                    className="h-16 rounded-md mb-2"
                    style={{
                      background: `linear-gradient(135deg, ${fullGlassTheme.colors.bgPrimary} 50%, ${fullGlassTheme.colors.bgSecondary} 50%)`,
                      border: `1px solid ${fullGlassTheme.colors.border}`,
                    }}
                  >
                    <div
                      className="w-3 h-3 rounded-full m-2"
                      style={{ backgroundColor: fullGlassTheme.colors.accent }}
                    />
                  </div>
                  <div className="text-xs leading-[1.5] text-[var(--text-secondary)] space-y-1 mb-3">
                    <div>Referrals: {settings.referralCount} / {fullGlassTheme.unlock?.referralsRequired ?? 1} {settings.referralCount >= (fullGlassTheme.unlock?.referralsRequired ?? 1) ? '✓' : ''}</div>
                    <div>Purchase tier: {settings.purchaseTierActive ? 'Active ✓' : 'Not active'}</div>
                  </div>
                  {isThemeUnlocked(fullGlassTheme, settings) ? (
                    <button
                      onClick={() => setTheme(fullGlassTheme.id)}
                      className="btn btn-primary px-3 py-1.5 text-sm"
                    >
                      Use Full Glass
                    </button>
                  ) : (
                    <Tooltip content="Unlocks with referrals and an active purchase tier">
                      <button
                        disabled
                        aria-label="Full Glass locked — unlocks with referrals and an active purchase tier"
                        className="btn btn-secondary px-3 py-1.5 text-sm opacity-50 cursor-not-allowed"
                      >
                        <Lock size={14} className="inline mr-1" /> Locked — refer + purchase tier
                      </button>
                    </Tooltip>
                  )}
                </div>
              </section>

              {/* All Black — its own separate section UNDER the theme
                  selection (Gary, 2026-11-08 ~07:49 PST): "Keep that
                  as the all black theme for first refferal". The
                  black backboard design as a proper theme, NOT the
                  default and NOT another entry in the theme list:
                  it is the first-referral reward, gated (see
                  isThemeUnlocked). Locked until the user has 1
                  referral — NO purchase tier, which is what
                  distinguishes it from Full Glass (2 referrals +
                  purchase tier). The section shows the unlock
                  progress so the path is visible, and the theme
                  becomes selectable once unlocked. The picker and
                  setTheme both refuse a locked theme. */}
              <section data-testid="all-black-section">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-[var(--text-secondary)]">All Black</h3>
                  {isThemeUnlocked(allBlackTheme, settings) ? (
                    <Unlock size={14} className="text-[var(--success)]" aria-label="All Black unlocked" />
                  ) : (
                    <Lock size={14} className="text-[var(--text-muted)]" aria-label="All Black locked" />
                  )}
                  <span className="text-xs leading-[1.5] text-[var(--text-muted)]">First referral reward</span>
                </div>
                <p className="text-xs leading-[1.5] text-[var(--text-muted)] mb-3">
                  Pure black throughout. Unlocks with your first referral.
                </p>
                <div className={`p-3 rounded-lg border transition-all ${currentTheme.id === allBlackTheme.id
                  ? 'border-[var(--accent)] ring-2 ring-[var(--accent)] ring-opacity-50'
                  : 'border-[var(--border)]'
                  }`}>
                  <div
                    className="h-16 rounded-md mb-2"
                    style={{
                      background: `linear-gradient(135deg, ${allBlackTheme.colors.bgPrimary} 50%, ${allBlackTheme.colors.bgSecondary} 50%)`,
                      border: `1px solid ${allBlackTheme.colors.border}`,
                    }}
                  >
                    <div
                      className="w-3 h-3 rounded-full m-2"
                      style={{ backgroundColor: allBlackTheme.colors.accent }}
                    />
                  </div>
                  <div className="text-xs leading-[1.5] text-[var(--text-secondary)] space-y-1 mb-3">
                    <div>Referrals: {settings.referralCount} / {allBlackTheme.unlock?.referralsRequired ?? 1} {settings.referralCount >= (allBlackTheme.unlock?.referralsRequired ?? 1) ? '✓' : ''}</div>
                  </div>
                  {isThemeUnlocked(allBlackTheme, settings) ? (
                    <button
                      onClick={() => setTheme(allBlackTheme.id)}
                      className="btn btn-primary px-3 py-1.5 text-sm"
                    >
                      Use All Black
                    </button>
                  ) : (
                    <Tooltip content="Unlocks with your first referral">
                      <button
                        disabled
                        aria-label="All Black locked — unlocks with your first referral"
                        className="btn btn-secondary px-3 py-1.5 text-sm opacity-50 cursor-not-allowed"
                      >
                        <Lock size={14} className="inline mr-1" /> Locked — first referral
                      </button>
                    </Tooltip>
                  )}
                </div>
              </section>

              {/* Mist — its own section for toggles (Gary, 2026-11-09
                  ~08:15 PST): one toggle per surface, each its own
                  settings key, default off. The Files toggle is the
                  first; the AI Chat toggle (sweep item 12) is the
                  second, same pattern: key + toggle + conditional
                  render — see src/lib/mist.ts. NOT the full mist
                  theme (Gary, 2026-11-14 ~20:31 PST) — that comes
                  LATER, gated on verified client-side yield + a
                  verified temp for that profile. */}
              <section data-testid="mist-section">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Mist</h3>
                  <span className="text-xs leading-[1.5] text-[var(--text-muted)]">Splash mist, per surface</span>
                </div>
                <p className="text-xs leading-[1.5] text-[var(--text-muted)] mb-3">
                  The splashscreen mist, surface by surface. Each toggle is off by default — the surface shows its solid theme until its mist is switched on.
                </p>
                <div className="flex items-center gap-3">
                  <Tooltip content="Show the splash mist on the Files screen">
                    <label className="flex items-center gap-2 cursor-pointer py-1">
                      <Toggle
                        checked={settings.filesMist ?? false}
                        onChange={(checked) => updateSetting('filesMist', checked)}
                      />
                      <span className="text-sm">Files mist</span>
                    </label>
                  </Tooltip>
                  <Tooltip content="Show the splash mist in the AI Chat panel">
                    <label className="flex items-center gap-2 cursor-pointer py-1">
                      <Toggle
                        checked={settings.aiChatMist ?? false}
                        onChange={(checked) => updateSetting('aiChatMist', checked)}
                      />
                      <span className="text-sm">AI Chat mist</span>
                    </label>
                  </Tooltip>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Font</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Family</label>
<Tooltip content="Terminal font family">
                      <select
                        className="input"
                        value={settings.fontFamily}
                        onChange={(e) => updateSetting('fontFamily', e.target.value)}
                      >
                        <option value="Consolas">Consolas</option>
                        <option value="Monaco">Monaco</option>
                        <option value="Fira Code">Fira Code</option>
                        <option value="JetBrains Mono">JetBrains Mono</option>
                        <option value="Source Code Pro">Source Code Pro</option>
                        <option value="Cascadia Code">Cascadia Code</option>
                      </select>
</Tooltip>
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Size</label>
<Tooltip content="Terminal font size">
                      <input
                        type="number"
                        className="input"
                        value={settings.fontSize}
                        onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))}
                        min={10}
                        max={24}
                      />
</Tooltip>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'terminal' && (
            <div className="space-y-6">
              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Shell</h3>
<Tooltip content="Shell for new terminals">
                  <select
                    className="input"
                    value={settings.shell}
                    onChange={(e) => updateSetting('shell', e.target.value)}
                  >
                    <option value="powershell.exe">PowerShell</option>
                    <option value="cmd.exe">Command Prompt</option>
                    <option value="wsl.exe">WSL</option>
                    <option value="C:\\Program Files\\Git\\bin\\bash.exe">Git Bash</option>
                  </select>
</Tooltip>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Cursor</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Style</label>
<Tooltip content="Cursor shape">
                      <select
                        className="input"
                        value={settings.cursorStyle}
                        onChange={(e) =>
                          updateSetting('cursorStyle', e.target.value as 'block' | 'underline' | 'bar')
                        }
                      >
                        <option value="block">Block</option>
                        <option value="underline">Underline</option>
                        <option value="bar">Bar</option>
                      </select>
</Tooltip>
                  </div>
                  <div className="flex items-end">
<Tooltip content="Blink the cursor">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Toggle
                          checked={settings.cursorBlink}
                          onChange={(checked) => updateSetting('cursorBlink', checked)}
                        />
                        <span className="text-sm">Cursor blink</span>
                      </label>
</Tooltip>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Scrollback</h3>
<Tooltip content="Lines of history to keep">
                  <input
                    type="number"
                    className="input w-32"
                    value={settings.scrollback}
                    onChange={(e) => updateSetting('scrollback', parseInt(e.target.value))}
                    min={1000}
                    max={100000}
                    step={1000}
                  />
</Tooltip>
                <p className="text-xs leading-[1.5] text-[var(--text-muted)] mt-2">Number of lines to keep in history</p>
              </section>

              <section>
                <div className="flex items-center gap-3">
<Tooltip content="Play a sound on the terminal bell">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Toggle
                      checked={settings.bellSound}
                      onChange={(checked) => updateSetting('bellSound', checked)}
                    />
                    <span className="text-sm">Terminal bell sound</span>
                  </label>
</Tooltip>
                  <span className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      data-terminal-bell-play
                      onClick={previewBell}
                      className="btn btn-secondary text-xs shrink-0"
                      title="Preview the terminal bell sound"
                      aria-label={
                        bellPreviewPlaying
                          ? 'Playing terminal bell sound'
                          : 'Play terminal bell sound preview'
                      }
                    >
                      {bellPreviewPlaying ? (
                        <Pause size={14} />
                      ) : (
                        <Volume2 size={14} />
                      )}
                    </button>
                    <span className="text-xs text-[var(--text-muted)]">
                      Preview
                    </span>
                  </span>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Commands</h3>
                <p className="text-xs leading-[1.5] text-[var(--text-muted)] mb-3">
                  Every command the terminal understands, grouped by kind. The same catalogue the Help screen is built from — what the router actually routes, plus what Help documents. The list shows only what the terminal will actually run: while LuciferAI is off, its commands are hidden, because the terminal refuses them.
                </p>
                <input
                  type="text"
                  className="input w-full mb-3"
                  placeholder="Filter commands…"
                  value={commandFilter}
                  onChange={(e) => setCommandFilter(e.target.value)}
                />
                {(() => {
                  const filtered = searchCommandCatalogue(commandFilter, luciferAiEnabled);
                  return COMMAND_CATEGORIES.map((category) => {
                    const entries = category.entries.filter((entry) => filtered.includes(entry));
                    if (entries.length === 0) return null;
                    return (
                      <div key={category.id} className="mb-4">
                        <h4 className="text-xs font-semibold mb-2 text-[var(--text-secondary)]">{category.title}</h4>
                        <div className="space-y-2">
                          {entries.map((entry) => (
                            <div key={entry.name} className="flex items-start gap-2">
                              <code className="text-xs font-mono shrink-0 bg-[var(--bg-tertiary)] rounded px-1.5 py-0.5">{entry.syntax}</code>
                              <span className="text-xs leading-[1.5] text-[var(--text-muted)]">{entry.description}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  });
                })()}
              </section>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="space-y-6">
              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">API Key (Tier 5)</h3>
                <p className="text-xs leading-[1.5] text-[var(--text-muted)] mb-3">
                  Your own key for the chat API — sent straight to the API, never through a middleman. The model picked below is the model actually used.
                </p>
                {hasApiKey ? (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-[var(--bg-tertiary)] rounded-md">
                      <Check size={16} className="text-[var(--success)]" />
                      <span className="text-sm text-[var(--text-muted)]">API key saved</span>
                    </div>
<Tooltip content="Remove the saved API key">
                      <button onClick={deleteApiKey} className="btn btn-danger">
                        <Trash2 size={16} />
                        Remove
                      </button>
</Tooltip>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="password"
                      className="input"
                      placeholder="sk-..."
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                    />
<Tooltip content="Save the API key">
                      <button onClick={() => setApiKey(apiKeyInput)} className="btn btn-primary">
                        Save
                      </button>
</Tooltip>
                  </div>
                )}
              </section>


              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Model</h3>
<Tooltip content="AI model used for chat">
                  <select
                    className="input"
                    value={settings.aiModel}
                    onChange={(e) => updateSetting('aiModel', e.target.value)}
                  >
                    <option value="gpt-4">GPT-4</option>
                    <option value="gpt-4-turbo">GPT-4 Turbo</option>
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  </select>
</Tooltip>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Copilots</h3>
                <p className="text-xs leading-[1.5] text-[var(--text-muted)] mb-3">
                  The copilots in the AI chat&apos;s Copilot tab — add as many as you like, each
                  with its own model. A copilot runs the agent loop in the tab: it reads files,
                  makes edits, checks each edit, and shows every edit for Keep/Reject first. The
                  local planner needs no key; GitHub Copilot needs your key below.
                </p>
                {settings.copilots.length > 0 && (
                  <ul className="space-y-2 mb-3">
                    {settings.copilots.map((copilot) => (
                      <li
                        key={copilot.id}
                        data-testid="copilot-settings-row"
                        className="flex items-center gap-3 px-3 py-2 bg-[var(--bg-tertiary)] rounded-md"
                      >
                        <span className="flex-1 min-w-0 truncate text-sm text-[var(--text-primary)]">
                          {copilot.name}
                        </span>
                        <span className="shrink-0 text-xs text-[var(--text-muted)]">
                          {copilotModelLabel(copilot.model)}
                        </span>
                        <Tooltip content={`Remove ${copilot.name}`}>
                          <button
                            onClick={() =>
                              void updateSetting(
                                'copilots',
                                settings.copilots.filter((c) => c.id !== copilot.id),
                              )
                            }
                            className="btn btn-danger"
                          >
                            <Trash2 size={16} />
                            Remove
                          </button>
                        </Tooltip>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    className="input flex-1"
                    placeholder="Copilot name"
                    value={copilotNameInput}
                    onChange={(e) => setCopilotNameInput(e.target.value)}
                  />
                  <select
                    className="input"
                    aria-label="Copilot model"
                    value={copilotModelInput}
                    onChange={(e) => setCopilotModelInput(e.target.value as CopilotModelId)}
                  >
                    {COPILOT_MODELS.map((model) => (
                      <option key={model.id} value={model.id} title={model.hint}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                  <Tooltip content="Add this copilot">
                    <button
                      data-testid="copilot-add"
                      disabled={!copilotNameInput.trim()}
                      onClick={() => {
                        const name = copilotNameInput.trim();
                        if (!name) return;
                        void updateSetting('copilots', [
                          ...settings.copilots,
                          { id: newCopilotId(), name, model: copilotModelInput },
                        ]);
                        setCopilotNameInput('');
                      }}
                      className="btn btn-primary"
                    >
                      Add
                    </button>
                  </Tooltip>
                </div>
                {hasCopilotApiKey ? (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-[var(--bg-tertiary)] rounded-md">
                      <Check size={16} className="text-[var(--success)]" />
                      <span className="text-sm text-[var(--text-muted)]">GitHub Copilot key saved</span>
                    </div>
                    <Tooltip content="Remove the saved GitHub Copilot key">
                      <button data-testid="copilot-key-remove" onClick={deleteCopilotApiKey} className="btn btn-danger">
                        <Trash2 size={16} />
                        Remove
                      </button>
                    </Tooltip>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="password"
                      className="input"
                      placeholder="GitHub Copilot key"
                      value={copilotKeyInput}
                      onChange={(e) => setCopilotKeyInput(e.target.value)}
                    />
                    <Tooltip content="Save the GitHub Copilot key">
                      <button data-testid="copilot-key-save" onClick={() => setCopilotApiKey(copilotKeyInput)} className="btn btn-primary">
                        Save
                      </button>
                    </Tooltip>
                  </div>
                )}
                <p className="text-xs leading-[1.5] text-[var(--text-muted)] mt-2">
                  The key is stored encrypted in the OS keychain, like the API key, and never
                  leaves the main process — the copilot tab talks to GitHub Copilot through it
                  (cloud, metered by your Copilot subscription). The key is a GitHub token: an
                  OAuth token or a fine-grained token with Copilot access. A classic personal
                  access token (ghp_…) does not work — GitHub rejects it.
                </p>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Driving agent tabs</h3>
                <p className="text-xs leading-[1.5] text-[var(--text-muted)] mb-3">
                  The driving agents the LLMBuilder tab can pick from — add as many as you like.
                  The pick is what allows each tool call: the copilot tab&apos;s dropdown picks the
                  brain that does the work, this picker picks the base underneath that allows the
                  pass. The base runs today; a starship shows when one is detected; a Tier 5 model
                  needs your API key; an ARC Server needs its endpoint. An agent that cannot run
                  yet answers as not connected, never as another agent.
                </p>
                {settings.drivingAgentTabs.length > 0 && (
                  <ul className="space-y-2 mb-3">
                    {settings.drivingAgentTabs.map((tab) => {
                      const state = detectDrivingAgent(
                        tab.agent,
                        liveDrivingAgentDetection(hasApiKey, settings.aiModel),
                        tab.endpoint,
                      );
                      const stateLabel = !state.detected
                        ? 'Not detected'
                        : !state.canRun
                          ? 'Not connected yet'
                          : 'Ready';
                      return (
                        <li
                          key={tab.id}
                          data-testid="driving-agent-settings-row"
                          className="flex items-center gap-3 px-3 py-2 bg-[var(--bg-tertiary)] rounded-md"
                        >
                          <span className="flex-1 min-w-0 truncate text-sm text-[var(--text-primary)]">
                            {tab.name}
                          </span>
                          <span className="shrink-0 text-xs text-[var(--text-muted)]">
                            {drivingAgentLabel(tab.agent)}
                          </span>
                          <span
                            className="shrink-0 text-xs text-[var(--text-muted)]"
                            title={state.detail}
                          >
                            {stateLabel}
                          </span>
                          <Tooltip content={`Remove ${tab.name}`}>
                            <button
                              onClick={() => {
                                const tabs = settings.drivingAgentTabs.filter(
                                  (t) => t.id !== tab.id,
                                );
                                if (settings.activeDrivingAgentTabId === tab.id) {
                                  void updateSettings({
                                    drivingAgentTabs: tabs,
                                    activeDrivingAgentTabId: null,
                                  });
                                } else {
                                  void updateSetting('drivingAgentTabs', tabs);
                                }
                              }}
                              className="btn btn-danger"
                            >
                              <Trash2 size={16} />
                              Remove
                            </button>
                          </Tooltip>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    className="input flex-1"
                    placeholder="Driving agent tab name"
                    value={drivingAgentTabNameInput}
                    onChange={(e) => setDrivingAgentTabNameInput(e.target.value)}
                  />
                  <select
                    className="input"
                    aria-label="Driving agent"
                    value={drivingAgentTabAgentInput}
                    onChange={(e) =>
                      setDrivingAgentTabAgentInput(e.target.value as DrivingAgentId)
                    }
                  >
                    {DRIVING_AGENTS.map((agent) => (
                      <option key={agent.id} value={agent.id} title={agent.hint}>
                        {agent.label}
                      </option>
                    ))}
                  </select>
                  {drivingAgentTabAgentInput === 'arc-server' && (
                    <input
                      type="text"
                      className="input flex-1"
                      placeholder="http://127.0.0.1:8080"
                      aria-label="ARC Server endpoint"
                      value={drivingAgentTabEndpointInput}
                      onChange={(e) => setDrivingAgentTabEndpointInput(e.target.value)}
                    />
                  )}
                  <Tooltip content="Add this driving agent tab">
                    <button
                      data-testid="driving-agent-add"
                      disabled={
                        !drivingAgentTabNameInput.trim() ||
                        (drivingAgentTabAgentInput === 'arc-server' &&
                          !drivingAgentTabEndpointInput.trim())
                      }
                      onClick={() => {
                        const name = drivingAgentTabNameInput.trim();
                        if (!name) return;
                        const endpoint = drivingAgentTabEndpointInput.trim();
                        if (drivingAgentTabAgentInput === 'arc-server' && !endpoint) return;
                        void updateSetting('drivingAgentTabs', [
                          ...settings.drivingAgentTabs,
                          {
                            id: newDrivingAgentTabId(),
                            name,
                            agent: drivingAgentTabAgentInput,
                            ...(drivingAgentTabAgentInput === 'arc-server'
                              ? { endpoint }
                              : {}),
                          },
                        ]);
                        setDrivingAgentTabNameInput('');
                        setDrivingAgentTabEndpointInput('');
                      }}
                      className="btn btn-primary"
                    >
                      Add
                    </button>
                  </Tooltip>
                </div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">
                  Active driving agent
                </label>
                <select
                  className="input w-full"
                  data-testid="driving-agent-picker"
                  aria-label="Active driving agent"
                  value={settings.activeDrivingAgentTabId ?? ''}
                  onChange={(e) =>
                    void updateSetting(
                      'activeDrivingAgentTabId',
                      e.target.value === '' ? null : e.target.value,
                    )
                  }
                >
                  {drivingAgentPickerOptions(
                    settings.drivingAgentTabs,
                    liveDrivingAgentDetection(hasApiKey, settings.aiModel),
                  ).map((option) => (
                    <option key={option.value || 'base'} value={option.value} title={option.title}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs leading-[1.5] text-[var(--text-muted)] mt-2">
                  No tab picked means the base (LLMBuilder) — the run keeps working. A tab whose
                  agent is not detected or not connected yet shows its state here, and a run under
                  it answers as not ready instead of running as another agent.
                </p>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Temperature</h3>
                <div className="flex items-center gap-3">
<Tooltip content="Lower is more focused, higher is more creative">
                    <input
                      type="range"
                      className="flex-1"
                      value={settings.aiTemperature}
                      onChange={(e) => updateSetting('aiTemperature', parseFloat(e.target.value))}
                      min={0}
                      max={1}
                      step={0.1}
                    />
</Tooltip>
                  <span className="text-sm w-8">{settings.aiTemperature}</span>
                </div>
                <p className="text-xs leading-[1.5] text-[var(--text-muted)] mt-2">
                  Lower = more focused, Higher = more creative
                </p>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Ping Server (test)</h3>
                <p className="text-xs leading-[1.5] text-[var(--text-muted)] mb-3">
                  Test path: AI chat goes to the Cloudflare ping server Worker instead of the local model or OpenAI. Free model, 100 SP to start — 1 SP per reply, refills over time. Nothing else changes.
                </p>
                <label className="flex items-center gap-2 text-sm mb-3">
                  <input
                    type="checkbox"
                    checked={settings.pingServerEnabled}
                    onChange={(e) => updateSetting('pingServerEnabled', e.target.checked)}
                  />
                  Route AI chat through the ping server
                </label>
                <div className="space-y-2">
                  <input
                    type="text"
                    className="input w-full"
                    placeholder="http://127.0.0.1:8787"
                    value={settings.pingServerEndpoint}
                    onChange={(e) => updateSetting('pingServerEndpoint', e.target.value)}
                  />
                  {hasPingKey ? (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-[var(--bg-tertiary)] rounded-md">
                        <Check size={16} className="text-[var(--success)]" />
                        <span className="text-sm text-[var(--text-muted)]">Ping server key saved</span>
                      </div>
                      <Tooltip content="Remove the saved ping server key">
                        <button onClick={deletePingKey} className="btn btn-danger">
                          <Trash2 size={16} />
                          Remove
                        </button>
                      </Tooltip>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="password"
                        className="input"
                        placeholder="Ping server shared secret"
                        value={pingKeyInput}
                        onChange={(e) => setPingKeyInput(e.target.value)}
                      />
                      <Tooltip content="Save the ping server key">
                        <button onClick={() => setPingKey(pingKeyInput)} className="btn btn-primary">
                          Save
                        </button>
                      </Tooltip>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button onClick={testPingServer} disabled={pingTesting} className="btn btn-secondary">
                      {pingTesting ? 'Testing…' : 'Test connection'}
                    </button>
                    {pingTestResult && (
                      <span className="text-xs text-[var(--text-muted)]">{pingTestResult}</span>
                    )}
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">
                  Command Execution Policy
                </h3>
<Tooltip content="What the AI may run in the terminal">
                  <select
                    className="input"
                    value={settings.terminalPolicy}
                    onChange={(e) =>
                      updateSetting('terminalPolicy', e.target.value as 'ask' | 'auto' | 'deny')
                    }
                  >
                    <option value="ask">Ask before executing</option>
                    <option value="auto">Execute automatically</option>
                    <option value="deny">Never execute</option>
                  </select>
</Tooltip>
              </section>
            </div>
          )}

          {activeTab === 'customization' && (
            <div className="space-y-6">
              <section>
                {/* Voice explanation (Gary, 2026-11-07 ~05:38 PST):
                    Customization gets one flagship voice recording,
                    like Devices has. */}
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Processing Animation</h3>
                  <CustomizationVoiceButton />
                </div>
                <ProcessingGlowSettings onSave={() => console.log('Processing glow settings saved')} />
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Sentinel Face — Gaze Sensitivity</h3>
                <div className="flex items-center gap-3">
<Tooltip content="How closely the Sentinel face tracks the cursor">
                    <input
                      type="range"
                      className="flex-1"
                      value={settings.gazeSensitivity ?? 50}
                      onChange={(e) => updateSetting('gazeSensitivity', parseInt(e.target.value, 10))}
                      min={0}
                      max={100}
                      step={5}
                    />
</Tooltip>
                  <span className="text-sm w-10">{settings.gazeSensitivity ?? 50}%</span>
                </div>
                <p className="text-xs leading-[1.5] text-[var(--text-muted)] mt-2">
                  How focused the Sentinel face&rsquo;s eyes are on the cursor. Low = the eyes stay wandering and only glance toward it; high = they track it closely and lock on quickly. Applies right away, no restart needed.
                </p>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Validation Display</h3>
                <div className="space-y-3">
<Tooltip content="Show validation steps">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Toggle
                        checked={settings.showValidationSteps !== false}
                        onChange={(checked) => updateSetting('showValidationSteps', checked)}
                      />
                      <span className="text-sm">Show validation steps (Warp-style ✓/✗/⏳)</span>
                    </label>
</Tooltip>
<Tooltip content="Auto-collapse completed validations">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Toggle
                        checked={settings.autoCollapseValidation !== false}
                        onChange={(checked) => updateSetting('autoCollapseValidation', checked)}
                      />
                      <span className="text-sm">Auto-collapse completed validations</span>
                    </label>
</Tooltip>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Token Display</h3>
                <div className="space-y-3">
<Tooltip content="Show token statistics">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Toggle
                        checked={settings.showTokenStats !== false}
                        onChange={(checked) => updateSetting('showTokenStats', checked)}
                      />
                      <span className="text-sm">Show token statistics</span>
                    </label>
</Tooltip>
<Tooltip content="Show efficiency indicators">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Toggle
                        checked={settings.showTokenEfficiency !== false}
                        onChange={(checked) => updateSetting('showTokenEfficiency', checked)}
                      />
                      <span className="text-sm">Show efficiency indicators</span>
                    </label>
</Tooltip>
                </div>
              </section>

              <section>
                {/* Terminal customizations (Gary, 2026-11-14 ~14:28 PST):
                    Warp's terminal font values as customizations.
                    The terminal — xterm, the composer, the feed
                    blocks — follows these settings live. Defaults
                    ship as the terminal's current look (JetBrains
                    Mono 13 / 1.5 / 0 / off / Normal); the Warp
                    preset below is a one-click choice, not the
                    default. Hack is bundled with Lucid, so the
                    preset renders Hack on every machine. */}
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Terminal customizations</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-[var(--text-muted)] mb-1">Family</label>
<Tooltip content="Terminal font family">
                        <select
                          className="input"
                          data-testid="terminal-font-family"
                          value={settings.terminalFontFamily ?? 'JetBrains Mono'}
                          onChange={(e) => updateSetting('terminalFontFamily', e.target.value)}
                        >
                          {TERMINAL_FONT_FAMILIES.map((family) => (
                            <option key={family} value={family}>{family}</option>
                          ))}
                        </select>
</Tooltip>
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--text-muted)] mb-1">Size</label>
<Tooltip content="Terminal font size (1–120)">
                        <input
                          type="number"
                          className="input"
                          data-testid="terminal-font-size"
                          value={settings.terminalFontSize ?? 13}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (!Number.isNaN(v)) updateSetting('terminalFontSize', clampTerminalFontSize(v));
                          }}
                          min={TERMINAL_FONT_SIZE_MIN}
                          max={TERMINAL_FONT_SIZE_MAX}
                        />
</Tooltip>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-[var(--text-muted)] mb-1">Feed density</label>
<Tooltip content="Feed density — comfortable spacing, or compact (tighter blocks)">
                        <select
                          className="input"
                          data-testid="feed-density"
                          value={settings.feedDensity ?? 'comfortable'}
                          onChange={(e) => updateSetting('feedDensity', e.target.value as 'comfortable' | 'compact')}
                        >
                          <option value="comfortable">Comfortable</option>
                          <option value="compact">Compact</option>
                        </select>
</Tooltip>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">
                      Line height — {(settings.terminalLineHeight ?? 1.5).toFixed(1)}×
                    </label>
                    <div className="flex items-center gap-3">
<Tooltip content="Terminal line height (ratio — Warp default 1.2)">
                        <input
                          type="range"
                          className="flex-1"
                          data-testid="terminal-line-height"
                          value={settings.terminalLineHeight ?? 1.5}
                          onChange={(e) => updateSetting('terminalLineHeight', clampTerminalLineHeight(parseFloat(e.target.value)))}
                          min={TERMINAL_LINE_HEIGHT_MIN}
                          max={TERMINAL_LINE_HEIGHT_MAX}
                          step={0.1}
                        />
</Tooltip>
                      <span className="text-sm w-10">{(settings.terminalLineHeight ?? 1.5).toFixed(1)}×</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">
                      Letter spacing — {(settings.terminalLetterSpacing ?? 0).toFixed(1)} px
                    </label>
                    <div className="flex items-center gap-3">
<Tooltip content="Terminal letter spacing (Warp sets none — a Lucid addition)">
                        <input
                          type="range"
                          className="flex-1"
                          data-testid="terminal-letter-spacing"
                          value={settings.terminalLetterSpacing ?? 0}
                          onChange={(e) => updateSetting('terminalLetterSpacing', clampTerminalLetterSpacing(parseFloat(e.target.value)))}
                          min={TERMINAL_LETTER_SPACING_MIN}
                          max={TERMINAL_LETTER_SPACING_MAX}
                          step={0.5}
                        />
</Tooltip>
                      <span className="text-sm w-10">{(settings.terminalLetterSpacing ?? 0).toFixed(1)} px</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-[var(--text-muted)] mb-1">Weight</label>
<Tooltip content="Terminal font weight">
                        <select
                          className="input"
                          data-testid="terminal-font-weight"
                          value={settings.terminalFontWeight ?? '400'}
                          onChange={(e) => updateSetting('terminalFontWeight', e.target.value)}
                        >
                          {TERMINAL_FONT_WEIGHTS.map((w) => (
                            <option key={w.value} value={w.value}>{w.label}</option>
                          ))}
                        </select>
</Tooltip>
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--text-muted)] mb-1">Ligatures</label>
<Tooltip content="Terminal ligatures (Warp default: off)">
                        <label className="flex items-center gap-2 cursor-pointer pt-1">
                          <Toggle
                            checked={settings.terminalLigatures ?? false}
                            onChange={(checked) => updateSetting('terminalLigatures', checked)}
                          />
                          <span className="text-sm">On</span>
                        </label>
</Tooltip>
                    </div>
                  </div>
                  <div>
<Tooltip content="Apply Warp's terminal font defaults">
                      <button
                        type="button"
                        className="btn-primary"
                        data-testid="terminal-warp-preset"
                        onClick={() => updateSettings(warpPresetSettings())}
                      >
                        Warp preset
                      </button>
</Tooltip>
                    <p className="text-xs leading-[1.5] text-[var(--text-muted)] mt-2">
                      Hack, {WARP_PRESET.size}, line height {WARP_PRESET.lineHeight.toFixed(1)}, ligatures off, Normal — Warp&rsquo;s defaults. Applies right away, no restart needed.
                    </p>
                  </div>
                </div>
              </section>

              <section>
                {/* Code-block colors (Gary, 2026-11-13 ~15:30 PST):
                    "I dont wanna add the code blocks yet just get the
                    section ready coming soon in customization". The
                    ChatGPT purple/pink palette lives here as ONE section
                    in Customization (not a theme) when it lands — the
                    apply (O1 strings pink vs green, O2 editor bg, O3
                    highlighter) is still Gary's call. No coloring is
                    applied anywhere yet. */}
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Code blocks</h3>
                  <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
                    Coming soon
                  </span>
                </div>
                <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
                  Code blocks in the editor and chat will take the ChatGPT purple and pink here. Coming soon — no colors are applied anywhere yet.
                </p>
              </section>
            </div>
          )}

          {activeTab === 'plugins' && (
            <div className="space-y-6">
              <section>
                {/* Voice explanation (Gary, 2026-11-07 ~05:38 PST):
                    plugins needs one flagship voice recording too,
                    like Devices has. */}
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Core plugins</h3>
                  <PluginsVoiceButton />
                </div>
                <p className="text-xs leading-[1.5] text-[var(--text-muted)] mb-3">
                  Built in — always installed.
                </p>
                <div className="space-y-3">
                  {TOOLBAR_PLUGINS.map((plugin) => {
                    const Icon = plugin.icon;
                    const onToolbar = settings.toolbarPlugins?.[plugin.id] ?? plugin.defaultOnToolbar;
                    // Synth and the blood drop are LuciferAI surfaces: their
                    // toolbar buttons cannot be switched on while the
                    // plugin is off. AI Chat is not — it is Lucid AI,
                    // its own plugin (Gary, 2026-11-07), so its
                    // toggle stays live with the plugin off.
                    const isLuciferSurface = plugin.action === 'synth' || plugin.action === 'help';
                    const surfaceDisabled = isLuciferSurface && !luciferAiEnabled;
                    return (
<Tooltip key={plugin.id} content={plugin.description}>
                        <label className="flex items-center gap-3 cursor-pointer">
                          <Toggle
                            checked={onToolbar}
                            onChange={(checked) =>
                              updateSetting('toolbarPlugins', {
                                ...(settings.toolbarPlugins ?? {}),
                                [plugin.id]: checked,
                              })
                            }
                            disabled={surfaceDisabled}
                            title={surfaceDisabled ? 'Disabled while LuciferAI is off — these are its surfaces' : undefined}
                          />
                          <Icon size={18} className="text-[var(--text-muted)] shrink-0" />
                          <span className="min-w-0">
                            <span className="block text-sm">{plugin.name}</span>
                            <span className="block text-xs leading-[1.5] text-[var(--text-muted)]">{plugin.description}</span>
                          </span>
                        </label>
</Tooltip>
                    );
                  })}
                  <div className="flex items-start gap-3">
                    <Bot size={18} className="text-[var(--text-muted)] shrink-0 mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm">LuciferAI</span>
                      <span className="block text-xs leading-[1.5] text-[var(--text-muted)]">
                        The plugin itself — local AI backend, command passes, FixNet. The Synth shell and blood drop above are its surfaces.
                      </span>
                      <label className="flex items-center gap-2 cursor-pointer mt-3 py-1">
                        <Toggle
                          checked={luciferAiEnabled}
                          onChange={(checked) => updateSetting('luciferAiEnabled', checked)}
                        />
                        <span className="text-xs leading-[1.5] text-[var(--text-muted)]">
                          {luciferAiEnabled
                            ? 'Enabled — turning it off removes the plugin entirely (blood drop, heartbeat, Help and Synth all go with it). AI Chat stays — it is its own plugin now. Persona Plex stays too — it is an add-on, not one of its surfaces.'
                            : 'Disabled — the plugin is completely gone. Turn it back on to restore it. (AI Chat stays — it is its own plugin now. Persona Plex stays too — it is an add-on, not one of its surfaces.)'}
                        </span>
                      </label>
                    </span>
                    <span className="text-xs text-[var(--text-muted)] shrink-0">
                      Built-in ·{' '}
                      {!luciferAiEnabled
                        ? 'Disabled'
                        : luciferCondition === 'checking'
                          ? 'Checking…'
                          : luciferCondition === 'awake'
                            ? 'Awake'
                            : luciferCondition === 'dormant'
                              ? 'Dormant'
                              : 'Status unavailable'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Usb size={18} className="text-[var(--text-muted)] shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm">{DEVICES_PLUGIN.name}</span>
                      <span className="block text-xs leading-[1.5] text-[var(--text-muted)]">
                        {DEVICES_PLUGIN.description}
                      </span>
                    </span>
                    <span className="text-xs text-[var(--text-muted)] shrink-0">
                      Built-in · Anchored
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Boxes size={18} className="text-[var(--text-muted)] shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm">{MODULES_PLUGIN.name}</span>
                      <span className="block text-xs leading-[1.5] text-[var(--text-muted)]">
                        {MODULES_PLUGIN.description}
                      </span>
                    </span>
                    <span className="text-xs text-[var(--text-muted)] shrink-0">
                      Built-in · Anchored
                    </span>
                  </div>
                </div>
                <p className="text-xs leading-[1.5] text-[var(--text-muted)] mt-2">
                  Toggled-on plugins show as buttons in the icon bar, in the section above Settings. Applies right away, no restart needed. LuciferAI is always built in — its switch is on its row above: turning it off disables the plugin entirely.
                </p>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Custom plugins</h3>
                <p className="text-xs leading-[1.5] text-[var(--text-muted)] mb-3">
                  User-registered plugins (see src/data/customPlugins.ts). A plugin appears here once it is registered — give it an id, a name, a description and an icon (a lucide icon, an emoji, or an image file/URL).
                </p>
                <div className="space-y-3">
                  {CUSTOM_PLUGINS.length === 0 ? (
                    <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
                      No custom plugins registered yet. Add one to src/data/customPlugins.ts and it appears here with its own toggle.
                    </p>
                  ) : (
                    CUSTOM_PLUGINS.map((plugin) => {
                      const resolvedIcon = resolvePluginIcon(plugin.icon);
                      const FallbackIcon = CUSTOM_PLUGIN_FALLBACK_ICON;
                      return (
                        <label key={plugin.id} className="flex items-center gap-3 cursor-pointer">
                          <Toggle
                            checked={isCustomPluginEnabled(plugin, settings.customPlugins)}
                            onChange={(checked) =>
                              updateSetting('customPlugins', {
                                ...(settings.customPlugins ?? {}),
                                [plugin.id]: checked,
                              })
                            }
                          />
                          {resolvedIcon?.type === 'lucide' ? (
                            <resolvedIcon.icon size={18} className="text-[var(--text-muted)] shrink-0" />
                          ) : resolvedIcon?.type === 'emoji' ? (
                            <span className="text-lg leading-none shrink-0" aria-hidden="true">{resolvedIcon.char}</span>
                          ) : resolvedIcon?.type === 'image' ? (
                            <img src={resolvedIcon.src} alt="" className="h-[18px] w-[18px] shrink-0 rounded-sm object-contain" />
                          ) : (
                            <FallbackIcon size={18} className="text-[var(--text-muted)] shrink-0" />
                          )}
                          <span className="min-w-0">
                            <span className="block text-sm">{plugin.name}</span>
                            <span className="block text-xs leading-[1.5] text-[var(--text-muted)]">{plugin.description}</span>
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Add-ons</h3>
                <p className="text-xs leading-[1.5] text-[var(--text-muted)] mb-3">
                  Installed on demand — nothing is pre-installed, except Android Connect, which is installed automatically with the Devices anchor plugin, and Segments, installed automatically with the Modules anchor plugin. Installable add-ons install from here; an installed add-on gets a Settings button that opens its settings.
                </p>
                <div className="space-y-3">
                  {PLUGIN_ADDONS.map((addon) => {
                    const installed = isAddonInstalled(addon, settings.installedAddons ?? []);
                    const userInstalled = (settings.installedAddons ?? []).includes(addon.id);
                    const anchorLabel = addonAnchorLabel(addon);
                    return (
                      <div key={addon.id} className="flex items-center gap-3">
                        <Puzzle size={18} className="text-[var(--text-muted)] shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm">{addon.name}</span>
                          <span className="block text-xs leading-[1.5] text-[var(--text-muted)]">
                            {addon.description}
                            {addon.removable ? ' Removable once installed.' : ''}
                            {addon.fetchedAtInstall && settings.arcServerInstall ? (
                              <span className="block">{arcServerInstallStateText(settings.arcServerInstall)}</span>
                            ) : null}
                            {addon.fetchedAtInstall && addon.id === 'offline-worldmap' && settings.worldmapInstall ? (
                              <span className="block">{worldmapInstallStateText(settings.worldmapInstall)}</span>
                            ) : null}
                            {addon.fetchedAtInstall && installed && addon.id === 'arc-server' ? (
                              <span className="block">{ARC_SERVER_BUILD_NOTE}</span>
                            ) : null}
                            {addon.fetchedAtInstall && installed && addon.id === 'offline-worldmap' ? (
                              <span className="block">{WORLDMAP_BUILD_NOTE}</span>
                            ) : null}
                          </span>
                        </span>
                        <AddonVoiceButton addonId={addon.id} addonName={addon.name} />
                        {addon.fetchedAtInstall ? (
                          <>
                            <span className="text-xs text-[var(--text-muted)] shrink-0">
                              {installed ? 'Installed' : 'Not installed'}
                            </span>
                            {installingFor(addon.id) ? (
                              <button data-addon-install={addon.id}
                                disabled
                                className="btn btn-secondary text-xs shrink-0 opacity-50 cursor-not-allowed"
                              >
                                Fetching…
                              </button>
                            ) : installed ? (
                              <>
                                {addonHasSettings(addon.id) && (
                                  <button data-addon-settings={addon.id}
                                    onClick={() => handleAddonSettings(addon.id, addon.name)}
                                    className="btn btn-secondary text-xs shrink-0"
                                    title={`Open ${addon.name} settings`}
                                  >
                                    Settings
                                  </button>
                                )}
                                {userInstalled && addon.removable && (
                                  <button data-addon-remove={addon.id}
                                    onClick={() => void handleFetchedRemove(addon.id)}
                                    className="btn btn-secondary text-xs shrink-0"
                                  >
                                    Remove
                                  </button>
                                )}
                              </>
                            ) : (
                              <button data-addon-install={addon.id}
                                onClick={() => void handleFetchedInstall(addon.id)}
                                className="btn btn-secondary text-xs shrink-0"
                              >
                                Install
                              </button>
                            )}
                          </>
                        ) : installed ? (
                          <>
                            <span className="text-xs text-[var(--text-muted)] shrink-0">
                              Installed{anchorLabel ? ` · ${anchorLabel}` : ''}
                            </span>
                            {addonHasSettings(addon.id) && (
                              <button data-addon-settings={addon.id}
                                onClick={() => handleAddonSettings(addon.id, addon.name)}
                                className="btn btn-secondary text-xs shrink-0"
                                title={`Open ${addon.name} settings`}
                              >
                                Settings
                              </button>
                            )}
                            {userInstalled && addon.removable && (
                              <button data-addon-remove={addon.id}
                                onClick={() => void updateSetting('installedAddons', (settings.installedAddons ?? []).filter((id) => id !== addon.id))}
                                className="btn btn-secondary text-xs shrink-0"
                              >
                                Remove
                              </button>
                            )}
                          </>
                        ) : addon.installBlockedReason ? (
                          <>
                            <span className="text-xs text-[var(--text-muted)] shrink-0">Not installed</span>
                            <button data-addon-install={addon.id}
                              disabled
                              title={addon.installBlockedReason}
                              className="btn btn-secondary text-xs shrink-0 opacity-50 cursor-not-allowed"
                            >
                              Install
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="text-xs text-[var(--text-muted)] shrink-0">Not installed</span>
                            <button data-addon-install={addon.id}
                              onClick={() => void updateSetting('installedAddons', [...(settings.installedAddons ?? []), addon.id])}
                              className="btn btn-secondary text-xs shrink-0"
                            >
                              Install
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          )}

          {activeTab === 'devices' && (
            <div className="space-y-6">
              <section>
                {/* Voice explanation (Gary, 2026-11-07 ~02:54 PST):
                    plugins have voice recordings all throughout. */}
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Detected devices</h3>
                  <DevicesVoiceButton />
                </div>
                <p className="text-xs leading-[1.5] text-[var(--text-muted)] mb-3">
                  Detection only — Lucid lists and identifies devices. It never controls them or talks to them. USB via system_profiler, Android via adb, plus this Mac itself.
                </p>
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => void devicesState.refresh()}
                    disabled={devicesState.loading}
                    className="btn btn-secondary text-xs disabled:opacity-50"
                  >
                    Refresh
                  </button>
                  {devicesState.loading && <span className="text-xs text-[var(--text-muted)]">Scanning…</span>}
                  {devicesState.lastRefreshedAt && !devicesState.loading && (
                    <span className="text-xs text-[var(--text-muted)]">
                      Last scanned {new Date(devicesState.lastRefreshedAt).toLocaleTimeString()}
                    </span>
                  )}
                </div>
                {devicesState.errors.map((message) => (
                  <p key={message} className="text-xs text-red-500 mb-2">{message}</p>
                ))}
                <div className="space-y-3">
                  {devicesState.host && (
                    <div className="flex items-center gap-3">
                      <Monitor size={18} className="text-[var(--text-muted)] shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm">{devicesState.host.name}</span>
                        <span className="block text-xs leading-[1.5] text-[var(--text-muted)]">
                          This Mac · host{devicesState.host.detail ? ` · ${devicesState.host.detail}` : ''}
                        </span>
                      </span>
                      <span className="text-xs text-[var(--text-muted)] shrink-0">{devicesState.host.status}</span>
                    </div>
                  )}
                  {devicesState.devices.map((device) => (
                    <div key={device.id} className="flex items-center gap-3">
                      {device.kind === 'android' ? (
                        <Smartphone size={18} className="text-[var(--text-muted)] shrink-0" />
                      ) : (
                        <Usb size={18} className="text-[var(--text-muted)] shrink-0" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm">{device.name}</span>
                        <span className="block text-xs leading-[1.5] text-[var(--text-muted)]">
                          {device.kind === 'android'
                            ? `Android · ${device.id}`
                            : `USB${device.vendorName ? ` · ${device.vendorName}` : ''}${device.vendorId ? ` · ${device.vendorId}` : ''}${device.productId ? ` / ${device.productId}` : ''}`}
                        </span>
                      </span>
                      <span className="text-xs text-[var(--text-muted)] shrink-0">{device.status}</span>
                    </div>
                  ))}
                  {!devicesState.loading && devicesState.devices.length === 0 && (
                    <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
                      No USB or Android devices detected. Connect one and press Refresh.
                    </p>
                  )}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Add-ons</h3>
                <p className="text-xs leading-[1.5] text-[var(--text-muted)] mb-3">
                  Android Connect is installed automatically with the Devices anchor plugin — it is how Android devices are detected.
                </p>
                <div className="space-y-3">
                  {PLUGIN_ADDONS.filter((addon) => addon.anchor === 'devices').map((addon) => (
                    <div key={addon.id} className="flex items-center gap-3">
                      <Puzzle size={18} className="text-[var(--text-muted)] shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm">{addon.name}</span>
                        <span className="block text-xs leading-[1.5] text-[var(--text-muted)]">{addon.description}</span>
                      </span>
                      <span className="text-xs text-[var(--text-muted)] shrink-0">Installed · Anchored with Devices</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeTab === 'forge' && (
            <ForgeView />
          )}

          {activeTab === 'modules' && (
            <ModulesTab />
          )}

          {activeTab === 'models' && (
            <div>
              <ModelInstaller />
            </div>
          )}

          {activeTab === 'daemon' && (
            <div className="space-y-6">
              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">File Watching</h3>
                <div className="space-y-3">
<Tooltip content="Start the file watcher daemon">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Toggle
                        // The toggle is the daemon switch: it reads on when the
                        // setting says so OR the daemon is actually running
                        // (e.g. started on launch or from the terminal).
                        checked={settings.daemonEnabled !== false || daemonStatus?.running === true}
                        onChange={(checked) => handleDaemonEnabledChange(checked)}
                        disabled={daemonBusy}
                      />
                      <span className="text-sm">Enable file watcher daemon</span>
                    </label>
</Tooltip>
<Tooltip content="Apply fixes automatically on file change">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Toggle
                        checked={settings.daemonAutoFix !== false}
                        onChange={(checked) => handleDaemonAutoFixChange(checked)}
                        disabled={daemonBusy}
                      />
                      <span className="text-sm">Auto-fix errors on file change</span>
                    </label>
</Tooltip>
                  <div className="text-xs leading-[1.5] text-[var(--text-muted)] pl-6">
                    Off = suggest fixes only (watch mode). On applies fixes automatically.
                  </div>
<Tooltip content="Log new commits in watched repos">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Toggle
                        checked={settings.daemonCommitTracking !== false}
                        onChange={(checked) => handleDaemonCommitTrackingChange(checked)}
                        disabled={daemonBusy}
                      />
                      <span className="text-sm">GitHub-style commit tracking</span>
                    </label>
</Tooltip>
                  <div className="text-xs leading-[1.5] text-[var(--text-muted)] pl-6">
                    On = the watcher logs each new commit in a watched git repo (see Daemon Logs below). Off = commits are ignored. The watcher only reads HEAD — it never commits anything itself.
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Watched Directories</h3>
                <div className="space-y-2">
                  <div className="text-xs leading-[1.5] text-[var(--text-muted)] mb-2">
                    Directories being monitored for changes
                  </div>
                  {watchPaths.length === 0 ? (
                    <div className="text-xs leading-[1.5] text-[var(--text-muted)]">No directories watched yet.</div>
                  ) : (
                    watchPaths.map((dir) => (
                      <div key={dir} className="flex items-center gap-2 text-sm">
                        <span className="flex-1 truncate font-mono text-xs">{dir}</span>
<Tooltip content="Stop watching this directory">
                          <button
                            onClick={() => handleRemoveWatchDirectory(dir)}
                            disabled={daemonBusy}
                            className="btn-ghost p-1 rounded text-red-500 hover:bg-red-500/10"
                          >
                            <X size={14} />
                          </button>
</Tooltip>
                      </div>
                    ))
                  )}
<Tooltip content="Add a directory to watch">
                    <button onClick={handleAddWatchDirectory} disabled={daemonBusy} className="btn btn-secondary text-xs">
                      Add Directory to Watch
                    </button>
</Tooltip>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Daemon Logs</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Log Retention (days)</label>
<Tooltip content="Days of daemon logs to keep">
                      <input
                        type="number"
                        className="input"
                        value={settings.daemonLogRetention || 30}
                        onChange={(e) => updateSetting('daemonLogRetention', parseInt(e.target.value))}
                        min={1}
                        max={365}
                      />
</Tooltip>
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Verbosity</label>
<Tooltip content="How much the daemon logs">
                      <select
                        className="input"
                        value={settings.daemonLogVerbosity || 'normal'}
                        onChange={(e) => updateSetting('daemonLogVerbosity', e.target.value)}
                      >
                        <option value="minimal">Minimal</option>
                        <option value="normal">Normal</option>
                        <option value="verbose">Verbose</option>
                        <option value="debug">Debug</option>
                      </select>
</Tooltip>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Status</h3>
                <div className="text-sm space-y-2">
                  <div>
                    {daemonStatus
                      ? daemonStatus.running
                        ? `Running in ${daemonStatus.mode ?? 'watch'} mode${daemonStatus.commitTracking ? ' with commit tracking' : ''}${daemonStatus.pids.length > 0 ? ` (PID ${daemonStatus.pids.join(', ')})` : ''}`
                        : 'Not running'
                      : 'Status unknown'}
                  </div>
                  {daemonError && (
                    <div className="text-xs text-red-500">{daemonError}</div>
                  )}
<Tooltip content="Open the daemon log viewer">
                    <button onClick={() => setShowDaemonLogs(true)} className="btn btn-secondary text-xs">
                      View Daemon Logs
                    </button>
</Tooltip>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'general' && (
            <div className="space-y-6">
              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">
                  Run on startup
                </h3>
                <label className="flex items-center gap-2 cursor-pointer py-1">
                  <Toggle
                    checked={runOnStartup === true}
                    onChange={(checked) => void setRunOnStartup(checked)}
                    ariaLabel="Run on startup"
                  />
                  <span className="text-xs leading-[1.5] text-[var(--text-muted)]">
                    {runOnStartup === true
                      ? 'On — Lucid launches when you log in to your Mac.'
                      : 'Off — Lucid only launches when you open it. Nothing starts on its own.'}
                  </span>
                </label>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">
                  Startup Directory
                </h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="input"
                    value={settings.startupDirectory}
                    onChange={(e) => updateSetting('startupDirectory', e.target.value)}
                    placeholder="Default: Home directory"
                  />
<Tooltip content="Choose the startup directory">
                    <button
                      onClick={async () => {
                        const dir = await window.lucidAPI.fs.selectDirectory();
                        // Track + diagnose the folder picker:
                        // WHEN it opened and WHY (the user chose
                        // the startup directory here).
                        // (Gary, 2026-11-08 — track when + why.)
                        useEventLogStore.getState().logDirectoryDialog(
                          'Settings — choose the startup directory',
                          dir ? 'completed' : 'cancelled',
                        );
                        if (dir) updateSetting('startupDirectory', dir);
                      }}
                      className="btn btn-secondary"
                    >
                      Browse
                    </button>
</Tooltip>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">
                  Explorer root
                </h3>
                <p className="text-xs leading-[1.5] text-[var(--text-muted)] mb-2">
                  The folder the file explorer opens at startup. Empty means automatic: your last workspace folder, else your home directory. Opening a folder from the sidebar does not change this.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="input"
                    value={settings.explorerRoot ?? ''}
                    onChange={(e) => updateSetting('explorerRoot', e.target.value || null)}
                    placeholder="Automatic — last workspace, else home"
                  />
                  <Tooltip content="Choose the explorer root">
                    <button
                      onClick={async () => {
                        const dir = await window.lucidAPI.fs.selectDirectory();
                        // Track + diagnose the folder picker:
                        // WHEN it opened and WHY (the user chose
                        // the explorer root here).
                        // (Gary, 2026-11-08 — track when + why.)
                        useEventLogStore.getState().logDirectoryDialog(
                          'Settings — choose the explorer root',
                          dir ? 'completed' : 'cancelled',
                        );
                        if (dir) updateSetting('explorerRoot', dir);
                      }}
                      className="btn btn-secondary"
                    >
                      Browse
                    </button>
                  </Tooltip>
                  <Tooltip content="Clear — back to automatic">
                    <button
                      onClick={() => updateSetting('explorerRoot', null)}
                      disabled={!settings.explorerRoot}
                      className="btn btn-secondary"
                    >
                      Clear
                    </button>
                  </Tooltip>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">
                  Dev mode
                </h3>
                <label className="flex items-center gap-2 cursor-pointer py-1">
                  <Toggle
                    checked={settings.devMode === true}
                    onChange={(checked) => updateSetting('devMode', checked)}
                    ariaLabel="Dev mode"
                  />
                  <span className="text-xs leading-[1.5] text-[var(--text-muted)]">
                    {settings.devMode === true
                      ? 'On — the prompt bar is delinked from the terminal screen: a detached command bar in the prompt section runs slash commands and one-shot shell commands into its own dev console, and the terminal screen runs independently. Clicking the prompt section does not focus the terminal. Works with LuciferAI on or off.'
                      : 'Off — the prompt bar and the terminal are topology-synced: clicking anywhere in the prompt section focuses the terminal, so typing always lands in the shell (Warp-style, one input, one screen). Turn it on to delink the bar for troubleshooting, or run /devmode on in the terminal.'}
                  </span>
                </label>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">
                  Editor
                </h3>
                <p className="text-xs leading-[1.5] text-[var(--text-muted)] mb-2">
                  Kite&apos;s editor toggles (Atom steal #15): each takes effect immediately, without a reload.
                </p>
                <label className="flex items-center gap-2 cursor-pointer py-1">
                  <Toggle
                    checked={settings.editorCompletionsEnabled !== false}
                    onChange={(checked) => updateSetting('editorCompletionsEnabled', checked)}
                    ariaLabel="Code completions"
                  />
                  <span className="text-xs leading-[1.5] text-[var(--text-muted)]">
                    Code completions — the merged completion list in the editor (language server, snippets, patterns, structure, words).
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer py-1">
                  <Toggle
                    checked={settings.editorSignatureHelpEnabled !== false}
                    onChange={(checked) => updateSetting('editorSignatureHelpEnabled', checked)}
                    ariaLabel="Signature help"
                  />
                  <span className="text-xs leading-[1.5] text-[var(--text-muted)]">
                    Signature help — the parameter popup while calling a function.
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer py-1">
                  <Toggle
                    checked={settings.editorHoverEnabled !== false}
                    onChange={(checked) => updateSetting('editorHoverEnabled', checked)}
                    ariaLabel="Hover"
                  />
                  <span className="text-xs leading-[1.5] text-[var(--text-muted)]">
                    Hover — type and documentation on hover, with the Docs link.
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer py-1">
                  <Toggle
                    checked={settings.docsPanelEnabled !== false}
                    onChange={(checked) => updateSetting('docsPanelEnabled', checked)}
                    ariaLabel="Docs panel"
                  />
                  <span className="text-xs leading-[1.5] text-[var(--text-muted)]">
                    Docs panel — the Docs sidebar panel and its toolbar icon. Off hides both; a hover Docs link does nothing while off.
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer py-1">
                  <Toggle
                    checked={settings.projectSearchEnabled === true}
                    onChange={(checked) => updateSetting('projectSearchEnabled', checked)}
                    ariaLabel="Find in Project"
                  />
                  <span className="text-xs leading-[1.5] text-[var(--text-muted)]">
                    Find in Project — project find-and-replace over ripgrep (⌘⇧F). Off until enabled; the panel shows an opt-in card until then.
                  </span>
                </label>
                <p className="text-xs leading-[1.5] text-[var(--text-muted)] mb-2 mt-3">
                  Brackets, rulers, whitespace, autosave (Atom steal #20): each takes effect immediately, without a reload.
                </p>
                <label className="flex items-center gap-2 cursor-pointer py-1">
                  <Toggle
                    checked={settings.editorAutoClosingBrackets !== false}
                    onChange={(checked) => updateSetting('editorAutoClosingBrackets', checked)}
                    ariaLabel="Auto-close brackets"
                  />
                  <span className="text-xs leading-[1.5] text-[var(--text-muted)]">
                    Auto-close brackets — typing an opening bracket or quote inserts its pair, with the cursor inside.
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer py-1">
                  <Toggle
                    checked={settings.editorAutoSurround !== false}
                    onChange={(checked) => updateSetting('editorAutoSurround', checked)}
                    ariaLabel="Auto-surround selection"
                  />
                  <span className="text-xs leading-[1.5] text-[var(--text-muted)]">
                    Auto-surround selection — typing a bracket or quote around a selection wraps it instead of replacing it.
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer py-1">
                  <Toggle
                    checked={settings.editorMatchBrackets !== false}
                    onChange={(checked) => updateSetting('editorMatchBrackets', checked)}
                    ariaLabel="Highlight matching brackets"
                  />
                  <span className="text-xs leading-[1.5] text-[var(--text-muted)]">
                    Highlight matching brackets — the pair enclosing the cursor is highlighted.
                  </span>
                </label>
                <label className="flex items-center gap-2 py-1">
                  <span className="text-xs leading-[1.5] text-[var(--text-muted)] w-40 shrink-0">
                    Wrap guides (columns)
                  </span>
                  <input
                    type="text"
                    value={(settings.editorRulers ?? []).join(', ')}
                    onChange={(e) =>
                      updateSetting('editorRulers', parseRulers(e.target.value))
                    }
                    placeholder="80, 120"
                    aria-label="Wrap guide columns"
                    className="flex-1 min-w-0 bg-transparent border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] outline-none"
                  />
                  <span className="text-xs leading-[1.5] text-[var(--text-muted)]">
                    Vertical lines at these columns, e.g. 80, 120. Empty means none.
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer py-1">
                  <Toggle
                    checked={settings.editorTrimTrailingWhitespaceOnSave === true}
                    onChange={(checked) =>
                      updateSetting('editorTrimTrailingWhitespaceOnSave', checked)
                    }
                    ariaLabel="Trim trailing whitespace on save"
                  />
                  <span className="text-xs leading-[1.5] text-[var(--text-muted)]">
                    Trim trailing whitespace on save — strips trailing spaces and tabs when a file saves. Markdown hard breaks (lines ending in 2+ spaces) are preserved.
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer py-1">
                  <Toggle
                    checked={settings.editorEnsureTrailingNewlineOnSave === true}
                    onChange={(checked) =>
                      updateSetting('editorEnsureTrailingNewlineOnSave', checked)
                    }
                    ariaLabel="Ensure single trailing newline on save"
                  />
                  <span className="text-xs leading-[1.5] text-[var(--text-muted)]">
                    Ensure single trailing newline on save — a saved file ends with exactly one newline.
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer py-1">
                  <Toggle
                    checked={settings.editorAutosave === true}
                    onChange={(checked) => updateSetting('editorAutosave', checked)}
                    ariaLabel="Autosave on window blur"
                  />
                  <span className="text-xs leading-[1.5] text-[var(--text-muted)]">
                    Autosave on window blur — dirty files save when the window loses focus. Off by default; a save meant to be discarded stays discarded until you save it yourself.
                  </span>
                </label>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">
                  Import / Export
                </h3>
                <div className="flex gap-2">
<Tooltip content="Download settings as JSON">
                    <button onClick={handleExport} className="btn btn-secondary">
                      <Download size={16} />
                      Export Settings
                    </button>
</Tooltip>
<Tooltip content="Import settings from a JSON file">
                    <button onClick={handleImport} className="btn btn-secondary">
                      <Upload size={16} />
                      Import Settings
                    </button>
</Tooltip>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">
                  Profile
                </h3>
                <p className="text-xs leading-[1.5] text-[var(--text-muted)] mb-2">
                  Signed in as {activeProfile?.name ?? '—'}
                  {activeProfile ? ` (${activeProfile.status})` : ''}. Logging out
                  returns to the Profiles screen — your profile and its data stay saved.
                </p>
                <div className="flex gap-2">
                  <Tooltip content="Log out of the current profile">
                    <button
                      onClick={handleLogoutClick}
                      disabled={!activeProfile}
                      data-testid="general-logout-button"
                      className="btn btn-secondary"
                    >
                      Log out of {activeProfile?.name ?? 'profile'}
                    </button>
                  </Tooltip>
                </div>
                <label className="flex items-center gap-2 cursor-pointer py-1 mt-2">
                  <Toggle
                    checked={activeProfile ? activeProfile.skipLogoutConfirm !== true : true}
                    onChange={(checked) =>
                      activeProfile && setSkipLogoutConfirm(activeProfile.id, !checked)
                    }
                    disabled={!activeProfile}
                    ariaLabel="Ask before logging out"
                  />
                  <span className="text-xs leading-[1.5] text-[var(--text-muted)]">
                    Ask before logging out — {activeProfile?.skipLogoutConfirm === true
                      ? 'Off — logging out skips the confirmation. Turn this back on to ask again.'
                      : 'On — Lucid asks before logging out of a profile.'}
                  </span>
                </label>
              </section>
            </div>
          )}
          {activeTab === 'permissions' && (<PermissionsTab />)}
          {activeTab === 'agent-permissions' && (<AgentPermissionsTab />)}
          {activeTab === 'security' && (<SecurityTab />)}
          {activeTab === 'memory' && (<MemoryTab />)}
          {activeTab === 'profile' && (<ProfileTab />)}
        </div>
      </div>

      {/* Logout confirmation (Gary, 2026-11-16): "Are you sure?"
          before logging out of a profile. A guest session is
          ephemeral — the prompt says its chats and terminal history
          are discarded. "Don't ask again" saves the choice to this
          profile only; it can be turned back on in General
          ("Ask before logging out"). */}
      {logoutConfirmOpen && activeProfile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-secondary)] rounded-lg w-[480px] max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <h3 className="font-semibold">Log out of {activeProfile.name}?</h3>
              <Tooltip content="Close">
                <button
                  onClick={() => setLogoutConfirmOpen(false)}
                  className="btn-ghost p-1 rounded"
                >
                  <X size={18} />
                </button>
              </Tooltip>
            </div>
            <div className="p-4 space-y-3">
              {isGuestProfile(activeProfile) ? (
                <p className="text-sm text-[var(--text-muted)]">
                  Are you sure? All unsaved data will be lost. Guest is a
                  fresh, temporary session — logging out ends it and discards
                  the guest&apos;s chats and terminal history. Your saved
                  profiles and their data are untouched.
                </p>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">
                  You&apos;ll go back to the Profiles screen. {activeProfile.name}&apos;s chats,
                  history and settings are saved — pick the profile again to come back.
                </p>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={logoutDontAskAgain}
                  onChange={(e) => setLogoutDontAskAgain(e.target.checked)}
                  data-testid="logout-dont-ask-again"
                />
                <span className="text-xs text-[var(--text-muted)]">
                  Don&apos;t ask again — you can turn the confirmation back on in Settings &gt; General.
                </span>
              </label>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-[var(--border)]">
              <Tooltip content="Stay signed in">
                <button
                  onClick={() => setLogoutConfirmOpen(false)}
                  data-testid="logout-cancel-button"
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
              </Tooltip>
              <Tooltip content="Log out of this profile">
                <button
                  onClick={handleLogoutConfirm}
                  data-testid="logout-confirm-button"
                  className="btn btn-primary"
                >
                  Log out
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      )}

      {/* Custom Theme Editor Modal */}
      {showCustomThemeEditor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-secondary)] rounded-lg w-[600px] max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <h3 className="font-semibold">Custom Theme Editor</h3>
<Tooltip content="Close the theme editor">
                <button
                  onClick={() => setShowCustomThemeEditor(false)}
                  className="btn-ghost p-1 rounded"
                >
                  <X size={18} />
                </button>
</Tooltip>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: 'bgPrimary', label: 'Background Primary' },
                  { key: 'bgSecondary', label: 'Background Secondary' },
                  { key: 'bgTertiary', label: 'Background Tertiary' },
                  { key: 'textPrimary', label: 'Text Primary' },
                  { key: 'textSecondary', label: 'Text Secondary' },
                  { key: 'textMuted', label: 'Text Muted' },
                  { key: 'accent', label: 'Accent' },
                  { key: 'accentHover', label: 'Accent Hover' },
                  { key: 'border', label: 'Border' },
                  { key: 'success', label: 'Success' },
                  { key: 'warning', label: 'Warning' },
                  { key: 'error', label: 'Error' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={((customTheme.colors as unknown) as Record<string, string>)[key]}
                      onChange={(e) => updateCustomThemeColor(key, e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer"
                    />
                    <span className="text-sm">{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-[var(--border)]">
<Tooltip content="Discard theme changes">
                <button
                  onClick={() => setShowCustomThemeEditor(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
</Tooltip>
<Tooltip content="Save and apply the custom theme">
                <button onClick={handleSaveCustomTheme} className="btn btn-primary">
                  Apply Theme
                </button>
</Tooltip>
            </div>
          </div>
        </div>
      )}

      {/* Daemon Log Viewer */}
      {showDaemonLogs && <DaemonLogViewer onClose={() => setShowDaemonLogs(false)} />}
    </div>
  );
}

export default SettingsPanel;
