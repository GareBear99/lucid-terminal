/**
 * Browser downloads (Area 2) — pure service helpers: file-name
 * sanitising, collision-free paths, progress math, human sizes.
 *
 * Run with: npm test
 */

import { describe, it, expect, vi } from 'vitest';
import {
  sanitizeDownloadFilename,
  uniqueDownloadPath,
  downloadProgress,
  formatDownloadSize,
  type BrowserDownload,
} from '../electron/services/browserDownloads';

// The service under test imports { shell } from 'electron'
// (showItemInFolder). CI installs with --ignore-scripts, so there is
// no Electron binary and the real 'electron' package throws at
// import — mock it, as the *Main test files do, so these pure-helper
// tests can run without the binary.
vi.mock('electron', () => ({
  shell: { showItemInFolder: () => undefined },
}));

describe('sanitizeDownloadFilename', () => {
  it('keeps a plain file name', () => {
    expect(sanitizeDownloadFilename('report.pdf')).toBe('report.pdf');
  });

  it('strips directories — a site cannot smuggle a ../ path through', () => {
    expect(sanitizeDownloadFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeDownloadFilename('a/b/c.zip')).toBe('c.zip');
    expect(sanitizeDownloadFilename('C:\\Users\\gary\\secret.txt')).toBe(
      'secret.txt',
    );
  });

  it('strips control characters and illegal characters', () => {
    expect(sanitizeDownloadFilename('my\nfile?.txt')).toBe('myfile.txt');
    expect(sanitizeDownloadFilename('a<b>c:d"e|f.txt')).toBe('abcdef.txt');
  });

  it('falls back to "download" when nothing is left', () => {
    expect(sanitizeDownloadFilename('')).toBe('download');
    expect(sanitizeDownloadFilename('...')).toBe('...');
    expect(sanitizeDownloadFilename('///')).toBe('download');
  });
});

describe('uniqueDownloadPath', () => {
  const never = () => false;
  const existsOnce = (seen: Set<string>) => (p: string) => seen.has(p);

  it('uses the plain name when free', () => {
    expect(uniqueDownloadPath('/dl', 'a.zip', never)).toBe('/dl/a.zip');
  });

  it('appends (1), (2), … before the extension on collision', () => {
    const seen = new Set(['/dl/a.zip', '/dl/a (1).zip']);
    expect(uniqueDownloadPath('/dl', 'a.zip', existsOnce(seen))).toBe(
      '/dl/a (2).zip',
    );
  });

  it('handles extensionless names', () => {
    const seen = new Set(['/dl/README']);
    expect(uniqueDownloadPath('/dl', 'README', existsOnce(seen))).toBe(
      '/dl/README (1)',
    );
  });

  it('sanitises before deduping', () => {
    expect(uniqueDownloadPath('/dl', '../x.zip', never)).toBe('/dl/x.zip');
  });
});

describe('downloadProgress', () => {
  const base: BrowserDownload = {
    id: 'browser-download-1',
    url: 'https://example.com/a.zip',
    filename: 'a.zip',
    savePath: '/dl/a.zip',
    receivedBytes: 500,
    totalBytes: 1000,
    state: 'progressing',
  };

  it('is received / total, clamped to 0–1', () => {
    expect(downloadProgress(base)).toBe(0.5);
    expect(downloadProgress({ ...base, receivedBytes: 1500 })).toBe(1);
  });

  it('is null when the total is unknown (indeterminate bar)', () => {
    expect(downloadProgress({ ...base, totalBytes: 0 })).toBeNull();
    expect(downloadProgress({ ...base, totalBytes: -1 })).toBeNull();
  });
});

describe('formatDownloadSize', () => {
  it('formats bytes through GB', () => {
    expect(formatDownloadSize(0)).toBe('0 B');
    expect(formatDownloadSize(840)).toBe('840 B');
    expect(formatDownloadSize(1536)).toBe('1.5 KB');
    expect(formatDownloadSize(2_500_000)).toBe('2.4 MB');
    expect(formatDownloadSize(3_000_000_000)).toBe('2.8 GB');
  });

  it('never throws on garbage', () => {
    expect(formatDownloadSize(Number.NaN)).toBe('0 B');
    expect(formatDownloadSize(-5)).toBe('0 B');
  });
});
