// @vitest-environment jsdom
/**
 * openFile race + path normalisation (editor-freeze fix, 2026-11-15).
 *
 * The dedupe check in openFile used to run BEFORE the awaited read,
 * so a double-click opened the same file in two tabs — and a
 * `file://` URI from the DocsPanel route could open a second,
 * differently-spelled tab for the same file. These tests pin it:
 * - concurrent opens of the same path land exactly one tab.
 * - a `file://` URI and the plain path dedupe to one tab.
 * - differently-spelled paths (`//`, `/./`, `/../`) dedupe too.
 * - normalizeOpenPath: file:// strip + percent-decode, collapse.
 *
 * Run with: npm test -- tests/fileStoreOpenFileRace.test.ts
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  useFileStore,
  normalizeOpenPath,
} from '../src/stores/fileStore';
import { useToastStore } from '../src/stores/toastStore';

const PATH = '/Users/gary/.warp/keybindings.yaml';
const CONTENT = '---\n"editor_view:insert_autosuggestion": tab\n';

const readFileMock = vi.fn(async (_path: string): Promise<string> => CONTENT);
const getStatsMock = vi.fn(async (_path: string) => ({ size: CONTENT.length }));

let prevLucidAPI: unknown;
let toastErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  readFileMock.mockClear();
  readFileMock.mockImplementation(async () => CONTENT);
  getStatsMock.mockClear();
  getStatsMock.mockImplementation(async () => ({ size: CONTENT.length }));
  const win = window as unknown as Record<string, unknown>;
  prevLucidAPI = win.lucidAPI;
  win.lucidAPI = { fs: { readFile: readFileMock, getStats: getStatsMock } };
  toastErrorSpy = vi.spyOn(useToastStore.getState(), 'error');
  useFileStore.setState({
    entries: [],
    openFiles: [],
    activeFilePath: null,
    error: null,
  });
});

afterEach(() => {
  const win = window as unknown as Record<string, unknown>;
  win.lucidAPI = prevLucidAPI;
  toastErrorSpy.mockRestore();
});

describe('normalizeOpenPath', () => {
  test('a plain path passes through', () => {
    expect(normalizeOpenPath(PATH)).toBe(PATH);
  });

  test('strips file:// and percent-decodes', () => {
    expect(normalizeOpenPath('file:///Users/gary/my%20file.yaml')).toBe(
      '/Users/gary/my file.yaml',
    );
  });

  test('collapses duplicate slashes, . and .. segments', () => {
    expect(normalizeOpenPath('/Users/gary//.warp/../.warp/keybindings.yaml')).toBe(
      PATH,
    );
    expect(normalizeOpenPath('/Users/./gary/.warp/keybindings.yaml')).toBe(PATH);
  });

  test('a relative path stays relative', () => {
    expect(normalizeOpenPath('a/./b/../c.txt')).toBe('a/c.txt');
  });
});

describe('openFile race', () => {
  test('two concurrent opens of the same path land one tab', async () => {
    // Hold the read in flight so both opens pass the pre-await
    // dedupe check — the old code appended twice from here.
    let release!: (value: string) => void;
    const gate = new Promise<string>((resolve) => { release = resolve; });
    readFileMock.mockImplementationOnce(() => gate);
    readFileMock.mockImplementationOnce(() => gate);

    const pending = [
      useFileStore.getState().openFile(PATH),
      useFileStore.getState().openFile(PATH),
    ];
    // Both opens are now past the pre-await dedupe and parked on
    // the gated read. Release it: the first to resume appends the
    // tab, the second must see it via the post-read re-check.
    release(CONTENT);
    const [first, second] = await Promise.all(pending);
    expect(first).toBe(true);
    expect(second).toBe(true);
    const { openFiles, activeFilePath } = useFileStore.getState();
    expect(openFiles).toHaveLength(1);
    expect(openFiles[0].path).toBe(PATH);
    expect(activeFilePath).toBe(PATH);
    expect(toastErrorSpy).not.toHaveBeenCalled();
  });

  test('a file:// URI open and a plain-path open dedupe to one tab', async () => {
    expect(await useFileStore.getState().openFile(`file://${PATH}`)).toBe(true);
    expect(await useFileStore.getState().openFile(PATH)).toBe(true);
    const { openFiles } = useFileStore.getState();
    expect(openFiles).toHaveLength(1);
    expect(openFiles[0].path).toBe(PATH);
    // The second open was a re-activation, not a second read.
    expect(readFileMock).toHaveBeenCalledTimes(1);
  });

  test('differently-spelled paths dedupe to one tab', async () => {
    expect(
      await useFileStore.getState().openFile('/Users/gary//.warp/keybindings.yaml'),
    ).toBe(true);
    expect(
      await useFileStore.getState().openFile('/Users/gary/.warp/./keybindings.yaml'),
    ).toBe(true);
    expect(useFileStore.getState().openFiles).toHaveLength(1);
    expect(readFileMock).toHaveBeenCalledTimes(1);
  });

  test('a sequential re-open still just activates the tab', async () => {
    expect(await useFileStore.getState().openFile(PATH)).toBe(true);
    expect(await useFileStore.getState().openFile(PATH)).toBe(true);
    expect(useFileStore.getState().openFiles).toHaveLength(1);
    expect(readFileMock).toHaveBeenCalledTimes(1);
  });
});
