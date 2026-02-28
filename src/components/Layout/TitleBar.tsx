import { useState, useEffect } from 'react';
import { Minus, Square, X, Maximize2, Monitor } from 'lucide-react';
import { AccountButton } from '../Account/AccountButton';

function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

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
        <div className="w-4 h-4 rounded-full bg-gradient-to-br from-[var(--accent)] to-purple-500" />
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          Lucid Terminal
        </span>
        <BalanceDisplay />
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
        <button
          onClick={() => window.lucidAPI.window.create()}
          className="w-12 h-full flex items-center justify-center hover:bg-[var(--bg-tertiary)] transition-colors"
          title="New Window"
        >
          <Monitor size={14} className="text-[var(--text-secondary)]" />
        </button>

        <button
          onClick={() => window.lucidAPI.window.minimize()}
          className="w-12 h-full flex items-center justify-center hover:bg-[var(--bg-tertiary)] transition-colors"
          title="Minimize"
        >
          <Minus size={16} className="text-[var(--text-secondary)]" />
        </button>

        <button
          onClick={() => window.lucidAPI.window.maximize()}
          className="w-12 h-full flex items-center justify-center hover:bg-[var(--bg-tertiary)] transition-colors"
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? (
            <Maximize2 size={14} className="text-[var(--text-secondary)]" />
          ) : (
            <Square size={14} className="text-[var(--text-secondary)]" />
          )}
        </button>

        <button
          onClick={() => window.lucidAPI.window.close()}
          className="w-12 h-full flex items-center justify-center hover:bg-[var(--error)] hover:text-white transition-colors"
          title="Close"
        >
          <X size={16} className="text-[var(--text-secondary)] hover:text-white" />
        </button>
      </div>
    </div>
  );
}

import { useSettingsStore } from '../../stores/settingsStore';
import { Coins } from 'lucide-react';

function BalanceDisplay() {
  const { balance, fetchBalance, hasLicenseKey } = useSettingsStore();

  useEffect(() => {
    if (hasLicenseKey) {
      fetchBalance();
      // Poll every 30 seconds
      const interval = setInterval(fetchBalance, 30000);
      return () => clearInterval(interval);
    }
  }, [hasLicenseKey, fetchBalance]);

  if (!hasLicenseKey || balance === null) return null;

  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5 ml-4 bg-[var(--bg-tertiary)] rounded-full border border-[var(--border)]">
      <Coins size={12} className="text-[var(--accent)]" />
      <span className="text-xs font-medium text-[var(--text-secondary)]">
        {balance.toLocaleString()} Credits
      </span>
    </div>
  );
}

export default TitleBar;
