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
  function renderMenu(over: Partial<{
    showSpeak: boolean;
    onSpeak: () => void;
    onCopy: () => void;
    onClose: () => void;
    speakActors: string[];
    selectedActor: string | null;
    defaultActorLabel: string;
    currentSpeakVoice: string | null;
    onPickActor: (voice: string | null) => void;
  }> = {}) {
    const showSpeak = over.showSpeak ?? true;
    const onSpeak = over.onSpeak ?? vi.fn();
    const onCopy = over.onCopy ?? vi.fn();
    const onClose = over.onClose ?? vi.fn();
    const onPickActor = over.onPickActor ?? vi.fn();
    render(
      <MessageContextMenu
        x={100}
        y={200}
        showSpeak={showSpeak}
        onSpeak={onSpeak}
        onCopy={onCopy}
        onClose={onClose}
        speakActors={over.speakActors ?? ['Karen', 'Fred']}
        selectedActor={over.selectedActor ?? null}
        defaultActorLabel={over.defaultActorLabel ?? "Lucifer's voice · Karen"}
        currentSpeakVoice={over.currentSpeakVoice ?? 'Karen'}
        onPickActor={onPickActor}
      />,
    );
    return { onSpeak, onCopy, onClose, onPickActor };
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

describe('Speak actor dropdown (Gary, 2026-11-07 — pick an actor, or Default for the active Homunculus voice)', () => {
  function renderMenu(over: Partial<{
    showSpeak: boolean;
    onSpeak: () => void;
    onClose: () => void;
    speakActors: string[];
    selectedActor: string | null;
    defaultActorLabel: string;
    currentSpeakVoice: string | null;
    onPickActor: (voice: string | null) => void;
  }> = {}) {
    const onSpeak = over.onSpeak ?? vi.fn();
    const onClose = over.onClose ?? vi.fn();
    const onPickActor = over.onPickActor ?? vi.fn();
    render(
      <MessageContextMenu
        x={100}
        y={200}
        showSpeak={over.showSpeak ?? true}
        onSpeak={onSpeak}
        onCopy={vi.fn()}
        onClose={onClose}
        speakActors={over.speakActors ?? ['Karen', 'Fred']}
        selectedActor={over.selectedActor ?? null}
        defaultActorLabel={over.defaultActorLabel ?? "Lucifer's voice · Karen"}
        currentSpeakVoice={over.currentSpeakVoice ?? 'Karen'}
        onPickActor={onPickActor}
      />,
    );
    return { onSpeak, onClose, onPickActor };
  }

  const openActors = () => {
    fireEvent.click(document.querySelector('[data-message-speak-actors]')!);
  };

  test('the dropdown arrow sits next to Speak, and the actor list is closed until it is clicked', () => {
    renderMenu();
    expect(document.querySelector('[data-message-speak-actors]')).not.toBeNull();
    expect(document.querySelector('[data-message-speak-actor-list]')).toBeNull();
    openActors();
    expect(document.querySelector('[data-message-speak-actor-list]')).not.toBeNull();
  });

  test('the arrow toggles the list closed again on a second click, without speaking', () => {
    const { onSpeak } = renderMenu();
    openActors();
    openActors();
    expect(document.querySelector('[data-message-speak-actor-list]')).toBeNull();
    expect(onSpeak).not.toHaveBeenCalled();
  });

  test('the list shows the Default row (the active Homunculus voice) plus every actor', () => {
    renderMenu();
    openActors();
    expect(screen.getByText("Default — Lucifer's voice · Karen")).toBeTruthy();
    expect(screen.getByText('Karen')).toBeTruthy();
    expect(screen.getByText('Fred')).toBeTruthy();
  });

  test('picking an actor calls onPickActor with that voice and closes the menu (it does not call onSpeak)', () => {
    const { onPickActor, onSpeak, onClose } = renderMenu();
    openActors();
    fireEvent.click(document.querySelector('[data-message-speak-actor][data-voice="Fred"]')!);
    expect(onPickActor).toHaveBeenCalledTimes(1);
    expect(onPickActor).toHaveBeenCalledWith('Fred');
    expect(onSpeak).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('picking Default clears the pick (null) and closes the menu', () => {
    const { onPickActor, onClose } = renderMenu({ selectedActor: 'Fred' });
    openActors();
    fireEvent.click(document.querySelector('[data-speak-actor-default]')!);
    expect(onPickActor).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('clicking Speak itself speaks with the current selection and never opens the list', () => {
    const { onSpeak } = renderMenu({ selectedActor: 'Fred', currentSpeakVoice: 'Fred' });
    fireEvent.click(document.querySelector('[data-message-speak]')!);
    expect(onSpeak).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-message-speak-actor-list]')).toBeNull();
    // The Speak row shows the voice it will use.
    expect(screen.getByText('Fred')).toBeTruthy();
  });

  test('with no actors the list shows only the Default row', () => {
    renderMenu({ speakActors: [] });
    openActors();
    expect(document.querySelector('[data-speak-actor-default]')).not.toBeNull();
    expect(document.querySelectorAll('[data-message-speak-actor]').length).toBe(0);
  });

  test('no dropdown arrow when Speak is hidden (the gate does not pass)', () => {
    renderMenu({ showSpeak: false });
    expect(document.querySelector('[data-message-speak-actors]')).toBeNull();
    expect(document.querySelector('[data-message-speak]')).toBeNull();
  });
});
