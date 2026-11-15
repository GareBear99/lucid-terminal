/**
 * Project search pure tests (Atom steal #5 — 2026-11-14).
 *
 * The pure parts: grouping matches by file, the search
 * pattern builder (literal escaping, regex validation,
 * whole-word wrapping), and the replace computation
 * (right-to-left per line, so columns stay valid; a match
 * whose span no longer matches the line is skipped, never
 * forced).
 *
 * Run with: npx vitest run tests/projectSearch.test.ts
 */
import { describe, test, expect } from 'vitest';
import {
  groupMatchesByFile,
  buildSearchPattern,
  applyReplacements,
  type SearchMatch,
} from '../src/lib/projectSearch';

function match(
  file: string,
  line: number,
  column: number,
  text: string,
  matchText: string,
): SearchMatch {
  return { file, line, column, text, matchText };
}

describe('groupMatchesByFile', () => {
  test('groups in first-seen order', () => {
    const matches = [
      match('/a.ts', 1, 1, 'x', 'x'),
      match('/b.ts', 2, 1, 'y', 'y'),
      match('/a.ts', 5, 3, 'z', 'z'),
    ];
    const groups = groupMatchesByFile(matches);
    expect(groups.map((g) => g.file)).toEqual(['/a.ts', '/b.ts']);
    expect(groups[0].matches).toHaveLength(2);
    expect(groups[1].matches).toHaveLength(1);
  });

  test('an empty list groups to nothing', () => {
    expect(groupMatchesByFile([])).toEqual([]);
  });
});

describe('buildSearchPattern', () => {
  test('literal mode escapes regex syntax', () => {
    const { source, flags } = buildSearchPattern({
      query: 'a.b(c)',
      regex: false,
      caseSensitive: false,
      wholeWord: false,
      scope: 'project',
    });
    expect(source).toBe('a\\.b\\(c\\)');
    expect(flags).toBe('gi');
    expect(new RegExp(source, flags).test('a.b(c)')).toBe(true);
    expect(new RegExp(source, flags).test('axb(c)')).toBe(false);
  });

  test('case-sensitive mode drops the i flag', () => {
    const { flags } = buildSearchPattern({
      query: 'Ab',
      regex: false,
      caseSensitive: true,
      wholeWord: false,
      scope: 'project',
    });
    expect(flags).toBe('g');
  });

  test('an invalid regex throws with the engine message', () => {
    expect(() =>
      buildSearchPattern({
        query: '(unclosed',
        regex: true,
        caseSensitive: false,
        wholeWord: false,
        scope: 'project',
      }),
    ).toThrow();
  });

  test('whole-word wraps the pattern in word boundaries', () => {
    const { source } = buildSearchPattern({
      query: 'cat',
      regex: false,
      caseSensitive: false,
      wholeWord: true,
      scope: 'project',
    });
    expect(source).toBe('\\b(?:cat)\\b');
    const re = new RegExp(source, 'gi');
    expect(re.test('the cat sat')).toBe(true);
    expect(re.test('concatenate')).toBe(false);
  });
});

describe('applyReplacements', () => {
  test('replaces the matched span, nothing else', () => {
    const { content, replacedCount } = applyReplacements(
      'const foo = 1;\nconst foo = 2;\n',
      [
        match('/a.ts', 1, 7, 'const foo = 1;', 'foo'),
        match('/a.ts', 2, 7, 'const foo = 2;', 'foo'),
      ],
      'bar',
    );
    expect(content).toBe('const bar = 1;\nconst bar = 2;\n');
    expect(replacedCount).toBe(2);
  });

  test('multiple matches on one line apply right-to-left', () => {
    const { content, replacedCount } = applyReplacements(
      'foo foo foo\n',
      [
        match('/a.ts', 1, 1, 'foo foo foo', 'foo'),
        match('/a.ts', 1, 5, 'foo foo foo', 'foo'),
        match('/a.ts', 1, 9, 'foo foo foo', 'foo'),
      ],
      'barbar',
    );
    expect(content).toBe('barbar barbar barbar\n');
    expect(replacedCount).toBe(3);
  });

  test('a match whose span no longer matches is skipped', () => {
    const { content, replacedCount } = applyReplacements(
      'const bar = 1;\n',
      [match('/a.ts', 1, 7, 'const foo = 1;', 'foo')],
      'baz',
    );
    expect(content).toBe('const bar = 1;\n');
    expect(replacedCount).toBe(0);
  });

  test('an out-of-range line is skipped', () => {
    const { content, replacedCount } = applyReplacements('one line\n', [
      match('/a.ts', 99, 1, 'missing', 'missing'),
    ], 'x');
    expect(content).toBe('one line\n');
    expect(replacedCount).toBe(0);
  });

  test('a regex replacement replaces the matched text only', () => {
    const { content, replacedCount } = applyReplacements(
      'user_123 logged in\n',
      [match('/a.ts', 1, 6, 'user_123 logged in', '123')],
      '456',
    );
    expect(content).toBe('user_456 logged in\n');
    expect(replacedCount).toBe(1);
  });
});
