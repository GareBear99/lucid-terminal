/**
 * Browser credentials (Area 3) — renderer store: the save offer
 * from main and the saved-login list (origin + username only).
 *
 * Run with: npm test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useBrowserCredentials } from '../src/stores/browserCredentials';
import type { BrowserLoginOffer, BrowserSavedLogin } from '../src/types';

const flush = () => new Promise((r) => setTimeout(r, 10));

const offer = (over: Partial<BrowserLoginOffer> = {}): BrowserLoginOffer => ({
  origin: 'https://example.com',
  username: 'gary',
  ...over,
});

const saved = (
  over: Partial<BrowserSavedLogin> = {},
): BrowserSavedLogin => ({
  origin: 'https://example.com',
  username: 'gary',
  updatedAt: '2026-11-05T00:00:00.000Z',
  ...over,
});

let api: {
  listSavedLogins: ReturnType<typeof vi.fn>;
  saveLogin: ReturnType<typeof vi.fn>;
  dismissLoginOffer: ReturnType<typeof vi.fn>;
  deleteSavedLogin: ReturnType<typeof vi.fn>;
  fillSavedLogin: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  useBrowserCredentials.setState({ offer: null, savedLogins: [] });
  api = {
    listSavedLogins: vi.fn(async () => [saved()]),
    saveLogin: vi.fn(async () => true),
    dismissLoginOffer: vi.fn(async () => undefined),
    deleteSavedLogin: vi.fn(async () => true),
    fillSavedLogin: vi.fn(async () => true),
  };
  (globalThis as unknown as { window: unknown }).window = {
    lucidAPI: { browser: api },
  };
});

afterEach(() => {
  delete (globalThis as unknown as { window: unknown }).window;
});

describe('offer', () => {
  it('setOffer shows it, clearOffer hides it', () => {
    const store = useBrowserCredentials.getState();
    store.setOffer(offer());
    expect(useBrowserCredentials.getState().offer).toEqual(offer());
    useBrowserCredentials.getState().clearOffer();
    expect(useBrowserCredentials.getState().offer).toBeNull();
  });

  it('the latest offer replaces an earlier one', () => {
    const store = useBrowserCredentials.getState();
    store.setOffer(offer({ origin: 'https://a.example' }));
    store.setOffer(offer({ origin: 'https://b.example' }));
    expect(useBrowserCredentials.getState().offer?.origin).toBe(
      'https://b.example',
    );
  });
});

describe('load', () => {
  it('populates the saved list from main', async () => {
    useBrowserCredentials.getState().load();
    await flush();
    expect(useBrowserCredentials.getState().savedLogins).toEqual([saved()]);
    expect(api.listSavedLogins).toHaveBeenCalledTimes(1);
  });
});

describe('saveLogin / dismissOffer', () => {
  it('save confirms with origin + username, reloads, clears the offer', async () => {
    const store = useBrowserCredentials.getState();
    store.setOffer(offer());
    store.saveLogin('https://example.com', 'gary');
    await flush();
    expect(api.saveLogin).toHaveBeenCalledWith(
      'https://example.com',
      'gary',
    );
    // Reloaded after the save, and the offer is gone.
    expect(api.listSavedLogins).toHaveBeenCalledTimes(1);
    expect(useBrowserCredentials.getState().offer).toBeNull();
  });

  it('dismiss tells main to drop the candidate and clears the offer', async () => {
    const store = useBrowserCredentials.getState();
    store.setOffer(offer());
    store.dismissOffer('https://example.com');
    await flush();
    expect(api.dismissLoginOffer).toHaveBeenCalledWith(
      'https://example.com',
    );
    expect(useBrowserCredentials.getState().offer).toBeNull();
  });
});

describe('deleteLogin / fillSavedLogin', () => {
  it('delete removes the login and reloads the list', async () => {
    useBrowserCredentials.getState().deleteLogin('https://example.com');
    await flush();
    expect(api.deleteSavedLogin).toHaveBeenCalledWith(
      'https://example.com',
    );
    expect(api.listSavedLogins).toHaveBeenCalledTimes(1);
  });

  it('fill asks main to fill the active tab', () => {
    useBrowserCredentials.getState().fillSavedLogin();
    expect(api.fillSavedLogin).toHaveBeenCalledTimes(1);
  });
});
