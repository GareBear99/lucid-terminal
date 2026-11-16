/**
 * Editor status bar tests.
 *
 * Pure parts: line-ending detection/conversion, the language
 * labels, the tile registry's ordering, and the published
 * editor-state store.
 *
 * Run with: npm test
 */
import { describe, test, expect, beforeEach } from 'vitest';
import {
  detectEol,
  convertLineEndings,
  languageLabel,
  EOL_CONVERT_MAX_BYTES,
  type EolConvertibleModel,
} from '../src/lib/editorStatus';
import {
  useEditorStatusBarStore,
  sortedTiles,
  type StatusBarTile,
} from '../src/stores/editorStatusBarStore';
import { useEditorStatusStore } from '../src/stores/editorStatusStore';

const tile = (id: string, side: 'left' | 'right', priority: number): StatusBarTile => ({
  id,
  side,
  priority,
  render: () => id,
});

describe('detectEol', () => {
  test('LF only', () => {
    expect(detectEol('a\nb\nc\n')).toBe('LF');
  });
  test('CRLF only', () => {
    expect(detectEol('a\r\nb\r\nc\r\n')).toBe('CRLF');
  });
  test('both kinds is Mixed', () => {
    expect(detectEol('a\r\nb\nc\r\n')).toBe('Mixed');
  });
  test('empty or break-free text is LF (Monaco default)', () => {
    expect(detectEol('')).toBe('LF');
    expect(detectEol('no breaks')).toBe('LF');
  });
  test('a lone CR is not a break', () => {
    expect(detectEol('a\rb')).toBe('LF');
  });
});

describe('convertLineEndings', () => {
  function fakeModel(text: string) {
    const calls: Array<{ range: unknown; text: string }> = [];
    const model: EolConvertibleModel & { calls: typeof calls; eol: string | null } = {
      getValue: () => text,
      getFullModelRange: () => ({ startLineNumber: 1, endLineNumber: 99 }),
      applyEdits: (edits) => {
        calls.push(...edits);
      },
      setEOL: (eol) => {
        model.eol = eol;
      },
      calls,
      eol: null,
    };
    return model;
  }

  test('CRLF → LF normalises every break in one edit', () => {
    const model = fakeModel('a\r\nb\r\nc');
    expect(convertLineEndings(model, 'LF')).toBe(true);
    expect(model.calls).toHaveLength(1);
    expect(model.calls[0].text).toBe('a\nb\nc');
    expect(model.eol).toBe('\n');
  });

  test('LF → CRLF converts every break, Mixed input included', () => {
    const model = fakeModel('a\nb\r\nc\n');
    expect(convertLineEndings(model, 'CRLF')).toBe(true);
    expect(model.calls[0].text).toBe('a\r\nb\r\nc\r\n');
    expect(model.eol).toBe('\r\n');
  });

  test('over the size cap nothing changes', () => {
    const model = fakeModel('x'.repeat(EOL_CONVERT_MAX_BYTES + 1));
    expect(convertLineEndings(model, 'LF')).toBe(false);
    expect(model.calls).toHaveLength(0);
    expect(model.eol).toBeNull();
  });
});

describe('languageLabel', () => {
  test('known ids get labels, unknown ids pass through, null is Plain Text', () => {
    expect(languageLabel('typescript')).toBe('TypeScript');
    expect(languageLabel('python')).toBe('Python');
    expect(languageLabel('weird-lang')).toBe('weird-lang');
    expect(languageLabel(null)).toBe('Plain Text');
  });
});

describe('tile registry', () => {
  beforeEach(() => {
    useEditorStatusBarStore.getState().resetForTests();
  });

  test('tiles render in priority order, ties by registration order', () => {
    const store = useEditorStatusBarStore.getState();
    store.registerTile(tile('b', 'left', 20));
    store.registerTile(tile('a', 'left', 10));
    store.registerTile(tile('c', 'left', 20));
    store.registerTile(tile('r', 'right', 5));
    expect(sortedTiles(useEditorStatusBarStore.getState().tiles, 'left').map((t) => t.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(sortedTiles(useEditorStatusBarStore.getState().tiles, 'right').map((t) => t.id)).toEqual([
      'r',
    ]);
  });

  test('the unregister function is the tile destroy — it removes the tile', () => {
    const store = useEditorStatusBarStore.getState();
    const destroy = store.registerTile(tile('x', 'left', 10));
    expect(useEditorStatusBarStore.getState().tiles).toHaveLength(1);
    destroy();
    expect(useEditorStatusBarStore.getState().tiles).toHaveLength(0);
  });

  test('re-registering an id replaces the tile, it does not duplicate it', () => {
    const store = useEditorStatusBarStore.getState();
    store.registerTile(tile('x', 'left', 10));
    store.registerTile(tile('x', 'left', 30));
    const tiles = useEditorStatusBarStore.getState().tiles;
    expect(tiles).toHaveLength(1);
    expect(tiles[0].priority).toBe(30);
  });
});

describe('editor status store', () => {
  beforeEach(() => {
    useEditorStatusStore.getState().resetForTests();
  });

  test('publish merges partial state; reset restores the defaults', () => {
    const store = useEditorStatusStore.getState();
    store.publish({ filePath: '/a/b.ts', lineNumber: 12, column: 4, selectionCount: 7 });
    const state = useEditorStatusStore.getState();
    expect(state.filePath).toBe('/a/b.ts');
    expect(state.lineNumber).toBe(12);
    expect(state.column).toBe(4);
    expect(state.selectionCount).toBe(7);
    expect(state.eol).toBeNull();
    store.resetForTests();
    expect(useEditorStatusStore.getState().filePath).toBeNull();
    expect(useEditorStatusStore.getState().lineNumber).toBe(1);
  });
});
