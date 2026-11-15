import { describe, test, expect } from 'vitest';
import {
  decorationToMonacoOptions,
  doesChangeInvalidate,
  MarkerLayer,
  type MarkerEditor,
  type MarkerRange,
} from '../src/lib/markerDecorations';

const range = (
  startLine: number,
  startCol: number,
  endLine: number,
  endCol: number,
): MarkerRange => ({
  startLineNumber: startLine,
  startColumn: startCol,
  endLineNumber: endLine,
  endColumn: endCol,
});

describe('decorationToMonacoOptions', () => {
  test('line decorates the whole line', () => {
    expect(
      decorationToMonacoOptions({ type: 'line', className: 'foo' }),
    ).toEqual({ isWholeLine: true, className: 'foo' });
  });

  test('line-number decorates the line-number margin', () => {
    expect(
      decorationToMonacoOptions({ type: 'line-number', className: 'git-line-added' }),
    ).toEqual({ linesDecorationsClassName: 'git-line-added' });
  });

  test('gutter decorates the glyph margin, with a hover message', () => {
    expect(
      decorationToMonacoOptions({
        type: 'gutter',
        className: 'git-line-added',
        hoverMessage: 'Added',
      }),
    ).toEqual({
      glyphMarginClassName: 'git-line-added',
      glyphMarginHoverMessage: { value: 'Added' },
    });
  });

  test('text decorates inline, highlight decorates the range', () => {
    expect(
      decorationToMonacoOptions({ type: 'text', className: 'find-result' }),
    ).toEqual({ inlineClassName: 'find-result' });
    expect(
      decorationToMonacoOptions({ type: 'highlight', className: 'sel' }),
    ).toEqual({ className: 'sel' });
  });
});

describe('doesChangeInvalidate', () => {
  const marker = range(5, 1, 8, 10);

  test('never is never invalidated', () => {
    expect(
      doesChangeInvalidate('never', marker, range(1, 1, 20, 1)),
    ).toBe(false);
  });

  test('surround only when the change covers the whole marker', () => {
    expect(
      doesChangeInvalidate('surround', marker, range(1, 1, 20, 1)),
    ).toBe(true);
    expect(
      doesChangeInvalidate('surround', marker, range(6, 1, 7, 1)),
    ).toBe(false);
  });

  test('overlap when the change intersects the marker', () => {
    expect(
      doesChangeInvalidate('overlap', marker, range(7, 1, 9, 1)),
    ).toBe(true);
    expect(
      doesChangeInvalidate('overlap', marker, range(10, 1, 12, 1)),
    ).toBe(false);
  });

  test('overlap does not fire for a pure insertion inside the marker', () => {
    expect(
      doesChangeInvalidate('overlap', marker, range(6, 5, 6, 5)),
    ).toBe(false);
  });

  test('inside fires for a pure insertion strictly inside the marker', () => {
    expect(
      doesChangeInvalidate('inside', marker, range(6, 5, 6, 5)),
    ).toBe(true);
  });

  test('inside does not fire for an insertion exactly at an edge', () => {
    expect(
      doesChangeInvalidate('inside', marker, range(5, 1, 5, 1)),
    ).toBe(false);
    expect(
      doesChangeInvalidate('inside', marker, range(8, 10, 8, 10)),
    ).toBe(false);
  });

  test('touch fires for an insertion at an edge', () => {
    expect(
      doesChangeInvalidate('touch', marker, range(5, 1, 5, 1)),
    ).toBe(true);
    expect(
      doesChangeInvalidate('touch', marker, range(8, 10, 8, 10)),
    ).toBe(true);
    expect(
      doesChangeInvalidate('touch', marker, range(10, 1, 11, 1)),
    ).toBe(false);
  });
});

