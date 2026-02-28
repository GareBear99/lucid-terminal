import { Plus, X, Terminal } from 'lucide-react';
import { useTerminalStore } from '../../stores/terminalStore';

function TerminalTabs() {
  const { tabs, activeTabId, createTab, closeTab, setActiveTab } = useTerminalStore();

  return (
    <div className="h-9 flex items-center bg-[var(--bg-secondary)] border-b border-[var(--border)]">
      {/* Tabs */}
      <div className="flex-1 flex items-center overflow-x-auto">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`group flex items-center gap-2 px-3 h-9 border-r border-[var(--border)] cursor-pointer transition-colors ${
              tab.id === activeTabId
                ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] tab-active'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            <Terminal size={14} />
            <span className="text-sm whitespace-nowrap">{tab.title}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="p-0.5 rounded hover:bg-[var(--bg-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* New Tab Button */}
      <button
        onClick={() => createTab()}
        className="h-9 px-3 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
        title="New Terminal"
      >
        <Plus size={18} />
      </button>
    </div>
  );
}

export default TerminalTabs;
