import type { CSSProperties } from 'react';

/**
 * Windowed synth scale — the whole synth plugin renders 25% smaller
 * while the app is windowed, at full size when maximized.
 *
 * A CSS transform does not change layout, so a plain `scale(0.75)` on
 * a pane-sized wrapper would leave a 25% empty band at the right and
 * bottom. Instead the wrapper lays out at 100% / 0.75 (≈133.33%) and
 * is then scaled down: 133.33% × 0.75 = 100%, so the scaled content
 * exactly fills its pane — no gap, no clipping, and everything inside
 * (shell iframe, inspector, mount button) stays interactive at its
 * visual position.
 *
 * CONTRACT (2026-11-15, dead black band): the wrapper must ACTUALLY
 * lay out at 133% height. A flex parent defeats this — `flex: 1`
 * (flex-basis 0%) on the wrapper makes its main size the flex share,
 * ignoring the height below, so the wrapper lays out at 100% and
 * scale(0.75) renders 75% with a 25% dead band at the bottom. The
 * style below must therefore be applied to a wrapper whose parent
 * does NOT flex-size it: the wrapper sits inside a plain sizing
 * parent that is exactly the remaining pane space (flex-1 min-h-0),
 * and the wrapper itself carries no flex sizing — only this style.
 */
export const WINDOWED_SYNTH_SCALE = 0.75;

/** Style for the synth content wrapper (shell + inspector). */
export function synthScaleStyle(isMaximized: boolean): CSSProperties {
  if (isMaximized) {
    return { width: '100%', height: '100%' };
  }
  return {
    width: `calc(100% / ${WINDOWED_SYNTH_SCALE})`,
    height: `calc(100% / ${WINDOWED_SYNTH_SCALE})`,
    transform: `scale(${WINDOWED_SYNTH_SCALE})`,
    transformOrigin: 'top left',
  };
}
