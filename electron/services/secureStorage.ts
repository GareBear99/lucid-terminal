import { safeStorage } from 'electron';
import Store from 'electron-store';

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
