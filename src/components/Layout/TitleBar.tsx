import { useState, useEffect } from 'react';
import { Minus, Square, X, Maximize2, Monitor } from 'lucide-react';
import { AccountButton } from '../Account/AccountButton';
import { useLoadingStore } from '../../stores/loadingStore';
import { Tooltip } from '../Tooltip/Tooltip';

function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  // True while any background work is in progress (a command running,
  // a model installing, the LuciferAI status being probed) — the dot
  // swirls for exactly as long as that work lasts.
  const isLoading = useLoadingStore((s) => s.isLoading);

  useEffect(() => {
    // Check initial state
    window.lucidAPI.window.isMaximized().then(setIsMaximized);

    // Listen for maximize state changes
    window.lucidAPI.window.onMaximizedChange(setIsMaximized);
  }, []);

  return (
    <div
      className="h-9 flex items-center justify-between bg-[var(--bg-secondary)] border-b border-[var(--border)] select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* App Title */}
      <div className="flex items-center gap-2 px-4">
        {/* Top-left status dot. At rest it is exactly the static
            accent-to-purple gradient it always was. While background work
            is in progress a conic-gradient ring swirls around it (spinning
            up) and a charge arc on the dot itself fills, holds, then
            reloads — looping until the work finishes. */}
        <Tooltip content={isLoading ? 'Loading in the background…' : undefined}>
          <div
            data-glow-anchor="titlebar-dot"
            className="relative w-4 h-4 shrink-0"
          >
            {isLoading && <div className="titlebar-swirl-ring" aria-hidden="true" />}
            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-[var(--accent)] to-purple-500" />
            {isLoading && (
              <svg className="titlebar-charge-arc" viewBox="0 0 16 16" aria-hidden="true">
                <defs>
                  <linearGradient id="titlebar-charge-grad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" style={{ stopColor: 'var(--accent)' }} />
                    <stop offset="55%" style={{ stopColor: '#a855f7' }} />
                    <stop offset="100%" style={{ stopColor: '#60a5fa' }} />
                  </linearGradient>
                </defs>
                <circle cx="8" cy="8" r="6.5" fill="none" stroke="url(#titlebar-charge-grad)" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            )}
          </div>
        </Tooltip>
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          Lucid Terminal
        </span>
      </div>

      {/* Account Button (Warp-style) */}
      <div className="flex-1 flex justify-end items-center px-4"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <AccountButton />
      </div>

      {/* Window Controls */}
      <div
        className="flex h-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <Tooltip content="New Window">
          <button
            onClick={() => window.lucidAPI.window.create()}
            className="w-12 h-full flex items-center justify-center hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <Monitor size={14} className="text-[var(--text-secondary)]" />
          </button>
        </Tooltip>

        <Tooltip content="Minimize">
          <button
            onClick={() => window.lucidAPI.window.minimize()}
            className="w-12 h-full flex items-center justify-center hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <Minus size={16} className="text-[var(--text-secondary)]" />
          </button>
        </Tooltip>

        <Tooltip content={isMaximized ? 'Restore' : 'Maximize'}>
          <button
            onClick={() => window.lucidAPI.window.maximize()}
            className="w-12 h-full flex items-center justify-center hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            {isMaximized ? (
              <Maximize2 size={14} className="text-[var(--text-secondary)]" />
            ) : (
              <Square size={14} className="text-[var(--text-secondary)]" />
            )}
          </button>
        </Tooltip>

        <Tooltip content="Close">
          <button
            onClick={() => window.lucidAPI.window.close()}
            className="w-12 h-full flex items-center justify-center hover:bg-[var(--error)] hover:text-white transition-colors"
          >
            <X size={16} className="text-[var(--text-secondary)] hover:text-white" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}


export default TitleBar;
