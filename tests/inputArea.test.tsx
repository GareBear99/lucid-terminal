// @vitest-environment jsdom
/**
 * Prompt input tests.
 *
 * Gary's fixes (2026-11-05): the cursor/text must not hug the
 * bubble edge (padding), the bubble must grow upward with the input
 * up to one-third of the page (33.33vh), and past that cap the input
 * must scroll so long input stays readable. A drag handle on the
 * bubble's top edge lets the user drag it taller or shorter, up to
 * half the page (50vh). The dragged height is a cap, not a floor:
 * it sets how tall the bubble may grow; the bubble hugs the content
 * in both directions and regresses to fit it when the content
 * shrinks, so it is never stuck tall after deleting text. During a
 * drag the bubble follows the pointer.
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
  INPUT_DRAG_MAX_HEIGHT_VH,
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

function Harness({ initial = '' }: { initial?: string }) {
  const [input, setInput] = useState(initial);
  return (
    <InputArea
      input={input}
      setInput={setInput}
      onSubmit={() => {}}
      onHistoryUp={() => {}}
      onHistoryDown={() => {}}
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

/** Drag the handle by a vertical delta (negative = up). */
function dragHandleBy(startY: number, endY: number) {
  const handle = screen.getByTestId('input-drag-handle');
  fireEvent.pointerDown(handle, { clientY: startY, pointerId: 1 });
  fireEvent.pointerMove(window, { clientY: endY, pointerId: 1 });
  fireEvent.pointerUp(window, { pointerId: 1 });
}

describe('prompt input bubble', () => {
  test('the default cap is one-third of the page, the drag max is half', () => {
    expect(INPUT_DEFAULT_HEIGHT_VH).toBe(33.33);
    expect(INPUT_DRAG_MAX_HEIGHT_VH).toBe(50);
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
    // maxHeight is the 50vh drag max, not the 33.33vh default cap.
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

describe('prompt input drag handle', () => {
  test('a drag handle sits on the bubble top edge', async () => {
    mockState.initImpl = () => Promise.resolve();
    render(<Harness />);
    await screen.findByTestId('monaco-editor');
    const handle = screen.getByTestId('input-drag-handle');
    expect(handle.getAttribute('role')).toBe('separator');
    expect(handle.getAttribute('aria-label')).toBe('Drag to resize input');
  });

  test('dragging up raises the cap and clamps at half the page', async () => {
    mockState.initImpl = () => Promise.resolve();
    render(<Harness />);
    await screen.findByTestId('monaco-editor');
    expect(mockState.sizeCb).not.toBeNull();

    // Long content sits at the 33.33vh default cap (255px).
    setContentHeight(2000);
    expect(editorHeight()).toBe('255');

    // Drag up 160px: the cap rises 255 -> 415, clamped at half the
    // page (384px), and the long content fills it.
    dragHandleBy(300, 140);
    expect(editorHeight()).toBe('384');

    // Drag up far past the max: still clamped at half the page.
    dragHandleBy(300, -500);
    expect(editorHeight()).toBe('384');
  });

  test('dragging down lowers the cap toward the one-line floor', async () => {
    mockState.initImpl = () => Promise.resolve();
    render(<Harness />);
    await screen.findByTestId('monaco-editor');
    expect(mockState.sizeCb).not.toBeNull();

    // Long content sits at the 33.33vh default cap (255px).
    setContentHeight(2000);
    expect(editorHeight()).toBe('255');

    // Drag down 140px: the cap drops 255 -> 115.
    dragHandleBy(300, 440);
    expect(editorHeight()).toBe('115');

    // Drag down past the floor: clamped at one line (40px).
    dragHandleBy(300, 500);
    expect(editorHeight()).toBe('40');
  });

  test('dragged height is a cap: content fits under it, long content caps at it, deleting regresses fully', async () => {
    mockState.initImpl = () => Promise.resolve();
    render(<Harness />);
    await screen.findByTestId('monaco-editor');
    expect(mockState.sizeCb).not.toBeNull();

    // Drag to 200px. With one line of content the bubble regresses to
    // fit it on release — the drag only raises the cap.
    dragHandleBy(300, 140);
    expect(editorHeight()).toBe('40');

    // Type a little (content 100px, shorter than the dragged 200px):
    // the bubble hugs the content.
    setContentHeight(100);
    expect(editorHeight()).toBe('100');

    // Type a lot (content 300px): capped at the dragged 200px.
    setContentHeight(300);
    expect(editorHeight()).toBe('200');

    // Type a lot more (content 2000px): still capped at 200px.
    setContentHeight(2000);
    expect(editorHeight()).toBe('200');

    // Delete back down (content 40px): regresses fully to the content —
    // never stuck tall at the dragged height.
    setContentHeight(40);
    expect(editorHeight()).toBe('40');
  });

  test('while dragging the bubble follows the pointer, then caps at the dragged height on release', async () => {
    mockState.initImpl = () => Promise.resolve();
    render(<Harness />);
    await screen.findByTestId('monaco-editor');
    expect(mockState.sizeCb).not.toBeNull();

    // Long content: capped at the 33.33vh default (255px).
    setContentHeight(2000);
    expect(editorHeight()).toBe('255');

    // Drag up 60px. While dragging the bubble follows the pointer
    // (255 + 60 = 315), not the 50vh cap height.
    const handle = screen.getByTestId('input-drag-handle');
    fireEvent.pointerDown(handle, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(window, { clientY: 240, pointerId: 1 });
    expect(editorHeight()).toBe('315');

    // Release: the content (2000px) is taller than the dragged 315px,
    // so the bubble sits at the dragged cap (315px), not the 50vh max.
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(editorHeight()).toBe('315');
  });

  test('fallback textarea drag sets a cap, and the bubble regresses to the content on release', async () => {
    mockState.initImpl = () => Promise.reject(new Error('monaco down'));
    mockState.mountEditor = false;
    render(<Harness />);
    const textarea = (await screen.findByPlaceholderText(
      /plain input/,
    )) as HTMLTextAreaElement;
    expect(textarea.style.height).toBe('40px');

    // Drag up 160px: while dragging the bubble follows the pointer
    // (40 + 160 = 200).
    const handle = screen.getByTestId('input-drag-handle');
    fireEvent.pointerDown(handle, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(window, { clientY: 140, pointerId: 1 });
    expect(textarea.style.height).toBe('200px');

    // Release: jsdom scrollHeight is 0, so the bubble regresses to the
    // one-line floor — the drag only raised the cap, it does not stick.
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(textarea.style.height).toBe('40px');

    // Typing does not grow it past the content either.
    fireEvent.change(textarea, { target: { value: 'hello' } });
    expect(textarea.style.height).toBe('40px');
  });
});
