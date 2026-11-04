/**
 * Model-file check tests.
 *
 * The startup disclaimer asks "is a model FILE installed" — a non-empty,
 * readable .gguf/.llamafile in one of the model directories. These tests
 * cover the scan directly (temp directories stand in for
 * ~/.lucid/models and LUCID-BACKEND/models) plus the GGUF check the
 * installer relies on to claim success.
 *
 * Run with: npm test
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  scanModelDirectories,
  isValidGguf,
  verifyTinyLlamaInstalled,
  getModelDirectories,
  TINYLLAMA_FILENAME,
} from '../electron/core/llm/modelFiles';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-modelfiles-'));
}

function writeGguf(dir: string, name: string, size = 1024): string {
  const file = path.join(dir, name);
  const buf = Buffer.alloc(size);
  buf.write('GGUF', 0, 'ascii');
  fs.writeFileSync(file, buf);
  return file;
}

describe('scanModelDirectories', () => {
  test('model in the first directory only counts as installed', () => {
    const homeModels = makeTempDir();
    const backendModels = makeTempDir();
    writeGguf(homeModels, 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf');
    const scan = scanModelDirectories([homeModels, backendModels]);
    expect(scan.installed).toBe(true);
    expect(scan.files).toHaveLength(1);
    expect(scan.files[0].name).toBe('tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf');
    expect(scan.files[0].dir).toBe(homeModels);
  });

  test('model in the backend directory only counts as installed', () => {
    const homeModels = makeTempDir();
    const backendModels = makeTempDir();
    writeGguf(backendModels, 'mistral-7b.Q4_K_M.gguf');
    const scan = scanModelDirectories([homeModels, backendModels]);
    expect(scan.installed).toBe(true);
    expect(scan.files).toHaveLength(1);
    expect(scan.files[0].dir).toBe(backendModels);
  });

  test('no model anywhere counts as not installed', () => {
    const homeModels = makeTempDir();
    const backendModels = makeTempDir();
    const scan = scanModelDirectories([homeModels, backendModels]);
    expect(scan.installed).toBe(false);
    expect(scan.files).toHaveLength(0);
  });

  test('missing directories do not throw and count as not installed', () => {
    const scan = scanModelDirectories([
      path.join(os.tmpdir(), 'lucid-no-such-dir-a'),
      path.join(os.tmpdir(), 'lucid-no-such-dir-b'),
    ]);
    expect(scan.installed).toBe(false);
    expect(scan.errors.length).toBeGreaterThan(0);
  });

  test('an unreadable directory does not throw and is recorded, not fatal', () => {
    const goodDir = makeTempDir();
    writeGguf(goodDir, 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf');
    // A path that is a file, not a directory, fails readdir the same way
    // an unreadable directory does (and works even as root, where
    // chmod 000 does not block reads).
    const notADir = path.join(makeTempDir(), 'not-a-dir');
    fs.writeFileSync(notADir, 'x');
    const scan = scanModelDirectories([notADir, goodDir]);
    expect(scan.installed).toBe(true);
    expect(scan.files).toHaveLength(1);
    expect(scan.errors.length).toBeGreaterThan(0);
  });

  test('empty model files and non-model files are ignored', () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, 'empty.gguf'), '');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a model');
    fs.writeFileSync(path.join(dir, 'readme.md'), 'not a model');
    writeGguf(dir, 'real.llamafile');
    const scan = scanModelDirectories([dir]);
    expect(scan.installed).toBe(true);
    expect(scan.files).toHaveLength(1);
    expect(scan.files[0].name).toBe('real.llamafile');
  });
});

describe('isValidGguf', () => {
  test('a file starting with GGUF magic is valid', () => {
    const dir = makeTempDir();
    const file = writeGguf(dir, 'model.gguf');
    expect(isValidGguf(file)).toBe(true);
  });

  test('a file without GGUF magic is not valid (bad download)', () => {
    const dir = makeTempDir();
    const file = path.join(dir, 'model.gguf');
    fs.writeFileSync(file, '<html>404 Not Found</html>');
    expect(isValidGguf(file)).toBe(false);
  });

  test('a missing file is not valid', () => {
    expect(isValidGguf(path.join(os.tmpdir(), 'lucid-no-such-model.gguf'))).toBe(false);
  });
});

describe('verifyTinyLlamaInstalled', () => {
  test('a real TinyLlama GGUF verifies', () => {
    const dir = makeTempDir();
    writeGguf(dir, TINYLLAMA_FILENAME);
    const check = verifyTinyLlamaInstalled(dir);
    expect(check.installed).toBe(true);
    expect(check.path).toBe(path.join(dir, TINYLLAMA_FILENAME));
  });

  test('a missing TinyLlama file does not verify', () => {
    const dir = makeTempDir();
    const check = verifyTinyLlamaInstalled(dir);
    expect(check.installed).toBe(false);
    expect(check.reason).toMatch(/not found/);
  });

  test('a TinyLlama file with bad magic does not verify', () => {
    const dir = makeTempDir();
    fs.writeFileSync(path.join(dir, TINYLLAMA_FILENAME), 'not a gguf at all');
    const check = verifyTinyLlamaInstalled(dir);
    expect(check.installed).toBe(false);
    expect(check.reason).toMatch(/not a valid GGUF/);
  });
});

describe('getModelDirectories', () => {
  test('checks both the home models dir and the backend models dir', () => {
    const appRoot = makeTempDir();
    const backendModels = path.join(appRoot, 'LUCID-BACKEND', 'models');
    fs.mkdirSync(backendModels, { recursive: true });
    const dirs = getModelDirectories(appRoot);
    expect(dirs).toContain(path.join(os.homedir(), '.lucid', 'models'));
    expect(dirs).toContain(backendModels);
  });

  test('falls back to the home models dir alone when no backend is found', () => {
    const dirs = getModelDirectories(path.join(os.tmpdir(), 'lucid-no-such-app-root'));
    expect(dirs).toEqual([path.join(os.homedir(), '.lucid', 'models')]);
  });
});
