// @vitest-environment jsdom
/**
 * DefconBadge (Gary, 2026-11-09) — the DEFCON level on the main
 * terminal.
 *
 * CORRECTION (Gary, 2026-11-09 ~04:24 PST): the DEFCONs take
 * effect in NON-devmode — that is the point. Devmode is where we
 * understood them; non-devmode is where they take effect. So the
 * badge renders ONLY when devmode is OFF, and returns null in
 * devmode. Non-devmode itself is untouched (perfect, identical
 * to Warp) — the badge is the readiness level that takes effect
 * on it, it does not redesign it.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DefconBadge } from '../src/components/FixNet/DefconBadge';
import { useSettingsStore } from '../src/stores/settingsStore';

function setMode(devMode: boolean, defconLevel: 1 | 2 | 3) {
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    settings: { ...base, devMode, defconLevel },
  });
}

beforeEach(() => {
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    settings: { ...base, devMode: false, defconLevel: 1 },
  });
});

describe('DefconBadge (Gary, 2026-11-09)', () => {
  test('shows DEFCON 1 in non-devmode — the war zone, red', () => {
    setMode(false, 1);
    render(<DefconBadge />);
    const badge = screen.getByTestId('defcon-badge');
    expect(badge.textContent).toBe('DEFCON 1');
    expect(badge.getAttribute('data-level')).toBe('1');
    expect(badge.getAttribute('title')).toContain('war zone');
    expect(badge.className).toContain('text-red-400');
  });

  test('shows the level that is set — 2 amber, 3 green', () => {
    setMode(false, 2);
    const { rerender } = render(<DefconBadge />);
    expect(screen.getByTestId('defcon-badge').textContent).toBe('DEFCON 2');
    expect(screen.getByTestId('defcon-badge').className).toContain('text-amber-400');

    setMode(false, 3);
    rerender(<DefconBadge />);
    expect(screen.getByTestId('defcon-badge').textContent).toBe('DEFCON 3');
    expect(screen.getByTestId('defcon-badge').className).toContain('text-green-400');
  });

  test('renders NOTHING in devmode — the levels take effect in non-devmode, not locked inside devmode', () => {
    setMode(true, 1);
    render(<DefconBadge />);
    expect(screen.queryByTestId('defcon-badge')).toBeNull();

    setMode(true, 2);
    render(<DefconBadge />);
    expect(screen.queryByTestId('defcon-badge')).toBeNull();
  });
});
