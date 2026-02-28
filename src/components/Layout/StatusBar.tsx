import { MessageSquare, Terminal, HelpCircle } from 'lucide-react';
import { useTerminalStore } from '../../stores/terminalStore';
import { useSettingsStore } from '../../stores/settingsStore';

interface StatusBarProps {
  showAI: boolean;
  onToggleAI: () => void;
  onOpenHelp?: () => void;
}

function StatusBar({ showAI, onToggleAI, onOpenHelp }: StatusBarProps) {
  const { tabs, activeTabId } = useTerminalStore();
  const { hasLicenseKey, currentTheme } = useSettingsStore();

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
        {/* Theme Indicator */}
        <div className="flex items-center gap-1 text-[var(--text-muted)]">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: currentTheme.colors.accent }}
          />
          <span>{currentTheme.name}</span>
        </div>

        {/* Help Button */}
        {onOpenHelp && (
          <button
            onClick={onOpenHelp}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-tertiary)] transition-colors"
            title="Command Reference (Cmd+/ or F1)"
          >
            <HelpCircle size={14} />
          </button>
        )}

        {/* AI Status */}
        <button
          onClick={onToggleAI}
          className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${showAI
              ? 'bg-[var(--accent)] text-[var(--bg-primary)]'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          title={showAI ? 'Hide AI Panel' : 'Show AI Panel'}
        >
          <MessageSquare size={12} />
          <span>AI {hasLicenseKey ? '' : '(No Key)'}</span>
        </button>
      </div>
    </div>
  );
}

export default StatusBar;
