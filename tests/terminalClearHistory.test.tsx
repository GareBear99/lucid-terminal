// @vitest-environment jsdom
/**
 * Terminal `clear history` regression tests.
 *
 * Live failure (2026-11-06, LuciferAI disabled): `clear history`
 * printed "✅ Conversation history cleared" but the terminal blocks
 * and the History panel stayed put — the `case 'history'` clear branch
 * only cleared the backend AI conversation
 * (`window.lucidAPI.lucid.clearHistory()`), never the history store
 * that both the terminal block list and the History panel read. After
 * `clear history` the blocks state must be empty — and the History
 * panel, which reads the same store, shows 0 commands.
 *
 * This renders the real Terminal (LuciferAI disabled, so the plugin
 * probe short-circuits) with the Monaco editor mocked (same pattern as
 * tests/inputArea.test.tsx) and the heavy children stubbed, seeds two
 * blocks, submits the command through the prompt, and asserts the
 * store is empty and no block renders.
 *
 * Run with: npm test
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import Terminal from '../src/components/Terminal/Terminal';
import { useHistoryStore } from '../src/stores/historyStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import type { TerminalBlock } from '../src/types';

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

function block(id: string, command: string): TerminalBlock {
  return {
    id,
    command,
    output: `out-${command}`,
    timestamp: 1000,
    isComplete: true,
    isCollapsed: false,
    isProcessing: false,
  };
}

const win = window as unknown as { lucidAPI?: unknown };
let prevLucidAPI: unknown;
let clearHistoryMock: ReturnType<typeof vi.fn>;
let getHistoryMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockState.initImpl = () => Promise.resolve();
  mockState.editorProps = null;
  mockState.mounted = false;
  // jsdom has no scrollIntoView; the terminal auto-scrolls on new blocks.
  (Element.prototype as unknown as Record<string, unknown>).scrollIntoView = vi.fn();
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
  clearHistoryMock = vi.fn().mockResolvedValue(undefined);
  getHistoryMock = vi.fn().mockResolvedValue([{ command: 'pwd' }]);
  prevLucidAPI = win.lucidAPI;
  win.lucidAPI = {
    terminal: {
      onData: () => () => {},
      onExit: () => () => {},
      write: vi.fn(),
    },
    lucid: {
      clearHistory: clearHistoryMock,
      getHistory: getHistoryMock,
    },
  };
  useHistoryStore.setState({ blocksByTab: {} });
});

afterEach(() => {
  if (prevLucidAPI === undefined) delete win.lucidAPI;
  else win.lucidAPI = prevLucidAPI;
  useHistoryStore.setState({ blocksByTab: {} });
});

/** Type a command into the mocked prompt and press Send. */
function submitCommand(command: string) {
  expect(mockState.editorProps).not.toBeNull();
  act(() => {
    mockState.editorProps!.onChange(command);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send command' }));
}

describe('Terminal clear history', () => {
  test('clear history empties the blocks state and the visible history', async () => {
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({ settings: { ...base, luciferAiEnabled: false } });
    try {
      const api = useHistoryStore.getState();
      api.setBlocks('tab-1', [block('b1', 'llm list'), block('b2', 'pwd')]);
      expect(useHistoryStore.getState().blocksByTab['tab-1']).toHaveLength(2);

      const { container } = render(<Terminal tabId="tab-1" />);
      // Two seeded blocks render.
      expect(container.querySelectorAll('.terminal-block')).toHaveLength(2);

      submitCommand('clear history');

      await waitFor(() => {
        expect(useHistoryStore.getState().blocksByTab['tab-1'] ?? []).toEqual([]);
      });
      // The backend AI conversation was still cleared too.
      expect(clearHistoryMock).toHaveBeenCalledTimes(1);
      // No block renders any more — the visible history is empty, and
      // the History panel (which reads this same store) shows 0.
      expect(container.querySelectorAll('.terminal-block')).toHaveLength(0);
    } finally {
      useSettingsStore.setState({ settings: { ...base, luciferAiEnabled: true } });
    }
  });

  test('plain history (no clear) shows history and does NOT empty the blocks', async () => {
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({ settings: { ...base, luciferAiEnabled: false } });
    try {
      const api = useHistoryStore.getState();
      api.setBlocks('tab-1', [block('b1', 'llm list'), block('b2', 'pwd')]);

      const { container } = render(<Terminal tabId="tab-1" />);
      submitCommand('history');

      await waitFor(() => {
        const blocks = useHistoryStore.getState().blocksByTab['tab-1'] ?? [];
        expect(blocks).toHaveLength(3);
        expect(blocks[2].output).toContain('pwd');
      });
      expect(clearHistoryMock).not.toHaveBeenCalled();
      expect(container.querySelectorAll('.terminal-block')).toHaveLength(3);
    } finally {
      useSettingsStore.setState({ settings: { ...base, luciferAiEnabled: true } });
    }
  });
});
