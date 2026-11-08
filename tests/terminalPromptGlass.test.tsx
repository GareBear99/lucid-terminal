// @vitest-environment jsdom
/**
 * Terminal prompt panel tests — squared glass backwall, drag on the dev bar.
 *
 * Gary (2026-11-07): the terminal prompt gets a squared glass backwall
 * like the Warp AI terminal. The drag handle was removed from the
 * prompt then (ec33aa9) and is RESTORED by Gary's 2026-11-08
 * "recover it all": it lives on the detached dev-bar input (drag up
 * to grow, down to shrink, max halfway at 50vh) — NOT on the prompt
 * panel (xterm surface) itself, which keeps the squared glass
 * backwall + segregation divider intact. The backwall is the prompt's own panel
 * (prompt-input-wrap in Terminal.tsx): frosted translucent glass,
 * subtle border, SQUARE corners (no rounding) — in BOTH LuciferAI
 * states, on and flat (plugin off). The backwall is the prompt's
 * panel, not bubble chrome, so it shows while flat too; the rainbow
 * processing glow stays off while flat (covered in
 * tests/inputArea.test.tsx).
 *
 * WHERE THE GLASS LIVES NOW (Gary, 2026-11-08 ~07:05 PST): the
 * non-devmode terminal page is a clean unison — full black page,
 * black prompt bar, like Warp AI — so the glass backwall and the
 * glass prompt section are the DEV-MODE look now. These tests run
 * with devMode ON; the black non-devmode look is covered in
 * tests/nonDevModeTopology.test.tsx. The LuciferAI on/off split
 * still applies inside dev mode: glass in both states.
 *
 * Segregation (Gary, 2026-11-07): Warp marks where the output ends and
 * the input begins. The prompt panel's top edge is that divider —
 * thicker (2px) and brighter than the other sides — so the boundary
 * between the terminal output above and the prompt panel below is
 * unmistakable, in both states.
 *
 * This renders the real Terminal (same harness pattern as
 * tests/terminalClearHistory.test.tsx) with the heavy children
 * stubbed, and asserts on the prompt panel. jsdom has no canvas
 * 2d context, so XtermSurface renders its plain-text fallback —
 * the prompt panel under test is the same element either way.
 *
 * Run with: npm test
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import Terminal from '../src/components/Terminal/Terminal';
import { useHistoryStore } from '../src/stores/historyStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useTerminalStore } from '../src/stores/terminalStore';


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
  // The glass is the DEV-MODE look now (Gary, 2026-11-08): these
  // tests run with devMode ON.
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

/** The squared glass backwall classes on the prompt panel, plus the
 *  segregation divider: the panel's top edge is the boundary between
 *  the terminal output above and the prompt below, so it is thicker
 *  (2px) and brighter than the other three sides. */
function expectSquaredGlassBackwall(wrap: HTMLElement) {
  // Squared: square corners, no rounding anywhere.
  expect(wrap.className).toContain('rounded-none');
  expect(wrap.className).not.toContain('rounded-lg');
  expect(wrap.className).not.toContain('rounded-md');
  // Glass: frosted translucent background + backdrop blur + border.
  expect(wrap.className).toContain('bg-[var(--bg-tertiary)]/50');
  expect(wrap.className).toContain('backdrop-blur-md');
  expect(wrap.className).toContain('border');
  expect(wrap.className).toContain('border-[var(--border)]');
  // Segregation divider: the top edge is the output/input boundary.
  expect(wrap.className).toContain('border-t-2');
  expect(wrap.className).toContain('border-t-[var(--text-muted)]');
}

