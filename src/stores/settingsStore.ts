import { create } from 'zustand';
import { Theme, Settings } from '../types';
import { getTheme, applyTheme, themes, isThemeUnlocked } from '../themes/themes';

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

  // Ping server key actions (test path) — the shared secret for the
  // Cloudflare ping server Worker.
  setPingKey: (key: string) => Promise<void>;
  deletePingKey: () => Promise<void>;
  checkPingKey: () => Promise<void>;
  hasPingKey: boolean;

  // Telegram bot token actions — the Bot API token for the user's
  // own bot, stored encrypted in secureStorage.
  setTelegramBotToken: (token: string) => Promise<void>;
  deleteTelegramBotToken: () => Promise<void>;
  checkTelegramBotToken: () => Promise<void>;
  hasTelegramBotToken: boolean;

  // Stripe API key actions — the key for the user's own Stripe
  // account, stored encrypted in secureStorage.
  setStripeApiKey: (key: string) => Promise<void>;
  deleteStripeApiKey: () => Promise<void>;
  checkStripeApiKey: () => Promise<void>;
  hasStripeApiKey: boolean;
  checkBackendStatus: () => Promise<void>;

  exportSettings: () => Promise<string>;
  importSettings: (data: string) => Promise<void>;
}

const defaultSettings: Settings = {
  // LuciferAI is the default theme (Gary, 2026-11-07) — his color
  // scheme is the one Lucid loads up in. A fresh install (no
  // persisted theme) starts in LuciferAI's colors.
  theme: 'lucifer',
  customTheme: null,
  fontSize: 14,
  fontFamily: 'Consolas',
  shell: 'powershell.exe',
  startupDirectory: '',
  cursorStyle: 'block',
  cursorBlink: true,
  scrollback: 10000,
  bellSound: false,
  // Files mist (Gary, 2026-11-09) — OFF by default: the Files screen
  // shows the solid theme, no mist, unless the Files mist toggle in
  // the Mist section of Settings is flipped on. First toggle in the
  // Mist section; one toggle per surface (see src/types/index.ts).
  filesMist: false,
  aiModel: 'gpt-4',
  aiTemperature: 0.7,
  pingServerEnabled: false,
  pingServerEndpoint: 'http://127.0.0.1:8787',
  pingServerUserId: '',
  googleDriveClientId: '',
  telegramBotUsername: '',
  stripeAccountId: '',
  stripeAccountName: '',
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
  forgeStopColorDuration: { kind: 'seconds', seconds: 3 },
  synthDisclaimerChoice: null,
  synthVersion: null,
  toolbarPlugins: {},
  // Toolbar icon order — empty = the default order (see
  // src/lib/toolbarOrder.ts). Written immediately on drop.
  toolbarOrder: [],
  // Settings tab order — empty = the default order (see
  // src/lib/settingsTabOrder.ts). Written immediately on drop.
  settingsTabOrder: [],
  // Settings tab lock — false = unlocked, tabs can be dragged
  // (see src/types/index.ts).
  settingsTabsLocked: false,
  // Computer-control segment — the lock is the kill-switch (false =
  // unlocked, the phone finger's pattern: a finger starts enabled,
  // Gary locks it explicitly). Protected targets default to Gary's
  // ChatGPT tab (see src/lib/computerControl.ts).
  computerControlLocked: false,
  // Browser finger lock (Phase B) — starts enabled, Gary locks
  // it explicitly (same pattern as computerControlLocked).
  browserFingerLocked: false,
  computerControlProtectedTargets: ['Next Starship Steps'],
  // User-installed add-ons — empty = none installed (see
  // src/types/index.ts). Written immediately on Install.
  installedAddons: [],
  // Persona Plex — empty = no custom personas, no per-persona
  // overrides, no active persona, Speak off (see src/types/index.ts).
  personaPlexCustomPersonas: [],
  personaPlexConfig: {},
  personaPlexActiveId: null,
  personaPlexSpeakEnabled: false,
  // Speak actor — null = no actor picked, Speak defaults to the
  // active Homunculus's voice (see src/lib/personaPlex.ts).
  speakActorVoice: null,
  customPlugins: {},
  luciferAiEnabled: false,
  // Summon variant (Gary, 2026-11-09 ~11:01 PST): no variant
  // remembered yet — the ask runs on every activation until the
  // user checks "don't ask again" with a choice (see
  // src/types/index.ts).
  summonVariant: null,
  summonVariantDontAsk: false,
  // LuciferAI silenced (Gary, 2026-11-08 ~02:28 PST): the blood
  // drop toggle is JUST a silencer — it greys the drop, it never
  // turns the plugin off. Default false (speaking).
  luciferAiSilenced: false,
  // Dev mode — OFF by default: the prompt bar and the terminal
  // stay topology-synced on a fresh startup (Gary, 2026-11-07).
  devMode: false,
  // DEFCON level (Gary, 2026-11-09 — see src/lib/defcon.ts):
  // 1 = NOW, the war zone. Takes effect in NON-devmode (the main
  // Warp-style terminal), where it is visible; devmode is where
  // the levels were understood.
  defconLevel: 1,
  // DEFCON 2 merge reading — null = Gary hasn't picked one yet.
  defconMergeReading: null,
  // Full Glass unlock state (Gary, 2026-11-07) — the referral +
  // active purchase tier reward theme. 0 / false = locked.
  referralCount: 0,
  purchaseTierActive: false,
  // Permission grants — empty = nothing recorded yet (see
  // src/types/index.ts). The live probe is the truth; this is
  // only a memory of what the user once allowed.
  permissionGrants: {},
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: defaultSettings,
  currentTheme: themes[0],
  hasApiKey: false,
  hasPingKey: false,
  hasTelegramBotToken: false,
  hasStripeApiKey: false,
  isLocalBackendAvailable: false,
  isLocalModelAvailable: false,
  storageDegraded: false,
  storageDegradedReason: null,
  isLoading: true,

  loadSettings: async () => {
    try {
      const allSettings = await window.lucidAPI.settings.getAll();
      const hasKey = await window.lucidAPI.settings.hasApiKey();
      const hasPingKey = await window.lucidAPI.settings.hasPingKey();
      const hasTelegramBotToken = await window.lucidAPI.settings.hasTelegramBotToken();
      const hasStripeApiKey = await window.lucidAPI.settings.hasStripeApiKey();

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

      // Light was removed from the theme options (Gary, 2026-11-07) —
      // a persisted 'light' becomes Sunset instead of lingering.
      if (settings.theme === 'light') {
        settings.theme = 'sunset';
        try {
          await window.lucidAPI.settings.set('theme', 'sunset');
        } catch {
          // Persist is best-effort; the in-memory state is already Sunset.
        }
      }

      let theme = settings.customTheme && settings.theme === 'custom'
        ? settings.customTheme
        : getTheme(settings.theme);

      // A gated theme that is no longer unlocked (e.g. Full Glass after
      // a purchase tier lapses) never applies on load — fall back to
      // Dark and persist the fallback so it does not linger.
      if (!isThemeUnlocked(theme, settings)) {
        theme = themes[0];
        settings.theme = themes[0].id;
        try {
          await window.lucidAPI.settings.set('theme', themes[0].id);
        } catch {
          // Persist is best-effort; the in-memory state is already Dark.
        }
      }

      applyTheme(theme);

      // Apply font settings
      document.documentElement.style.setProperty('--font-mono', settings.fontFamily);
      document.documentElement.style.setProperty('--font-size', `${settings.fontSize}px`);

      set({ settings, currentTheme: theme, hasApiKey: hasKey, hasPingKey, hasTelegramBotToken, hasStripeApiKey, isLoading: false });

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
    // Light was removed from the theme options (Gary, 2026-11-07) —
    // no code path can select it; a 'light' request becomes Sunset.
    const effectiveId = themeId === 'light' ? 'sunset' : themeId;
    const theme = getTheme(effectiveId);
    // Full Glass is gated (Gary, 2026-11-07): the referral + active
    // purchase tier reward. A locked theme is never applied or
    // persisted — the request is refused and the current theme stays.
    if (!isThemeUnlocked(theme, get().settings)) {
      console.warn(`Theme '${effectiveId}' is locked (referral + active purchase tier required).`);
      return;
    }
    applyTheme(theme);
    await window.lucidAPI.settings.set('theme', effectiveId);
    set((state) => ({
      settings: { ...state.settings, theme: effectiveId },
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

  setPingKey: async (key) => {
    await window.lucidAPI.settings.setPingKey(key);
    set({ hasPingKey: true });
  },

  deletePingKey: async () => {
    await window.lucidAPI.settings.deletePingKey();
    set({ hasPingKey: false });
  },

  checkPingKey: async () => {
    const hasKey = await window.lucidAPI.settings.hasPingKey();
    set({ hasPingKey: hasKey });
  },

  setTelegramBotToken: async (token) => {
    await window.lucidAPI.settings.setTelegramBotToken(token);
    set({ hasTelegramBotToken: true });
  },

  deleteTelegramBotToken: async () => {
    await window.lucidAPI.settings.deleteTelegramBotToken();
    set({ hasTelegramBotToken: false });
  },

  checkTelegramBotToken: async () => {
    const hasToken = await window.lucidAPI.settings.hasTelegramBotToken();
    set({ hasTelegramBotToken: hasToken });
  },

  setStripeApiKey: async (key) => {
    await window.lucidAPI.settings.setStripeApiKey(key);
    set({ hasStripeApiKey: true });
  },

  deleteStripeApiKey: async () => {
    await window.lucidAPI.settings.deleteStripeApiKey();
    set({ hasStripeApiKey: false });
  },

  checkStripeApiKey: async () => {
    const hasKey = await window.lucidAPI.settings.hasStripeApiKey();
    set({ hasStripeApiKey: hasKey });
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
