// @vitest-environment jsdom
/**
 * Tooltip wiring tests — misc surfaces (Gary, 2026-11-05: one shared
 * tooltip everywhere). Proves the wired tips actually appear on hover
 * in two of the easiest-to-render misc components: the error-toast
 * dismiss button (ErrorNotification) and the token-efficiency
 * indicator (TokenDisplay). Both are pure-props components with no
 * store or IPC dependencies.
 *
 * Run with: npx vitest run tests/tooltipWiringMisc.test.tsx
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ErrorNotification } from '../src/components/Terminal/ErrorNotification';
import { TokenEfficiency } from '../src/components/Terminal/TokenDisplay';
import { TOOLTIP_SHOW_DELAY_MS } from '../src/components/Tooltip/Tooltip';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('misc tooltip wiring', () => {
  test('error toast dismiss button shows a "Dismiss" tip on hover', () => {
    render(
      <ErrorNotification
        notifications={[{ id: 'n1', type: 'error', message: 'Boom', duration: 0 }]}
        onDismiss={() => {}}
      />,
    );
    const dismiss = screen.getByRole('button');
    // No native title left — the shared tooltip is the only tip.
    expect(dismiss.getAttribute('title')).toBeNull();

    fireEvent.mouseEnter(dismiss);
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY_MS);
    });
    expect(screen.getByRole('tooltip').textContent).toContain('Dismiss');
  });

  test('token efficiency indicator shows its chars/token tip on hover', () => {
    render(<TokenEfficiency ratio={4.2} />);
    const indicator = screen.getByText(/Good efficiency/);
    expect(indicator.getAttribute('title')).toBeNull();

    fireEvent.mouseEnter(indicator);
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY_MS);
    });
    const tip = screen.getByRole('tooltip');
    expect(tip.textContent).toContain('4.20 chars/token');
    expect(tip.textContent).toContain('Good efficiency');
  });
});
