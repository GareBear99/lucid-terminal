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

describe('LuciferStatusIndicator — blood drop toggle (Gary, 2026-11-07 ~09:20 PST)', () => {
  // The drop next to the send arrow is a clickable toggle for the
  // blood drop terminal. It ALWAYS defaults darkened/off, so no blood
  // drop terminal is awaiting commands until it is turned on.
  const base = {
    enabled: true,
    checking: false,
    modelAvailable: true,
    modelNames: ['tinyllama'],
    available: true,
  };

  it('defaults darkened/off — the drop is dimmed until turned on', () => {
    render(
      <LuciferStatusIndicator {...base} bloodDropActive={false} onToggleBloodDrop={() => {}} />,
    );
    const button = screen.getByRole('button', { name: 'Toggle blood drop terminal' });
    expect(button).toBeTruthy();
    expect(button.className.split(' ')).toContain('opacity-40');
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking the drop toggles the blood drop terminal', () => {
    const onToggleBloodDrop = vi.fn();
    render(
      <LuciferStatusIndicator {...base} bloodDropActive={false} onToggleBloodDrop={onToggleBloodDrop} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Toggle blood drop terminal' }));
    expect(onToggleBloodDrop).toHaveBeenCalledTimes(1);
  });

  it('when on, the drop is full brightness', () => {
    render(
      <LuciferStatusIndicator {...base} bloodDropActive={true} onToggleBloodDrop={() => {}} />,
    );
    const button = screen.getByRole('button', { name: 'Toggle blood drop terminal' });
    const classes = button.className.split(' ');
    expect(classes).toContain('opacity-100');
    expect(classes).not.toContain('opacity-40');
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('renders nothing when disabled, even with a toggle handler', () => {
    const { container } = render(
      <LuciferStatusIndicator enabled={false} checking={false} modelAvailable={false} modelNames={[]} available={false} bloodDropActive={false} onToggleBloodDrop={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('without a toggle handler it stays a plain status display (no button)', () => {
    render(<LuciferStatusIndicator {...base} />);
    expect(screen.queryByRole('button', { name: 'Toggle blood drop terminal' })).toBeNull();
    expect(screen.getByText('🩸')).toBeTruthy();
  });
});
