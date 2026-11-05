import { safeStorage } from 'electron';
import type { WebContents } from 'electron';
import Store from 'electron-store';
import {
  buildFillScript,
  buildReadLoginScript,
  originFromUrl,
} from '../../src/lib/browserCredentials';
import type { PageLoginFields } from '../../src/lib/browserCredentials';
import type {
  BrowserLoginOffer,
  BrowserSavedLogin,
} from '../../src/types';

/**
 * Credential vault for the in-panel browser (Area 3).
 *
 * Logins ONLY — no cards (a separate security decision). One login
 * per origin (the most recent save wins); multi-account origins are
 * a later refinement.
 *
 * Storage: one record per origin in an electron-store file
 * (`lucid-browser-credentials`), with the password encrypted by
 * `safeStorage` (OS keychain: DPAPI on Windows, Keychain on macOS,
 * libsecret on Linux) and stored base64 — exactly the precedent in
 * `electron/services/secureStorage.ts`. When encryption is not
 * available, saving is refused rather than storing plaintext: a
 * vault that cannot encrypt is a vault that does not save.
 *
 * The password NEVER leaves the main process:
 * - fill goes main -> page via `executeJavaScript` (the script
 *   builders live in `src/lib/browserCredentials.ts`);
 * - capture reads the departing page's fields into main memory and
 *   only the origin + username are ever sent to the renderer (the
 *   `browser:login-detected` offer);
 * - the renderer confirms a save by origin + username; main looks
 *   the in-memory candidate up by origin and persists it;
 * - `listLogins` returns origin + username + updatedAt only.
 * Nothing credential-shaped is logged.
 *
 * Capture: when Gary signs in and the page navigates away
 * (`will-navigate`) or changes route in-page (SPA logins,
 * `did-navigate-in-page`), the departing page's fields are read.
 * A filled password field becomes a candidate held in memory
 * (bounded: 20 entries, oldest dropped) until Gary confirms or
 * dismisses it — it is never written to disk unconfirmed. No offer
 * is made when the same username is already saved for the origin
 * (a repeat sign-in is not a new login; a changed password for the
 * same username needs the old login deleted first, in the saved
 * logins panel). Logins that submit via fetch without navigating
 * are not detected — a known gap, not a silent failure: nothing is
 * offered, nothing is saved.
 *
 * Auto-fill: on `did-finish-load`, a saved login for the page's
 * origin is filled automatically, like any desktop browser.
 *
 * Dependencies are injectable so tests can pass an in-memory store
 * and fake crypto; production uses the real `safeStorage` and a
 * real electron-store (built lazily, with an in-memory fallback if
 * the store file cannot be created — same degrade philosophy as
 * `secureStorage.ts`'s ResilientStore).
 */

export interface BrowserCredentialStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  has(key: string): boolean;
  delete(key: string): void;
  entries(): Record<string, unknown>;
}

export interface BrowserCredentialsDeps {
  store?: BrowserCredentialStore;
  isEncryptionAvailable?: () => boolean;
  encryptString?: (value: string) => Buffer;
  decryptString?: (encrypted: Buffer) => string;
}

interface StoredLogin {
  username: string;
  /** base64 of the safeStorage-encrypted password. */
  password: string;
  updatedAt: string;
}

export interface BrowserCredentialsVault {
  isEncryptionAvailable(): boolean;
  hasLogin(origin: string): boolean;
  listLogins(): BrowserSavedLogin[];
  saveLogin(origin: string, username: string, password: string): boolean;
  deleteLogin(origin: string): boolean;
  /** Fill the page in `webContents` from the vault. False when
   * there is no saved login for the page's origin, or the page has
   * no password field to fill. */
  fillLogin(webContents: WebContents): Promise<boolean>;
  /** Read the departing page's login fields; when a password is
   * filled, hold it as an in-memory candidate and return the offer
   * (origin + username only). Null when there is nothing to offer. */
  captureCandidate(webContents: WebContents): Promise<BrowserLoginOffer | null>;
  /** Persist the in-memory candidate for `origin` (only when its
   * username matches — guards against a stale offer). False when
   * there is no such candidate or encryption is unavailable. */
  confirmCandidate(origin: string, username: string): boolean;
  discardCandidate(origin: string): void;
}

/** In-memory store, used when the electron-store file cannot be
 * created (and by tests). Logins in it do not survive a restart. */
class MemoryCredentialStore implements BrowserCredentialStore {
  private data = new Map<string, unknown>();

  get(key: string): unknown {
    return this.data.get(key);
  }

  set(key: string, value: unknown): void {
    this.data.set(key, value);
  }

  has(key: string): boolean {
    return this.data.has(key);
  }

  delete(key: string): void {
    this.data.delete(key);
  }

  entries(): Record<string, unknown> {
    return Object.fromEntries(this.data);
  }
}

class ElectronCredentialStore implements BrowserCredentialStore {
  private inner: Store<Record<string, unknown>>;

  constructor() {
    this.inner = new Store<Record<string, unknown>>({
      name: 'lucid-browser-credentials',
    });
  }

  get(key: string): unknown {
    return this.inner.get(key);
  }

  set(key: string, value: unknown): void {
    this.inner.set(key, value);
  }

  has(key: string): boolean {
    return this.inner.has(key);
  }

