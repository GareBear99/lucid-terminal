// @vitest-environment jsdom
/**
 * Files detach (Gary, 2026-11-09): Files gets the same detach
 * natively, with the regular theme — a file pulled out of the
 * main window becomes its own editor-only screen, its content
 * (including unsaved edits) transferring with it.
 *
 * Covered here: the fileStore detach actions (detachFile /
 * addDetachedFile) — removal without touching disk, and
 * idempotent adds so a push + a pending fetch delivering the
 * same file twice lands once. Plus the local threshold helpers
 * in tabDrag (screenPoint / outsideWindowDistance).
 */
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { useFileStore, type OpenFile } from '../src/stores/fileStore';
import { screenPoint, outsideWindowDistance, FILE_DETACH_THRESHOLD_PX } from '../src/lib/tabDrag';

const FILE_A: OpenFile = {
  path: '/tmp/a.txt',
  name: 'a.txt',
  content: 'hello',
  originalContent: 'hello',
  isDirty: false,
};
const FILE_B: OpenFile = {
  path: '/tmp/b.txt',
  name: 'b.txt',
  content: 'dirty edit',
  originalContent: 'clean',
  isDirty: true,
};

describe('fileStore detach actions', () => {
  beforeEach(() => {
    useFileStore.setState({ openFiles: [FILE_A, FILE_B], activeFilePath: '/tmp/a.txt' });
  });

  afterEach(() => {
    useFileStore.setState({ openFiles: [], activeFilePath: null });
  });

  test('detachFile removes the file and activates the previous one', () => {
    useFileStore.setState({ openFiles: [FILE_A, FILE_B], activeFilePath: '/tmp/b.txt' });
    useFileStore.getState().detachFile('/tmp/b.txt');
    const state = useFileStore.getState();
    expect(state.openFiles.map((f) => f.path)).toEqual(['/tmp/a.txt']);
    expect(state.activeFilePath).toBe('/tmp/a.txt');
  });

  test('detachFile keeps the dirty content in the caller (nothing is written)', () => {
    // The detach caller moves the snapshot first (files:detach);
    // detachFile itself only drops the strip entry — the file's
    // dirty content is the caller's responsibility, not the
    // store's, and nothing touches disk here.
    const before = useFileStore.getState().openFiles.find((f) => f.path === '/tmp/b.txt');
    expect(before?.isDirty).toBe(true);
    expect(before?.content).toBe('dirty edit');
    useFileStore.getState().detachFile('/tmp/b.txt');
    expect(useFileStore.getState().openFiles).toHaveLength(1);
  });

  test('addDetachedFile inserts without reading disk', () => {
    useFileStore.setState({ openFiles: [], activeFilePath: null });
    useFileStore.getState().addDetachedFile(FILE_B);
    const state = useFileStore.getState();
    expect(state.openFiles).toHaveLength(1);
    expect(state.openFiles[0]).toEqual(FILE_B);
    expect(state.activeFilePath).toBe('/tmp/b.txt');
  });

  test('addDetachedFile is idempotent — a double delivery lands once', () => {
    const store = useFileStore.getState();
    store.addDetachedFile(FILE_A);
    store.addDetachedFile(FILE_A);
    expect(useFileStore.getState().openFiles).toHaveLength(2);
  });
});

describe('file drag threshold helpers', () => {
  test('the proposed threshold is 16px', () => {
    expect(FILE_DETACH_THRESHOLD_PX).toBe(16);
  });

  test('screenPoint adds the window origin to client coords', () => {
    const p = screenPoint(10, 20);
    expect(p).toEqual({ x: window.screenX + 10, y: window.screenY + 20 });
  });

  test('outsideWindowDistance is 0 inside the window', () => {
    const p = screenPoint(window.innerWidth / 2, window.innerHeight / 2);
    expect(outsideWindowDistance(p)).toBe(0);
  });

  test('outsideWindowDistance grows past the window edge', () => {
    const p = screenPoint(window.innerWidth + 30, window.innerHeight / 2);
    expect(outsideWindowDistance(p)).toBeCloseTo(30);
  });
});
