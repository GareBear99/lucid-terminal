// @vitest-environment jsdom
/**
 * Browser Phase B — agent cursor + glass splash component tests:
 * the live agent mouse renders at its position (hidden when there
 * is none), and the glass splash shows the Lucid wordmark, runs
 * its ~3.2s schedule, and skips on click.
 *
 * Run with: npm test
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AgentMouseCursor } from '../src/components/Browser/AgentMouseCursor';
import { BrowserGlassSplash } from '../src/components/Browser/BrowserGlassSplash';

afterEach(() => {
  vi.useRealTimers();
});

describe('AgentMouseCursor', () => {
  it('renders the live agent pointer at its position with an Agent tag', () => {
    render(<AgentMouseCursor mouse={{ x: 120, y: 80 }} />);
    const cursor = screen.getByTestId('agent-mouse-cursor');
    expect(cursor).toBeTruthy();
    expect(cursor.style.left).toBe('120px');
    expect(cursor.style.top).toBe('80px');
    expect(screen.getByText('Agent')).toBeTruthy();
    expect(cursor.getAttribute('aria-label')).toMatch(/120, 80/);
  });

  it('renders nothing when there is no mouse (idle, or Gary took control)', () => {
    const { container } = render(<AgentMouseCursor mouse={null} />);
    expect(screen.queryByTestId('agent-mouse-cursor')).toBeNull();
    expect(container).toBeTruthy();
  });
});

describe('BrowserGlassSplash', () => {
  it('shows the Lucid wordmark and Agent browsing label', () => {
    vi.useFakeTimers();
    render(<BrowserGlassSplash onDone={() => {}} />);
    expect(screen.getByTestId('browser-glass-splash')).toBeTruthy();
    expect(screen.getByText('Agent browsing')).toBeTruthy();
    expect(screen.getByTestId('browser-glass-splash').getAttribute('data-phase')).toBe('smoke');
  });

  it('walks its phases and calls onDone after ~3.2s', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<BrowserGlassSplash onDone={onDone} />);
    const splash = screen.getByTestId('browser-glass-splash');
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(splash.getAttribute('data-phase')).toBe('wordmark');
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(splash.getAttribute('data-phase')).toBe('hold');
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(splash.getAttribute('data-phase')).toBe('fade');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('clicking skips to a fast fade and finishes in 250ms', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<BrowserGlassSplash onDone={onDone} />);
    const splash = screen.getByTestId('browser-glass-splash');
    fireEvent.click(splash);
    expect(splash.getAttribute('data-phase')).toBe('fade');
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
