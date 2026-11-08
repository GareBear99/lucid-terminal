// @vitest-environment jsdom
/**
 * Prompt input tests.
 *
 * Gary's fixes (2026-11-05): the cursor/text must not hug the
 * bubble edge (padding), the bubble must grow upward with the input
 * up to one-third of the page (33.33vh), and past that cap the input
 * must scroll so long input stays readable.
 *
 * Gary's fix (2026-11-07): the terminal prompt is NOT drag-extendable
 * — there is no drag handle on the prompt area. The input still grows
 * with the content up to the 33.33vh default cap, then scrolls. The
 * fallback textarea's maxHeight is the default cap too, not a drag max.
 * (The AI-chat input keeps its own drag handle; this file only covers
 * the terminal prompt.)
 *
 * The Monaco editor is stubbed out here (same pattern as
 * tests/codeEditorFallback.test.tsx): what matters is the height the
 * InputArea asks for, the scroll config, and the fallback textarea's
 * behaviour when Monaco fails. The fake editor reports content
 * heights on demand so the grow-to-cap logic is exercised for real.
 *
 * Run with: npm test
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useState } from 'react';
import { InputArea } from '../src/components/Terminal/InputArea';
import {
  INPUT_DEFAULT_HEIGHT_VH,
} from '../src/lib/inputHeight';

const mockState = vi.hoisted(() => ({
  // When null, loader.init() never settles (the load hangs).
  initImpl: null as null | (() => Promise<unknown>),
  sizeCb: null as null | ((e: { contentHeight: number }) => void),
  contentHeight: 40,
  editorProps: null as null | Record<string, any>,
  mounted: false,
  // False when the Monaco bundle never mounts (fallback test): the mock
  // Editor renders but never calls onMount, like the real thing.
  mountEditor: true,
}));

vi.mock('@monaco-editor/react', () => {
  const fakeEditor = {
    getValue: () => '',
    setValue: () => {},
    getModel: () => null,
    setPosition: () => {},
    addCommand: () => {},
    focus: () => {},
    getContentHeight: () => mockState.contentHeight,
    onDidContentSizeChange: (cb: (e: { contentHeight: number }) => void) => {
      mockState.sizeCb = cb;
      return { dispose: () => {} };
    },
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
          data-height={props.height}
          ref={(el: unknown) => {
            if (el && !mockState.mounted && mockState.mountEditor) {
              mockState.mounted = true;
              props.onMount?.(fakeEditor, fakeMonaco);
            }
          }}
        />
      );
    },
  };
});

function Harness({ initial = '', flat = false, processing = false }: { initial?: string; flat?: boolean; processing?: boolean }) {
  const [input, setInput] = useState(initial);
  return (
    <InputArea
      input={input}
      setInput={setInput}
      onSubmit={() => {}}
      onHistoryUp={() => {}}
      onHistoryDown={() => {}}
      isProcessing={processing}
      flat={flat}
    />
  );
}

beforeEach(() => {
  mockState.initImpl = null;
  mockState.sizeCb = null;
  mockState.contentHeight = 40;
  mockState.editorProps = null;
  mockState.mounted = false;
  mockState.mountEditor = true;
});

function editorHeight() {
  return screen.getByTestId('monaco-editor').getAttribute('data-height');
}

function setContentHeight(px: number) {
  mockState.contentHeight = px;
  act(() => {
    mockState.sizeCb?.({ contentHeight: px });
  });
}

/** No drag helper anymore: there is no handle to drag (Gary, 2026-11-07). */

