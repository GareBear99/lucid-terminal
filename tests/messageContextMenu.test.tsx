// @vitest-environment jsdom
/**
 * Message context menu tests — `src/components/AI/MessageContextMenu.tsx`.
 *
 * Copy is ALWAYS in the menu (Gary: Copy is a basic function, it
 * must not be gated behind Persona Plex — it works with or without
 * Persona Plex installed, Speak toggle on or off). Speak shows only
 * when `showSpeak` is true — that is the Speak gate (Persona Plex
 * installed AND the Speak toggle on AND the active persona's own
 * Speak on; see shouldShowSpeakOption in src/lib/personaPlex.ts,
 * tested below). AIChat always shows this custom menu on a message
 * right-click and never falls back to the browser's default menu,
 * so Copy is never lost in Electron.
 *
 * Run with: npm test
 */
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MessageContextMenu } from '../src/components/AI/MessageContextMenu';
import { shouldShowSpeakOption } from '../src/lib/personaPlex';

describe('MessageContextMenu', () => {
  function renderMenu(over: Partial<{ showSpeak: boolean; onSpeak: () => void; onCopy: () => void; onClose: () => void }> = {}) {
    const showSpeak = over.showSpeak ?? true;
    const onSpeak = over.onSpeak ?? vi.fn();
    const onCopy = over.onCopy ?? vi.fn();
    const onClose = over.onClose ?? vi.fn();
    render(<MessageContextMenu x={100} y={200} showSpeak={showSpeak} onSpeak={onSpeak} onCopy={onCopy} onClose={onClose} />);
    return { onSpeak, onCopy, onClose };
  }

  test('renders Speak and Copy at the click position', () => {
    renderMenu();
    const menu = document.querySelector('[data-message-context-menu]') as HTMLElement;
    expect(menu).not.toBeNull();
    expect(menu.style.left).toBe('100px');
    expect(menu.style.top).toBe('200px');
    expect(document.querySelector('[data-message-speak]')).not.toBeNull();
    expect(document.querySelector('[data-message-copy]')).not.toBeNull();
    expect(screen.getByText('Speak')).toBeTruthy();
    expect(screen.getByText('Copy')).toBeTruthy();
  });

  test('Copy shows without Speak when the gate does not pass (no Persona Plex / Speak off)', () => {
    renderMenu({ showSpeak: false });
    expect(document.querySelector('[data-message-context-menu]')).not.toBeNull();
    expect(document.querySelector('[data-message-speak]')).toBeNull();
    expect(screen.queryByText('Speak')).toBeNull();
    expect(document.querySelector('[data-message-copy]')).not.toBeNull();
    expect(screen.getByText('Copy')).toBeTruthy();
  });

  test('Speak calls onSpeak and closes the menu', () => {
    const { onSpeak, onClose } = renderMenu();
    fireEvent.click(document.querySelector('[data-message-speak]')!);
    expect(onSpeak).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('Copy calls onCopy and closes the menu', () => {
    const { onCopy, onClose } = renderMenu();
    fireEvent.click(document.querySelector('[data-message-copy]')!);
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('Copy still copies and closes when Speak is hidden', () => {
    const { onCopy, onClose } = renderMenu({ showSpeak: false });
    fireEvent.click(document.querySelector('[data-message-copy]')!);
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('Escape closes the menu', () => {
    const { onClose } = renderMenu();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('a click outside the menu closes it', () => {
    const { onClose } = renderMenu();
    // The click-catcher covers the screen; clicking it closes.
    const catcher = document.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(catcher).not.toBeNull();
    fireEvent.click(catcher);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Speak gating (the gate the menu sits behind)', () => {
  test('Speak shows only when Persona Plex is installed and the toggle is on', () => {
    expect(shouldShowSpeakOption({ personaPlexInstalled: true, speakEnabled: true })).toBe(true);
    expect(shouldShowSpeakOption({ personaPlexInstalled: false, speakEnabled: true })).toBe(false);
    expect(shouldShowSpeakOption({ personaPlexInstalled: true, speakEnabled: false })).toBe(false);
  });

  test('a persona that opted out of Speak hides it even when the toggle is on', () => {
    expect(
      shouldShowSpeakOption({ personaPlexInstalled: true, speakEnabled: true, personaSpeakEnabled: false }),
    ).toBe(false);
  });
});
