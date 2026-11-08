// @vitest-environment jsdom
/**
 * Main-screen mist — the terminal must NOT cover the splash mist (Gary, 2026-11-07).
 *
 * Gary (2026-11-07 ~08:07 PST): "tabs are good but where the main
 * screen splash blackness i asked for to go with it" — the tabs glass
 * was good, but the main screen showed NO misty black at all.
 *
 * Root cause (two parts, both verified 2026-11-07):
 * 1. STALE BUILD: the running Lucid (pid 8050) was built from an
 *    app.asar modified 15:31:30Z, ~24 minutes BEFORE commit 00d22ec
 *    (15:55:28Z) that added the mist — the running app did not contain
 *    the mist code at all. (Fixed by re-sync + rebuild + relaunch.)
 * 2. OPAQUE TERMINAL BACKGROUND: even in the 00d22ec code, the terminal
 *    content div set an inline backgroundColor to the theme's opaque
 *    terminal.background (Sunset #1f1315, every theme's is an opaque
 *    hex). The terminal IS the main screen, and that opaque layer sat
 *    above the mist (App renders SplashMist at -z-10 in the isolated
 *    root) and covered it completely. The 00d22ec coordinator made
 *    Synth/Forge/Settings roots transparent but missed the terminal.
 *
 * The fix: the terminal content div has NO background at all — no inline
 * backgroundColor, no opaque bg class — so the App root's pure black
 * #000 + the SplashMist smoke show through. The theme still colours
 * the text, cursor and accents; only the backdrop is the mist now.
 * (Gary: "the main screen should always be splashscreen misty black".)
 *
 * WHERE THE MIST LIVES NOW (Gary, 2026-11-08 ~07:05 PST): the
 * non-devmode terminal page is a clean unison — FULL BLACK, opaque
 * black root — so the mist is covered there by design. The mist
 * still shows in DEV MODE (transparent page, glass panels over the
 * mist). These tests run with devMode ON; the black non-devmode
 * page is covered in tests/nonDevModeTopology.test.tsx.
 *
 * This renders the real Terminal (same harness pattern as
 * tests/terminalPromptGlass.test.tsx) with the Monaco editor mocked
 * and the heavy children stubbed, and asserts the terminal content
 * container carries no opaque background, in BOTH LuciferAI states.
 *
 * Run with: npm test
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Terminal from '../src/components/Terminal/Terminal';
import { useHistoryStore } from '../src/stores/historyStore';
import { useSettingsStore } from '../src/stores/settingsStore';


// Heavy children the test does not care about — stub them so the render
// stays light (SentinelFace runs a rAF gaze loop; FixNetStatus fetches
// stats on mount).
vi.mock('../src/components/Synth/SentinelFace', () => ({
  SentinelFace: () => null,
}));
vi.mock('../src/components/FixNet/FixNetStatus', () => ({
  FixNetStatus: () => null,
}));

const win = window as unknown as { lucidAPI?: unknown };
let prevLucidAPI: unknown;
let prevLuciferAiEnabled: boolean | undefined;
let prevDevMode: boolean | undefined;

beforeEach(() => {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockImplementation((q: string) => ({
        matches: false,
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      })),
      configurable: true,
    });
  }
  prevLucidAPI = win.lucidAPI;
  win.lucidAPI = {
    terminal: {
      onData: () => () => {},
      onExit: () => () => {},
      write: vi.fn(),
    },
    lucid: {
      init: vi.fn().mockResolvedValue({ success: true }),
      getModelStatuses: vi.fn().mockResolvedValue({}),
      clearHistory: vi.fn().mockResolvedValue(undefined),
      getHistory: vi.fn().mockResolvedValue([]),
    },
  };
  useHistoryStore.setState({ blocksByTab: {} });
  prevLuciferAiEnabled =
    useSettingsStore.getState().settings.luciferAiEnabled;
  // The mist shows in DEV MODE now (Gary, 2026-11-08): the
  // non-devmode page is opaque black by design.
  prevDevMode = useSettingsStore.getState().settings.devMode;
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({ settings: { ...base, devMode: true } });
});

afterEach(() => {
  if (prevLucidAPI === undefined) delete win.lucidAPI;
  else win.lucidAPI = prevLucidAPI;
  useHistoryStore.setState({ blocksByTab: {} });
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    settings: { ...base, luciferAiEnabled: prevLuciferAiEnabled, devMode: prevDevMode },
  });
});

function setLuciferAiEnabled(enabled: boolean) {
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({ settings: { ...base, luciferAiEnabled: enabled } });
}

/** The terminal content container must carry NO opaque background — no
 *  inline backgroundColor and no opaque bg class — so the App root's
 *  pure black + SplashMist show through and the main screen reads as
 *  misty black. */
function expectNoOpaqueBackground(content: HTMLElement) {
  expect(content.style.backgroundColor).toBe('');
  expect(content.className).not.toMatch(/bg-\[/);
}

describe('terminal main screen — splash mist visible, no opaque background', () => {
  test('LuciferAI on: the terminal content has NO opaque background', async () => {
    setLuciferAiEnabled(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');
    const content = screen.getByTestId('terminal-content');
    expectNoOpaqueBackground(content);
  });

  test('LuciferAI off (flat): the terminal content STILL has no opaque background', async () => {
    setLuciferAiEnabled(false);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');
    const content = screen.getByTestId('terminal-content');
    expectNoOpaqueBackground(content);
  });
});
