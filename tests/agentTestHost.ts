/**
 * An in-memory AgentHost for tests — files live in a Map,
 * directories are derived from the paths, stats are a
 * monotonically increasing counter (a write bumps the
 * mtime, so the index sees the change). No window, no
 * electron, no disk.
 *
 * (Adapted for cea360f: this commit's AgentHost.getStats
 * returns a full FileStats — created/accessed included —
 * and throws for a missing path, which the index treats
 * as "gone already".)
 */
import type { AgentHost, AgentOpenFile, FileEntry } from '../src/lib/agentHost';
import type { FileStats } from '../src/types';

export class MemoryAgentHost implements AgentHost {
  files = new Map<string, string>();
  private mtimes = new Map<string, number>();
  private clock = 1;
  private open: AgentOpenFile[] = [];
  private active: string | null = null;
  /** The fake `git diff` output view_diff returns
   *  (null = not a repo, the default). */
  private diffText: string | null = null;

  /** Set the diff view_diff sees (tests). */
  setDiff(text: string | null): void {
    this.diffText = text;
  }

  constructor(files: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(files)) {
      this.files.set(path, content);
      this.mtimes.set(path, this.clock);
    }
  }

  private parentOf(path: string): string {
    const idx = path.lastIndexOf('/');
    return idx <= 0 ? '/' : path.slice(0, idx);
  }

  private dirsOf(): Set<string> {
    const dirs = new Set<string>(['/']);
    for (const path of this.files.keys()) {
      let dir = this.parentOf(path);
      while (dir !== '/') {
        dirs.add(dir);
        dir = this.parentOf(dir);
      }
    }
    return dirs;
  }

  async readDir(dirPath: string): Promise<FileEntry[]> {
    const entries: FileEntry[] = [];
    const dirs = this.dirsOf();
    for (const dir of dirs) {
      if (this.parentOf(dir) === dirPath && dir !== dirPath) {
        entries.push({
          name: dir.slice(dirPath.length + 1),
          path: dir,
          isDirectory: true,
          isFile: false,
          size: 0,
          modified: 1,
        });
      }
    }
    for (const [path, content] of this.files) {
      if (this.parentOf(path) === dirPath) {
        entries.push({
          name: path.slice(dirPath.length + 1),
          path,
          isDirectory: false,
          isFile: true,
          size: content.length,
          modified: this.mtimes.get(path) ?? 1,
        });
      }
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`ENOENT: ${path}`);
    return content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
    this.clock += 1;
    this.mtimes.set(path, this.clock);
  }

  async createFile(path: string, content?: string): Promise<void> {
    if (this.files.has(path)) throw new Error(`EEXIST: ${path}`);
    await this.writeFile(path, content ?? '');
  }

  async createDir(path: string): Promise<void> {
    // Directories are derived from file paths — nothing to
    // store. (A directory with no files in it does not
    // exist in this host, which is fine for the tests.)
    void path;
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.dirsOf().has(path);
  }

  async getStats(path: string): Promise<FileStats> {
    const content = this.files.get(path);
    const modified = this.mtimes.get(path) ?? 1;
    if (content !== undefined) {
      return {
        isFile: true,
        isDirectory: false,
        size: content.length,
        created: modified,
        modified,
        accessed: modified,
      };
    }
    if (this.dirsOf().has(path)) {
      return {
        isFile: false,
        isDirectory: true,
        size: 0,
        created: 1,
        modified: 1,
        accessed: 1,
      };
    }
    throw new Error(`ENOENT: ${path}`);
  }

  getOpenFiles(): AgentOpenFile[] {
    return [...this.open];
  }

  getActiveFilePath(): string | null {
    return this.active;
  }

  setOpenFiles(files: AgentOpenFile[], active?: string): void {
    this.open = [...files];
    this.active = active ?? files[0]?.path ?? null;
  }

  async deleteFile(path: string): Promise<void> {
    this.files.delete(path);
    this.mtimes.delete(path);
  }

  async getDiff(_cwd: string, _filepath?: string): Promise<string | null> {
    return this.diffText;
  }

  async openFile(path: string): Promise<boolean> {
    if (!this.files.has(path)) return false;
    if (!this.open.some((f) => f.path === path)) {
      const name = path.split('/').pop() ?? path;
      this.open.push({ path, name, content: this.files.get(path) ?? '', isDirty: false });
    }
    return true;
  }

  updateOpenFileContent(path: string, content: string): void {
    const file = this.open.find((f) => f.path === path);
    if (file) {
      file.content = content;
      file.isDirty = true;
    }
  }

  async saveOpenFile(path: string): Promise<void> {
    const file = this.open.find((f) => f.path === path);
    if (!file) return;
    await this.writeFile(path, file.content);
    file.isDirty = false;
  }
}

/** The shared test workspace: a small project tree. */
export function makeTestWorkspace(): Record<string, string> {
  return {
    '/ws/src/app.ts':
      "export function greet(name: string) { return `hello ${name}`; }\nconst answer = 42;\n",
    '/ws/src/util.ts': "export const helper = () => 'help';\n",
    '/ws/src/nested/deep.ts': 'export const deep = true;\n',
    '/ws/README.md': '# Workspace\nThe quick brown fox jumps over the lazy dog.\n',
    '/ws/.env': 'SECRET=<redacted>\n',
    '/ws/node_modules/dep/index.js': 'module.exports = {};\n',
    '/ws/dist/bundle.js': 'console.log("built");\n',
  };
}
