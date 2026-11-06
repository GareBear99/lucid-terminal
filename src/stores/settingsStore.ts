import { create } from 'zustand';
import { Theme, Settings } from '../types';
import { getTheme, applyTheme, themes } from '../themes/themes';

interface SettingsState {
  settings: Settings;
  currentTheme: Theme;
  isLoading: boolean;

  // Actions

  isLocalBackendAvailable: boolean;
  // At least one LLM model is actually loaded. The wrapper can be up with
  // no model — that must not read as "backend available" (see
  // checkBackendStatus).
  isLocalModelAvailable: boolean;

  // Settings storage fell back to in-memory (read-only app data dir).
  storageDegraded: boolean;
  storageDegradedReason: string | null;

  // Actions
  loadSettings: () => Promise<void>;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
  setTheme: (themeId: string) => Promise<void>;
  setCustomTheme: (theme: Theme) => Promise<void>;

  // API Key Actions (Tier 5)
  setApiKey: (key: string) => Promise<void>;
  deleteApiKey: () => Promise<void>;
  checkApiKey: () => Promise<void>;
  hasApiKey: boolean;
  checkBackendStatus: () => Promise<void>;

  exportSettings: () => Promise<string>;
  importSettings: (data: string) => Promise<void>;
}

const defaultSettings: Settings = {
  theme: 'dark',
  customTheme: null,
  fontSize: 14,
  fontFamily: 'Consolas',
  shell: 'powershell.exe',
  startupDirectory: '',
  cursorStyle: 'block',
  cursorBlink: true,
  scrollback: 10000,
  bellSound: false,
  aiModel: 'gpt-4',
  aiTemperature: 0.7,
  terminalPolicy: 'ask',
  showValidationSteps: true,
  autoCollapseValidation: true,
  showTokenStats: true,
  showTokenEfficiency: true,
  daemonEnabled: false,
  daemonAutoFix: false,
  daemonCommitTracking: false,
  daemonLogRetention: 30,
  daemonLogVerbosity: 'normal',
  daemonWatchPaths: [],
  processingGlowColor: 'rainbow',
  processingGlowCustomColor: '#0099ff',
  processingGlowIntensity: 0.8,
  processingGlowSpeed: 3,
  gazeSensitivity: 50,
  homunculusColor: null,
  synthDisclaimerChoice: null,
  synthVersion: null,
  toolbarPlugins: {},
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: defaultSettings,
  currentTheme: themes[0],
  hasApiKey: false,
  isLocalBackendAvailable: false,
  isLocalModelAvailable: false,
  storageDegraded: false,
  storageDegradedReason: null,
  isLoading: true,

  loadSettings: async () => {
    try {
      const allSettings = await window.lucidAPI.settings.getAll();
      const hasKey = await window.lucidAPI.settings.hasApiKey();

      // Check local backend status
      await get().checkBackendStatus();

      // Check whether settings storage is writable. A read-only app data
      // dir falls back to an in-memory store (see secureStorage.ts) — the
      // app still runs, but changes will not persist.
      try {
        const storageStatus = await window.lucidAPI.settings.getStorageStatus();
        set({ storageDegraded: storageStatus.degraded, storageDegradedReason: storageStatus.reason });
      } catch {
        // Preload without the status call — assume writable.
      }

      const settings: Settings = {
        ...defaultSettings,
        ...allSettings,
      };

      const theme = settings.customTheme && settings.theme === 'custom'
        ? settings.customTheme
        : getTheme(settings.theme);

      applyTheme(theme);

      // Apply font settings
      document.documentElement.style.setProperty('--font-mono', settings.fontFamily);
      document.documentElement.style.setProperty('--font-size', `${settings.fontSize}px`);

      set({ settings, currentTheme: theme, hasApiKey: hasKey, isLoading: false });

    } catch (error) {
      console.error('Failed to load settings:', error);
      set({ isLoading: false });
    }
  },

  updateSetting: async (key, value) => {
    try {
      await window.lucidAPI.settings.set(key, value);
      set((state) => ({
        settings: { ...state.settings, [key]: value },
      }));

      // Handle special cases
      if (key === 'fontFamily' || key === 'fontSize') {
        const { settings } = get();
        document.documentElement.style.setProperty('--font-mono', settings.fontFamily);
        document.documentElement.style.setProperty('--font-size', `${settings.fontSize}px`);
      }
    } catch (error) {
      console.error(`Failed to update setting ${key}:`, error);
    }
  },

  updateSettings: async (updates) => {
    try {
      await Promise.all(
        (Object.entries(updates) as [keyof Settings, Settings[keyof Settings]][]).map(
          ([key, value]) => window.lucidAPI.settings.set(key, value)
        )
      );
      set((state) => ({
        settings: { ...state.settings, ...updates },
      }));
    } catch (error) {
      console.error('Failed to update settings:', error);
    }
  },

  setTheme: async (themeId) => {
    const theme = getTheme(themeId);
    applyTheme(theme);
    await window.lucidAPI.settings.set('theme', themeId);
    set((state) => ({
      settings: { ...state.settings, theme: themeId },
      currentTheme: theme,
    }));
  },

  setCustomTheme: async (theme) => {
    applyTheme(theme);
    await window.lucidAPI.settings.set('theme', 'custom');
    await window.lucidAPI.settings.set('customTheme', theme);
    set((state) => ({
      settings: { ...state.settings, theme: 'custom', customTheme: theme },
      currentTheme: theme,
    }));
  },

  setApiKey: async (key) => {
    await window.lucidAPI.settings.setApiKey(key);
    set({ hasApiKey: true });
  },

  deleteApiKey: async () => {
    await window.lucidAPI.settings.deleteApiKey();
    set({ hasApiKey: false });
  },

  checkApiKey: async () => {
    const hasKey = await window.lucidAPI.settings.hasApiKey();
    set({ hasApiKey: hasKey });
  },

  checkBackendStatus: async () => {
    try {
      const isAvailable = await window.lucidAPI.ai.checkLocalBackend();
      // The wrapper being up is not enough — a loaded model is what makes
      // the backend usable. Report the two separately so the UI never
      // claims "connected" when no model is loaded.
      let modelAvailable = false;
      try {
        const statuses = await window.lucidAPI.lucid.getModelStatuses();
        modelAvailable = Object.values(statuses || {}).some(Boolean);
      } catch {
        modelAvailable = false;
      }
      console.log(
        `Local AI Backend Status: ${isAvailable
          ? modelAvailable
            ? 'model(s) available'
            : 'wrapper up, no model loaded'
          : 'down'}`
      );
      set({ isLocalBackendAvailable: isAvailable, isLocalModelAvailable: modelAvailable });
    } catch (error) {
      console.error('Failed to check local backend:', error);
      set({ isLocalBackendAvailable: false, isLocalModelAvailable: false });
    }
  },

  exportSettings: async () => {
    return await window.lucidAPI.settings.export();
  },

  importSettings: async (data) => {
    await window.lucidAPI.settings.import(data);
    await get().loadSettings();
  },
}));
