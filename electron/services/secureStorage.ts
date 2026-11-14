import { safeStorage } from 'electron';
import Store from 'electron-store';
import type { GoogleDriveTokens } from './googleDriveOAuth';

/**
 * Resilient store construction.
 *
 * electron-store writes its file during construction (and on every set).
 * When the app data folder is read-only (locked-down machine, read-only
 * user-data dir) that write throws EROFS and the main process dies before
 * any window opens. So every store is wrapped in a ResilientStore: on any
 * failure it falls back to an in-memory copy, the app keeps running, and
 * the renderer is told (settings:getStorageStatus) so it can warn that
 * changes will not persist.
 */

interface SimpleStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  has(key: string): boolean;
  delete(key: string): void;
  clear(): void;
  readonly store: Record<string, unknown>;
}

class MemoryStore implements SimpleStore {
  private data: Record<string, unknown>;

  constructor(defaults: Record<string, unknown> = {}) {
    this.data = { ...defaults };
  }

  get(key: string): unknown {
    return this.data[key];
  }

  set(key: string, value: unknown): void {
    this.data[key] = value;
  }

  has(key: string): boolean {
    return key in this.data;
  }

  delete(key: string): void {
    delete this.data[key];
  }

  clear(): void {
    this.data = {};
  }

  get store(): Record<string, unknown> {
    return { ...this.data };
  }
}

class ResilientStore implements SimpleStore {
  private inner: SimpleStore;
  private readonly name: string;
  degraded = false;
  reason: string | null = null;

  constructor(name: string, defaults: Record<string, unknown> = {}) {
    this.name = name;
    try {
      this.inner = new Store<Record<string, unknown>>({
        name,
        defaults,
      }) as unknown as SimpleStore;
    } catch (error) {
      this.inner = new MemoryStore(defaults);
      this.degrade(error);
    }
  }

  private degrade(error: unknown): void {
    if (this.degraded) return;
    this.degraded = true;
    this.reason = error instanceof Error ? error.message : String(error);
    console.error(
      `[Storage] Store "${this.name}" unavailable — running in-memory. Changes will not persist. ${this.reason}`
    );
  }

  private snapshot(): Record<string, unknown> {
    try {
      return { ...this.inner.store };
    } catch {
      return {};
    }
  }

  private swapToMemory(error: unknown): void {
    const snapshot = this.snapshot();
    this.inner = new MemoryStore(snapshot);
    this.degrade(error);
  }

  get(key: string): unknown {
    try {
      return this.inner.get(key);
    } catch (error) {
      this.swapToMemory(error);
      return this.inner.get(key);
    }
  }

  set(key: string, value: unknown): void {
    try {
      this.inner.set(key, value);
    } catch (error) {
      this.swapToMemory(error);
      this.inner.set(key, value);
    }
  }

  has(key: string): boolean {
    try {
      return this.inner.has(key);
    } catch (error) {
      this.swapToMemory(error);
      return this.inner.has(key);
    }
  }

  delete(key: string): void {
    try {
      this.inner.delete(key);
    } catch (error) {
      this.swapToMemory(error);
      this.inner.delete(key);
    }
  }

  clear(): void {
    try {
      this.inner.clear();
    } catch (error) {
      this.swapToMemory(error);
      this.inner.clear();
    }
  }

  get store(): Record<string, unknown> {
    try {
      return this.inner.store;
    } catch (error) {
      this.swapToMemory(error);
      return this.inner.store;
    }
  }
}

// Store for encrypted data
const secureStore = new ResilientStore('lucid-secure');

// Store for regular settings
const settingsStore = new ResilientStore('lucid-settings', {
  theme: 'dark',
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
  pingServerEnabled: false,
  pingServerEndpoint: 'http://127.0.0.1:8787',
  pingServerUserId: '',
  terminalPolicy: 'ask', // 'ask', 'auto', 'deny'
  customTheme: null,
});

/** True when either store fell back to memory (settings will not persist). */
export function isStorageDegraded(): boolean {
  return secureStore.degraded || settingsStore.degraded;
}

export function getStorageDegradedReason(): string | null {
  return settingsStore.reason || secureStore.reason;
}

