/**
 * Horn-wiggle store tests.
 *
 * When a task completes, the Sentinel face's horns wiggle inward once.
 * The store is a debounced sequence number: one bump per completion,
 * and a second bump inside the debounce window is ignored so a task
 * that completes through two signals (completeStream + setLoading)
 * wiggles once, not twice.
 *
 * Run with: npm test
 */

import {
  useHornWiggleStore,
  WIGGLE_DEBOUNCE_MS,
  WIGGLE_DURATION_MS,
} from '../src/stores/hornWiggleStore';

describe('useHornWiggleStore', () => {
  beforeEach(() => {
    useHornWiggleStore.setState({ seq: 0, lastWiggleAt: 0 });
  });

  test('starts at seq 0', () => {
    expect(useHornWiggleStore.getState().seq).toBe(0);
  });

  test('one wiggle bumps seq once', () => {
    useHornWiggleStore.getState().wiggle();
    expect(useHornWiggleStore.getState().seq).toBe(1);
  });

  test('a second wiggle inside the debounce window is ignored', () => {
    const api = useHornWiggleStore.getState();
    api.wiggle();
    api.wiggle();
    api.wiggle();
    expect(useHornWiggleStore.getState().seq).toBe(1);
  });

  test('a wiggle after the debounce window bumps again', () => {
    const api = useHornWiggleStore.getState();
    api.wiggle();
    // Fake the last wiggle as long ago, so the debounce has passed.
    useHornWiggleStore.setState({
      lastWiggleAt: Date.now() - WIGGLE_DEBOUNCE_MS - 1,
    });
    useHornWiggleStore.getState().wiggle();
    expect(useHornWiggleStore.getState().seq).toBe(2);
  });

  test('the wiggle duration matches the CSS keyframe (450ms)', () => {
    expect(WIGGLE_DURATION_MS).toBe(450);
  });
});
