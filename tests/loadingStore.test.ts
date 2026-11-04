/**
 * Background-loading store tests.
 *
 * The top-left TitleBar dot swirls while any background work is active.
 * The store is ref-counted per key so overlapping work keeps the dot
 * spinning until the LAST operation finishes, and a stray finish can
 * never turn it off early.
 *
 * Run with: npm test
 */

import { useLoadingStore } from '../src/stores/loadingStore';

function reset() {
  useLoadingStore.setState({
    active: { command: 0, 'model-install': 0, 'lucifer-check': 0, 'lucifer-task': 0 },
    isLoading: false,
    activeKeys: [],
  });
}

describe('useLoadingStore', () => {
  beforeEach(reset);

  test('starts idle with no loading', () => {
    const s = useLoadingStore.getState();
    expect(s.isLoading).toBe(false);
    expect(s.activeKeys).toEqual([]);
  });

  test('start makes isLoading true, finish turns it off', () => {
    useLoadingStore.getState().start('command');
    expect(useLoadingStore.getState().isLoading).toBe(true);
    expect(useLoadingStore.getState().activeKeys).toEqual(['command']);
    useLoadingStore.getState().finish('command');
    expect(useLoadingStore.getState().isLoading).toBe(false);
    expect(useLoadingStore.getState().activeKeys).toEqual([]);
  });

  test('ref-counted: two starts need two finishes', () => {
    const api = useLoadingStore.getState();
    api.start('command');
    api.start('command');
    api.finish('command');
    expect(useLoadingStore.getState().isLoading).toBe(true);
    api.finish('command');
    expect(useLoadingStore.getState().isLoading).toBe(false);
  });

  test('overlapping keys: dot stays on until the last one finishes', () => {
    const api = useLoadingStore.getState();
    api.start('command');
    api.start('model-install');
    api.finish('command');
    expect(useLoadingStore.getState().isLoading).toBe(true);
    expect(useLoadingStore.getState().activeKeys).toEqual(['model-install']);
    api.finish('model-install');
    expect(useLoadingStore.getState().isLoading).toBe(false);
  });

  test('finish without a matching start is a no-op and never goes negative', () => {
    const api = useLoadingStore.getState();
    api.finish('command');
    api.finish('lucifer-check');
    const s = useLoadingStore.getState();
    expect(s.isLoading).toBe(false);
    expect(s.active.command).toBe(0);
    expect(s.active['lucifer-check']).toBe(0);
    // A later real start still works after stray finishes.
    api.start('lucifer-check');
    expect(useLoadingStore.getState().isLoading).toBe(true);
    api.finish('lucifer-check');
    expect(useLoadingStore.getState().isLoading).toBe(false);
  });

  test('lucifer-task key: ref-counted and independent of the shared command key', () => {
    const api = useLoadingStore.getState();
    // A plugin task is its own key — starting it does not touch 'command'.
    api.start('lucifer-task');
    expect(useLoadingStore.getState().active['lucifer-task']).toBe(1);
    expect(useLoadingStore.getState().active.command).toBe(0);
    expect(useLoadingStore.getState().activeKeys).toEqual(['lucifer-task']);
    // Overlapping plugin tasks need one finish each.
    api.start('lucifer-task');
    api.finish('lucifer-task');
    expect(useLoadingStore.getState().active['lucifer-task']).toBe(1);
    api.finish('lucifer-task');
    expect(useLoadingStore.getState().isLoading).toBe(false);
  });

  test('a plain shell command does not activate lucifer-task', () => {
    // Shell work only ever starts the shared 'command' key — that is
    // the whole point of the separate key: the face can tell plugin
    // work from shell work. Starting 'command' must leave the plugin
    // key at zero.
    const api = useLoadingStore.getState();
    api.start('command');
    expect(useLoadingStore.getState().active['lucifer-task']).toBe(0);
    expect(useLoadingStore.getState().activeKeys).toEqual(['command']);
    api.finish('command');
    expect(useLoadingStore.getState().isLoading).toBe(false);
  });

  test('lucifer-task finish without a matching start is a no-op', () => {
    const api = useLoadingStore.getState();
    api.finish('lucifer-task');
    expect(useLoadingStore.getState().active['lucifer-task']).toBe(0);
    expect(useLoadingStore.getState().isLoading).toBe(false);
  });
});