export const secureStorage = {
  /**
   * Store a secret securely using OS-level encryption (DPAPI on Windows)
   */
  setSecret(key: string, value: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure storage is not available on this system');
    }
    const encrypted = safeStorage.encryptString(value);
    secureStore.set(key, encrypted.toString('base64'));
  },

  /**
   * Retrieve a secret
   */
  getSecret(key: string): string | null {
    const encrypted = secureStore.get(key) as string | undefined;
    if (!encrypted) return null;

    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure storage is not available on this system');
    }

    try {
      const buffer = Buffer.from(encrypted, 'base64');
      return safeStorage.decryptString(buffer);
    } catch {
      return null;
    }
  },

  /**
   * Check if a secret exists
   */
  hasSecret(key: string): boolean {
    return secureStore.has(key);
  },

  /**
   * Delete a secret
   */
  deleteSecret(key: string): void {
    secureStore.delete(key);
  },

  /**
   * Check if encryption is available
   */
  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  },
};

export const settings = {
  get<T>(key: string): T | undefined {
    return settingsStore.get(key) as T | undefined;
  },

  set(key: string, value: unknown): void {
    settingsStore.set(key, value);
  },

  getAll(): Record<string, unknown> {
    return settingsStore.store;
  },

  delete(key: string): void {
    settingsStore.delete(key);
  },

  reset(): void {
    settingsStore.clear();
  },

  export(): string {
    return JSON.stringify(settingsStore.store, null, 2);
  },

  import(data: string): void {
    try {
      const parsed = JSON.parse(data);
      Object.entries(parsed).forEach(([key, value]) => {
        settingsStore.set(key, value);
      });
    } catch {
      throw new Error('Invalid settings data');
    }
  },
};

// API Key specific helpers
export const apiKeyStorage = {
  setApiKey(key: string): void {
    secureStorage.setSecret('openai-api-key', key);
  },

  getApiKey(): string | null {
    return secureStorage.getSecret('openai-api-key');
  },

  hasApiKey(): boolean {
    return secureStorage.hasSecret('openai-api-key');
  },

  deleteApiKey(): void {
    secureStorage.deleteSecret('openai-api-key');
  },

};

// Ping server key (test path) — the shared secret for the Cloudflare
// ping server Worker, stored encrypted like the API key.
export const pingKeyStorage = {
  setPingKey(key: string): void {
    secureStorage.setSecret('ping-server-key', key);
  },

  getPingKey(): string | null {
    return secureStorage.getSecret('ping-server-key');
  },

  hasPingKey(): boolean {
    return secureStorage.hasSecret('ping-server-key');
  },

  deletePingKey(): void {
    secureStorage.deleteSecret('ping-server-key');
  },

};

// GitHub Copilot key — Gary's own Copilot key for the copilot
// tab's GitHub Copilot model, entered by Gary himself in
// Settings > AI and stored encrypted like the API key. The
// key is never hardcoded, never logged, never written to a
// file outside the OS keychain. (The Copilot connection
// itself lands in a later build — D9 is still open — so a
// saved key does not make a Copilot copilot run yet.)
export const copilotApiKeyStorage = {
  setCopilotApiKey(key: string): void {
    secureStorage.setSecret('github-copilot-key', key);
  },

  getCopilotApiKey(): string | null {
    return secureStorage.getSecret('github-copilot-key');
  },

  hasCopilotApiKey(): boolean {
    return secureStorage.hasSecret('github-copilot-key');
  },

  deleteCopilotApiKey(): void {
    secureStorage.deleteSecret('github-copilot-key');
  },

};

// Telegram bot token — the Bot API token for the user's own bot
// (created in BotFather), stored encrypted like the API key and
// the ping key. The renderer only ever sees whether one is stored
// (hasTelegramBotToken); the token itself never crosses into
// plain Settings.
export const telegramBotTokenStorage = {
  setTelegramBotToken(token: string): void {
    secureStorage.setSecret('telegram-bot-token', token);
  },

  getTelegramBotToken(): string | null {
    return secureStorage.getSecret('telegram-bot-token');
  },

  hasTelegramBotToken(): boolean {
    return secureStorage.hasSecret('telegram-bot-token');
  },

  deleteTelegramBotToken(): void {
    secureStorage.deleteSecret('telegram-bot-token');
  },

};