describe('prompt input bubble', () => {
  test('the default cap is one-third of the page', () => {
    expect(INPUT_DEFAULT_HEIGHT_VH).toBe(33.33);
  });

  test('Monaco editor starts at one line with text inset from the edge', async () => {
    mockState.initImpl = () => Promise.resolve();
    render(<Harness />);
    const editor = await screen.findByTestId('monaco-editor');
    expect(editor.getAttribute('data-height')).toBe('40');
    // Padding: the editor sits 12px in from the bubble edge.
    expect(editor.parentElement?.className).toContain('px-3');
    // Scrollable at the cap (was hidden + mouse wheel off).
    expect(mockState.editorProps?.options?.scrollbar?.vertical).toBe('auto');
    expect(mockState.editorProps?.options?.scrollbar?.handleMouseWheel).toBe(
      true,
    );
  });

  test('Monaco editor grows with content up to one-third of the page, then caps', async () => {
    mockState.initImpl = () => Promise.resolve();
    render(<Harness />);
    await screen.findByTestId('monaco-editor');
    expect(mockState.sizeCb).not.toBeNull();

    // Short input: the bubble grows to fit it. (The event only signals
    // a change; the height is read from the editor, like the real one.)
    setContentHeight(200);
    expect(editorHeight()).toBe('200');

    // Very long input: capped at one-third of the page (jsdom viewport
    // 768px -> 33.33vh = 255px).
    setContentHeight(2000);
    expect(editorHeight()).toBe('255');
  });

  test('fallback textarea is inset, scrollable, and keeps long input readable', async () => {
    mockState.initImpl = () => Promise.reject(new Error('monaco down'));
    mockState.mountEditor = false;
    render(<Harness />);
    const textarea = (await screen.findByPlaceholderText(
      /plain input/,
    )) as HTMLTextAreaElement;

    // Padding: the text starts 12px in from the bubble edge.
    expect(textarea.parentElement?.className).toContain('px-3');
    // Scrollable past the cap (was overflow-hidden: clipped). The CSS
    // maxHeight is the 33.33vh default cap — no drag max anymore.
    expect(textarea.className).toContain('overflow-y-auto');
    expect(textarea.style.maxHeight).toBe('33.33vh');

    const longText = Array.from({ length: 60 }, (_, i) => `line ${i}`).join(
      '\n',
    );
    fireEvent.change(textarea, { target: { value: longText } });
    expect(textarea.value).toBe(longText);
    // The grow effect ran and holds the one-line floor in jsdom
    // (scrollHeight is 0 there); in a real browser it grows to the cap.
    expect(textarea.style.height).toBe('40px');
  });
});

describe('prompt input flat (LuciferAI disabled — no bubble)', () => {
  test('flat prompt still shows the processing glow while processing', async () => {
    mockState.initImpl = () => Promise.resolve();
    const { container } = render(<Harness processing flat />);
    await screen.findByTestId('monaco-editor');
    // The rainbow swirl is a platform appearance trait, not a
    // LuciferAI trait (Gary, 2026-11-08): flat does not suppress it.
    // It shows while a command runs, LuciferAI off or on.
    expect(container.querySelector('.processing-glow-border')).not.toBeNull();
    expect(container.querySelector('.processing-glow-pulse')).not.toBeNull();
    // And there is no drag handle on the prompt at all (Gary,
    // 2026-11-07): the prompt area must not be drag-extendable.
    expect(screen.queryByTestId('input-drag-handle')).toBeNull();
  });

  test('flat prompt shows no glow while idle — the swirl is processing-only', async () => {
    mockState.initImpl = () => Promise.resolve();
    const { container } = render(<Harness flat />);
    await screen.findByTestId('monaco-editor');
    expect(container.querySelector('.processing-glow-border')).toBeNull();
    expect(container.querySelector('.processing-glow-pulse')).toBeNull();
  });

  test('non-flat prompt still shows the processing glow while processing', async () => {
    mockState.initImpl = () => Promise.resolve();
    const { container } = render(<Harness processing />);
    await screen.findByTestId('monaco-editor');
    expect(container.querySelector('.processing-glow-border')).not.toBeNull();
  });

  test('no glow either way while idle', async () => {
    mockState.initImpl = () => Promise.resolve();
    const { container } = render(<Harness />);
    await screen.findByTestId('monaco-editor');
    expect(container.querySelector('.processing-glow-border')).toBeNull();
  });
});

describe('prompt input has no drag handle (Gary, 2026-11-07)', () => {
  test('no drag handle renders in the Monaco prompt', async () => {
    mockState.initImpl = () => Promise.resolve();
    render(<Harness />);
    await screen.findByTestId('monaco-editor');
    expect(screen.queryByTestId('input-drag-handle')).toBeNull();
  });

  test('no drag handle renders in the flat prompt either', async () => {
    mockState.initImpl = () => Promise.resolve();
    render(<Harness flat />);
    await screen.findByTestId('monaco-editor');
    expect(screen.queryByTestId('input-drag-handle')).toBeNull();
  });

  test('no drag handle renders in the fallback textarea prompt', async () => {
    mockState.initImpl = () => Promise.reject(new Error('monaco down'));
    mockState.mountEditor = false;
    render(<Harness />);
    await screen.findByPlaceholderText(/plain input/);
    expect(screen.queryByTestId('input-drag-handle')).toBeNull();
  });

  test('content still grows to the default cap and scrolls past it — no drag needed', async () => {
    mockState.initImpl = () => Promise.resolve();
    render(<Harness />);
    await screen.findByTestId('monaco-editor');
    expect(mockState.sizeCb).not.toBeNull();

    // Short input: the input grows to fit it.
    setContentHeight(200);
    expect(editorHeight()).toBe('200');

    // Very long input: capped at one-third of the page (jsdom viewport
    // 768px -> 33.33vh = 255px), and it scrolls there — the cap is
    // content-driven now, with no drag handle to raise it.
    setContentHeight(2000);
    expect(editorHeight()).toBe('255');
    expect(mockState.editorProps?.options?.scrollbar?.vertical).toBe('auto');
  });
});
