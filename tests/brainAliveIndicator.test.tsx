// @vitest-environment jsdom
/**
 * The brain-alive indicator —
 * the status-bar pill, driven by a stub client.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, act, fireEvent } from '@testing-library/react';
import { BrainAliveIndicator } from '../src/components/Layout/BrainAliveIndicator';
import type { EngineState } from '../src/lib/engineClient';
import { useToastStore } from '../src/stores/toastStore';

function stubClient(overrides: {
  state?: EngineState;
  lastSuccessAt?: number | null;
  version?: string | null;
  checkHealth?: () => Promise<EngineState>;
}) {
  return {
    transportName: 'stub',
    // `??` would swallow an explicit null (the "never ran"
    // case) — the `in` check keeps null null.
    getState: () => ('state' in overrides ? overrides.state! : 'ready'),
    getLastSuccessAt: () =>
      'lastSuccessAt' in overrides ? overrides.lastSuccessAt! : Date.now(),
    getLastError: () => null,
    getEngineVersion: () => ('version' in overrides ? overrides.version! : '6.0.3'),
    checkHealth: overrides.checkHealth ?? (async () => overrides.state ?? 'ready'),
  };
}

describe('BrainAliveIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a green dot while the last success is inside the 5s window', () => {
    const { getByTestId } = render(
      <BrainAliveIndicator client={stubClient({ lastSuccessAt: Date.now() - 1000 })} />,
    );
    const pill = getByTestId('brain-alive-indicator');
    // Dot only — no permanent bar text (global presentation
    // fix): the state is the dot colour + the aria-label.
    expect(pill.querySelector('.bg-green-500')).not.toBeNull();
    expect(pill.getAttribute('aria-label')).toBe('Brain: ready');
    expect(pill.textContent).toBe('');
  });

  it('flips the dot to red when the window expires, without a new success', () => {
    const client = stubClient({ lastSuccessAt: Date.now() - 1000 });
    const { getByTestId } = render(<BrainAliveIndicator client={client} />);
    const pill = getByTestId('brain-alive-indicator');
    expect(pill.querySelector('.bg-green-500')).not.toBeNull();
    expect(pill.getAttribute('aria-label')).toBe('Brain: ready');
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(pill.querySelector('.bg-red-500')).not.toBeNull();
    expect(pill.querySelector('.bg-green-500')).toBeNull();
    expect(pill.getAttribute('aria-label')).toBe('Brain: not responding');
    expect(pill.textContent).toBe('');
  });

  it('shows an amber dot before the engine ever runs', () => {
    const { getByTestId } = render(
      <BrainAliveIndicator client={stubClient({ state: 'not-running', lastSuccessAt: null })} />,
    );
    const pill = getByTestId('brain-alive-indicator');
    expect(pill.querySelector('.bg-amber-500')).not.toBeNull();
    expect(pill.getAttribute('aria-label')).toBe('Brain: not started');
    expect(pill.textContent).toBe('');
  });

  it('clicking probes the engine and toasts the check-status report', async () => {
    const info = vi.fn();
    useToastStore.setState({ info } as never);
    const { getByTestId } = render(
      <BrainAliveIndicator client={stubClient({ lastSuccessAt: Date.now() - 2000 })} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId('brain-alive-indicator'));
    });
    expect(info).toHaveBeenCalledTimes(1);
    const report = String(info.mock.calls[0][0]);
    expect(report).toContain('Brain: ready');
    expect(report).toContain('state: ready (stub)');
    expect(report).toContain('Version: 6.0.3');
    expect(report).toContain('Last success: 2s ago');
  });
});
