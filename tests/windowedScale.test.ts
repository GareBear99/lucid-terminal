import { describe, expect, it } from 'vitest';
import { WINDOWED_SYNTH_SCALE, synthScaleStyle } from '../src/components/Synth/windowedScale';

describe('windowed synth scale', () => {
  it('is 25% smaller when windowed (0.75)', () => {
    expect(WINDOWED_SYNTH_SCALE).toBe(0.75);
  });

  it('maximized renders at full size with no transform', () => {
    const style = synthScaleStyle(true);
    expect(style.transform).toBeUndefined();
    expect(style.width).toBe('100%');
    expect(style.height).toBe('100%');
  });

  it('windowed scales to 0.75 from the top-left corner', () => {
    const style = synthScaleStyle(false);
    expect(style.transform).toBe('scale(0.75)');
    expect(style.transformOrigin).toBe('top left');
  });

  it('windowed wrapper lays out at 100%/0.75 so the scaled content exactly fills the pane', () => {
    const style = synthScaleStyle(false);
    expect(style.width).toBe('calc(100% / 0.75)');
    expect(style.height).toBe('calc(100% / 0.75)');
    // 100/0.75 layout × 0.75 scale = 100% rendered — no gap, no clip.
    expect(100 / WINDOWED_SYNTH_SCALE * WINDOWED_SYNTH_SCALE).toBeCloseTo(100, 10);
  });
});
