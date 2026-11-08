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
  Volume2,
  Pause,
} from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAIStore } from '../../stores/aiStore';
import { themes, fullGlassTheme, isThemeUnlocked, createDefaultCustomTheme } from '../../themes/themes';
import { Theme } from '../../types';
import { ProcessingGlowSettings } from '../Terminal/ProcessingGlow';
import { ModelInstaller } from './ModelInstaller';
import { ModulesTab } from '../Modules/ModulesTab';
import { ForgeView } from '../Forge/ForgeView';
import { TOOLBAR_PLUGINS } from '../../data/toolbarPlugins';
import { PLUGIN_ADDONS, isAddonInstalled, addonAnchorLabel } from '../../data/pluginAddons';
import { AddonVoiceButton } from './AddonVoiceButton';
import { DEVICES_PLUGIN } from '../../data/devices';
import { MODULES_PLUGIN } from '../../data/modules';
import { CUSTOM_PLUGINS, CUSTOM_PLUGIN_FALLBACK_ICON, resolvePluginIcon, isCustomPluginEnabled } from '../../data/customPlugins';
import { COMMAND_CATEGORIES, searchCommandCatalogue } from '../../data/commands';
import { useDevicesStore } from '../../stores/devicesStore';
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

type SettingsTab = 'appearance' | 'terminal' | 'ai' | 'customization' | 'models' | 'daemon' | 'general' | 'plugins' | 'devices' | 'forge' | 'modules' | 'permissions';

function SettingsPanel({ onClose, initialTab, onOpenPersonaPlex }: SettingsPanelProps) {
  const {
    settings,
    currentTheme,
    setTheme,
    setCustomTheme,
    updateSetting,
    hasApiKey,
    setApiKey,
    deleteApiKey,
    hasPingKey,
    setPingKey,
    deletePingKey,
    exportSettings,
    importSettings,
  } = useSettingsStore();
  // The LuciferAI disable rule: the Synth / AI Chat toolbar toggles
  // below cannot be switched on while the plugin is off, and the
  // LuciferAI row's own switch is what turns it off.
  const luciferAiEnabled = isLuciferAiEnabled(settings);
  // Add-on settings (Gary, 2026-11-06): every installed add-on gets
  // a Settings button that opens that add-on's settings. Persona Plex
  // opens its setup page; Android Connect and Segments open their
  // anchor plugin's tab (Devices / Modules); an add-on with no
  // settings page yet just says so (no invented page).
  const { info: toastInfo } = useToastStore();
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
    toastInfo(`No settings yet for ${addonName}.`);
  };

  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab ?? 'appearance');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [pingKeyInput, setPingKeyInput] = useState('');
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
    { id: 'customization', label: 'Customization', icon: <Sliders size={18} /> },
    { id: 'plugins', label: 'Plugins', icon: <Puzzle size={18} /> },
    { id: 'devices', label: 'Devices', icon: <Usb size={18} /> },
    { id: 'forge', label: 'Forge', icon: <Hammer size={18} /> },
    { id: 'modules', label: 'Modules', icon: <Boxes size={18} /> },
    { id: 'models', label: 'Models', icon: <Package size={18} /> },
    { id: 'terminal', label: 'Terminal', icon: <Terminal size={18} /> },
    { id: 'ai', label: 'AI', icon: <Sparkles size={18} /> },
    { id: 'daemon', label: 'Daemon', icon: <Eye size={18} /> },
    { id: 'general', label: 'General', icon: <Settings size={18} /> },
    { id: 'permissions', label: 'Permissions', icon: <Shield size={18} /> },
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
                  <span className="text-xs text-[var(--text-muted)]">Referral + purchase tier reward</span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mb-3">
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
                  <div className="text-xs text-[var(--text-secondary)] space-y-1 mb-3">
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
                <p className="text-xs text-[var(--text-muted)] mt-1">Number of lines to keep in history</p>
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
                <p className="text-xs text-[var(--text-muted)] mb-3">
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
                              <span className="text-xs text-[var(--text-muted)]">{entry.description}</span>
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
                <p className="text-xs text-[var(--text-muted)] mb-3">
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
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Lower = more focused, Higher = more creative
                </p>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Ping Server (test)</h3>
                <p className="text-xs text-[var(--text-muted)] mb-3">
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
                <p className="text-xs text-[var(--text-muted)] mt-1">
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
                <p className="text-xs text-[var(--text-muted)] mb-3">
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
                            <span className="block text-xs text-[var(--text-muted)]">{plugin.description}</span>
                          </span>
                        </label>
