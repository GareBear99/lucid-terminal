// @vitest-environment jsdom
/**
 * LuciferStatusIndicator — the blood drop in the terminal prompt
 * row. The disabled state must render NOTHING (no 🩸, no ⏳, no ⚪
 * offline dot — that is itself a LuciferAI trace), so the flex row
 * reflows and the input stretches to fill the gap.
 *
 * Run with: npm test
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LuciferStatusIndicator } from '../src/components/Terminal/LuciferStatusIndicator';

describe('LuciferStatusIndicator', () => {
  it('renders nothing at all when the plugin is disabled', () => {
    const { container } = render(
      <LuciferStatusIndicator enabled={false} checking={false} modelAvailable={false} modelNames={[]} available={false} />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText('🩸')).toBeNull();
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
    expect(screen.getByText('🩸')).toBeTruthy();
  });

  it('renders the blood drop when loaded with no model', () => {
    render(
      <LuciferStatusIndicator enabled={true} checking={false} modelAvailable={false} modelNames={[]} available={true} />,
    );
    expect(screen.getByText('🩸')).toBeTruthy();
  });

  it('renders the grey offline dot when the plugin is down but enabled', () => {
    render(
      <LuciferStatusIndicator enabled={true} checking={false} modelAvailable={false} modelNames={[]} available={false} />,
    );
    expect(screen.getByText('⚪')).toBeTruthy();
  });
});

describe('LuciferStatusIndicator — blood drop quick disable (Gary, 2026-11-07 ~18:57 PST)', () => {
  // The drop next to the send arrow IS LuciferAI's quick disable:
  // clicking it flips the plugin on/off. It ALWAYS defaults
  // darkened/off, is lit when on, never greyed-out unclickable,
  // and never prints or repeats the "awaiting commands" line
  // (toggling only flips the setting). With a toggle handler the
  // drop stays rendered even while disabled — darkened, clickable —
  // because a quick disable with no way back on is a trap.
  const base = {
    enabled: true,
    checking: false,
    modelAvailable: true,
    modelNames: ['tinyllama'],
    available: true,
  };

  it('defaults darkened/off — the drop is dimmed until turned on', () => {
    render(
      <LuciferStatusIndicator {...base} toggleActive={false} onToggleBloodDrop={() => {}} />,
    );
    const button = screen.getByRole('button', { name: 'Toggle LuciferAI' });
    expect(button).toBeTruthy();
    expect(button.className.split(' ')).toContain('opacity-40');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.hasAttribute('disabled')).toBe(false);
  });

  it('clicking the drop toggles LuciferAI', () => {
    const onToggleBloodDrop = vi.fn();
    render(
      <LuciferStatusIndicator {...base} toggleActive={false} onToggleBloodDrop={onToggleBloodDrop} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Toggle LuciferAI' }));
    expect(onToggleBloodDrop).toHaveBeenCalledTimes(1);
  });

  it('when on, the drop is full brightness — never greyed', () => {
    render(
      <LuciferStatusIndicator {...base} toggleActive={true} onToggleBloodDrop={() => {}} />,
    );
    const button = screen.getByRole('button', { name: 'Toggle LuciferAI' });
    const classes = button.className.split(' ');
    expect(classes).toContain('opacity-100');
    expect(classes).not.toContain('opacity-40');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(false);
  });

  it('stays rendered while disabled when it is the toggle — darkened, clickable', () => {
    render(
      <LuciferStatusIndicator enabled={false} checking={false} modelAvailable={false} modelNames={[]} available={false} toggleActive={false} onToggleBloodDrop={() => {}} />,
    );
    const button = screen.getByRole('button', { name: 'Toggle LuciferAI' });
    expect(button).toBeTruthy();
    expect(button.className.split(' ')).toContain('opacity-40');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.textContent).toBe('🩸');
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
    expect(screen.getByText('🩸')).toBeTruthy();
  });
});
