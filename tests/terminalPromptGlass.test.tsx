// @vitest-environment jsdom
/**
 * Terminal prompt panel tests — squared glass backwall, no drag.
 *
 * Gary (2026-11-07): the terminal prompt area must NOT be
 * drag-extendable, and it gets a squared glass backwall like the
 * Warp AI terminal. The backwall is the prompt's own panel
 * (prompt-input-wrap in Terminal.tsx): frosted translucent glass,
 * subtle border, SQUARE corners (no rounding) — in BOTH states,
 * LuciferAI on and flat (plugin off). The backwall is the prompt's
 * panel, not bubble chrome, so it shows while flat too; the rainbow
 * processing glow stays off while flat (covered in
 * tests/inputArea.test.tsx).
 *
 * Segregation (Gary, 2026-11-07): Warp marks where the output ends and
 * the input begins. The prompt panel's top edge is that divider —
 * thicker (2px) and brighter than the other sides — so the boundary
 * between the terminal output above and the prompt panel below is
 * unmistakable, in both states.
 *
 * This renders the real Terminal (same harness pattern as
 * tests/terminalClearHistory.test.tsx) with the Monaco editor mocked
 * and the heavy children stubbed, and asserts on the prompt panel.
 *
 * Run with: npm test
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Terminal from '../src/components/Terminal/Terminal';
import { useHistoryStore } from '../src/stores/historyStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useTerminalStore } from '../src/stores/terminalStore';

// --- Monaco mock (same pattern as tests/inputArea.test.tsx) ---
const mockState = vi.hoisted(() => ({
  initImpl: null as null | (() => Promise<unknown>),
  editorProps: null as null | Record<string, any>,
  mounted: false,
}));

vi.mock('@monaco-editor/react', () => {
  const fakeEditor = {
    getValue: () => '',
    setValue: () => {},
    getModel: () => null,
    setPosition: () => {},
    addCommand: () => {},
    focus: () => {},
    getContentHeight: () => 40,
    onDidContentSizeChange: () => ({ dispose: () => {} }),
  };
  const fakeMonaco = {
    editor: { defineTheme: () => {}, setTheme: () => {} },
    KeyCode: { Enter: 3, UpArrow: 16, DownArrow: 18 },
  };
  return {
    loader: {
      init: () =>
        mockState.initImpl ? mockState.initImpl() : new Promise(() => {}),
      config: () => {},
    },
    default: (props: Record<string, any>) => {
      mockState.editorProps = props;
      return (
        <div
          data-testid="monaco-editor"
          ref={(el: unknown) => {
            if (el && !mockState.mounted) {
              mockState.mounted = true;
              props.onMount?.(fakeEditor, fakeMonaco);
            }
          }}
        />
      );
    },
  };
});

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

beforeEach(() => {
  mockState.initImpl = () => Promise.resolve();
  mockState.editorProps = null;
  mockState.mounted = false;
  // jsdom has no scrollIntoView; the terminal auto-scrolls on new blocks.
  (Element.prototype as unknown as Record<string, unknown>).scrollIntoView =
    vi.fn();
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
});

afterEach(() => {
  if (prevLucidAPI === undefined) delete win.lucidAPI;
  else win.lucidAPI = prevLucidAPI;
  useHistoryStore.setState({ blocksByTab: {} });
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    settings: { ...base, luciferAiEnabled: prevLuciferAiEnabled },
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

describe('terminal prompt panel — squared glass backwall, segregation divider, no drag', () => {
  test('LuciferAI on: the prompt panel is a squared glass backwall', async () => {
    setLuciferAiEnabled(true);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('monaco-editor');
    const wrap = screen.getByTestId('prompt-input-wrap');
    expectSquaredGlassBackwall(wrap);
    // No drag handle anywhere in the terminal prompt.
    expect(screen.queryByTestId('input-drag-handle')).toBeNull();
  });

  test('LuciferAI off (flat): the prompt panel is STILL a squared glass backwall', async () => {
    setLuciferAiEnabled(false);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('monaco-editor');
    const wrap = screen.getByTestId('prompt-input-wrap');
    expectSquaredGlassBackwall(wrap);
    // No drag handle while flat either.
    expect(screen.queryByTestId('input-drag-handle')).toBeNull();
  });
});

/**
 * Prompt SECTION (Gary, 2026-11-07 ~08:34 PST): "see how their prompt
 * box is a whole section make ours significantly more vantage glass
 * for our section". Warp's prompt box is a full-width panel with its
 * own header/identity line and context lines — Lucid's prompt is the
 * same shape, more glass: a distinct frosted section (header row +
 * input row) with a 2px top divider, in BOTH states. The section sits
 * ON the misty-black main screen: translucent gradient, never opaque.
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
    await screen.findByTestId('monaco-editor');
    const section = screen.getByTestId('prompt-section');
    expectPromptSection(section);
    const header = screen.getByTestId('prompt-section-header');
    expect(header.textContent).toContain('Terminal');
    expect(header.textContent).toContain('plain shell');
    // The backwall inside is still the squared glass panel.
    expectSquaredGlassBackwall(screen.getByTestId('prompt-input-wrap'));
  });

  test('LuciferAI off (flat): the prompt is STILL a whole glass section', async () => {
    setLuciferAiEnabled(false);
    render(<Terminal tabId="tab-1" />);
    await screen.findByTestId('monaco-editor');
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
    useTerminalStore.setState({
      tabs: [{ id: 'tab-1', title: 'Terminal 1', cwd: '/Users/gary', isActive: true }],
      activeTabId: 'tab-1',
    });
    try {
      render(<Terminal tabId="tab-1" />);
      await screen.findByTestId('monaco-editor');
      const header = screen.getByTestId('prompt-section-header');
      expect(header.textContent).toContain('/Users/gary');
    } finally {
      useTerminalStore.setState({ tabs: [], activeTabId: null });
    }
  });
});
