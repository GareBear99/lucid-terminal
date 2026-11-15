// @vitest-environment jsdom
/**
 * The brain-alive indicator (Atom steal #16, Kite half) —
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

  it('shows ready while the last success is inside the 5s window', () => {
    const { getByTestId } = render(
      <BrainAliveIndicator client={stubClient({ lastSuccessAt: Date.now() - 1000 })} />,
    );
    expect(getByTestId('brain-alive-indicator').textContent).toContain('Brain: ready');
  });

  it('flips to not responding when the window expires, without a new success', () => {
    const client = stubClient({ lastSuccessAt: Date.now() - 1000 });
    const { getByTestId } = render(<BrainAliveIndicator client={client} />);
    expect(getByTestId('brain-alive-indicator').textContent).toContain('Brain: ready');
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(getByTestId('brain-alive-indicator').textContent).toContain('Brain: not responding');
  });

  it('shows not started before the engine ever runs', () => {
    const { getByTestId } = render(
      <BrainAliveIndicator client={stubClient({ state: 'not-running', lastSuccessAt: null })} />,
    );
    expect(getByTestId('brain-alive-indicator').textContent).toContain('Brain: not started');
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
