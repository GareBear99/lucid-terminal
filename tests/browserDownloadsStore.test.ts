/**
 * Browser downloads (Area 2) — renderer store: upserts from main's
 * `browser:download-updated` events, dismiss / clear-finished.
 *
 * Run with: npm test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useBrowserDownloads } from '../src/stores/browserDownloads';
import type { BrowserDownload } from '../src/types';

const dl = (over: Partial<BrowserDownload> = {}): BrowserDownload => ({
  id: 'browser-download-1',
  url: 'https://example.com/a.zip',
  filename: 'a.zip',
  savePath: '/dl/a.zip',
  receivedBytes: 0,
  totalBytes: 1000,
  state: 'progressing',
  ...over,
});

beforeEach(() => {
  useBrowserDownloads.setState({ downloads: [] });
});

describe('applyUpdate', () => {
  it('appends a new download and updates it in place by id', () => {
    const store = useBrowserDownloads.getState();
    store.applyUpdate(dl({ receivedBytes: 100 }));
    store.applyUpdate(dl({ receivedBytes: 500 }));
    store.applyUpdate(dl({ id: 'browser-download-2', filename: 'b.zip' }));
    const { downloads } = useBrowserDownloads.getState();
    expect(downloads).toHaveLength(2);
    expect(downloads[0].receivedBytes).toBe(500);
    expect(downloads[1].filename).toBe('b.zip');
  });
});

describe('dismiss / clearCompleted', () => {
  it('dismiss removes one download; clearCompleted keeps only running ones', () => {
    const store = useBrowserDownloads.getState();
    store.applyUpdate(dl({ id: 'browser-download-1' }));
    store.applyUpdate(dl({ id: 'browser-download-2', state: 'completed' }));
    store.applyUpdate(dl({ id: 'browser-download-3', state: 'cancelled' }));
    useBrowserDownloads.getState().dismiss('browser-download-3');
    expect(useBrowserDownloads.getState().downloads.map((d) => d.id)).toEqual([
      'browser-download-1',
      'browser-download-2',
    ]);
    useBrowserDownloads.getState().clearCompleted();
    expect(useBrowserDownloads.getState().downloads.map((d) => d.id)).toEqual([
      'browser-download-1',
    ]);
  });
});

describe('setDownloads', () => {
  it('replaces the whole list (initial load from main)', () => {
    useBrowserDownloads.getState().setDownloads([dl()]);
    expect(useBrowserDownloads.getState().downloads).toHaveLength(1);
    useBrowserDownloads.getState().setDownloads([]);
    expect(useBrowserDownloads.getState().downloads).toHaveLength(0);
  });
});
