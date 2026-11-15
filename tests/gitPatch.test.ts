/**
 * Unified-diff parsing + single-hunk patches (Atom steal #21 —
 * the git panel's local core, 2026-11-14).
 *
 * The unit cases cover the parse (multi-file, multi-hunk, new
 * file, no-newline marker, binary file); the round-trip proves
 * the mechanism end to end in a real throwaway repo: parse a
 * two-hunk diff, build one hunk's patch, `git apply --cached`
 * it, and the index holds exactly that hunk — then reverse it
 * and the index is empty again.
 */
import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import {
  parseUnifiedDiff,
  buildHunkPatch,
  annotateStagedHunks,
} from '../src/lib/gitPatch';

const exec = promisify(execFile);
const git = (cwd: string, ...args: string[]) => exec('git', args, { cwd });

/**
 * `git apply --cached` with the patch on stdin — on `spawn`,
 * like the IPC handler (electron/ipc/git.ts): `execFile`'s
 * `input` option never delivers stdin on this Node build
 * (verified 2026-11-14 — it hangs even for `cat`).
 */
function applyPatch(cwd: string, patch: string, reverse: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = reverse ? ['apply', '--cached', '--reverse'] : ['apply', '--cached'];
    const child = spawn('git', args, { cwd });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `git apply exited ${code}`));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(patch);
  });
}

const SAMPLE = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 line one
-line two
+line two changed
+line two added
 line three
@@ -10,2 +11,3 @@
 line ten
+line eleven
 line twelve
diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,2 @@
+hello
+world
\\ No newline at end of file
diff --git a/logo.png b/logo.png
index 4444444..5555555 100644
Binary files a/logo.png and b/logo.png differ
`;

describe('parseUnifiedDiff', () => {
  it('parses files, hunks, and line types', () => {
    const files = parseUnifiedDiff(SAMPLE);
    expect(files.map((f) => f.path)).toEqual(['src/a.ts', 'src/new.ts', 'logo.png']);
    const a = files[0];
    expect(a.hunks).toHaveLength(2);
    expect(a.hunks[0].oldStart).toBe(1);
    expect(a.hunks[0].oldCount).toBe(3);
    expect(a.hunks[0].newCount).toBe(4);
    expect(a.hunks[0].lines.map((l) => l.type).join('')).toBe(' -++ ');
    expect(a.hunks[1].lines[1]).toEqual({ type: '+', text: 'line eleven' });
  });

  it('marks new files and attaches the no-newline marker', () => {
    const files = parseUnifiedDiff(SAMPLE);
    expect(files[1].isNew).toBe(true);
    expect(files[1].oldHeader).toBe('/dev/null');
    expect(files[1].hunks[0].lines[1]).toEqual({
      type: '+',
      text: 'world',
      noNewline: true,
    });
  });

  it('parses a binary file as a file with no hunks', () => {
    const files = parseUnifiedDiff(SAMPLE);
    expect(files[2].hunks).toEqual([]);
    expect(files[2].isNew).toBe(false);
  });

  it('returns an empty list for an empty diff and never throws on garbage', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
    expect(parseUnifiedDiff('not a diff at all\n@@ nope')).toEqual([]);
  });
});

describe('buildHunkPatch', () => {
  it('builds a minimal patch for one hunk', () => {
    const files = parseUnifiedDiff(SAMPLE);
    const patch = buildHunkPatch(files[0], files[0].hunks[0]);
    expect(patch).toBe(
      'diff --git a/src/a.ts b/src/a.ts\n' +
        '--- a/src/a.ts\n' +
        '+++ b/src/a.ts\n' +
        '@@ -1,3 +1,4 @@\n' +
        ' line one\n' +
        '-line two\n' +
        '+line two changed\n' +
        '+line two added\n' +
        ' line three\n',
    );
  });

  it('emits the no-newline marker after its line', () => {
    const files = parseUnifiedDiff(SAMPLE);
    const patch = buildHunkPatch(files[1], files[1].hunks[0]);
    expect(patch).toContain('+world\n\\ No newline at end of file\n');
    expect(patch).toContain('--- /dev/null\n');
  });
});

describe('annotateStagedHunks', () => {
  it('marks hunks staged when their header is in the cached diff', () => {
    const head = parseUnifiedDiff(SAMPLE);
    const staged = parseUnifiedDiff(
      'diff --git a/src/a.ts b/src/a.ts\n' +
        '--- a/src/a.ts\n' +
        '+++ b/src/a.ts\n' +
        '@@ -1,3 +1,4 @@\n' +
        ' line one\n' +
        '-line two\n' +
        '+line two changed\n' +
        '+line two added\n' +
        ' line three\n',
    );
    const annotated = annotateStagedHunks(head, staged);
    expect(annotated[0].hunks[0].staged).toBe(true);
    expect(annotated[0].hunks[1].staged).toBe(false);
    expect(annotated[1].hunks[0].staged).toBe(false);
  });
});

describe('hunk patch round-trip (real git)', () => {
  // Real git invocations under a loaded vitest worker can be
  // slow to spawn — the default 10 s timeout is too tight.
  it('stages exactly one hunk via git apply --cached, then reverses it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lucid-gitpatch-'));
    try {
      await git(dir, 'init', '-q');
      await git(dir, 'config', 'user.email', 'test@lucid.local');
      await git(dir, 'config', 'user.name', 'Lucid Test');
      const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
      await writeFile(join(dir, 'a.txt'), `${lines.join('\n')}\n`);
      await git(dir, 'add', 'a.txt');
      await git(dir, 'commit', '-q', '-m', 'initial');
      // Two separated edits → two hunks.
      lines[1] = 'line 2 changed';
      lines[17] = 'line 18 changed';
      await writeFile(join(dir, 'a.txt'), `${lines.join('\n')}\n`);
      const { stdout: raw } = await exec('git', ['diff', 'HEAD', '--', 'a.txt'], { cwd: dir });
      const files = parseUnifiedDiff(raw);
      expect(files).toHaveLength(1);
      expect(files[0].hunks).toHaveLength(2);
      // Stage only the first hunk.
      const patch = buildHunkPatch(files[0], files[0].hunks[0]);
      await applyPatch(dir, patch, false);
      const { stdout: cached } = await exec('git', ['diff', '--cached', '--stat'], { cwd: dir });
      expect(cached).toContain('1 insertion');
      expect(cached).not.toContain('2 insertions');
      const { stdout: unstaged } = await exec('git', ['diff', '--stat'], { cwd: dir });
      expect(unstaged).toContain('1 insertion');
      // Reverse it — the index is empty again.
      await applyPatch(dir, patch, true);
      const { stdout: cachedAfter } = await exec('git', ['diff', '--cached', '--stat'], { cwd: dir });
      expect(cachedAfter.trim()).toBe('');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
