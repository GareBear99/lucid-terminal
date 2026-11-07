// @vitest-environment jsdom
/**
 * Terminal bell sound tests (Gary, 2026-11-07): "have a play button
 * for terminal bell sound".
 *
 * What was broken: the Terminal tab had a "Terminal bell sound"
 * toggle, but bellSound was write-only — nothing read it, no bell
 * was ever played, and there was no way to preview the sound. The
 * terminal is a custom block renderer (no xterm onBell); the bell
 * arrives as a BEL (\x07) character in PTY data.
 *
 * Covers:
 * - lib: containsBell / stripBell / processTerminalBell — BEL
 *   detection, BEL stripped from displayed output, the bell rings
 *   only when enabled.
 * - Settings: the Terminal tab shows a play button next to the bell
 *   toggle; clicking it plays the bell even when the toggle is OFF
 *   (preview is for hearing what it sounds like before enabling
 *   it); the toggle still flips bellSound.
 *
 * Run with: npx vitest run tests/terminalBell.test.tsx
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  TERMINAL_BELL_CHAR,
  containsBell,
  stripBell,
  processTerminalBell,
  resetTerminalBellContext,
} from '../src/lib/terminalBell';
import SettingsPanel from '../src/components/Settings/SettingsPanel';
import { useSettingsStore } from '../src/stores/settingsStore';

// --- Mock AudioContext -------------------------------------------------

interface MockOsc {
  type: string;
  frequency: { value: number };
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

interface MockGain {
  connect: ReturnType<typeof vi.fn>;
  gain: {
    value: number;
    setValueAtTime: ReturnType<typeof vi.fn>;
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
}

function installMockAudioContext() {
  const oscillators: MockOsc[] = [];
  const gains: MockGain[] = [];
  class MockAudioContext {
    state = 'running';
    currentTime = 0;
    destination = {};
    resume = vi.fn(async () => undefined);
    createOscillator = vi.fn(() => {
      const osc: MockOsc = {
        type: '',
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(osc);
      return osc;
    });
    createGain = vi.fn(() => {
      const gain: MockGain = {
        connect: vi.fn(),
        gain: {
          value: 0,
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
      };
      gains.push(gain);
      return gain;
    });
  }
  (window as unknown as { AudioContext?: unknown }).AudioContext =
    MockAudioContext;
  return { oscillators, gains };
}

describe('terminal bell lib', () => {
  let audio: ReturnType<typeof installMockAudioContext>;
  let prevAudioContext: unknown;

  beforeEach(() => {
    prevAudioContext = (window as unknown as { AudioContext?: unknown })
      .AudioContext;
    audio = installMockAudioContext();
    resetTerminalBellContext();
  });

  afterEach(() => {
    const win = window as unknown as { AudioContext?: unknown };
    if (prevAudioContext === undefined) delete win.AudioContext;
    else win.AudioContext = prevAudioContext;
    resetTerminalBellContext();
  });

  test('BEL is the 0x07 character', () => {
    expect(TERMINAL_BELL_CHAR).toBe('\x07');
    expect(TERMINAL_BELL_CHAR.charCodeAt(0)).toBe(7);
  });

  test('containsBell finds BEL, and only BEL', () => {
    expect(containsBell('hello\x07world')).toBe(true);
    expect(containsBell('\x07')).toBe(true);
    expect(containsBell('hello world')).toBe(false);
    expect(containsBell('')).toBe(false);
  });

  test('stripBell removes BEL chars and leaves everything else', () => {
    expect(stripBell('a\x07b\x07c')).toBe('abc');
    expect(stripBell('no bell here')).toBe('no bell here');
    expect(stripBell('')).toBe('');
  });

  test('BEL + enabled rings the bell and strips BEL from the output', () => {
    const out = processTerminalBell('done\x07\n', true);
    expect(out).toBe('done\n');
    expect(audio.oscillators.length).toBeGreaterThan(0);
    expect(audio.oscillators[0].start).toHaveBeenCalled();
  });

  test('BEL + disabled stays silent but still strips BEL', () => {
    const out = processTerminalBell('done\x07\n', false);
    expect(out).toBe('done\n');
    expect(audio.oscillators.length).toBe(0);
  });

  test('no BEL never rings, enabled or not', () => {
    expect(processTerminalBell('plain output\n', true)).toBe('plain output\n');
    expect(processTerminalBell('plain output\n', false)).toBe(
      'plain output\n',
    );
    expect(audio.oscillators.length).toBe(0);
  });
});

describe('Terminal tab bell play button', () => {
  const mockSet = vi.fn(async (_key: string, _value: unknown) => undefined);
  let prevLucidAPI: unknown;
  let prevAudioContext: unknown;
  let audio: ReturnType<typeof installMockAudioContext>;

  function setBellSound(enabled: boolean) {
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: { ...base, bellSound: enabled },
    });
  }

  beforeEach(() => {
    const win = window as unknown as Record<string, unknown>;
    prevLucidAPI = win.lucidAPI;
    win.lucidAPI = {
      settings: {
        set: mockSet,
        getAll: vi.fn(async () => ({})),
        hasApiKey: vi.fn(async () => false),
        hasPingKey: vi.fn(async () => false),
        getStorageStatus: vi.fn(async () => ({
          degraded: false,
          reason: null,
        })),
      },
    };
    mockSet.mockClear();
    prevAudioContext = (window as unknown as { AudioContext?: unknown })
      .AudioContext;
    audio = installMockAudioContext();
    resetTerminalBellContext();
    setBellSound(false);
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    if (prevLucidAPI === undefined) delete win.lucidAPI;
    else win.lucidAPI = prevLucidAPI;
    const winAudio = window as unknown as { AudioContext?: unknown };
    if (prevAudioContext === undefined) delete winAudio.AudioContext;
    else winAudio.AudioContext = prevAudioContext;
    resetTerminalBellContext();
  });

  test('the play button renders next to the bell toggle', () => {
    const { container } = render(<SettingsPanel initialTab="terminal" />);
    expect(screen.getByText('Terminal bell sound')).not.toBeNull();
    const button = container.querySelector('[data-terminal-bell-play]');
    expect(button).not.toBeNull();
    // It sits in the same section as the toggle.
    const section = screen
      .getByText('Terminal bell sound')
      .closest('section');
    expect(section?.contains(button)).toBe(true);
  });

  test('clicking play previews the bell even when the toggle is OFF', () => {
    setBellSound(false);
    const { container } = render(<SettingsPanel initialTab="terminal" />);
    const button = container.querySelector(
      '[data-terminal-bell-play]',
    ) as HTMLElement;
    fireEvent.click(button);
    expect(audio.oscillators.length).toBeGreaterThan(0);
    expect(audio.oscillators[0].start).toHaveBeenCalled();
    // Preview does not flip the toggle on.
    expect(useSettingsStore.getState().settings.bellSound).toBe(false);
  });

  test('clicking play previews the bell when the toggle is ON too', () => {
    setBellSound(true);
    const { container } = render(<SettingsPanel initialTab="terminal" />);
    const button = container.querySelector(
      '[data-terminal-bell-play]',
    ) as HTMLElement;
    fireEvent.click(button);
    expect(audio.oscillators.length).toBeGreaterThan(0);
    expect(audio.oscillators[0].start).toHaveBeenCalled();
  });

  test('the bell toggle still flips bellSound', async () => {
    setBellSound(false);
    const { container } = render(<SettingsPanel initialTab="terminal" />);
    const label = screen.getByText('Terminal bell sound').closest('label');
    const toggle = label?.querySelector('[role="switch"]') as HTMLElement;
    expect(toggle).not.toBeNull();
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    // updateSetting is async (persists via IPC first), so the store
    // flips on the next microtask — await the click.
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(useSettingsStore.getState().settings.bellSound).toBe(true);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(container.querySelector('[data-terminal-bell-play]')).not.toBeNull();
  });
});
