// @vitest-environment jsdom
/**
 * Wiring tests for the Monaco inline completions in the composer (InputArea).
 *
 * The mock follows tests/inputArea.test.tsx: @monaco-editor/react
 * is stubbed with a fake editor, and onMount is driven by hand.
 * Extended here with the pieces the provider needs:
 *   - monaco.languages.registerInlineCompletionsProvider (captures
 *     the provider so the test can drive provideInlineCompletions
 *     the way Monaco would as Gary types);
 *   - KeyCode.Tab / KeyCode.RightArrow (the accept keys);
 *   - editor.onKeyDown / getModel / getPosition / setPosition.
 *
 * The history and file context come from the real stores
 * (commandHistoryStore / fileStore) — the provider reads them
 * via getState() at request time, exactly as in production.
 */

import React, { useState } from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { InputArea } from '../src/components/Terminal/InputArea';
import { useCommandHistoryStore } from '../src/stores/commandHistoryStore';
import { useFileStore } from '../src/stores/fileStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useCompletionAcceptanceLog } from '../src/stores/completionAcceptanceLog';

const mockState: {
  editorProps: any;
  editorValue: string;
  position: { lineNumber: number; column: number } | null;
  commands: Record<number, () => void>;
  keyDownHandler: ((e: any) => void) | null;
  capturedProvider: { language: string; provider: any } | null;
  providerDisposed: boolean;
} = {
  editorProps: null,
  editorValue: '',
  position: null,
  commands: {},
  keyDownHandler: null,
  capturedProvider: null,
  providerDisposed: false,
};

const fakeModel = () => ({
  getLineCount: () => 1,
  getLineContent: () => mockState.editorValue,
  getLineMaxColumn: () => mockState.editorValue.length + 1,
});

const fakeEditor = {
  addCommand: (key: number, cb: () => void) => {
    mockState.commands[key] = cb;
  },
  getValue: () => mockState.editorValue,
  setValue: (v: string) => {
    mockState.editorValue = v;
  },
  getModel: () => fakeModel(),
  getPosition: () => ({ lineNumber: 1, column: mockState.editorValue.length + 1 }),
  setPosition: (pos: { lineNumber: number; column: number }) => {
    mockState.position = pos;
  },
  onKeyDown: (cb: (e: any) => void) => {
    mockState.keyDownHandler = cb;
    return { dispose: () => {} };
  },
  onDidScrollChange: () => ({ dispose: () => {} }),
  onDidContentSizeChange: () => ({ dispose: () => {} }),
  focus: () => {},
  getContentHeight: () => 40,
  getSelection: () => ({ isEmpty: () => true }),
};

const fakeMonaco: any = {
  editor: { defineTheme: () => {}, setTheme: () => {} },
  KeyCode: { Enter: 3, UpArrow: 16, DownArrow: 18, Escape: 9, Tab: 2, RightArrow: 17 },
  languages: {
    registerInlineCompletionsProvider: (language: string, provider: any) => {
      mockState.capturedProvider = { language, provider };
      return {
        dispose: () => {
          mockState.providerDisposed = true;
        },
      };
    },
  },
};

vi.mock('@monaco-editor/react', () => ({
  default: (props: any) => {
    mockState.editorProps = props;
    return null;
  },
  loader: { init: () => Promise.resolve() },
}));

vi.mock('../src/lib/monacoLoader', () => ({
  default: { init: () => Promise.resolve() },
}));

function mountEditor() {
  act(() => {
    mockState.editorProps?.onMount?.(fakeEditor, fakeMonaco);
  });
}

function driveProvider(input: string) {
  mockState.editorValue = input;
  const provider = mockState.capturedProvider?.provider;
  expect(provider).toBeDefined();
  return provider.provideInlineCompletions(
    fakeModel(),
    { lineNumber: 1, column: input.length + 1 },
    {},
    { isCancellationRequested: false },
  );
}

function Harness({
  initialInput = '',
  ghostSuggestion = null,
  hintPlaceholder = null,
  completionMode,
}: {
  initialInput?: string;
  ghostSuggestion?: string | null;
  hintPlaceholder?: string | null;
  completionMode?: 'terminal' | 'agent';
}) {
  const [input, setInput] = useState(initialInput);
  return (
    <InputArea
      input={input}
      setInput={setInput}
      onSubmit={() => {}}
      onHistoryUp={() => {}}
      onHistoryDown={() => {}}
      ghostSuggestion={ghostSuggestion}
      hintPlaceholder={hintPlaceholder}
      onAcceptSuggestion={() => {
        if (ghostSuggestion) setInput(ghostSuggestion);
      }}
      completionMode={completionMode}
    />
  );
}

beforeEach(() => {
  mockState.editorProps = null;
  mockState.editorValue = '';
  mockState.position = null;
  mockState.commands = {};
  mockState.keyDownHandler = null;
  mockState.capturedProvider = null;
  mockState.providerDisposed = false;
  useCommandHistoryStore.setState({
    entries: [],
    loaded: true,
    profileId: 'default',
    guestSessionActive: false,
  });
  useFileStore.setState({ openFiles: [] });
});

