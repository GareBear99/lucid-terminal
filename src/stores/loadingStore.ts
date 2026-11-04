import { create } from 'zustand';

/**
 * Global background-loading signal — the single source of truth for
 * "the app is loading something in the background".
 *
 * The TitleBar's top-left dot swirls while any background work is active.
 * Keys are ref-counted so overlapping work (a command running while a model
 * installs) keeps the indicator on until the LAST operation finishes, and a
 * stray `finish` without a matching `start` can never drive a count below 0.
 *
 * Keys (each must be real background work, never a timer):
 * - 'command' — a terminal command is being processed (Terminal.handleSubmit)
 * - 'model-install' — TinyLlama is installing (ModelMissingBanner)
 * - 'lucifer-check' — the LuciferAI plugin/model status is being probed
 * - 'lucifer-task' — a terminal command routed through the LuciferAI
 *   plugin is running (Terminal.runPluginCommand → `lucid.command`).
 *   This is deliberately a separate key from 'command': 'command'
 *   covers EVERY terminal command including plain shell, and the
 *   Sentinel face's fangs must drip for plugin work only — so the face
 *   reads this key, never the shared 'command' key.
 */
export type BackgroundLoadKey = 'command' | 'model-install' | 'lucifer-check' | 'lucifer-task';

const ALL_KEYS: BackgroundLoadKey[] = ['command', 'model-install', 'lucifer-check', 'lucifer-task'];

function emptyCounts(): Record<BackgroundLoadKey, number> {
  return { command: 0, 'model-install': 0, 'lucifer-check': 0, 'lucifer-task': 0 };
}

function isAnyLoading(active: Record<BackgroundLoadKey, number>): boolean {
  return ALL_KEYS.some((k) => active[k] > 0);
}

interface LoadingState {
  /** Active operation counts per key. */
  active: Record<BackgroundLoadKey, number>;
  /** True while at least one background operation is in progress. */
  isLoading: boolean;
  /** Names of the keys currently active (for debugging / tooltips). */
  activeKeys: BackgroundLoadKey[];
  start: (key: BackgroundLoadKey) => void;
  finish: (key: BackgroundLoadKey) => void;
}

export const useLoadingStore = create<LoadingState>((set) => ({
  active: emptyCounts(),
  isLoading: false,
  activeKeys: [],

  start: (key) =>
    set((state) => {
      const active = { ...state.active, [key]: state.active[key] + 1 };
      return {
        active,
        isLoading: isAnyLoading(active),
        activeKeys: ALL_KEYS.filter((k) => active[k] > 0),
      };
    }),

  finish: (key) =>
    set((state) => {
      // A finish without a matching start is a no-op — never below zero,
      // so a double-finish can never turn the indicator off early.
      if (state.active[key] <= 0) return state;
      const active = { ...state.active, [key]: state.active[key] - 1 };
      return {
        active,
        isLoading: isAnyLoading(active),
        activeKeys: ALL_KEYS.filter((k) => active[k] > 0),
      };
    }),
}));
