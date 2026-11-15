import { describe, test, expect } from 'vitest';
import {
  parseGoToLine,
  isLineJumpQuery,
  splitLineJumpSuffix,
} from '../src/lib/goToLine';

describe('parseGoToLine', () => {
  test('a plain line number jumps to the start of the line', () => {
    expect(parseGoToLine('42', 1)).toEqual({ lineNumber: 42, column: 1 });
  });

  test('line:column parses both', () => {
    expect(parseGoToLine('42:10', 1)).toEqual({ lineNumber: 42, column: 10 });
  });

  test('a missing row means the current row', () => {
    expect(parseGoToLine(':10', 7)).toEqual({ lineNumber: 7, column: 10 });
  });

  test('an empty input parses to nothing', () => {
    expect(parseGoToLine('', 7)).toBeNull();
  });

  test('a lone colon parses to nothing', () => {
    expect(parseGoToLine(':', 7)).toBeNull();
  });

  test('lines and columns clamp to 1, never 0', () => {
    expect(parseGoToLine('0:0', 1)).toEqual({ lineNumber: 1, column: 1 });
  });
});

describe('isLineJumpQuery', () => {
  test('detects a :line suffix', () => {
    expect(isLineJumpQuery('foo.ts:12')).toBe(true);
    expect(isLineJumpQuery('foo.ts:12:3')).toBe(true);
    expect(isLineJumpQuery('foo.ts')).toBe(false);
    expect(isLineJumpQuery('foo.ts:')).toBe(false);
    expect(isLineJumpQuery(':12')).toBe(true);
  });
});

describe('splitLineJumpSuffix', () => {
  test('splits path and line', () => {
    expect(splitLineJumpSuffix('src/foo.ts:12', 1)).toEqual({
      pathQuery: 'src/foo.ts',
      target: { lineNumber: 12, column: 1 },
    });
  });

  test('splits path, line and column', () => {
    expect(splitLineJumpSuffix('src/foo.ts:12:3', 1)).toEqual({
      pathQuery: 'src/foo.ts',
      target: { lineNumber: 12, column: 3 },
    });
  });

  test('no suffix returns null', () => {
    expect(splitLineJumpSuffix('src/foo.ts', 1)).toBeNull();
    expect(splitLineJumpSuffix(':12', 1)).toBeNull();
  });
});
