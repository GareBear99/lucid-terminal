import { safeStorage } from 'electron';
import Store from 'electron-store';

// Store for encrypted data
const secureStore = new Store<Record<string, string>>({
  name: 'lucid-secure',
  encryptionKey: 'lucid-terminal-obfuscation', // This just obfuscates, real encryption is via safeStorage
});

// Store for regular settings
const settingsStore = new Store<Record<string, unknown>>({
  name: 'lucid-settings',
  defaults: {
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
  },
});

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
    const encrypted = secureStore.get(key);
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

  // License Key helpers
  setLicenseKey(key: string): void {
    secureStorage.setSecret('lucid-license-key', key);
  },

  getLicenseKey(): string | null {
    return secureStorage.getSecret('lucid-license-key');
  },

  hasLicenseKey(): boolean {
    return secureStorage.hasSecret('lucid-license-key');
  },

  deleteLicenseKey(): void {
    secureStorage.deleteSecret('lucid-license-key');
  },
};
