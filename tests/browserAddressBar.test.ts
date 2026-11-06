// @vitest-environment jsdom
/**
 * Address-bar helper tests (BrowserPanel wiring).
 *
 * Gary's fixes (2026-11-05): the browser address bar was squeezed to
 * ~30px by ~15 toolbar buttons in a fixed-width ~465px panel, there
 * was no Cmd+L/Ctrl+L shortcut, and a new tab did not focus the bar.
 * The fix: the nav bar wraps (input min-width 320px, secondary
 * actions flow to a second row), Cmd+L/Ctrl+L focuses the bar, and
 * opening a new tab focuses it.
 *
 * The full BrowserPanel is not rendered here — its effects need
 * window.lucidAPI.browser (same reason as tests/tooltipWiringPanels).
 * What is pinned here is the behaviour the panel delegates to these
 * helpers: which keystrokes count as the focus shortcut, and that
 * focusing selects the current text so typing replaces the URL.
 * The layout (wrap + min-width) is verified live on the Mac, where
 * the rendered width is measurable.
 *
 * Run with: npm test
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  focusAddressBar,
  isFocusAddressBarKeyInput,
  isFocusAddressBarShortcut,
  scheduleAddressBarFocus,
} from '../src/lib/browserAddressBar';

describe('isFocusAddressBarShortcut', () => {
  test('Cmd+L on macOS focuses the address bar', () => {
    expect(
      isFocusAddressBarShortcut({ key: 'l', metaKey: true }),
    ).toBe(true);
  });

  test('Ctrl+L focuses the address bar', () => {
    expect(
      isFocusAddressBarShortcut({ key: 'l', ctrlKey: true }),
    ).toBe(true);
  });

  test('capital L with a modifier still matches (Shift held)', () => {
    expect(
      isFocusAddressBarShortcut({ key: 'L', metaKey: true }),
    ).toBe(true);
  });

  test('bare L with no modifier does not steal the keystroke', () => {
    expect(isFocusAddressBarShortcut({ key: 'l' })).toBe(false);
  });

  test('other Cmd/Ctrl letters are not the address-bar shortcut', () => {
    expect(
      isFocusAddressBarShortcut({ key: 'f', metaKey: true }),
    ).toBe(false);
    expect(
      isFocusAddressBarShortcut({ key: 'k', ctrlKey: true }),
    ).toBe(false);
    expect(
      isFocusAddressBarShortcut({ key: 't', metaKey: true }),
    ).toBe(false);
  });
});

describe('focusAddressBar', () => {
  test('focuses the input and selects its text', () => {
    const input = document.createElement('input');
    input.value = 'https://example.com';
    document.body.appendChild(input);
    try {
      focusAddressBar(input);
      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(input.value.length);
    } finally {
      input.remove();
    }
  });

  test('a null input is a no-op, not a throw', () => {
    expect(() => focusAddressBar(null)).not.toThrow();
  });
});

describe('isFocusAddressBarKeyInput', () => {
  test('Cmd+L key-down inside the page matches', () => {
    expect(
      isFocusAddressBarKeyInput({ type: 'keyDown', key: 'l', meta: true }),
    ).toBe(true);
  });

  test('Ctrl+L key-down matches', () => {
    expect(
      isFocusAddressBarKeyInput({
        type: 'keyDown',
        key: 'L',
        control: true,
      }),
    ).toBe(true);
  });

  test('key-up never matches — the page keeps its own keystrokes', () => {
    expect(
      isFocusAddressBarKeyInput({ type: 'keyUp', key: 'l', meta: true }),
    ).toBe(false);
  });

  test('char events never match', () => {
    expect(
      isFocusAddressBarKeyInput({ type: 'char', key: 'l', meta: true }),
    ).toBe(false);
  });

  test('other Cmd/Ctrl letters never match', () => {
    expect(
      isFocusAddressBarKeyInput({ type: 'keyDown', key: 'f', meta: true }),
    ).toBe(false);
    expect(
      isFocusAddressBarKeyInput({ type: 'keyDown', key: 't', control: true }),
    ).toBe(false);
  });

  test('bare L with no modifier never matches', () => {
    expect(
      isFocusAddressBarKeyInput({ type: 'keyDown', key: 'l' }),
    ).toBe(false);
  });
});

describe('scheduleAddressBarFocus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  test('focuses the input on the first attempt and selects its text', () => {
    const input = document.createElement('input');
    input.value = 'https://example.com';
    document.body.appendChild(input);
    scheduleAddressBarFocus(() => input);
    vi.advanceTimersByTime(0);
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  test('re-focuses after the BrowserView steals focus to the page', () => {
    const input = document.createElement('input');
    input.value = 'https://example.com';
    document.body.appendChild(input);
    scheduleAddressBarFocus(() => input);
    vi.advanceTimersByTime(0);
    expect(document.activeElement).toBe(input);
    // The newly attached view yanks focus to its webarea (the body,
    // from the renderer's point of view).
    input.blur();
    expect(document.activeElement).toBe(document.body);
    vi.advanceTimersByTime(100);
    expect(document.activeElement).toBe(input);
  });

  test('does not yank focus out of the terminal prompt', () => {
    const input = document.createElement('input');
    input.value = 'https://example.com';
    const prompt = document.createElement('textarea');
    document.body.appendChild(input);
    document.body.appendChild(prompt);
    prompt.focus();
    scheduleAddressBarFocus(() => input);
    vi.advanceTimersByTime(1000);
    expect(document.activeElement).toBe(prompt);
  });

  test('cancel stops the later attempts', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const cancel = scheduleAddressBarFocus(() => input);
    vi.advanceTimersByTime(0);
    expect(document.activeElement).toBe(input);
    input.blur();
    cancel();
    vi.advanceTimersByTime(1000);
    expect(document.activeElement).toBe(document.body);
  });

  test('a null input is a no-op, not a throw', () => {
    expect(() =>
      scheduleAddressBarFocus(() => null),
    ).not.toThrow();
    vi.advanceTimersByTime(1000);
  });
});