describe('InputArea inline completions — provider registration', () => {
  it('registers a shell inline-completion provider on mount', () => {
    render(<Harness initialInput="echo h" />);
    mountEditor();
    expect(mockState.capturedProvider?.language).toBe('shell');
    expect(mockState.capturedProvider?.provider).toBeDefined();
  });

  it('enables inlineSuggest in the editor options (prefix, no toolbar, widget off)', () => {
    render(<Harness initialInput="" />);
    expect(mockState.editorProps.options.inlineSuggest).toEqual({
      enabled: true,
      mode: 'prefix',
      showToolbar: 'never',
      suppressSuggestions: true,
      minShowDelay: 0,
    });
    // The suggest widget stays off — the ghost is the only
    // completion surface in the composer.
    expect(mockState.editorProps.options.quickSuggestions).toBe(false);
  });

  it('does not fail the mount when monaco has no languages (stubbed monaco)', () => {
    render(<Harness initialInput="echo h" />);
    act(() => {
      mockState.editorProps?.onMount?.(fakeEditor, {
        editor: { defineTheme: () => {}, setTheme: () => {} },
        KeyCode: fakeMonaco.KeyCode,
      });
    });
    expect(mockState.capturedProvider).toBeNull();
  });
});

describe('InputArea inline completions — offers and accept', () => {
  it('offers a history completion and Tab accepts it', () => {
    useCommandHistoryStore.setState({ entries: ['echo hello'] });
    render(<Harness initialInput="echo h" />);
    mountEditor();
    const list = driveProvider('echo h');
    expect(list.items[0].insertText).toBe('echo hello');
    act(() => {
      mockState.commands[2]?.();
    });
    expect(mockState.editorProps.value).toBe('echo hello');
    expect(mockState.editorValue).toBe('echo hello');
  });

  it('Right-arrow accepts the provider offer at the end of the input', () => {
    useCommandHistoryStore.setState({ entries: ['echo hello'] });
    render(<Harness initialInput="echo h" />);
    mountEditor();
    driveProvider('echo h');
    act(() => {
      mockState.keyDownHandler?.({ keyCode: 17, preventDefault: vi.fn() });
    });
    expect(mockState.editorProps.value).toBe('echo hello');
  });

  it('offers a file completion from the open files and Tab accepts it', () => {
    useFileStore.setState({
      openFiles: [
        {
          path: 'src/components/Terminal.tsx',
          name: 'Terminal.tsx',
          content: '',
          originalContent: '',
          isDirty: false,
        },
      ],
    });
    render(<Harness initialInput="cd src/com" />);
    mountEditor();
    const list = driveProvider('cd src/com');
    expect(list.items[0].insertText).toBe('cd src/components/Terminal.tsx');
    act(() => {
      mockState.commands[2]?.();
    });
    expect(mockState.editorProps.value).toBe('cd src/components/Terminal.tsx');
  });

  it('the parent ghost wins: the provider stays silent and Tab accepts the overlay ghost', () => {
    useCommandHistoryStore.setState({ entries: ['echo hello'] });
    render(<Harness initialInput="echo h" ghostSuggestion="echo hi" />);
    mountEditor();
    const list = driveProvider('echo h');
    expect(list).toBeUndefined();
    act(() => {
      mockState.commands[2]?.();
    });
    expect(mockState.editorProps.value).toBe('echo hi');
  });

  it('agent mode: the provider stays silent and Tab does nothing', () => {
    useCommandHistoryStore.setState({ entries: ['echo hello'] });
    render(<Harness initialInput="echo h" completionMode="agent" />);
    mountEditor();
    const list = driveProvider('echo h');
    expect(list).toBeUndefined();
    act(() => {
      mockState.commands[2]?.();
    });
    expect(mockState.editorProps.value).toBe('echo h');
  });

  it('Tab with no offer and no ghost does nothing (still swallowed, never a tab character)', () => {
    useCommandHistoryStore.setState({ entries: ['ls'] });
    render(<Harness initialInput="zzz" />);
    mountEditor();
    const list = driveProvider('zzz');
    expect(list).toBeUndefined();
    act(() => {
      mockState.commands[2]?.();
    });
    expect(mockState.editorProps.value).toBe('zzz');
  });

  it('a stale offer is not accepted once the input no longer matches it', () => {
    useCommandHistoryStore.setState({ entries: ['echo hello'] });
    render(<Harness initialInput="echo h" />);
    mountEditor();
    driveProvider('echo h');
    // The user typed on past the offer — the input is no longer
    // a prefix of it, so Tab must not apply it.
    mockState.editorValue = 'echo hello world';
    act(() => {
      mockState.commands[2]?.();
    });
    expect(mockState.editorProps.value).toBe('echo h');
  });

  it('paused: the provider offers nothing and Tab does nothing (Tabnine S7)', () => {
    const base = useSettingsStore.getState().settings;
    useSettingsStore.setState({ settings: { ...base, ghostCompletionsPaused: true } });
    try {
      useCommandHistoryStore.setState({ entries: ['echo hello'] });
      render(<Harness initialInput="echo h" />);
      mountEditor();
      expect(driveProvider('echo h')).toBeUndefined();
      act(() => {
        mockState.commands[2]?.();
      });
      expect(mockState.editorProps.value).toBe('echo h');
    } finally {
      useSettingsStore.setState({ settings: { ...base, ghostCompletionsPaused: false } });
    }
  });

  it('an accept is logged with snippet + session + source (Tabnine S7)', () => {
    useCompletionAcceptanceLog.getState().resetForTests();
    useCommandHistoryStore.setState({ entries: ['echo hello world'] });
    render(<Harness initialInput="echo " />);
    mountEditor();
    driveProvider('echo ');
    act(() => {
      mockState.commands[2]?.();
    });
    expect(mockState.editorProps.value).toBe('echo hello world');
    const entries = useCompletionAcceptanceLog.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].snippet).toBe('echo hello world');
    expect(entries[0].source).toBe('history');
    expect(entries[0].sessionId).toBeDefined();
    expect(entries[0].timestamp).toBeGreaterThan(0);
  });
});