</Tooltip>
                    );
                  })}
                  <div className="flex items-start gap-3">
                    <Bot size={18} className="text-[var(--text-muted)] shrink-0 mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm">LuciferAI</span>
                      <span className="block text-xs text-[var(--text-muted)]">
                        The plugin itself — local AI backend, command passes, FixNet. The Synth shell and blood drop above are its surfaces.
                      </span>
                      <label className="flex items-center gap-2 cursor-pointer mt-2">
                        <Toggle
                          checked={luciferAiEnabled}
                          onChange={(checked) => updateSetting('luciferAiEnabled', checked)}
                        />
                        <span className="text-xs text-[var(--text-muted)]">
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
                      <span className="block text-xs text-[var(--text-muted)]">
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
                      <span className="block text-xs text-[var(--text-muted)]">
                        {MODULES_PLUGIN.description}
                      </span>
                    </span>
                    <span className="text-xs text-[var(--text-muted)] shrink-0">
                      Built-in · Anchored
                    </span>
                  </div>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-2">
                  Toggled-on plugins show as buttons in the icon bar, in the section above Settings. Applies right away, no restart needed. LuciferAI is always built in — its switch is on its row above: turning it off disables the plugin entirely.
                </p>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Custom plugins</h3>
                <p className="text-xs text-[var(--text-muted)] mb-3">
                  User-registered plugins (see src/data/customPlugins.ts). A plugin appears here once it is registered — give it an id, a name, a description and an icon (a lucide icon, an emoji, or an image file/URL).
                </p>
                <div className="space-y-3">
                  {CUSTOM_PLUGINS.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)]">
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
                            <span className="block text-xs text-[var(--text-muted)]">{plugin.description}</span>
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Add-ons</h3>
                <p className="text-xs text-[var(--text-muted)] mb-3">
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
                          <span className="block text-xs text-[var(--text-muted)]">
                            {addon.description}
                            {addon.removable ? ' Removable once installed.' : ''}
                          </span>
                        </span>
                        <AddonVoiceButton addonId={addon.id} addonName={addon.name} />
                        {installed ? (
                          <>
                            <span className="text-xs text-[var(--text-muted)] shrink-0">
                              Installed{anchorLabel ? ` · ${anchorLabel}` : ''}
                            </span>
                            <button data-addon-settings={addon.id}
                              onClick={() => handleAddonSettings(addon.id, addon.name)}
                              className="btn btn-secondary text-xs shrink-0"
                              title={`Open ${addon.name} settings`}
                            >
                              Settings
                            </button>
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
                <p className="text-xs text-[var(--text-muted)] mb-3">
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
                        <span className="block text-xs text-[var(--text-muted)]">
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
                        <span className="block text-xs text-[var(--text-muted)]">
                          {device.kind === 'android'
                            ? `Android · ${device.id}`
                            : `USB${device.vendorName ? ` · ${device.vendorName}` : ''}${device.vendorId ? ` · ${device.vendorId}` : ''}${device.productId ? ` / ${device.productId}` : ''}`}
                        </span>
                      </span>
                      <span className="text-xs text-[var(--text-muted)] shrink-0">{device.status}</span>
                    </div>
                  ))}
                  {!devicesState.loading && devicesState.devices.length === 0 && (
                    <p className="text-xs text-[var(--text-muted)]">
                      No USB or Android devices detected. Connect one and press Refresh.
                    </p>
                  )}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Add-ons</h3>
                <p className="text-xs text-[var(--text-muted)] mb-3">
                  Android Connect is installed automatically with the Devices anchor plugin — it is how Android devices are detected.
                </p>
                <div className="space-y-3">
                  {PLUGIN_ADDONS.filter((addon) => addon.anchor === 'devices').map((addon) => (
                    <div key={addon.id} className="flex items-center gap-3">
                      <Puzzle size={18} className="text-[var(--text-muted)] shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm">{addon.name}</span>
                        <span className="block text-xs text-[var(--text-muted)]">{addon.description}</span>
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
                  <div className="text-xs text-[var(--text-muted)] pl-6">
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
                  <div className="text-xs text-[var(--text-muted)] pl-6">
                    On = the watcher logs each new commit in a watched git repo (see Daemon Logs below). Off = commits are ignored. The watcher only reads HEAD — it never commits anything itself.
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-3 text-[var(--text-secondary)]">Watched Directories</h3>
                <div className="space-y-2">
                  <div className="text-xs text-[var(--text-muted)] mb-2">
                    Directories being monitored for changes
                  </div>
                  {watchPaths.length === 0 ? (
                    <div className="text-xs text-[var(--text-muted)]">No directories watched yet.</div>
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
                  Dev mode
                </h3>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Toggle
                    checked={settings.devMode === true}
                    onChange={(checked) => updateSetting('devMode', checked)}
                    ariaLabel="Dev mode"
                  />
                  <span className="text-xs text-[var(--text-muted)]">
                    {settings.devMode === true
                      ? 'On — the prompt bar is delinked from the terminal screen: a detached command bar in the prompt section runs slash commands and one-shot shell commands into its own dev console, and the terminal screen runs independently. Clicking the prompt section does not focus the terminal. Works with LuciferAI on or off.'
                      : 'Off — the prompt bar and the terminal are topology-synced: clicking anywhere in the prompt section focuses the terminal, so typing always lands in the shell (Warp-style, one input, one screen). Turn it on to delink the bar for troubleshooting, or run /devmode on in the terminal.'}
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
            </div>
          )}
          {activeTab === 'permissions' && (<PermissionsTab />)}
        </div>
      </div>

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
