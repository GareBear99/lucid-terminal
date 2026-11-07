// @vitest-environment jsdom
/**
 * Computer-control segment panel tests (Gary, 2026-11-06).
 *
 * The computer-control segment is pre-installed in the Segments
 * panel (Modules tab): no starship, no install step, no server.
 * The panel shows the segment lock (kill-switch), availability,
 * the observe → plan → act → read-back → decide loop, protected
 * targets, the agent-only gate note, and the action log. The
 * starship Segments stay gated on detection — the panel still
 * shows "No starship detected" until Gary settles the mechanism.
 *
 * Run with: npm test
 */
import { describe, it, test, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsPanel from '../src/components/Settings/SettingsPanel';
import { SegmentsPanel } from '../src/components/Modules/SegmentsPanel';
import { useSettingsStore } from '../src/stores/settingsStore';
import type { ComputerControlSegmentState } from '../src/lib/computerControl';

const renderSettings = (initialTab?: 'modules') =>
  renderToStaticMarkup(
    React.createElement(SettingsPanel, {
      onClose: () => undefined,
      ...(initialTab ? { initialTab } : {}),
    }),
  );

const MOCK_SEGMENT_STATE: ComputerControlSegmentState = {
  locked: false,
  available: true,
  availabilityReason: null,
  targetId: 'Test App',
  sequence: 1,
  log: [
    {
      sequence: 1,
      at: 1,
      kind: 'click',
      targetId: 'Test App',
      direction: 'Gary: click the window',
      outcome: 'landed',
      verified: true,
      changed: true,
      reason: null,
    },
  ],
  faults: [],
  watchdogTrips: 0,
  protectedTargets: ['Next Starship Steps'],
};

describe('Computer-control segment in the Modules tab (SSR)', () => {
  it('shows the computer-control segment as pre-installed', () => {
    const html = renderSettings('modules');
    expect(html).toContain('Computer control');
    expect(html).toContain('Pre-installed');
    expect(html).toContain('agent-only');
  });

  it('shows the lock switch, unlocked by default', () => {
    const html = renderSettings('modules');
    expect(html).toContain('Unlocked');
    expect(html).toContain('Lock the computer-control segment');
  });

  it('explains the loop and the read-back rule', () => {
    const html = renderSettings('modules');
    expect(html).toContain('Observe');
    expect(html).toContain('read back');
    expect(html).toContain('did not land');
  });

  it('shows the protected target (Gary’s ChatGPT tab)', () => {
    const html = renderSettings('modules');
    expect(html).toContain('Next Starship Steps');
    expect(html).toContain('Protected targets');
  });

  it('states the agent-only gate as an open decision, not a decided one', () => {
    const html = renderSettings('modules');
    expect(html).toContain('Agent-only');
    expect(html).toContain('not decided yet');
    expect(html).toContain('lucidAPI.computerControl');
  });

  it('still shows the no-starship-detected state — the starship Segments stay gated', () => {
    const html = renderSettings('modules');
    expect(html).toContain('No starship detected');
    expect(html).toContain('Starship segments');
  });
});

describe('Computer-control segment panel (interactive)', () => {
  const mockSet = vi.fn(async (_key: string, _value: unknown) => undefined);
  const mockGetState = vi.fn(async () => MOCK_SEGMENT_STATE);
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
      computerControl: {
        getState: mockGetState,
        listApps: vi.fn(async () => []),
        observe: vi.fn(async () => null),
        action: vi.fn(async () => ({})),
      },
    };
    mockSet.mockClear();
    mockGetState.mockClear();
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: {
        ...base,
        computerControlLocked: false,
        computerControlProtectedTargets: ['Next Starship Steps'],
        installedAddons: [],
      },
    });
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
  });

  test('the lock switch unlocks/locks and persists the setting', async () => {
    render(<SegmentsPanel />);
    const toggle = await screen.findByRole('switch', { name: /Lock the computer-control segment/i });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('computerControlLocked', true);
    });
  });

  test('the action log renders the read-back verdict', async () => {
    render(<SegmentsPanel />);
    await waitFor(() => {
      expect(document.body.textContent).toContain('Recent actions');
    });
    await waitFor(() => {
      expect(document.body.textContent).toContain('#1 click');
      expect(document.body.textContent).toContain('landed');
      expect(document.body.textContent).toContain('verified');
      expect(document.body.textContent).toContain('screen changed');
    });
  });

  test('availability is shown from the segment state', async () => {
    render(<SegmentsPanel />);
    await waitFor(() => {
      expect(document.body.textContent).toContain('Available — Accessibility + Screen Recording granted.');
    });
  });
});
