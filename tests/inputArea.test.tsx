// @vitest-environment jsdom
/**
 * Prompt input tests.
 *
 * Gary's fixes (2026-11-05): the cursor/text must not hug the
 * bubble edge (padding), the bubble must grow upward with the input
 * up to one-third of the page (33.33vh), and past that cap the input
 * must scroll so long input stays readable.
 *
 * Gary's fix (2026-11-07, ec33aa9): the terminal prompt was NOT
 * drag-extendable — the drag handle was removed from the prompt area.
 * Gary's "recover it all" (2026-11-08) RESTORES it: the drag handle is
 * back on the prompt's top edge, drag up to grow / down to shrink, up
 * to the halfway max (50vh), default cap one-third (33.33vh), dragged
 * height a CAP not a floor (the input regresses when content shrinks,
 * never stuck tall). The fallback textarea's maxHeight is the drag max
 * again. (The AI-chat input keeps its own drag handle; this file only
 * covers the terminal prompt.)
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

/** Drag helper (Gary, 2026-11-08 — recovered): the handle drags the
 *  input taller/shorter; the dragged height is a cap, not a floor. */

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
    // maxHeight is the 50vh drag max again (recovered).
    expect(textarea.className).toContain('overflow-y-auto');
    expect(textarea.style.maxHeight).toBe('50vh');

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
    // And the drag handle IS there in the flat prompt too (Gary,
    // 2026-11-08): resizing is not bubbling, so flat keeps it.
    expect(screen.queryByTestId('input-drag-handle')).not.toBeNull();
  });

  test('flat prompt shows no glow while idle — the swirl is processing-only', async () => {
    mockState.initImpl = () => Promise.resolve();
    const { container } = render(<Harness flat />);
    await screen.findByTestId('monaco-editor');
    expect(container.querySelector('.processing-glow-border')).toBeNull();
    expect(container.querySelector('.processing-glow-pulse')).toBeNull();
  });

  test('flat prompt still insets the text from the edge (Gary, 2026-11-08)', async () => {
    // The flat prompt lost its side padding when it went flat — the
    // cursor sat flush to the bubble edge. Recovered: px-3 in BOTH
    // states, so the cursor has 12px of breathing room either way.
    mockState.initImpl = () => Promise.resolve();
    render(<Harness flat />);
    const editor = await screen.findByTestId('monaco-editor');
    expect(editor.parentElement?.className).toContain('px-3');
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

describe('prompt input has a drag handle (Gary, 2026-11-08 — recovered)', () => {
  /** Drag the handle up by `dy` px: pointerdown on the handle, then a
   *  window pointermove / pointerup, like a real pointer drag. */
  function dragHandleUp(dy: number) {
    const handle = screen.getByTestId('input-drag-handle');
    fireEvent.pointerDown(handle, { clientY: 400, pointerId: 1 });
    act(() => {
      window.dispatchEvent(
        new window.MouseEvent('pointermove', { clientY: 400 - dy }),
      );
    });
    act(() => {
      window.dispatchEvent(
        new window.MouseEvent('pointerup', { clientY: 400 - dy }),
      );
    });
  }

  test('drag handle renders in the Monaco prompt', async () => {
    mockState.initImpl = () => Promise.resolve();
    render(<Harness />);
    await screen.findByTestId('monaco-editor');
    expect(screen.queryByTestId('input-drag-handle')).not.toBeNull();
  });

  test('drag handle renders in the flat prompt either', async () => {
    mockState.initImpl = () => Promise.resolve();
    render(<Harness flat />);
    await screen.findByTestId('monaco-editor');
    expect(screen.queryByTestId('input-drag-handle')).not.toBeNull();
  });

  test('drag handle renders in the fallback textarea prompt', async () => {
    mockState.initImpl = () => Promise.reject(new Error('monaco down'));
    mockState.mountEditor = false;
    render(<Harness />);
    await screen.findByPlaceholderText(/plain input/);
    expect(screen.queryByTestId('input-drag-handle')).not.toBeNull();
  });

  test('dragging up raises the cap to the halfway max (50vh)', async () => {
    mockState.initImpl = () => Promise.resolve();
    render(<Harness />);
    await screen.findByTestId('monaco-editor');
    // Long content: capped at the one-third default first (jsdom
    // viewport 768px -> 33.33vh = 255px).
    setContentHeight(2000);
    expect(editorHeight()).toBe('255');
    // Drag up 300px: the dragged cap would be 555px, clamped to the
    // halfway max (50vh of 768px = 384px).
    dragHandleUp(300);
    expect(editorHeight()).toBe('384');
  });

  test('dragged height is a cap, not a floor — shrinking content regresses', async () => {
    mockState.initImpl = () => Promise.resolve();
    render(<Harness />);
    await screen.findByTestId('monaco-editor');
    setContentHeight(2000);
    dragHandleUp(300);
    expect(editorHeight()).toBe('384');
    // Delete most of the text: the input hugs the content again
    // instead of staying stuck tall at the dragged height.
    setContentHeight(100);
    expect(editorHeight()).toBe('100');
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
    // content-driven when never dragged.
    setContentHeight(2000);
    expect(editorHeight()).toBe('255');
    expect(mockState.editorProps?.options?.scrollbar?.vertical).toBe('auto');
  });
});
