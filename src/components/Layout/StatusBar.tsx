import { useEffect, useState } from 'react';
import { MessageSquare, Terminal, HelpCircle } from 'lucide-react';
import { useTerminalStore } from '../../stores/terminalStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { isLuciferAiEnabled } from '../../lib/luciferAi';
import { Tooltip } from '../Tooltip/Tooltip';

interface StatusBarProps {
  showAI: boolean;
  onToggleAI: () => void;
  onOpenHelp?: () => void;
}

function StatusBar({ showAI, onToggleAI, onOpenHelp }: StatusBarProps) {
  const { tabs, activeTabId } = useTerminalStore();
  const { hasApiKey, currentTheme, settings } = useSettingsStore();
  // Disabled: the Help button (Help is bound to LuciferAI) leaves the
  // status bar with the plugin. The AI button is NOT a LuciferAI
  // surface — it is Lucid AI, its own plugin (Gary, 2026-11-07) — so
  // it stays and works with the plugin on or off.
  const luciferAiEnabled = isLuciferAiEnabled(settings);

  // Network reachability, probed from the main process (short-timeout
  // CDN check). This is actual reachability — not the FixNet offline %,
  // which is the share of fixes from offline sources. Null = unchecked.
  const [networkOnline, setNetworkOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const api = (window as any).lucidAPI?.system;
        if (!api || typeof api.checkNetwork !== 'function') return;
        const result = await api.checkNetwork();
        if (!cancelled) setNetworkOnline(result.online);
      } catch {
        if (!cancelled) setNetworkOnline(false);
      }
    };
    check();
    const timer = setInterval(check, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="h-6 flex items-center justify-between px-2 bg-[var(--bg-secondary)] border-t border-[var(--border)] text-xs">
      {/* Left Side */}
      <div className="flex items-center gap-3">
        {/* Current Directory */}
        {activeTab && (
          <div className="flex items-center gap-1 text-[var(--text-muted)]">
            <Terminal size={12} />
            <span className="truncate max-w-64">{activeTab.cwd}</span>
          </div>
        )}
      </div>

      {/* Right Side */}
      <div className="flex items-center gap-3">
        {/* Network Indicator */}
        <Tooltip content={networkOnline === null ? 'Checking network…' : networkOnline ? 'Network reachable' : 'Network unreachable'}>
          <div
            className="flex items-center gap-1 text-[var(--text-muted)]"
          >
            <div
              className={`w-2 h-2 rounded-full ${networkOnline === null ? 'bg-gray-500' : networkOnline ? 'bg-green-500' : 'bg-red-500'}`}
            />
            <span>{networkOnline === null ? '…' : networkOnline ? 'Online' : 'Offline'}</span>
          </div>
        </Tooltip>

        {/* Theme Indicator */}
        <Tooltip content={`Theme: ${currentTheme.name}`}>
          <div className="flex items-center gap-1 text-[var(--text-muted)]">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: currentTheme.colors.accent }}
            />
            <span>{currentTheme.name}</span>
          </div>
        </Tooltip>

        {/* Help Button — hidden while LuciferAI is disabled */}
        {luciferAiEnabled && onOpenHelp && (
          <Tooltip content="Command Reference" shortcut="Cmd+/">
            <button
              onClick={onOpenHelp}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              <HelpCircle size={14} />
            </button>
          </Tooltip>
        )}

        {/* AI Status — Lucid AI, its own plugin: always shown, on or off. */}
        <Tooltip content={showAI ? 'Hide AI Panel' : 'Show AI Panel'}>
          <button
            onClick={onToggleAI}
            className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${showAI
                ? 'bg-[var(--accent)] text-[var(--bg-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
          >
            <MessageSquare size={12} />
            <span>AI {hasApiKey ? '' : '(No Key)'}</span>
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

export default StatusBar;
