// @vitest-environment jsdom
/**
 * Prompt input tests.
 *
 * Gary's three fixes (2026-11-05): the cursor/text must not hug the
 * bubble edge (padding), the bubble must grow upward with the input
 * up to half the page, and past that cap the input must scroll so
 * long input stays readable. The cap is INPUT_MAX_HEIGHT_VH (50):
 * half the page keeps half the terminal visible and reads well.
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
import {
  InputArea,
  INPUT_MAX_HEIGHT_VH,
} from '../src/components/Terminal/InputArea';

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

describe('prompt input bubble', () => {
  test('the cap is half the page', () => {
    expect(INPUT_MAX_HEIGHT_VH).toBe(50);
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

  test('Monaco editor grows with content up to half the page, then caps', async () => {
    mockState.initImpl = () => Promise.resolve();
    render(<Harness />);
    await screen.findByTestId('monaco-editor');
    expect(mockState.sizeCb).not.toBeNull();

    // Short input: the bubble grows to fit it. (The event only signals
    // a change; the height is read from the editor, like the real one.)
    mockState.contentHeight = 200;
    act(() => {
      mockState.sizeCb?.({ contentHeight: 200 });
    });
    expect(screen.getByTestId('monaco-editor').getAttribute('data-height')).toBe(
      '200',
    );

    // Very long input: capped at half the page (jsdom viewport 768px).
    mockState.contentHeight = 2000;
    act(() => {
      mockState.sizeCb?.({ contentHeight: 2000 });
    });
    expect(screen.getByTestId('monaco-editor').getAttribute('data-height')).toBe(
      '384',
    );
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
    // Scrollable past the half-page cap (was overflow-hidden: clipped).
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
