// @vitest-environment jsdom
/**
 * Toggle — the one shared iPhone-style switch for Settings.
 *
 * The contract: a real button with role="switch", aria-checked
 * tracking the state, click flips it and reports the new value,
 * disabled never fires, and the ON state wears Lucid's own
 * iridescent accent gradient (not iOS green) so it reads as ON
 * against the flat grey OFF track.
 *
 * Run with: npm test
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toggle } from '../src/components/Settings/Toggle';

describe('Toggle', () => {
  it('renders as a switch, off by default', () => {
    render(<Toggle checked={false} onChange={() => {}} />);
    const toggle = screen.getByRole('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(toggle.className).not.toContain('lucid-color-shift');
  });

  it('clicking calls onChange with the flipped value', () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('clicking an ON switch calls onChange with false', () => {
    const onChange = vi.fn();
    render(<Toggle checked={true} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('the ON state wears the Lucid accent gradient, not green', () => {
    render(<Toggle checked={true} onChange={() => {}} />);
    const toggle = screen.getByRole('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(toggle.className).toContain('lucid-color-shift');
  });

  it('a disabled switch never fires onChange', () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} disabled />);
    const toggle = screen.getByRole('switch');
    expect(toggle.hasAttribute('disabled')).toBe(true);
    fireEvent.click(toggle);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('passes a title through for the hover tip', () => {
    render(<Toggle checked={false} onChange={() => {}} title="Why this is off" />);
    expect(screen.getByRole('switch').getAttribute('title')).toBe('Why this is off');
  });
});
