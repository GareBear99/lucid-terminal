/**
 * The open-file funnel — pure, injectable deps.
 */
import { describe, it, expect, vi } from 'vitest';
import { openFileInWorkspace, isPathInsideDir, type OpenFileDeps } from '../src/lib/workspace';

function deps(overrides: Partial<OpenFileDeps> = {}): OpenFileDeps & {
  addProject: ReturnType<typeof vi.fn>;
  openFile: ReturnType<typeof vi.fn>;
} {
  const addProject = vi.fn();
  const openFile = vi.fn(async () => true);
  return {
    getOpenFiles: () => [],
    getProjects: () => ['/home/test/proj'],
    addProject,
    openFile,
    ...overrides,
  };
}

describe('isPathInsideDir — segment-aware containment', () => {
  it('a file inside the dir matches, a sibling prefix does not', () => {
    expect(isPathInsideDir('/a/proj', '/a/proj/src/index.ts')).toBe(true);
    expect(isPathInsideDir('/a/proj', '/a/proj2/file.ts')).toBe(false);
    expect(isPathInsideDir('/a/proj', '/a/proj')).toBe(true);
    expect(isPathInsideDir('/a/proj', '/other/file.ts')).toBe(false);
  });

  it('tolerates trailing slashes and backslashes', () => {
    expect(isPathInsideDir('/a/proj/', '/a/proj/file.ts')).toBe(true);
    expect(isPathInsideDir('\\a\\proj', '/a/proj/file.ts')).toBe(true);
  });
});

describe('openFileInWorkspace — the cascade', () => {
  it('reveals a file that is already open (no project added)', async () => {
    const d = deps({ getOpenFiles: () => ['/home/test/proj/a.ts'] });
    const result = await openFileInWorkspace('/home/test/proj/a.ts', d);
    expect(result).toEqual({ result: 'revealed', path: '/home/test/proj/a.ts' });
    expect(d.openFile).toHaveBeenCalledWith('/home/test/proj/a.ts');
    expect(d.addProject).not.toHaveBeenCalled();
  });

  it('opens a file inside a known project without adding one', async () => {
    const d = deps();
    const result = await openFileInWorkspace('/home/test/proj/src/b.ts', d);
    expect(result).toEqual({ result: 'opened', path: '/home/test/proj/src/b.ts' });
    expect(d.addProject).not.toHaveBeenCalled();
  });

  it('opens a file outside every project and adds its directory', async () => {
    const d = deps();
    const result = await openFileInWorkspace('/home/test/other/c.ts', d);
    expect(result).toEqual({ result: 'added-project', path: '/home/test/other/c.ts' });
    expect(d.addProject).toHaveBeenCalledWith('/home/test/other');
  });

  it('a failed open returns null and adds no project', async () => {
    const d = deps({ openFile: vi.fn(async () => false) });
    const result = await openFileInWorkspace('/home/test/other/c.ts', d);
    expect(result).toBeNull();
    expect(d.addProject).not.toHaveBeenCalled();
  });

  it('no path returns null — Lucid has no untitled buffers', async () => {
    const d = deps();
    expect(await openFileInWorkspace('', d)).toBeNull();
    expect(d.openFile).not.toHaveBeenCalled();
  });
});
