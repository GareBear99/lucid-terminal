import { describe, test, expect } from 'vitest';
import {
  parseUnifiedDiff,
  hunksToGutterRanges,
  gutterRangesForDiff,
} from '../src/lib/gitLineDiff';

const SIMPLE_DIFF = `diff --git a/src/foo.ts b/src/foo.ts
index 1234567..89abcde 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 import { a } from './a';
+import { b } from './b';
 const x = 1;
-const y = 2;
+const y = 3;
@@ -10,0 +11,1 @@ function f() {
   return 1;
 }
+  return 2;
`;

describe('parseUnifiedDiff', () => {
  test('parses hunk headers into Atom-shaped diffs', () => {
    expect(parseUnifiedDiff(SIMPLE_DIFF)).toEqual([
      { oldStart: 1, newStart: 1, oldLines: 3, newLines: 4 },
      { oldStart: 10, newStart: 11, oldLines: 0, newLines: 1 },
    ]);
  });

  test('a hunk with no counts means 1 line', () => {
    expect(parseUnifiedDiff('@@ -5 +5 @@\n context')).toEqual([
      { oldStart: 5, newStart: 5, oldLines: 1, newLines: 1 },
    ]);
  });

  test('empty / null / garbage input yields no hunks', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
    expect(parseUnifiedDiff(null)).toEqual([]);
    expect(parseUnifiedDiff(undefined)).toEqual([]);
    expect(parseUnifiedDiff('not a diff\nat all\n')).toEqual([]);
  });

  test('a new-file diff parses as one added hunk', () => {
    const diff = `diff --git a/new.ts b/new.ts
new file mode 100644
--- /dev/null
+++ b/new.ts
@@ -0,0 +1,3 @@
+line one
+line two
+line three
`;
    expect(parseUnifiedDiff(diff)).toEqual([
      { oldStart: 0, newStart: 1, oldLines: 0, newLines: 3 },
    ]);
  });
});

describe('hunksToGutterRanges', () => {
  test('an added hunk maps to the new lines', () => {
    expect(
      hunksToGutterRanges([{ oldStart: 0, newStart: 1, oldLines: 0, newLines: 3 }]),
    ).toEqual([
      { kind: 'added', startLine: 1, endLine: 3, className: 'git-line-added' },
    ]);
  });

  test('a changed hunk maps to modified', () => {
    expect(
      hunksToGutterRanges([{ oldStart: 1, newStart: 1, oldLines: 3, newLines: 4 }]),
    ).toEqual([
      { kind: 'modified', startLine: 1, endLine: 4, className: 'git-line-modified' },
    ]);
  });

  test('a pure deletion maps to the line it sits after', () => {
    expect(
      hunksToGutterRanges([{ oldStart: 5, newStart: 4, oldLines: 2, newLines: 0 }]),
    ).toEqual([
      { kind: 'removed', startLine: 4, endLine: 4, className: 'git-line-removed' },
    ]);
  });

  test('a deletion at the very start of the file uses the previous-line class', () => {
    expect(
      hunksToGutterRanges([{ oldStart: 1, newStart: 0, oldLines: 2, newLines: 0 }]),
    ).toEqual([
      {
        kind: 'removed',
        startLine: 1,
        endLine: 1,
        className: 'git-previous-line-removed',
      },
    ]);
  });

  test('a 0/0 hunk is not a change', () => {
    expect(
      hunksToGutterRanges([{ oldStart: 3, newStart: 3, oldLines: 0, newLines: 0 }]),
    ).toEqual([]);
  });
});

describe('gutterRangesForDiff', () => {
  test('the simple diff maps to modified + added', () => {
    expect(gutterRangesForDiff(SIMPLE_DIFF)).toEqual([
      { kind: 'modified', startLine: 1, endLine: 4, className: 'git-line-modified' },
      { kind: 'added', startLine: 11, endLine: 11, className: 'git-line-added' },
    ]);
  });
});