function stubEditor(): {
  editor: MarkerEditor;
  setCalls: Array<unknown>;
  fireChange: (changes: { range: MarkerRange; text: string }[]) => void;
} {
  const setCalls: Array<unknown> = [];
  let listener: ((changes: { range: MarkerRange; text: string }[]) => void) | null = null;
  const editor: MarkerEditor = {
    createDecorationsCollection: () => ({
      set: (decorations) => {
        setCalls.push(decorations);
      },
      clear: () => {
        setCalls.push('clear');
      },
      dispose: () => {},
    }),
    onDidChangeModelContent: (fn) => {
      listener = fn;
      return { dispose: () => { listener = null; } };
    },
  };
  return {
    editor,
    setCalls,
    fireChange: (changes) => listener?.(changes),
  };
}

describe('MarkerLayer', () => {
  test('mark + decorate renders one decoration', () => {
    const { editor, setCalls } = stubEditor();
    const layer = new MarkerLayer(editor);
    const marker = layer.markRange(range(2, 1, 2, 5));
    layer.decorateMarker(marker, { type: 'gutter', className: 'git-line-added' });
    const last = setCalls[setCalls.length - 1] as Array<{
      range: MarkerRange;
      options: { glyphMarginClassName: string };
    }>;
    expect(last).toHaveLength(1);
    expect(last[0].range).toEqual(range(2, 1, 2, 5));
    expect(last[0].options.glyphMarginClassName).toBe('git-line-added');
  });

  test('decorateMarkerLayer renders every marker at once', () => {
    const { editor, setCalls } = stubEditor();
    const layer = new MarkerLayer(editor);
    layer.markRange(range(1, 1, 1, 3));
    layer.markRange(range(2, 1, 2, 3));
    layer.decorateMarkerLayer({ type: 'line-number', className: 'git-line-modified' });
    const last = setCalls[setCalls.length - 1] as Array<unknown>;
    expect(last).toHaveLength(2);
  });

  test('a change that invalidates a marker drops it and reports it', () => {
    const { editor, setCalls, fireChange } = stubEditor();
    const invalidated: number[] = [];
    const layer = new MarkerLayer(editor, {
      onDidInvalidateMarker: (m) => invalidated.push(m.id),
    });
    const marker = layer.markRange(range(5, 1, 8, 10), { invalidate: 'overlap' });
    layer.decorateMarker(marker, { type: 'line', className: 'x' });
    fireChange([{ range: range(6, 1, 7, 1), text: 'replaced' }]);
    expect(invalidated).toEqual([marker.id]);
    expect(layer.getMarker(marker.id)).toBeUndefined();
    const last = setCalls[setCalls.length - 1] as Array<unknown>;
    expect(last).toHaveLength(0);
  });

  test('a change that does not invalidate leaves the marker alone', () => {
    const { editor, fireChange } = stubEditor();
    const layer = new MarkerLayer(editor);
    const marker = layer.markRange(range(5, 1, 8, 10), { invalidate: 'overlap' });
    layer.decorateMarker(marker, { type: 'line', className: 'x' });
    fireChange([{ range: range(20, 1, 21, 1), text: 'elsewhere' }]);
    expect(layer.getMarker(marker.id)).toBeDefined();
  });

  test('destroyMarker and clear drop decorations', () => {
    const { editor, setCalls } = stubEditor();
    const layer = new MarkerLayer(editor);
    const a = layer.markRange(range(1, 1, 1, 2));
    layer.markRange(range(2, 1, 2, 2));
    layer.decorateMarkerLayer({ type: 'text', className: 'x' });
    layer.destroyMarker(a.id);
    const afterDestroy = setCalls[setCalls.length - 1] as Array<unknown>;
    expect(afterDestroy).toHaveLength(1);
    layer.clear();
    const afterClear = setCalls[setCalls.length - 1] as Array<unknown>;
    expect(afterClear).toHaveLength(0);
  });

  test('the default invalidation is overlap', () => {
    const { editor } = stubEditor();
    const layer = new MarkerLayer(editor);
    const marker = layer.markRange(range(1, 1, 1, 5));
    expect(marker.invalidate).toBe('overlap');
  });
});