// Stripe API key - the key for the user's own Stripe account
// (created in the Stripe Dashboard; a restricted key is best,
// a full secret key also works), stored encrypted like the API
// key, the ping key and the Telegram bot token. The renderer
// only ever sees whether one is stored (hasStripeApiKey); the
// key itself never crosses into plain Settings.
export const stripeApiKeyStorage = {
  setStripeApiKey(key: string): void {
    secureStorage.setSecret('stripe-api-key', key);
  },

  getStripeApiKey(): string | null {
    return secureStorage.getSecret('stripe-api-key');
  },

  hasStripeApiKey(): boolean {
    return secureStorage.hasSecret('stripe-api-key');
  },

  deleteStripeApiKey(): void {
    secureStorage.deleteSecret('stripe-api-key');
  },

};

// Kaggle API key - the key for the user's own Kaggle account
// (created on kaggle.com, Settings → API → Create New Token),
// stored encrypted like the API key, the ping key, the Telegram
// bot token and the Stripe key. The renderer only ever sees
// whether one is stored (hasKaggleApiKey); the key itself never
// crosses into plain Settings. Bring your own account (Gary,
// 2026-11-12): the key belongs to whoever connects it, and jobs
// spend that account's own GPU quota — never anyone else's, and
// never Gary's. Gary's Kaggle account appears nowhere here.
export const kaggleApiKeyStorage = {
  setKaggleApiKey(key: string): void {
    secureStorage.setSecret('kaggle-api-key', key);
  },

  getKaggleApiKey(): string | null {
    return secureStorage.getSecret('kaggle-api-key');
  },

  hasKaggleApiKey(): boolean {
    return secureStorage.hasSecret('kaggle-api-key');
  },

  deleteKaggleApiKey(): void {
    secureStorage.deleteSecret('kaggle-api-key');
  },

};

// Google Authenticator TOTP secret — the second factor for the
// Google sign-in (Settings > Security, Gary 2026-11-10 ~05:37
// PST), stored encrypted like the API key, the ping key, the
// Telegram bot token and the Stripe key. The renderer only ever
// sees whether one is stored (hasTotpSecret); the secret itself
// never crosses into plain Settings or the renderer after
// enrollment, and a stored secret is verified in the main
// process (electron/services/totpAuth.ts).
export const totpSecretStorage = {
  setTotpSecret(secret: string): void {
    secureStorage.setSecret('totp-secret', secret);
  },

  getTotpSecret(): string | null {
    return secureStorage.getSecret('totp-secret');
  },

  hasTotpSecret(): boolean {
    return secureStorage.hasSecret('totp-secret');
  },

  deleteTotpSecret(): void {
    secureStorage.deleteSecret('totp-secret');
  },

};

// Google Drive tokens - the access + refresh tokens for the user's
// own Google account (from the OAuth code exchange), stored
// encrypted like the API key, the ping key, the Telegram bot token
// and the Stripe key. The renderer only ever sees whether tokens
// are stored (hasGoogleDriveTokens); the tokens themselves never
// cross into plain Settings or the renderer.
export const googleDriveTokenStorage = {
  setGoogleDriveTokens(tokens: GoogleDriveTokens): void {
    secureStorage.setSecret('google-drive-tokens', JSON.stringify(tokens));
  },

  getGoogleDriveTokens(): GoogleDriveTokens | null {
    const raw = secureStorage.getSecret('google-drive-tokens');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<GoogleDriveTokens>;
      if (
        typeof parsed.accessToken !== 'string' ||
        parsed.accessToken.trim() === '' ||
        typeof parsed.expiresAtMs !== 'number' ||
        !Number.isFinite(parsed.expiresAtMs)
      ) {
        return null;
      }
      return {
        accessToken: parsed.accessToken,
        refreshToken:
          typeof parsed.refreshToken === 'string' ? parsed.refreshToken : null,
        expiresAtMs: parsed.expiresAtMs,
        scope: typeof parsed.scope === 'string' ? parsed.scope : '',
      };
    } catch {
      return null;
    }
  },

  hasGoogleDriveTokens(): boolean {
    return secureStorage.hasSecret('google-drive-tokens');
  },

  deleteGoogleDriveTokens(): void {
    secureStorage.deleteSecret('google-drive-tokens');
  },

};
