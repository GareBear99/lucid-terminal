import { useEffect, useState } from 'react';

/**
 * useWindowMaximized — whether the app window is maximized.
 *
 * Wraps the existing window IPC signal (`window:isMaximized` +
 * `window:maximized`, the same signal TitleBar uses for its
 * maximize/restore button). Defaults to false: the app launches
 * windowed, so callers should treat "unknown yet" as windowed.
 *
 * Guarded for non-Electron contexts (tests, vite dev without the
 * preload): if the API is absent the window simply reads as windowed.
 */
export function useWindowMaximized(): boolean {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const winApi = (
      window as unknown as {
        lucidAPI?: {
          window?: {
            isMaximized?: () => Promise<boolean>;
            onMaximizedChange?: (cb: (maximized: boolean) => void) => void;
          };
        };
      }
    ).lucidAPI?.window;
    if (!winApi) return;
    winApi.isMaximized?.().then(setIsMaximized).catch(() => {
      // Best-effort: a failed query leaves the windowed default in place.
    });
    winApi.onMaximizedChange?.(setIsMaximized);
  }, []);

  return isMaximized;
}
