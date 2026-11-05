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
import { browserContextMenuItems } from '../electron/services/browserContextMenu';

describe('browserContextMenuItems', () => {
  it('always shows Back, Forward, Reload, Inspect', () => {
    const items = browserContextMenuItems({
      linkURL: '',
      selectionText: '',
      canGoBack: true,
      canGoForward: false,
    });
    expect(items.map((i) => i.id)).toEqual([
      'back',
      'forward',
      'reload',
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
      selectionText: '',
      canGoBack: false,
      canGoForward: false,
    });
    expect(onLink.map((i) => i.id)).toContain('copy-link');
    const notOnLink = browserContextMenuItems({
      linkURL: '',
      selectionText: '',
      canGoBack: false,
      canGoForward: false,
    });
    expect(notOnLink.map((i) => i.id)).not.toContain('copy-link');
  });

  it('shows Copy only when text is selected', () => {
    const withSelection = browserContextMenuItems({
      linkURL: '',
      selectionText: 'some text',
      canGoBack: false,
      canGoForward: false,
    });
    expect(withSelection.map((i) => i.id)).toContain('copy');
    const withoutSelection = browserContextMenuItems({
      linkURL: '',
      selectionText: '',
      canGoBack: false,
      canGoForward: false,
    });
    expect(withoutSelection.map((i) => i.id)).not.toContain('copy');
  });

  it('shows both copy items when right-clicking a selected link', () => {
    const items = browserContextMenuItems({
      linkURL: 'https://example.com/page',
      selectionText: 'link text',
      canGoBack: true,
      canGoForward: true,
    });
    expect(items.map((i) => i.id)).toEqual([
      'back',
      'forward',
      'reload',
      'copy-link',
      'copy',
      'inspect',
    ]);
  });
});