  delete(key: string): void {
    this.inner.delete(key);
  }

  entries(): Record<string, unknown> {
    return { ...this.inner.store };
  }
}

/** How many unconfirmed candidates main holds at once; the oldest
 * is dropped when the cap is hit. */
const MAX_CANDIDATES = 20;

const keyFor = (origin: string): string => `login:${origin}`;

export function createBrowserCredentialsVault(
  deps: BrowserCredentialsDeps = {},
): BrowserCredentialsVault {
  let store: BrowserCredentialStore;
  if (deps.store) {
    store = deps.store;
  } else {
    try {
      store = new ElectronCredentialStore();
    } catch (error) {
      console.error(
        `[BrowserCredentials] credential store unavailable — logins will not persist. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      store = new MemoryCredentialStore();
    }
  }

  // safeStorage can be absent in unit-test electron mocks; treat
  // that exactly like encryption being unavailable.
  const safe =
    typeof safeStorage !== 'undefined' ? safeStorage : undefined;
  const isEncryptionAvailable =
    deps.isEncryptionAvailable ??
    (() => safe?.isEncryptionAvailable() ?? false);
  const encryptString =
    deps.encryptString ?? ((value: string) => safe!.encryptString(value));
  const decryptString =
    deps.decryptString ??
    ((encrypted: Buffer) => safe!.decryptString(encrypted));

  // Unconfirmed candidates: origin -> credentials, main memory only.
  const candidates = new Map<string, { username: string; password: string }>();

  const getStored = (origin: string): StoredLogin | null => {
    const raw = store.get(keyFor(origin)) as StoredLogin | undefined;
    if (
      !raw ||
      typeof raw.username !== 'string' ||
      typeof raw.password !== 'string'
    ) {
      return null;
    }
    return raw;
  };

  const decryptPassword = (encryptedBase64: string): string | null => {
    try {
      return decryptString(Buffer.from(encryptedBase64, 'base64'));
    } catch {
      return null;
    }
  };

  const saveLoginImpl = (
    origin: string,
    username: string,
    password: string,
  ): boolean => {
    if (!origin || !username || !password) return false;
    if (!isEncryptionAvailable()) return false;
    let encrypted: Buffer;
    try {
      encrypted = encryptString(password);
    } catch {
      return false;
    }
    store.set(keyFor(origin), {
      username,
      password: encrypted.toString('base64'),
      updatedAt: new Date().toISOString(),
    } satisfies StoredLogin);
    return true;
  };

  return {
    isEncryptionAvailable: () => isEncryptionAvailable(),

    hasLogin: (origin) => getStored(origin) !== null,

    listLogins: () => {
      const logins: BrowserSavedLogin[] = [];
      for (const [key, raw] of Object.entries(store.entries())) {
        if (!key.startsWith('login:')) continue;
        const login = raw as StoredLogin | undefined;
        if (
          !login ||
          typeof login.username !== 'string' ||
          typeof login.password !== 'string'
        ) {
          continue;
        }
        logins.push({
          origin: key.slice('login:'.length),
          username: login.username,
          updatedAt:
            typeof login.updatedAt === 'string' ? login.updatedAt : '',
        });
      }
      logins.sort((a, b) => a.origin.localeCompare(b.origin));
      return logins;
    },

    saveLogin: saveLoginImpl,

    deleteLogin: (origin) => {
      if (!store.has(keyFor(origin))) return false;
      store.delete(keyFor(origin));
      return true;
    },

    fillLogin: async (webContents) => {
      const origin = originFromUrl(webContents.getURL());
      if (!origin) return false;
      const stored = getStored(origin);
      if (!stored) return false;
      const password = decryptPassword(stored.password);
      if (password === null) return false;
      if (typeof webContents.executeJavaScript !== 'function') return false;
      try {
        const filled = await webContents.executeJavaScript(
          buildFillScript(stored.username, password),
        );
        return filled === true;
      } catch {
        return false;
      }
    },

    captureCandidate: async (webContents) => {
      // No offer when the vault cannot encrypt: a save that can
      // never succeed must not be promised.
      if (!isEncryptionAvailable()) return null;
      const origin = originFromUrl(webContents.getURL());
      if (!origin) return null;
      if (typeof webContents.executeJavaScript !== 'function') return null;
      let fields: PageLoginFields;
      try {
        fields = (await webContents.executeJavaScript(
          buildReadLoginScript(),
        )) as PageLoginFields;
      } catch {
        return null;
      }
      if (!fields || !fields.hasPassword || !fields.password) return null;
      const existing = getStored(origin);
      if (existing && existing.username === fields.username) return null;
      if (candidates.size >= MAX_CANDIDATES) {
        const oldest = candidates.keys().next();
        if (!oldest.done) candidates.delete(oldest.value);
      }
      candidates.set(origin, {
        username: fields.username,
        password: fields.password,
      });
      return { origin, username: fields.username };
    },

    confirmCandidate: (origin, username) => {
      const candidate = candidates.get(origin);
      if (!candidate || candidate.username !== username) return false;
      candidates.delete(origin);
      return saveLoginImpl(origin, candidate.username, candidate.password);
    },

    discardCandidate: (origin) => {
      candidates.delete(origin);
    },
  };
}
