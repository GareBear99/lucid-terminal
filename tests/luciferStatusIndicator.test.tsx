// @vitest-environment jsdom
/**
 * LuciferStatusIndicator — the blood drop in the terminal prompt
 * row. The disabled state must render NOTHING (no drop, no ⏳, no
 * ⚪ offline dot — that is itself a LuciferAI trace), so the flex
 * row reflows and the input stretches to fill the gap.
 *
 * The drop is an inline SVG droplet (BloodDropIcon), NOT the 🩸
 * emoji: the silenced state used to be Tailwind `opacity-40
 * grayscale` on the emoji, and the `grayscale` CSS filter blanks
 * a color-emoji glyph in this app's Electron 28 / Chromium — the
 * drop vanished on click instead of greying (Gary, 2026-11-08
 * ~06:15 PST). The grey is now a fill (#6b7280), never a filter,
 * so the drop is always visible. These tests assert the fill and
 * the absence of any filter class — the old tests only asserted
 * class names, and a class name renders fine in jsdom, which is
 * why they passed while the live drop was invisible.
 *
 * Run with: npm test
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  LuciferStatusIndicator,
  BLOOD_DROP_RED,
  BLOOD_DROP_GREY,
} from '../src/components/Terminal/LuciferStatusIndicator';

describe('LuciferStatusIndicator', () => {
  it('renders nothing at all when the plugin is disabled', () => {
    const { container } = render(
      <LuciferStatusIndicator enabled={false} checking={false} modelAvailable={false} modelNames={[]} available={false} />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('blood-drop-svg')).toBeNull();
    expect(screen.queryByText('⏳')).toBeNull();
    expect(screen.queryByText('⚪')).toBeNull();
  });

  it('renders nothing when disabled even mid-probe with a model', () => {
    const { container } = render(
      <LuciferStatusIndicator enabled={false} checking={true} modelAvailable={true} modelNames={['tinyllama']} available={true} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the checking spinner while probing', () => {
    render(
      <LuciferStatusIndicator enabled={true} checking={true} modelAvailable={false} modelNames={[]} available={false} />,
    );
    expect(screen.getByText('⏳')).toBeTruthy();
  });

  it('renders the blood drop when a model is ready', () => {
    render(
      <LuciferStatusIndicator enabled={true} checking={false} modelAvailable={true} modelNames={['tinyllama']} available={true} />,
    );
    const svg = screen.getByTestId('blood-drop-svg');
    expect(svg).toBeTruthy();
    expect(svg.getAttribute('fill')).toBe(BLOOD_DROP_RED);
  });

  it('renders the blood drop when loaded with no model', () => {
    render(
      <LuciferStatusIndicator enabled={true} checking={false} modelAvailable={false} modelNames={[]} available={true} />,
    );
    const svg = screen.getByTestId('blood-drop-svg');
    expect(svg).toBeTruthy();
    expect(svg.getAttribute('fill')).toBe(BLOOD_DROP_RED);
  });

  it('renders the grey offline dot when the plugin is down but enabled', () => {
    render(
      <LuciferStatusIndicator enabled={true} checking={false} modelAvailable={false} modelNames={[]} available={false} />,
    );
    expect(screen.getByText('⚪')).toBeTruthy();
  });
});

describe('LuciferStatusIndicator — blood drop silencer (Gary, 2026-11-08 ~02:28 PST — CORRECTS the old "quick disable" reading, 2026-11-07 ~20:17 PST)', () => {
  // The drop next to the send arrow is JUST A SILENCER: clicking
  // it silences LuciferAI's voices — the drop GREYS OUT but stays
  // visible and clickable, so clicking it again un-silences. It
  // does NOT turn the plugin off and does NOT stop the runtime
  // (causal ticks keep running, causal order is held). The drop
  // disappears ONLY when LuciferAI is off via the Settings toggle
  // (Settings → Plugins, Gary 2026-11-08 ~02:29 PST: "off like in
  // settings toggle"). When the plugin is off the drop is GONE
  // entirely (no darkened leftover as a re-enable control — when
  // LuciferAI is off the terminal must be no different than a
  // terminal). Re-enable from Settings → Plugins. Clicking it
  // never prints or repeats the "awaiting commands" line
  // (toggling only flips the silenced setting). The grey is a
  // fill, never a CSS filter — a filter on the emoji blanked the
  // drop entirely in Electron 28 (Gary, 2026-11-08 ~06:15 PST).
  const base = {
    enabled: true,
    checking: false,
    modelAvailable: true,
    modelNames: ['tinyllama'],
    available: true,
  };

  it('when on and not silenced, the drop is lit — full brightness red', () => {
    render(
      <LuciferStatusIndicator {...base} silenced={false} toggleActive={true} onToggleBloodDrop={() => {}} />,
    );
    const button = screen.getByRole('button', { name: 'Toggle LuciferAI' });
    expect(button).toBeTruthy();
    const svg = screen.getByTestId('blood-drop-svg');
    expect(svg.getAttribute('fill')).toBe(BLOOD_DROP_RED);
    const classes = button.className.split(' ');
    expect(classes).toContain('opacity-100');
    expect(classes).not.toContain('opacity-40');
    expect(classes).not.toContain('grayscale');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(false);
  });

  it('when silenced, the drop greys out but stays visible and clickable', () => {
    render(
      <LuciferStatusIndicator {...base} silenced={true} toggleActive={false} onToggleBloodDrop={() => {}} />,
    );
    const button = screen.getByRole('button', { name: 'Toggle LuciferAI' });
    expect(button).toBeTruthy();
    // Still a blood drop — a GREY one. It greys, it does not
    // disappear. The grey is a fill, never a CSS filter.
    const svg = screen.getByTestId('blood-drop-svg');
    expect(svg).toBeTruthy();
    expect(svg.getAttribute('fill')).toBe(BLOOD_DROP_GREY);
    const classes = button.className.split(' ');
    expect(classes).not.toContain('grayscale');
    expect(classes).not.toContain('opacity-40');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.hasAttribute('disabled')).toBe(false);
  });

  it('clicking the greyed drop still calls the toggle (un-silence)', () => {
    const onToggleBloodDrop = vi.fn();
    render(
      <LuciferStatusIndicator {...base} silenced={true} toggleActive={false} onToggleBloodDrop={onToggleBloodDrop} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Toggle LuciferAI' }));
    expect(onToggleBloodDrop).toHaveBeenCalledTimes(1);
  });

  it('clicking the drop toggles the silencer, not the plugin', () => {
    const onToggleBloodDrop = vi.fn();
    render(
      <LuciferStatusIndicator {...base} silenced={false} toggleActive={true} onToggleBloodDrop={onToggleBloodDrop} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Toggle LuciferAI' }));
    expect(onToggleBloodDrop).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when disabled even when silenced — the drop disappears ONLY when off (Settings toggle)', () => {
    const { container } = render(
      <LuciferStatusIndicator enabled={false} checking={false} modelAvailable={false} modelNames={[]} available={false} silenced={true} toggleActive={false} onToggleBloodDrop={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('button', { name: 'Toggle LuciferAI' })).toBeNull();
    expect(screen.queryByTestId('blood-drop-svg')).toBeNull();
  });

  it('a silenced status display (no toggle handler) greys out but stays rendered', () => {
    render(<LuciferStatusIndicator {...base} silenced={true} />);
    expect(screen.queryByRole('button', { name: 'Toggle LuciferAI' })).toBeNull();
    const svg = screen.getByTestId('blood-drop-svg');
    expect(svg).toBeTruthy();
    expect(svg.getAttribute('fill')).toBe(BLOOD_DROP_GREY);
  });

  it('renders nothing when disabled even WITH a toggle handler — no leftover drop', () => {
    const { container } = render(
      <LuciferStatusIndicator enabled={false} checking={false} modelAvailable={false} modelNames={[]} available={false} toggleActive={false} onToggleBloodDrop={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('button', { name: 'Toggle LuciferAI' })).toBeNull();
    expect(screen.queryByTestId('blood-drop-svg')).toBeNull();
  });

  it('renders nothing when disabled WITHOUT a toggle handler', () => {
    const { container } = render(
      <LuciferStatusIndicator enabled={false} checking={false} modelAvailable={false} modelNames={[]} available={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('without a toggle handler it stays a plain status display (no button)', () => {
    render(<LuciferStatusIndicator {...base} />);
    expect(screen.queryByRole('button', { name: 'Toggle LuciferAI' })).toBeNull();
    const svg = screen.getByTestId('blood-drop-svg');
    expect(svg).toBeTruthy();
    expect(svg.getAttribute('fill')).toBe(BLOOD_DROP_RED);
  });
});
