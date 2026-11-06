// @vitest-environment jsdom
/**
 * LuciferStatusIndicator — the blood drop in the terminal prompt
 * row. The disabled state must render NOTHING (no 🩸, no ⏳, no ⚪
 * offline dot — that is itself a LuciferAI trace), so the flex row
 * reflows and the input stretches to fill the gap.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
