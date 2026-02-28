import { create } from 'zustand';
import { Theme, Settings } from '../types';
import { getTheme, applyTheme, themes } from '../themes/themes';

interface SettingsState {
  settings: Settings;
  currentTheme: Theme;
  isLoading: boolean;

  // Actions

  isLocalBackendAvailable: boolean;

  // Actions
  loadSettings: () => Promise<void>;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
  setTheme: (themeId: string) => Promise<void>;
  setCustomTheme: (theme: Theme) => Promise<void>;

  // License Key Actions
  setLicenseKey: (key: string) => Promise<void>;
  deleteLicenseKey: () => Promise<void>;
  checkLicenseKey: () => Promise<void>;
  hasLicenseKey: boolean;

  // Balance
  balance: number | null;
  fetchBalance: () => Promise<void>;
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
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: defaultSettings,
  currentTheme: themes[0],
  hasLicenseKey: false,
  isLocalBackendAvailable: false,
  balance: null,
  isLoading: true,

  loadSettings: async () => {
    try {
      const allSettings = await window.lucidAPI.settings.getAll();
      const hasKey = await window.lucidAPI.settings.hasLicenseKey();

      // Check local backend status
      await get().checkBackendStatus();

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

      set({ settings, currentTheme: theme, hasLicenseKey: hasKey, isLoading: false });

      if (hasKey) {
        await get().fetchBalance();
      }
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

  setLicenseKey: async (key) => {
    await window.lucidAPI.settings.setLicenseKey(key);
    set({ hasLicenseKey: true });
    await get().fetchBalance();
  },

  deleteLicenseKey: async () => {
    await window.lucidAPI.settings.deleteLicenseKey();
    set({ hasLicenseKey: false, balance: null });
  },

  checkLicenseKey: async () => {
    const hasKey = await window.lucidAPI.settings.hasLicenseKey();
    set({ hasLicenseKey: hasKey });
    if (hasKey) await get().fetchBalance();
  },

  fetchBalance: async () => {
    try {
      if (!get().hasLicenseKey) return;
      const balance = await window.lucidAPI.settings.getBalance();
      set({ balance });
    } catch (error) {
      console.error('Failed to fetch balance:', error);
      set({ balance: null });
    }
  },

  checkBackendStatus: async () => {
    try {
      const isAvailable = await window.lucidAPI.ai.checkLocalBackend();
      console.log('Local AI Backend Status:', isAvailable);
      set({ isLocalBackendAvailable: isAvailable });
    } catch (error) {
      console.error('Failed to check local backend:', error);
      set({ isLocalBackendAvailable: false });
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
