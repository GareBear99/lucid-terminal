/**
 * Blood drip for the Sentinel face's fangs.
 *
 * When LuciferAI is running a task, tiny blood pixels drip from the fang
 * tips: faintly visible, falling downward until they fall off screen,
 * then gone. A "task" is either an AI-chat generation in flight
 * (`useAIStore.isLoading`) or a terminal command routed through the
 * LuciferAI plugin (`loadingStore` key 'lucifer-task', set by
 * Terminal.runPluginCommand around `lucid.command`). A plain shell
 * command is neither — the terminal's 'command' loading key covers
 * every command and must NOT start the drip on its own.
 *
 * The drip is irregular — an occasional drip, not a pour — and only a
 * handful of pixels are ever falling at once.
 *
 * The fangs are the two downward points of the maw zigzag in
 * SentinelFace (`M54,66 l3,4 l3,-4 l3,4 l3,-4`): the tips sit at
 * SVG (57, 70) and (63, 70). The blood is the only red in the face —
 * the face itself is fixed magenta (#ff2d95 / #d7a0ff) and white.
 *
 * Pure functions with an injectable randomness source so tests can
 * drive them deterministically; the component passes Math.random in
 * production.
 */

/** Fang tip positions (SVG user units) — the two downward points of the maw. */
export const FANG_TIPS = [
  { side: 'left', x: 57, y: 70 },
  { side: 'right', x: 63, y: 70 },
] as const;

export type FangSide = 'left' | 'right';

/** Blood colour — dark blood red, the only red in the face. */
export const BLOOD_COLOR = '#a4161a';

/** Faintly visible — a subtle drip, not bright or loud. */
export const BLOOD_OPACITY = 0.45;

/** Tiny pixel — 1 SVG unit (~0.67px at the 32px face size). */
export const BLOOD_RADIUS = 1;

/** How far a pixel falls (SVG units) — from the fang tip (y=70) past
 *  the head's bottom edge (y=73) and the SVG's bottom edge (y=76),
 *  so it reads as falling off the face. */
export const BLOOD_FALL_DISTANCE = 12;

/** Delay between drips: 350–900ms, irregular so it reads as dripping. */
export const DRIP_MIN_DELAY_MS = 350;
export const DRIP_MAX_DELAY_MS = 900;

/** How long one pixel takes to fall: 900–1400ms. */
export const DRIP_MIN_FALL_MS = 900;
export const DRIP_MAX_FALL_MS = 1400;

/** A handful of pixels at most — never dozens. */
export const MAX_DRIPS = 6;

/** Random delay until the next drip, in [350, 900] ms. */
export function nextDripDelayMs(rand: () => number = Math.random): number {
  return DRIP_MIN_DELAY_MS + rand() * (DRIP_MAX_DELAY_MS - DRIP_MIN_DELAY_MS);
}

/** Which fang a drip falls from — either fang, 50/50. */
export function pickFang(rand: () => number = Math.random): FangSide {
  return rand() < 0.5 ? 'left' : 'right';
}

/** Random fall duration for one pixel, in [900, 1400] ms. */
export function dripFallMs(rand: () => number = Math.random): number {
  return DRIP_MIN_FALL_MS + rand() * (DRIP_MAX_FALL_MS - DRIP_MIN_FALL_MS);
}

/** The fang tip coordinates for a side. */
export function fangTip(side: FangSide): { x: number; y: number } {
  return side === 'left' ? { x: FANG_TIPS[0].x, y: FANG_TIPS[0].y } : { x: FANG_TIPS[1].x, y: FANG_TIPS[1].y };
}

/**
 * Whether the fangs drip. True while the AI chat is generating OR a
 * LuciferAI plugin task is running. A plain shell command sets neither
 * — it only touches the terminal's shared 'command' loading key, which
 * is deliberately not an input here — so shell work never starts the
 * drip.
 */
export function shouldDrip(aiChatLoading: boolean, pluginTaskActive: boolean): boolean {
  return aiChatLoading || pluginTaskActive;
}
