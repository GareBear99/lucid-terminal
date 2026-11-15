// @vitest-environment jsdom
/**
 * File-open cap (files-section fix step 3, src/stores/fileStore.ts).
 *
 * openFile is the choke point for every open funnel (Explorer,
 * Finder, terminal /open, FindReplacePanel): it resolves the size
 * first and opens a file over MAX_OPEN_FILE_BYTES (2 MB) as a
 * read-only preview of its first LARGE_FILE_PREVIEW_BYTES (1 MB),
 * capped to LARGE_FILE_PREVIEW_MAX_LINES lines — the whole file
 * never crosses IPC and never reaches Monaco. The preview is
 * read-only end to end: updateFileContent is a no-op on it and
 * saveFile refuses it, so the preview buffer can never be written
 * over the real file.
 *
 * Run with: npm test
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  useFileStore,
  MAX_OPEN_FILE_BYTES,
  LARGE_FILE_PREVIEW_BYTES,
  LARGE_FILE_PREVIEW_MAX_LINES,
  formatBytes,
} from '../src/stores/fileStore';
import { useToastStore } from '../src/stores/toastStore';
import { toDetachedFile } from '../src/types/detach';
import type { FileEntry } from '../src/types';

const SMALL = '/tmp/small.txt';
const BIG = '/tmp/big.log';
const SMALL_CONTENT = 'hello\n';
const MB = 1024 * 1024;

function entry(path: string, size: number): FileEntry {
  return {
    path,
    name: path.split('/').pop()!,
    isDirectory: false,
    isFile: true,
    size,
    modified: 0,
  };
}

let prevLucidAPI: unknown;
let toastInfoSpy: ReturnType<typeof vi.spyOn>;
let toastErrorSpy: ReturnType<typeof vi.spyOn>;

const readFileMock = vi.fn(async (_path: string) => SMALL_CONTENT);
const readFileHeadMock = vi.fn(
  async (_path: string, _maxBytes: number) => ({
    content: 'x'.repeat(LARGE_FILE_PREVIEW_BYTES),
    truncated: true,
    fullSize: 5 * MB,
  }),
);
const getStatsMock = vi.fn(async (_path: string) => ({
  size: 5 * MB,
  isDirectory: false,
  isFile: true,
  created: 0,
  modified: 0,
  accessed: 0,
}));
const writeFileMock = vi.fn(async (_path: string, _content: string) => {});

beforeEach(() => {
  readFileMock.mockClear();
  readFileHeadMock.mockClear();
  getStatsMock.mockClear();
  writeFileMock.mockClear();
  const win = window as unknown as Record<string, unknown>;
  prevLucidAPI = win.lucidAPI;
  win.lucidAPI = {
    fs: {
      readFile: readFileMock,
      readFileHead: readFileHeadMock,
      getStats: getStatsMock,
      writeFile: writeFileMock,
    },
  };
  toastInfoSpy = vi.spyOn(useToastStore.getState(), 'info');
  toastErrorSpy = vi.spyOn(useToastStore.getState(), 'error');
  useFileStore.setState({
    entries: [],
    openFiles: [],
    activeFilePath: null,
    error: null,
    isLoading: false,
  });
});

afterEach(() => {
  const win = window as unknown as Record<string, unknown>;
  win.lucidAPI = prevLucidAPI;
  toastInfoSpy.mockRestore();
  toastErrorSpy.mockRestore();
});

describe('the cap itself', () => {
  test('2 MB cap, 1 MB preview, 10,000-line preview cap', () => {
    expect(MAX_OPEN_FILE_BYTES).toBe(2 * 1024 * 1024);
    expect(LARGE_FILE_PREVIEW_BYTES).toBe(1 * 1024 * 1024);
    expect(LARGE_FILE_PREVIEW_MAX_LINES).toBe(10_000);
  });

  test('formatBytes reads human', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('openFile under the cap', () => {
  test('opens whole and editable, from the known tree-entry size', async () => {
    useFileStore.setState({ entries: [entry(SMALL, 6)] });
    const opened = await useFileStore.getState().openFile(SMALL);
    expect(opened).toBe(true);
    expect(readFileMock).toHaveBeenCalledWith(SMALL);
    expect(readFileHeadMock).not.toHaveBeenCalled();
    // The size was already known — no stat needed.
    expect(getStatsMock).not.toHaveBeenCalled();
    const file = useFileStore.getState().openFiles[0];
    expect(file.content).toBe(SMALL_CONTENT);
    expect(file.isTruncated).toBeUndefined();
    expect(file.fullSize).toBeUndefined();
    // Still editable: edits land and save writes them back.
    useFileStore.getState().updateFileContent(SMALL, 'hello world\n');
    expect(useFileStore.getState().openFiles[0].isDirty).toBe(true);
    await useFileStore.getState().saveFile(SMALL);
    expect(writeFileMock).toHaveBeenCalledWith(SMALL, 'hello world\n');
  });

  test('a file exactly at the cap opens whole', async () => {
    useFileStore.setState({ entries: [entry(SMALL, MAX_OPEN_FILE_BYTES)] });
    await useFileStore.getState().openFile(SMALL);
    expect(readFileMock).toHaveBeenCalledWith(SMALL);
    expect(readFileHeadMock).not.toHaveBeenCalled();
  });
});

describe('openFile over the cap', () => {
  test('opens as a truncated 1 MB preview from the tree-entry size', async () => {
    useFileStore.setState({ entries: [entry(BIG, 3 * MB)] });
    const opened = await useFileStore.getState().openFile(BIG);
    expect(opened).toBe(true);
    expect(readFileMock).not.toHaveBeenCalled();
    expect(readFileHeadMock).toHaveBeenCalledWith(BIG, LARGE_FILE_PREVIEW_BYTES);
    const file = useFileStore.getState().openFiles[0];
    expect(file.isTruncated).toBe(true);
    // fullSize comes from the head read (fstat), not the entry.
    expect(file.fullSize).toBe(5 * MB);
    expect(file.content).toBe('x'.repeat(LARGE_FILE_PREVIEW_BYTES));
    expect(file.originalContent).toBe(file.content);
    expect(file.isDirty).toBe(false);
    expect(toastInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining('Opened the first 1 MB of big.log (5.0 MB)'),
    );
  });

  test('resolves the size via getStats when the entry is unknown', async () => {
    const opened = await useFileStore.getState().openFile(BIG);
    expect(opened).toBe(true);
    expect(getStatsMock).toHaveBeenCalledWith(BIG);
    expect(readFileHeadMock).toHaveBeenCalledWith(BIG, LARGE_FILE_PREVIEW_BYTES);
    expect(readFileMock).not.toHaveBeenCalled();
    expect(useFileStore.getState().openFiles[0].isTruncated).toBe(true);
  });

  test('caps the preview to 10,000 lines', async () => {
    readFileHeadMock.mockResolvedValueOnce({
      content: 'l\n'.repeat(15_000),
      truncated: true,
      fullSize: 5 * MB,
    });
    useFileStore.setState({ entries: [entry(BIG, 3 * MB)] });
    await useFileStore.getState().openFile(BIG);
    const content = useFileStore.getState().openFiles[0].content;
    expect(content.split('\n')).toHaveLength(LARGE_FILE_PREVIEW_MAX_LINES);
  });
});

describe('a truncated preview is read-only end to end', () => {
  beforeEach(async () => {
    useFileStore.setState({ entries: [entry(BIG, 3 * MB)] });
    await useFileStore.getState().openFile(BIG);
    expect(useFileStore.getState().openFiles[0].isTruncated).toBe(true);
  });

  test('saveFile refuses and never calls writeFile', async () => {
    await useFileStore.getState().saveFile(BIG);
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(toastErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cannot save a read-only preview'),
    );
    // The preview is untouched and still not dirty.
    const file = useFileStore.getState().openFiles[0];
    expect(file.isDirty).toBe(false);
    expect(file.content).toBe('x'.repeat(LARGE_FILE_PREVIEW_BYTES));
  });

  test('updateFileContent is a no-op', () => {
    useFileStore.getState().updateFileContent(BIG, 'edited\n');
    const file = useFileStore.getState().openFiles[0];
    expect(file.content).toBe('x'.repeat(LARGE_FILE_PREVIEW_BYTES));
    expect(file.isDirty).toBe(false);
  });

  test('the flags survive detach and re-add', () => {
    const file = useFileStore.getState().openFiles[0];
    const detached = toDetachedFile(file);
    expect(detached.isTruncated).toBe(true);
    expect(detached.fullSize).toBe(5 * MB);
    // Re-adding keeps the flags (addDetachedFile spreads the file).
    useFileStore.getState().closeFile(BIG);
    useFileStore.getState().addDetachedFile(detached);
    const back = useFileStore.getState().openFiles[0];
    expect(back.isTruncated).toBe(true);
    expect(back.fullSize).toBe(5 * MB);
    // And the re-added preview still cannot be saved.
    return useFileStore
      .getState()
      .saveFile(BIG)
      .then(() => {
        expect(writeFileMock).not.toHaveBeenCalled();
      });
  });
});

describe('getStats failure falls back to the whole-read path', () => {
  test('a rejecting getStats opens the file whole', async () => {
    getStatsMock.mockRejectedValueOnce(new Error('Failed to get stats: ENOENT'));
    const opened = await useFileStore.getState().openFile(SMALL);
    expect(opened).toBe(true);
    expect(readFileMock).toHaveBeenCalledWith(SMALL);
    expect(readFileHeadMock).not.toHaveBeenCalled();
    expect(useFileStore.getState().openFiles[0].isTruncated).toBeUndefined();
  });

  test('a bridge without getStats at all opens the file whole', async () => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = {
      fs: {
        readFile: readFileMock,
        readFileHead: readFileHeadMock,
        writeFile: writeFileMock,
      },
    };
    const opened = await useFileStore.getState().openFile(SMALL);
    expect(opened).toBe(true);
    expect(readFileMock).toHaveBeenCalledWith(SMALL);
    expect(useFileStore.getState().openFiles[0].isTruncated).toBeUndefined();
  });
});