describe('InputArea inline completions — partial accept (Tabnine S1)', () => {
  it('Ctrl+Right accepts the next word of the provider offer, then the next', () => {
    useCommandHistoryStore.setState({ entries: ['echo hello world'] });
    render(<Harness initialInput="echo " />);
    mountEditor();
    driveProvider('echo ');
    const preventDefault = vi.fn();
    act(() => {
      mockState.keyDownHandler?.({ keyCode: 17, ctrlKey: true, metaKey: false, preventDefault });
    });
    expect(mockState.editorProps.value).toBe('echo hello');
    expect(preventDefault).toHaveBeenCalled();
    // A second Ctrl+Right walks to the next word.
    act(() => {
      mockState.keyDownHandler?.({ keyCode: 17, ctrlKey: true, metaKey: false, preventDefault: vi.fn() });
    });
    expect(mockState.editorProps.value).toBe('echo hello world');
  });

  it('Ctrl+Down accepts the next line of a multi-line offer', () => {
    useCommandHistoryStore.setState({ entries: ['echo a\necho b'] });
    render(<Harness initialInput="echo " />);
    mountEditor();
    driveProvider('echo ');
    act(() => {
      mockState.keyDownHandler?.({ keyCode: 18, ctrlKey: true, metaKey: false, preventDefault: vi.fn() });
    });
    expect(mockState.editorProps.value).toBe('echo a\n');
  });

  it('Ctrl+Right accepts the next word of the parent overlay ghost', () => {
    useCommandHistoryStore.setState({ entries: ['echo hello'] });
    render(<Harness initialInput="echo " ghostSuggestion="echo hello world" />);
    mountEditor();
    // The provider stays silent while the parent ghost is set.
    expect(driveProvider('echo ')).toBeUndefined();
    act(() => {
      mockState.keyDownHandler?.({ keyCode: 17, ctrlKey: true, metaKey: false, preventDefault: vi.fn() });
    });
    expect(mockState.editorProps.value).toBe('echo hello');
  });

  it('Ctrl+Right with no ghost does nothing (the key falls through)', () => {
    useCommandHistoryStore.setState({ entries: ['ls'] });
    render(<Harness initialInput="zzz" />);
    mountEditor();
    expect(driveProvider('zzz')).toBeUndefined();
    const preventDefault = vi.fn();
    act(() => {
      mockState.keyDownHandler?.({ keyCode: 17, ctrlKey: true, metaKey: false, preventDefault });
    });
    expect(mockState.editorProps.value).toBe('zzz');
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('whole-accept (Tab) still takes everything after a partial accept', () => {
    useCommandHistoryStore.setState({ entries: ['echo hello world'] });
    render(<Harness initialInput="echo " />);
    mountEditor();
    driveProvider('echo ');
    act(() => {
      mockState.keyDownHandler?.({ keyCode: 17, ctrlKey: true, metaKey: false, preventDefault: vi.fn() });
    });
    expect(mockState.editorProps.value).toBe('echo hello');
    act(() => {
      mockState.commands[2]?.();
    });
    expect(mockState.editorProps.value).toBe('echo hello world');
  });
});

describe('InputArea inline completions — ghost words untouched', () => {
  it('the hint placeholder still renders while the input is empty', () => {
    render(<Harness initialInput="" hintPlaceholder="Type a command e.g. ls" />);
    mountEditor();
    expect(screen.getByTestId('composer-hint-placeholder')).toBeTruthy();
    expect(screen.getByTestId('composer-hint-placeholder').textContent).toBe(
      'Type a command e.g. ls',
    );
    // And the provider offers nothing for empty input.
    const list = driveProvider('');
    expect(list).toBeUndefined();
  });

  it('the overlay ghost still renders for the parent ghost (fallback path)', () => {
    render(<Harness initialInput="echo h" ghostSuggestion="echo hi" />);
    mountEditor();
    expect(screen.getByTestId('composer-ghost-suggestion')).toBeTruthy();
  });
});
