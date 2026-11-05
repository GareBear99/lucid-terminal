// @vitest-environment jsdom
/**
 * Tooltip wiring tests for the panel surfaces.
 *
 * Proves a wired tip actually appears: hover a Phone quick-tab button
 * in BrowserPanel's exported PhoneQuickTabs and a role="tooltip" shows
 * up with the wired text after the 450 ms delay.
 *
 * PhoneQuickTabs is the easiest panel piece to render in jsdom: it
 * takes plain entries (built by the same getPhoneEntries the panel
 * uses) and needs no window.lucidAPI, unlike the full BrowserPanel
 * (whose effects call window.lucidAPI.browser.*) or AIPanel (which
 * mounts AIChat). The other wired panels are covered by tsc + the
 * shared tooltip tests; their wiring is the same one-line wrap.
 *
 * Run with: npx vitest run tests/tooltipWiringPanels.test.tsx
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PhoneQuickTabs } from '../src/components/Browser/BrowserPanel';
import { TOOLTIP_SHOW_DELAY_MS } from '../src/components/Tooltip/Tooltip';
import { evaluateGpuGate, getPhoneEntries } from '../src/phone/streaming';

const openGate = evaluateGpuGate(
  { video_decode: 'enabled' },
  [{ deviceName: 'Intel(R) UHD Graphics 630' }],
);

describe('PhoneQuickTabs tooltips (BrowserPanel wiring)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderTabs() {
    return render(
      <PhoneQuickTabs
        entries={getPhoneEntries({ androidAddonInstalled: true, gpuGate: openGate })}
        onOpenExternal={() => undefined}
        onOpenInternal={() => undefined}
      />,
    );
  }

  function hover(button: HTMLElement) {
    fireEvent.mouseEnter(button);
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_SHOW_DELAY_MS);
    });
  }

  test('external Phone entry shows its wired tip on hover', () => {
    renderTabs();
    const button = screen.getByRole('button', { name: 'Phone — External' });
    // No native title left to double up with the Lucid tip.
    expect(button.getAttribute('title')).toBeNull();
    expect(screen.queryByRole('tooltip')).toBeNull();
    hover(button);
    expect(screen.getByRole('tooltip').textContent).toContain(
      'Open the external phone-control app',
    );
  });

  test('internal Android entry shows its wired tip on hover when enabled', () => {
    renderTabs();
    const button = screen.getByRole('button', { name: 'Android — Installed' });
    expect(button.getAttribute('title')).toBeNull();
    hover(button);
    expect(screen.getByRole('tooltip').textContent).toContain(
      'In-app phone stream (Android add-on)',
    );
  });
});