describe('terminal prompt panel — squared glass backwall, segregation divider, drag on the dev bar', () => {
  test('LuciferAI on: the prompt panel is a squared glass backwall', async () => {
    setLuciferAiEnabled(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');
    const wrap = screen.getByTestId('prompt-input-wrap');
    expectSquaredGlassBackwall(wrap);
    // No drag handle on the prompt PANEL itself (the xterm surface).
    expect(within(wrap).queryByTestId('input-drag-handle')).toBeNull();
    // The handle lives on the detached dev-bar input (recovered).
    expect(screen.queryByTestId('input-drag-handle')).not.toBeNull();
  });

  test('LuciferAI off (flat): the prompt panel is STILL a squared glass backwall', async () => {
    setLuciferAiEnabled(false);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');
    const wrap = screen.getByTestId('prompt-input-wrap');
    expectSquaredGlassBackwall(wrap);
    // No drag handle on the prompt PANEL itself while flat either —
    // the handle is on the dev-bar input, which keeps it while flat.
    expect(within(wrap).queryByTestId('input-drag-handle')).toBeNull();
    expect(screen.queryByTestId('input-drag-handle')).not.toBeNull();
  });
});

/**
 * Prompt SECTION (Gary, 2026-11-07 ~08:34 PST): "see how their prompt
 * box is a whole section make ours significantly more vantage glass
 * for our section". Warp's prompt box is a full-width panel with its
 * own header/identity line and context lines — Lucid's prompt is the
 * same shape, more glass: a distinct frosted section (header row +
 * input row) with a 2px top divider, in BOTH LuciferAI states. The
 * section sits ON the misty-black main screen: translucent gradient,
 * never opaque. DEV MODE ONLY now (Gary, 2026-11-08): non-devmode is
 * the solid black Warp bar instead.
 */
describe('terminal prompt — whole glass section', () => {
  /** The section's glass: 2px top divider + translucent gradient. */
  function expectPromptSection(section: HTMLElement) {
    // A section of its own: the 2px top divider marks where the
    // output ends and the prompt begins.
    expect(section.className).toContain('border-t-2');
    expect(section.className).toContain('border-t-[var(--text-muted)]');
    // Glass, never opaque: translucent gradient over the mist.
    const style = section.getAttribute('style') ?? '';
    expect(style).toContain('linear-gradient');
    expect(style).toContain('rgba(38, 45, 56, 0.55)');
    expect(style).toContain('rgba(22, 27, 34, 0.65)');
  }

  test('LuciferAI on: the prompt is a whole glass section with a header', async () => {
    setLuciferAiEnabled(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');
    const section = screen.getByTestId('prompt-section');
    expectPromptSection(section);
    const header = screen.getByTestId('prompt-section-header');
    expect(header.textContent).toContain('Terminal');
    // Dev mode: the header carries the delinked badge + note, not
    // the 'plain shell' label (that label is the synced header).
    expect(header.textContent).toContain('DEV — prompt bar delinked');
    expect(header.textContent).toContain('delinked — no live cwd');
    // The backwall inside is still the squared glass panel.
    expectSquaredGlassBackwall(screen.getByTestId('prompt-input-wrap'));
  });

  test('LuciferAI off (flat): the prompt is STILL a whole glass section', async () => {
    setLuciferAiEnabled(false);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('xterm-surface');
    const section = screen.getByTestId('prompt-section');
    expectPromptSection(section);
    const header = screen.getByTestId('prompt-section-header');
    expect(header.textContent).toContain('Terminal');
    // No flat outer bar anymore — the section is glass in both states.
    expect(section.className).not.toContain('input-container-flat');
    expectSquaredGlassBackwall(screen.getByTestId('prompt-input-wrap'));
  });

  test('the header shows the tab working directory as the context line', async () => {
    setLuciferAiEnabled(true);
    // The live cwd is the NON-DEVMODE header: dev mode delinks the
    // bar and shows "delinked — no live cwd" instead, so this test
    // runs with devMode OFF (it asserts no glass).
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({ settings: { ...base, devMode: false } });
    useTerminalStore.setState({
      tabs: [{ id: 'tab-1', title: 'Terminal 1', cwd: '/Users/gary', isActive: true }],
      activeTabId: 'tab-1',
    });
    try {
      render(<Terminal tabId="tab-1" />);
      await screen.findByTestId('xterm-surface');
      const header = screen.getByTestId('prompt-section-header');
      expect(header.textContent).toContain('/Users/gary');
    } finally {
      useTerminalStore.setState({ tabs: [], activeTabId: null });
    }
  });

  test('glass match (Gary, 2026-11-07 ~09:26 PST): everything ON the glass is glass, not opaque', async () => {
    setLuciferAiEnabled(true);
    render(<Terminal tabId="tab-1" luciferToggleActive={false} onToggleLuciferAi={() => {}} />);
    await screen.findByTestId('xterm-surface');
    // An on-glass element carries no opaque fill: every bg- token is
    // either a hover: sheen or a translucent (/NN) tint.
    const expectGlassMatched = (el: HTMLElement) => {
      const opaque = el.className
        .split(/\s+/)
        .filter((t) => t.startsWith('bg-') && !t.startsWith('hover:') && !t.includes('/'));
      expect(opaque).toEqual([]);
    };
    // The blood drop toggle (LuciferAI on): lit, transparent, no fill.
    expectGlassMatched(screen.getByRole('button', { name: 'Toggle LuciferAI' }));
    // The hint line in the prompt row: plain text, no fill. (The
    // send arrow and the `~` are gone with the Monaco prompt — the
    // terminal surface IS the input now, so there is no send button
    // left to match. That is the real terminal, not a regression.)
    const section = screen.getByTestId('prompt-section');
    expectGlassMatched(within(section).getByText(/Real shell/));
    const header = screen.getByTestId('prompt-section-header');
    expectGlassMatched(header);
    header.querySelectorAll('span').forEach((s) => expectGlassMatched(s as unknown as HTMLElement));
  });
});
