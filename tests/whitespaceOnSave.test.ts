// @vitest-environment jsdom
/**
 * Whitespace-on-save through the file store (settings smalls): saveFile runs the enabled
 * transforms before the write and updates the in-memory
 * content to match; off by default the content is untouched.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useFileStore } from '../src/stores/fileStore';
import { useSettingsStore } from '../src/stores/settingsStore';

const win = window as unknown as { lucidAPI?: unknown };
let prevLucidAPI: unknown;

function mockFs() {
  const files = new Map<string, string>([['/tmp/notes.txt', 'hello  \nworld\t']]);
  const fs = {
    readFile: vi.fn(async (path: string) => {
      const content = files.get(path);
      if (content === undefined) throw new Error(`ENOENT: no such file ${path}`);
      return content;
    }),
    writeFile: vi.fn(async (path: string, content: string) => {
      files.set(path, content);
    }),
  };
  prevLucidAPI = win.lucidAPI;
  win.lucidAPI = { fs };
  return { fs, files };
}

describe('whitespace on save (fileStore.saveFile)', () => {
  let fs: ReturnType<typeof mockFs>['fs'];
  let files: ReturnType<typeof mockFs>['files'];

  beforeEach(() => {
    ({ fs, files } = mockFs());
    useFileStore.setState({ openFiles: [], activeFilePath: null, error: null });
    useSettingsStore.setState((s) => ({
      settings: {
        ...s.settings,
        editorTrimTrailingWhitespaceOnSave: false,
        editorEnsureTrailingNewlineOnSave: false,
      },
    }));
  });

  afterEach(() => {
    if (prevLucidAPI === undefined) delete win.lucidAPI;
    else win.lucidAPI = prevLucidAPI;
    useSettingsStore.setState((s) => ({
      settings: {
        ...s.settings,
        editorTrimTrailingWhitespaceOnSave: false,
        editorEnsureTrailingNewlineOnSave: false,
      },
    }));
  });

  it('with both transforms off the content is written untouched', async () => {
    await useFileStore.getState().openFile('/tmp/notes.txt');
    await useFileStore.getState().saveFile('/tmp/notes.txt');
    expect(fs.writeFile).toHaveBeenCalledWith('/tmp/notes.txt', 'hello  \nworld\t');
    expect(files.get('/tmp/notes.txt')).toBe('hello  \nworld\t');
  });

  it('with both transforms on the write is trimmed and newline-terminated, and the editor content follows', async () => {
    useSettingsStore.setState((s) => ({
      settings: {
        ...s.settings,
        editorTrimTrailingWhitespaceOnSave: true,
        editorEnsureTrailingNewlineOnSave: true,
      },
    }));
    await useFileStore.getState().openFile('/tmp/notes.txt');
    await useFileStore.getState().saveFile('/tmp/notes.txt');
    expect(fs.writeFile).toHaveBeenCalledWith('/tmp/notes.txt', 'hello\nworld\n');
    expect(files.get('/tmp/notes.txt')).toBe('hello\nworld\n');
    const file = useFileStore.getState().openFiles.find((f) => f.path === '/tmp/notes.txt');
    expect(file?.content).toBe('hello\nworld\n');
    expect(file?.isDirty).toBe(false);
  });

  it('trim alone leaves the missing trailing newline alone', async () => {
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, editorTrimTrailingWhitespaceOnSave: true },
    }));
    await useFileStore.getState().openFile('/tmp/notes.txt');
    await useFileStore.getState().saveFile('/tmp/notes.txt');
    expect(fs.writeFile).toHaveBeenCalledWith('/tmp/notes.txt', 'hello\nworld');
  });
});
