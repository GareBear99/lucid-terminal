/**
 * Browser context-menu tests — which items a right-click shows.
 *
 * The menu is native (built in the main process), but the "which
 * items, and are they enabled" decision is pure, so it is tested
 * here without Electron. The main process maps the ids to actions
 * (back/forward/reload, copy-link, copy, inspect).
 *
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest';
import {
  browserContextMenuItems,
  buildCurlCommand,
} from '../electron/services/browserContextMenu';

describe('browserContextMenuItems', () => {
  it('always shows Back, Forward, Reload, Inspect', () => {
    const items = browserContextMenuItems({
      linkURL: '',
      pageURL: 'https://example.com/',
      selectionText: '',
      canGoBack: true,
      canGoForward: false,
    });
    expect(items.map((i) => i.id)).toEqual([
      'back',
      'forward',
      'reload',
      'copy-page-curl',
      'inspect',
    ]);
    expect(items.find((i) => i.id === 'back')?.enabled).toBe(true);
    expect(items.find((i) => i.id === 'forward')?.enabled).toBe(false);
    expect(items.find((i) => i.id === 'reload')?.enabled).toBe(true);
    expect(items.find((i) => i.id === 'inspect')?.enabled).toBe(true);
  });

  it('shows Copy Link Address only when right-clicking a link', () => {
    const onLink = browserContextMenuItems({
      linkURL: 'https://example.com/page',
      pageURL: 'https://example.com/',
      selectionText: '',
      canGoBack: false,
      canGoForward: false,
    });
    expect(onLink.map((i) => i.id)).toContain('copy-link');
    const notOnLink = browserContextMenuItems({
      linkURL: '',
      pageURL: 'https://example.com/',
      selectionText: '',
      canGoBack: false,
      canGoForward: false,
    });
    expect(notOnLink.map((i) => i.id)).not.toContain('copy-link');
  });

  it('shows Copy only when text is selected', () => {
    const withSelection = browserContextMenuItems({
      linkURL: '',
      pageURL: 'https://example.com/',
      selectionText: 'some text',
      canGoBack: false,
      canGoForward: false,
    });
    expect(withSelection.map((i) => i.id)).toContain('copy');
    const withoutSelection = browserContextMenuItems({
      linkURL: '',
      pageURL: 'https://example.com/',
      selectionText: '',
      canGoBack: false,
      canGoForward: false,
    });
    expect(withoutSelection.map((i) => i.id)).not.toContain('copy');
  });

  it('shows both copy items when right-clicking a selected link', () => {
    const items = browserContextMenuItems({
      linkURL: 'https://example.com/page',
      pageURL: 'https://example.com/',
      selectionText: 'link text',
      canGoBack: true,
      canGoForward: true,
    });
    expect(items.map((i) => i.id)).toEqual([
      'back',
      'forward',
      'reload',
      'copy-link',
      'copy-link-curl',
      'copy-page-curl',
      'copy',
      'inspect',
    ]);
  });
});

describe('buildCurlCommand', () => {
  it('builds a curl -L command with the URL single-quoted', () => {
    expect(buildCurlCommand('https://example.com/page?q=1')).toBe(
      `curl -L 'https://example.com/page?q=1'`,
    );
  });

  it('escapes embedded single quotes so the command stays safe to paste', () => {
    expect(buildCurlCommand(`https://example.com/it's`)).toBe(
      `curl -L 'https://example.com/it'\\''s'`,
    );
  });
});
