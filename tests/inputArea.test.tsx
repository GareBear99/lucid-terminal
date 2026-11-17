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
  // Mounted keybinding callbacks, keyed by the fake KeyCode:
  // the regression test fires them to prove they read the
  // LATEST props, not the mount-time closures.
  commands: new Map<number, () => void>(),
  // What the fake editor's getValue() returns (the Enter
  // command submits this).
  editorValue: '',
  // False when the Monaco bundle never mounts (fallback test): the mock
  // Editor renders but never calls onMount, like the real thing.
  mountEditor: true,
}));

vi.mock('@monaco-editor/react', () => {
  const fakeEditor = {
    getValue: () => mockState.editorValue,
    setValue: () => {},
    getModel: () => null,
    setPosition: () => {},
    addCommand: (key: number, cb: () => void) => {
      mockState.commands.set(key, cb);
    },
    focus: () => {},
    getContentHeight: () => mockState.contentHeight,
    onDidContentSizeChange: (cb: (e: { contentHeight: number }) => void) => {
      mockState.sizeCb = cb;
      return { dispose: () => {} };
    },
  };
  const fakeMonaco = {
    editor: { defineTheme: () => {}, setTheme: () => {} },
    KeyCode: { Enter: 3, UpArrow: 16, DownArrow: 18, Escape: 9 },
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
  mockState.commands.clear();
  mockState.editorValue = '';
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

  test('long text scrolls right instead of wrapping (Gary, 2026-11-08)', async () => {
    // Typing past the edge scrolls the line right so the cursor and
    // the text being typed stay visible — instead of the line wrapping
    // (and growing the bar tall) or clipping at the edge.
    mockState.initImpl = () => Promise.resolve();
    render(<Harness />);
    await screen.findByTestId('monaco-editor');
    expect(mockState.editorProps?.options?.wordWrap).toBe('off');
    expect(mockState.editorProps?.options?.scrollbar?.horizontal).toBe('auto');
    expect(mockState.editorProps?.options?.scrollbar?.vertical).toBe('auto');
  });

  test('Monaco exposes a real AX text field (Fix 3, 2026-11-17 — Gary: the DEFCON prompter must be typeable)', async () => {
    // The default ('auto') exposes no AX text field without a
    // screen reader attached, so computer control reports
    // keyboard_focus_unavailable and cannot type into the
    // prompter at all — in any state (LuciferAI on/off,
    // terminal/agent mode). 'on' is Monaco's supported
    // screen-reader mode. The VM can only assert the option
    // is set — the live proof is a Mac coordinator typing
    // into the composer after deploy (see the handoff doc).
    mockState.initImpl = () => Promise.resolve();
    render(<Harness />);
    await screen.findByTestId('monaco-editor');
    expect(mockState.editorProps?.options?.accessibilitySupport).toBe('on');
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
    // Long text scrolls right, not wraps (Gary, 2026-11-08): no wrap,
    // horizontal scroll on, so the cursor stays visible past the edge.
    expect(textarea.getAttribute('wrap')).toBe('off');
    expect(textarea.className).toContain('whitespace-nowrap');
    expect(textarea.className).toContain('overflow-x-auto');

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

describe('fallback textarea partial accept (Tabnine S1)', () => {
  function GhostHarness({ initial = '', ghost = null as string | null }) {
    const [input, setInput] = useState(initial);
    return (
      <InputArea
        input={input}
        setInput={setInput}
        onSubmit={() => {}}
        onHistoryUp={() => {}}
        onHistoryDown={() => {}}
        ghostSuggestion={ghost}
        onAcceptSuggestion={() => {
          if (ghost) setInput(ghost);
        }}
      />
    );
  }

  function renderFallback(initial: string, ghost: string | null) {
    mockState.initImpl = () => Promise.reject(new Error('monaco down'));
    mockState.mountEditor = false;
    render(<GhostHarness initial={initial} ghost={ghost} />);
    return screen.findByPlaceholderText(/plain input/) as Promise<HTMLTextAreaElement>;
  }

  function setCursorAtEnd(el: HTMLTextAreaElement) {
    el.selectionStart = el.value.length;
    el.selectionEnd = el.value.length;
  }

  test('Ctrl+Right accepts the next word of the ghost, then the next', async () => {
    const textarea = await renderFallback('echo ', 'echo hello world');
    setCursorAtEnd(textarea);
    fireEvent.keyDown(textarea, { key: 'ArrowRight', ctrlKey: true });
    expect(textarea.value).toBe('echo hello');
    setCursorAtEnd(textarea);
    fireEvent.keyDown(textarea, { key: 'ArrowRight', ctrlKey: true });
    expect(textarea.value).toBe('echo hello world');
  });

  test('Ctrl+Down accepts the next line of a multi-line ghost', async () => {
    const textarea = await renderFallback('echo ', 'echo a\necho b');
    setCursorAtEnd(textarea);
    fireEvent.keyDown(textarea, { key: 'ArrowDown', ctrlKey: true });
    expect(textarea.value).toBe('echo a\n');
  });

  test('Ctrl+Right with the cursor mid-input does nothing (normal word-jump)', async () => {
    const textarea = await renderFallback('echo ', 'echo hello world');
    textarea.selectionStart = 2;
    textarea.selectionEnd = 2;
    fireEvent.keyDown(textarea, { key: 'ArrowRight', ctrlKey: true });
    expect(textarea.value).toBe('echo ');
  });

  test('Ctrl+Right with no ghost does nothing', async () => {
    const textarea = await renderFallback('echo ', null);
    setCursorAtEnd(textarea);
    fireEvent.keyDown(textarea, { key: 'ArrowRight', ctrlKey: true });
    expect(textarea.value).toBe('echo ');
  });

  test('Tab still takes the whole ghost after a partial accept', async () => {
    const textarea = await renderFallback('echo ', 'echo hello world');
    setCursorAtEnd(textarea);
    fireEvent.keyDown(textarea, { key: 'ArrowRight', ctrlKey: true });
    expect(textarea.value).toBe('echo hello');
    fireEvent.keyDown(textarea, { key: 'Tab' });
    expect(textarea.value).toBe('echo hello world');
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

  test('grabbing the handle again does NOT flash to the old dragged cap (Gary, 2026-11-09)', async () => {
    // Gary, by hand: after dragging the prompt tall once, grabbing
    // the handle again FLASHED the bubble to full extend (the old
    // dragged cap) before the pointer even moved. Root cause: the
    // while-dragging height was the persisted dragged cap, so the
    // pointerdown re-render (isDragging=true, no move yet) jumped
    // straight to it. The drag must start from the on-screen height.
    mockState.initImpl = () => Promise.resolve();
    render(<Harness />);
    await screen.findByTestId('monaco-editor');
    setContentHeight(2000);
    dragHandleUp(300);
    expect(editorHeight()).toBe('384');
    // Short content: the bubble regresses to fit it (cap, not floor).
    setContentHeight(100);
    expect(editorHeight()).toBe('100');
    // Grab the handle again but do NOT move yet: the bubble must stay
    // at the content height — no flash to the old 384px cap.
    const handle = screen.getByTestId('input-drag-handle');
    fireEvent.pointerDown(handle, { clientY: 400, pointerId: 1 });
    expect(editorHeight()).toBe('100');
    // Release without moving: nothing changes either.
    act(() => {
      window.dispatchEvent(
        new window.MouseEvent('pointerup', { clientY: 400 }),
      );
    });
    expect(editorHeight()).toBe('100');
  });

  test('a second drag starts from the on-screen height and follows the pointer', async () => {
    mockState.initImpl = () => Promise.resolve();
    render(<Harness />);
    await screen.findByTestId('monaco-editor');
    setContentHeight(2000);
    dragHandleUp(300);
    expect(editorHeight()).toBe('384');
    setContentHeight(100);
    expect(editorHeight()).toBe('100');
    // Grab + drag up 50px: 100 + 50 = 150, not 384 + 50.
    const handle = screen.getByTestId('input-drag-handle');
    fireEvent.pointerDown(handle, { clientY: 400, pointerId: 1 });
    expect(editorHeight()).toBe('100');
    act(() => {
      window.dispatchEvent(
        new window.MouseEvent('pointermove', { clientY: 350 }),
      );
    });
    expect(editorHeight()).toBe('150');
    act(() => {
      window.dispatchEvent(
        new window.MouseEvent('pointerup', { clientY: 350 }),
      );
    });
    // After release the new cap is 150; short content still regresses.
    expect(editorHeight()).toBe('100');
    // And the new cap holds: long content caps at 150 now.
    setContentHeight(2000);
    expect(editorHeight()).toBe('150');
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

describe('mounted Monaco commands read the latest props (Gary, 2026-11-14 — stale-closure fix)', () => {
  // The mounted editor registers its keybindings ONCE, at mount.
  // Before the fix the Enter/Up/Down commands closed over the
  // FIRST render's props: Up recalled the history as it was at
  // mount (empty), so it did nothing until a remount; Enter
  // submitted through a stale onSubmit. The bindings must read
  // the current handlers through latestRef — these tests fire
  // the MOUNTED callbacks after a rerender with new props and
  // assert the NEW behaviour, which fails on the old code.
  const UP = 16;
  const ENTER = 3;
  const ESC = 9;

  function fireMountedCommand(key: number) {
    const cb = mockState.commands.get(key);
    expect(cb, `no mounted command for key ${key}`).toBeDefined();
    act(() => {
      cb?.();
    });
  }

  /** The current input, as the mock Editor last received it. */
  function editorValue() {
    return mockState.editorProps?.value as string | undefined;
  }

  /** Harness whose history grows after mount: the onHistoryUp
   *  prop closes over the CURRENT history each render, like
   *  Terminal's walk over commandHistoryStore. */
  function GrowingHistoryHarness() {
    const [input, setInput] = useState('');
    const [history, setHistory] = useState<string[]>(['first command']);
    return (
      <>
        <InputArea
          input={input}
          setInput={setInput}
          onSubmit={() => {}}
          onHistoryUp={() => setInput(history[history.length - 1])}
          onHistoryDown={() => {}}
          isProcessing={false}
          flat={false}
        />
        <button
          data-testid="grow-history"
          onClick={() => setHistory(['first command', 'second command'])}
        >
          grow
        </button>
      </>
    );
  }

  test('UpArrow after a rerender recalls the NEWEST history, not the mount-time one', async () => {
    mockState.initImpl = () => Promise.resolve();
    render(<GrowingHistoryHarness />);
    await screen.findByTestId('monaco-editor');
    // At mount the history is ['first command']: Up recalls it.
    fireMountedCommand(UP);
    expect(editorValue()).toBe('first command');
    // The history grows WITHOUT a remount (the editor stays
    // mounted): Up must now recall the new newest entry.
    fireEvent.click(screen.getByTestId('grow-history'));
    fireMountedCommand(UP);
    expect(editorValue()).toBe('second command');
  });

  /** Harness whose submit/escape handlers close over a tag that
   *  changes after mount — the mounted command must call the
   *  CURRENT handler, not the mount-time one. */
  function TaggedHandlersHarness() {
    const [input, setInput] = useState('');
    const [tag, setTag] = useState('A');
    const [submitted, setSubmitted] = useState<string[]>([]);
    const [escaped, setEscaped] = useState('');
    return (
      <>
        <InputArea
          input={input}
          setInput={setInput}
          onSubmit={(value) => setSubmitted((prev) => [...prev, `${tag}:${value}`])}
          onHistoryUp={() => {}}
          onHistoryDown={() => {}}
          onEscape={() => setEscaped(tag)}
          isProcessing={false}
          flat={false}
        />
        <button data-testid="retag" onClick={() => setTag('B')}>
          retag
        </button>
        <div data-testid="submitted">{submitted.join(',')}</div>
        <div data-testid="escaped">{escaped}</div>
      </>
    );
  }

  test('Enter after a rerender submits through the CURRENT onSubmit', async () => {
    mockState.initImpl = () => Promise.resolve();
    render(<TaggedHandlersHarness />);
    await screen.findByTestId('monaco-editor');
    mockState.editorValue = 'ls -la';
    fireMountedCommand(ENTER);
    expect(screen.getByTestId('submitted').textContent).toBe('A:ls -la');
    // Retag WITHOUT a remount: the mounted Enter command must
    // call the new handler.
    fireEvent.click(screen.getByTestId('retag'));
    fireMountedCommand(ENTER);
    expect(screen.getByTestId('submitted').textContent).toBe('A:ls -la,B:ls -la');
  });

  test('Escape after a rerender calls the CURRENT onEscape', async () => {
    mockState.initImpl = () => Promise.resolve();
    render(<TaggedHandlersHarness />);
    await screen.findByTestId('monaco-editor');
    fireMountedCommand(ESC);
    expect(screen.getByTestId('escaped').textContent).toBe('A');
    fireEvent.click(screen.getByTestId('retag'));
    fireMountedCommand(ESC);
    expect(screen.getByTestId('escaped').textContent).toBe('B');
  });
});
