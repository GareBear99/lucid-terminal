// Git status parsing + formatting (heavy terminal work, 2026-11-13).
import { describe, test, expect } from 'vitest';
import {
  parsePorcelain,
  parseNumstat,
  buildGitStatus,
  formatGitCounts,
  formatGitBranch,
} from '../src/lib/gitStatus';

describe('parsePorcelain', () => {
  test('parses XY status + path per line, skips empties', () => {
    const entries = parsePorcelain(' M src/a.ts\nA  src/b.ts\n?? src/c.ts\n');
    expect(entries).toEqual([
      { status: ' M', path: 'src/a.ts' },
      { status: 'A ', path: 'src/b.ts' },
      { status: '??', path: 'src/c.ts' },
    ]);
  });

  test('empty output is no entries', () => {
    expect(parsePorcelain('')).toEqual([]);
    expect(parsePorcelain('\n')).toEqual([]);
  });
});

describe('parseNumstat', () => {
  test('parses added/deleted/path, binary files count 0 lines', () => {
    const entries = parseNumstat('10\t2\tsrc/a.ts\n-\t-\tassets/logo.png\n');
    expect(entries).toEqual([
      { added: 10, deleted: 2, path: 'src/a.ts' },
      { added: 0, deleted: 0, path: 'assets/logo.png' },
    ]);
  });

  test('skips malformed lines', () => {
    expect(parseNumstat('garbage\n5\t3\tsrc/a.ts\n')).toEqual([
      { added: 5, deleted: 3, path: 'src/a.ts' },
    ]);
  });
});

describe('buildGitStatus', () => {
  test('builds branch + counts from the three raw outputs', () => {
    const status = buildGitStatus(
      'master\n',
      ' M src/a.ts\n?? src/b.ts\n',
      '10\t2\tsrc/a.ts\n3\t1\tsrc/c.ts\n',
      { ahead: 2, behind: 1 },
    );
    expect(status).toEqual({
      branch: 'master',
      ahead: 2,
      behind: 1,
      changedFiles: 2,
      addedLines: 13,
      deletedLines: 3,
    });
  });

  test('empty branch is null — never a faked status', () => {
    expect(buildGitStatus('', '', '')).toBeNull();
    expect(buildGitStatus('   \n', '', '')).toBeNull();
  });

  test('ahead/behind default to 0 without an upstream', () => {
    const status = buildGitStatus('main\n', '', '');
    expect(status?.ahead).toBe(0);
    expect(status?.behind).toBe(0);
  });
});

describe('formatting', () => {
  test('formatGitCounts is Warp-shaped', () => {
    expect(
      formatGitCounts({ branch: 'master', ahead: 0, behind: 0, changedFiles: 36, addedLines: 1075, deletedLines: 2 }),
    ).toBe('36 • +1075 -2');
  });

  test('formatGitBranch adds ahead/behind markers only when present', () => {
    const base = { changedFiles: 0, addedLines: 0, deletedLines: 0 };
    expect(formatGitBranch({ branch: 'master', ahead: 0, behind: 0, ...base })).toBe('master');
    expect(formatGitBranch({ branch: 'master', ahead: 2, behind: 1, ...base })).toBe('master ↑2 ↓1');
    expect(formatGitBranch({ branch: 'dev', ahead: 0, behind: 3, ...base })).toBe('dev ↓3');
  });
});
