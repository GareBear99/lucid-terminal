/**
 * Forge paths tests — the packaged-app writable working copy.
 *
 * In the packaged app resourcesPath may be read-only, and the trainer
 * reads/writes under the vendored tree, so the trainer runs from a
 * working copy at ~/.lucid/llmbuilder/code/, refreshed from the
 * resources copy on first run and whenever the vendored tree changes.
 * In dev the repo tree is already writable, so builderDir and
 * vendoredDir are the same dir and no copy ever happens.
 *
 * Covered:
 * - dev resolve: builderDir == vendoredDir == the repo tree
 * - packaged resolve: builderDir under the state dir, vendoredDir
 *   under resources
 * - ensureBuilderWorkCopy copies the tree, is a no-op when current,
 *   and re-copies when VERSION or the trainer script changes
 * - ensureBuilderWorkCopy is a no-op in dev and when nothing is vendored
 */

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const appMock = vi.hoisted(() => ({ isPackaged: false }));

vi.mock('electron', () => ({
  app: appMock,
}));

import {
  TRAIN_SCRIPT_REL,
  WORK_COPY_MARKER,
  ensureBuilderWorkCopy,
  resolveLlmbuilderPaths,
} from '../electron/core/llmbuilder/paths';

function makeVendored(root: string, version: string): string {
  const vendored = path.join(root, 'vendored');
  const script = path.join(vendored, TRAIN_SCRIPT_REL);
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.writeFileSync(script, '# trainer\n', 'utf-8');
  fs.writeFileSync(path.join(vendored, 'VERSION'), version, 'utf-8');
  fs.mkdirSync(path.join(vendored, 'adapters'), { recursive: true });
  fs.writeFileSync(
    path.join(vendored, 'adapters', 'exemplar_adapter.py'),
    '# adapter\n',
    'utf-8',
  );
  return vendored;
}

describe('resolveLlmbuilderPaths', () => {
  it('dev: builderDir and vendoredDir are the same repo tree', () => {
    appMock.isPackaged = false;
    const paths = resolveLlmbuilderPaths({
      repoRoot: '/repo',
      homeDir: '/home/test',
    });
    expect(paths.builderDir).toBe(path.join('/repo', 'LUCID-BUILDER'));
    expect(paths.vendoredDir).toBe(path.join('/repo', 'LUCID-BUILDER'));
    expect(paths.dataDir).toBe(path.join('/home/test', '.lucid', 'llmbuilder'));
  });

  it('packaged: builderDir is a working copy under the state dir', () => {
    appMock.isPackaged = true;
    const paths = resolveLlmbuilderPaths({
      resourcesPath: '/app/resources',
      homeDir: '/home/test',
    });
    expect(paths.vendoredDir).toBe(
      path.join('/app/resources', 'LUCID-BUILDER'),
    );
    expect(paths.builderDir).toBe(
      path.join('/home/test', '.lucid', 'llmbuilder', 'code'),
    );
  });
});

describe('ensureBuilderWorkCopy', () => {
  it('copies the tree on first run and is a no-op when current', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-paths-'));
    const vendored = makeVendored(root, 'fa819ed 2026-05-16');
    const paths = resolveLlmbuilderPaths({
      isPackaged: true,
      resourcesPath: path.join(root, 'resources'),
      homeDir: path.join(root, 'home'),
      vendoredDir: vendored,
    });
    expect(paths.builderDir).toBe(
      path.join(root, 'home', '.lucid', 'llmbuilder', 'code'),
    );
    expect(ensureBuilderWorkCopy(paths)).toBe(true);
    expect(
      fs.existsSync(path.join(paths.builderDir, TRAIN_SCRIPT_REL)),
    ).toBe(true);
    expect(
      fs.readFileSync(path.join(paths.builderDir, 'VERSION'), 'utf-8'),
    ).toBe('fa819ed 2026-05-16');
    expect(
      fs.existsSync(path.join(paths.builderDir, WORK_COPY_MARKER)),
    ).toBe(true);
    // Second call: already current, no copy.
    expect(ensureBuilderWorkCopy(paths)).toBe(false);
  });

  it('re-copies when the vendored VERSION changes', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-paths-'));
    const vendored = makeVendored(root, 'fa819ed 2026-05-16');
    const paths = resolveLlmbuilderPaths({
      isPackaged: true,
      resourcesPath: path.join(root, 'resources'),
      homeDir: path.join(root, 'home'),
      vendoredDir: vendored,
    });
    expect(ensureBuilderWorkCopy(paths)).toBe(true);
    fs.writeFileSync(
      path.join(vendored, 'VERSION'),
      'deadbee 2026-11-05',
      'utf-8',
    );
    fs.writeFileSync(
      path.join(vendored, 'adapters', 'new_adapter.py'),
      '# new\n',
      'utf-8',
    );
    expect(ensureBuilderWorkCopy(paths)).toBe(true);
    expect(
      fs.readFileSync(path.join(paths.builderDir, 'VERSION'), 'utf-8'),
    ).toBe('deadbee 2026-11-05');
    expect(
      fs.existsSync(
        path.join(paths.builderDir, 'adapters', 'new_adapter.py'),
      ),
    ).toBe(true);
    expect(ensureBuilderWorkCopy(paths)).toBe(false);
  });

  it('re-copies when the trainer script changes with no VERSION bump', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-paths-'));
    const vendored = makeVendored(root, 'fa819ed 2026-05-16');
    const paths = resolveLlmbuilderPaths({
      isPackaged: true,
      resourcesPath: path.join(root, 'resources'),
      homeDir: path.join(root, 'home'),
      vendoredDir: vendored,
    });
    expect(ensureBuilderWorkCopy(paths)).toBe(true);
    const script = path.join(vendored, TRAIN_SCRIPT_REL);
    fs.writeFileSync(script, '# trainer v2 — longer\n', 'utf-8');
    // mtime granularity: force a distinct mtime.
    const later = new Date(Date.now() + 5000);
    fs.utimesSync(script, later, later);
    expect(ensureBuilderWorkCopy(paths)).toBe(true);
    expect(
      fs.readFileSync(path.join(paths.builderDir, TRAIN_SCRIPT_REL), 'utf-8'),
    ).toBe('# trainer v2 — longer\n');
  });

  it('is a no-op in dev (builderDir is the vendored dir)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-paths-'));
    const vendored = makeVendored(root, 'fa819ed 2026-05-16');
    const paths = resolveLlmbuilderPaths({
      isPackaged: false,
      repoRoot: root,
      homeDir: path.join(root, 'home'),
      builderDir: vendored,
    });
    expect(paths.builderDir).toBe(paths.vendoredDir);
    expect(ensureBuilderWorkCopy(paths)).toBe(false);
    expect(
      fs.existsSync(path.join(vendored, WORK_COPY_MARKER)),
    ).toBe(false);
  });

  it('is a no-op when nothing is vendored (no trainer script)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-paths-'));
    const empty = path.join(root, 'empty');
    fs.mkdirSync(empty, { recursive: true });
    const paths = resolveLlmbuilderPaths({
      isPackaged: true,
      resourcesPath: path.join(root, 'resources'),
      homeDir: path.join(root, 'home'),
      vendoredDir: empty,
    });
    expect(ensureBuilderWorkCopy(paths)).toBe(false);
    expect(fs.existsSync(paths.builderDir)).toBe(false);
  });
});
