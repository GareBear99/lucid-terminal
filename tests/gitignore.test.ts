import { describe, test, expect } from 'vitest';
import {
  parseGitignore,
  matchGitignorePatterns,
  isIgnoredByRulesets,
  type GitignoreRuleset,
} from '../src/lib/gitignore';

describe('parseGitignore', () => {
  test('blank lines and # comments are ignored', () => {
    const patterns = parseGitignore('# a comment\n\n   \n*.log\n');
    expect(patterns).toHaveLength(1);
    expect(patterns[0].glob).toBe('*.log');
  });

  test('escaped leading # and ! are literal', () => {
    const patterns = parseGitignore('\\#hash.txt\n\\!bang.txt\n');
    expect(patterns.map((p) => p.glob)).toEqual(['#hash.txt', '!bang.txt']);
    expect(patterns.every((p) => !p.negated)).toBe(true);
  });

  test('! negates, trailing / is directories-only, leading / anchors', () => {
    const patterns = parseGitignore('!keep.log\nbuild/\n/docs/x.txt\n');
    expect(patterns).toEqual([
      { glob: 'keep.log', negated: true, dirOnly: false, anchored: false },
      { glob: 'build', negated: false, dirOnly: true, anchored: false },
      { glob: 'docs/x.txt', negated: false, dirOnly: false, anchored: true },
    ]);
  });

  test('a / anywhere in the pattern anchors it', () => {
    const patterns = parseGitignore('a/b/c\nplain\n');
    expect(patterns[0].anchored).toBe(true);
    expect(patterns[1].anchored).toBe(false);
  });

  test('CRLF and trailing spaces are tolerated', () => {
    const patterns = parseGitignore('*.log  \r\nbuild/ \r\n');
    expect(patterns.map((p) => p.glob)).toEqual(['*.log', 'build']);
  });

  test('patterns that are only ! or / are dropped', () => {
    expect(parseGitignore('!\n/\n!/ \n')).toHaveLength(0);
  });
});

describe('matchGitignorePatterns', () => {
  test('a pattern without / matches the basename at any depth', () => {
    const patterns = parseGitignore('*.log\n');
    expect(matchGitignorePatterns(patterns, 'a.log', false)).toBe(true);
    expect(matchGitignorePatterns(patterns, 'deep/nested/a.log', false)).toBe(
      true,
    );
    expect(matchGitignorePatterns(patterns, 'a.txt', false)).toBeUndefined();
  });

  test('dir-only patterns do not match files', () => {
    const patterns = parseGitignore('build/\n');
    expect(matchGitignorePatterns(patterns, 'build', true)).toBe(true);
    expect(matchGitignorePatterns(patterns, 'build', false)).toBeUndefined();
    expect(matchGitignorePatterns(patterns, 'src/build', true)).toBe(true);
  });

  test('negation re-includes, last match wins', () => {
    const patterns = parseGitignore('*.log\n!important.log\n');
    expect(matchGitignorePatterns(patterns, 'a.log', false)).toBe(true);
    expect(matchGitignorePatterns(patterns, 'important.log', false)).toBe(
      false,
    );
    const reversed = parseGitignore('!important.log\n*.log\n');
    expect(matchGitignorePatterns(reversed, 'important.log', false)).toBe(
      true,
    );
  });

  test('anchored patterns match relative to the base only', () => {
    const patterns = parseGitignore('docs/*.txt\n');
    expect(matchGitignorePatterns(patterns, 'docs/x.txt', false)).toBe(true);
    expect(
      matchGitignorePatterns(patterns, 'sub/docs/x.txt', false),
    ).toBeUndefined();
  });

  test('** crosses directories, * matches dotfiles', () => {
    const patterns = parseGitignore('**/*.log\n*\n');
    expect(matchGitignorePatterns(patterns, 'a/b/c.log', false)).toBe(true);
    expect(matchGitignorePatterns(patterns, '.env', false)).toBe(true);
  });
});

describe('isIgnoredByRulesets (stacking)', () => {
  const root: GitignoreRuleset = {
    base: '/proj',
    patterns: parseGitignore('*.log\n'),
  };
  const sub: GitignoreRuleset = {
    base: '/proj/sub',
    patterns: parseGitignore('!b.log\n*.tmp\n'),
  };

  test('a deeper ruleset can re-include what a parent ignored', () => {
    // Root ignores *.log everywhere below it; the subdir negates b.log.
    expect(isIgnoredByRulesets([root, sub], '/proj/sub/b.log', false)).toBe(
      false,
    );
    expect(isIgnoredByRulesets([root, sub], '/proj/a.log', false)).toBe(true);
    expect(isIgnoredByRulesets([root, sub], '/proj/sub/x.tmp', false)).toBe(
      true,
    );
    expect(isIgnoredByRulesets([root, sub], '/proj/sub/keep.txt', false)).toBe(
      false,
    );
  });

  test('a ruleset never applies outside its base or to the base itself', () => {
    expect(isIgnoredByRulesets([root], '/other/a.log', false)).toBe(false);
    expect(isIgnoredByRulesets([root], '/proj', true)).toBe(false);
    expect(isIgnoredByRulesets([root], '/proj/sub', true)).toBe(false);
  });

  test('an empty stack ignores nothing', () => {
    expect(isIgnoredByRulesets([], '/proj/a.log', false)).toBe(false);
  });
});
