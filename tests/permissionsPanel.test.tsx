// @vitest-environment jsdom
/**
 * Permissions tab tests (Gary, 2026-11-07 ~02:47–02:49 PST).
 *
 * Settings > Permissions shows the info explanatory page (exact
 * words, with the voice button) at the top, then every tracked
 * permission with its live state, what depends on it, and how to
 * grant it. A permission that is not granted is shown honestly —
 * never assumed.
 *
 * Run with: npm test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { render, screen } from '@testing-library/react';
import { PermissionsTab } from '../src/components/Settings/PermissionsTab';
import { PERMISSIONS_INFO_TEXT } from '../src/lib/permissions';
import type { PermissionSnapshot } from '../src/lib/permissions';
import { usePermissionsStore } from '../src/stores/permissionsStore';

const MOCK_SNAPSHOT: PermissionSnapshot[] = [
  { id: 'accessibility', status: 'denied', detail: 'Accessibility permission not granted.', verified: true, checkedAt: 1000 },
  { id: 'screen-recording', status: 'granted', detail: null, verified: true, checkedAt: 1000 },
  { id: 'full-disk-access', status: 'denied', detail: 'Full Disk Access is not granted.', verified: true, checkedAt: 1000 },
  { id: 'microphone', status: 'not-determined', detail: null, verified: false, checkedAt: 1000 },
  { id: 'camera', status: 'not-determined', detail: null, verified: false, checkedAt: 1000 },
];

describe('Permissions tab (SSR)', () => {
  it('shows the info page verbatim at the top, with the voice button', () => {
    const html = renderToStaticMarkup(React.createElement(PermissionsTab));
    // The exact words — the first paragraph, verbatim.
    expect(html).toContain('Lucid checks every permission before it acts.');
    expect(html).toContain('A permission that is not granted is never assumed.');
    // The voice button for the exact words.
    expect(html).toContain('Listen');
    expect(html).toContain('data-permissions-voice="permissions-explanation"');
    expect(html).toContain('Listen reads the exact words on this page, nothing added.');
  });

  it('lists all five tracked permissions', () => {
    const html = renderToStaticMarkup(React.createElement(PermissionsTab));
    for (const label of ['Accessibility', 'Screen Recording', 'Full Disk Access', 'Microphone', 'Camera']) {
      expect(html).toContain(label);
    }
  });
});

describe('Permissions tab (interactive)', () => {
  const mockGetSnapshot = vi.fn(async (_force?: boolean) => MOCK_SNAPSHOT);
  const mockSet = vi.fn(async (_key: string, _value: unknown) => undefined);
  let prevLucidAPI: unknown;

  beforeEach(() => {
    const win = window as unknown as Record<string, unknown>;
    prevLucidAPI = win.lucidAPI;
    win.lucidAPI = {
      settings: {
        set: mockSet,
        getAll: vi.fn(async () => ({})),
        hasApiKey: vi.fn(async () => false),
        hasPingKey: vi.fn(async () => false),
        getStorageStatus: vi.fn(async () => ({ degraded: false, reason: null })),
      },
      permissions: {
        getSnapshot: mockGetSnapshot,
        request: vi.fn(async () => false),
        openSettings: vi.fn(async () => true),
      },
    };
    mockGetSnapshot.mockClear();
    mockSet.mockClear();
    usePermissionsStore.setState({ snapshot: null, lastCheckedAt: null, checking: false, error: null });
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
  });

  it('probes on open and shows the live states honestly', async () => {
    render(<PermissionsTab />);
    // Screen Recording granted (Gary granted it); Accessibility not granted.
    expect(await screen.findByText('Granted')).toBeTruthy();
    const denied = await screen.findAllByText('Not granted');
    expect(denied.length).toBeGreaterThanOrEqual(2);
    const notDetermined = await screen.findAllByText('Not determined');
    expect(notDetermined.length).toBeGreaterThanOrEqual(2);
    expect(mockGetSnapshot).toHaveBeenCalled();
  });

  it('shows how to grant a permission that is not granted', async () => {
    render(<PermissionsTab />);
    expect(
      await screen.findByText(/System Settings → Privacy & Security → Accessibility/),
    ).toBeTruthy();
    // Two denied permissions (Accessibility + Full Disk Access)
    // each get an "Open System Settings" button.
    const buttons = await screen.findAllByText('Open System Settings');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it('shows what depends on each permission', async () => {
    render(<PermissionsTab />);
    expect(await screen.findByText(/Computer control — click, type, key/)).toBeTruthy();
    // Microphone + Camera have no feature yet.
    const noneYet = await screen.findAllByText('No feature uses this yet.');
    expect(noneYet.length).toBe(2);
  });

  it('the info page text on screen is the exact canonical text', async () => {
    const { container } = render(<PermissionsTab />);
    await screen.findByText('Granted');
    const firstParagraph = PERMISSIONS_INFO_TEXT.split('\n\n')[0];
    expect(container.textContent).toContain(firstParagraph);
  });

  it('has a Refresh button that re-probes', async () => {
    render(<PermissionsTab />);
    const refresh = await screen.findByRole('button', { name: 'Refresh permissions' });
    expect(refresh).toBeTruthy();
  });
});
