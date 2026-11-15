// @vitest-environment node
/**
 * readFileHead — the large-file preview read (files-section fix
 * step 3, electron/ipc/fileSystem.ts).
 *
 * The head read must never materialise the whole file: it opens
 * the file, stats it, and reads at most maxBytes from offset 0.
 * The content is cut to the last '\n' when truncated, so the
 * preview never ends mid-line, and reports the full size so the
 * store can say how much was not loaded.
 *
 * Run with: npm test
 */
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileHead } from '../electron/ipc/fileSystem';

describe('readFileHead', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'lucid-filehead-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test('a file under the cap reads whole, truncated false, fullSize set', async () => {
    const file = join(root, 'small.txt');
    await writeFile(file, 'hello\nworld\n');
    const head = await readFileHead(file, 1024 * 1024);
    expect(head.content).toBe('hello\nworld\n');
    expect(head.truncated).toBe(false);
    expect(head.fullSize).toBe(12);
  });

  test('a file over the cap reads only the head, cut to the last newline', async () => {
    const file = join(root, 'big.txt');
    // 100 lines of 100 bytes each = 10,000 bytes.
    const line = 'x'.repeat(99) + '\n';
    await writeFile(file, line.repeat(100));
    const head = await readFileHead(file, 1000);
    // 1000 bytes cut back to the last '\n' inside the head = 10 lines.
    expect(head.content).toBe(line.repeat(10));
    expect(head.truncated).toBe(true);
    expect(head.fullSize).toBe(10_000);
    // The preview ends on a line boundary, never mid-line.
    expect(head.content.endsWith('\n')).toBe(true);
  });

  test('a file with no newline in the head keeps at least one line', async () => {
    const file = join(root, 'oneline.txt');
    await writeFile(file, 'y'.repeat(5000));
    const head = await readFileHead(file, 1000);
    expect(head.content).toBe('y'.repeat(1000));
    expect(head.truncated).toBe(true);
    expect(head.fullSize).toBe(5000);
  });

  test('a cut through a multi-byte character leaves no replacement char', async () => {
    const file = join(root, 'unicode.txt');
    // 'é' is 2 bytes in UTF-8; a 1001-byte head ends mid-character.
    await writeFile(file, 'é'.repeat(2000));
    const head = await readFileHead(file, 1001);
    expect(head.truncated).toBe(true);
    expect(head.fullSize).toBe(4000);
    expect(head.content).not.toContain('\uFFFD');
    expect(head.content).toBe('é'.repeat(500));
  });

  test('a file exactly at the cap is not truncated', async () => {
    const file = join(root, 'exact.txt');
    await writeFile(file, 'z'.repeat(1000));
    const head = await readFileHead(file, 1000);
    expect(head.content).toBe('z'.repeat(1000));
    expect(head.truncated).toBe(false);
    expect(head.fullSize).toBe(1000);
  });

  test('a missing file throws', async () => {
    await expect(readFileHead(join(root, 'nope.txt'), 1000)).rejects.toThrow();
  });
});
