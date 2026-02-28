import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Clock, Terminal as TerminalIcon, Trash2, Search } from 'lucide-react';
import { TerminalBlock } from '../../types';

interface ConversationHistoryProps {
  blocks: TerminalBlock[];
  onJumpToBlock: (blockId: string) => void;
  onClearHistory?: () => void;
}

interface HistoryItem {
  id: string;
  command: string;
  timestamp: number;
  preview: string;
  type: 'shell' | 'llm' | 'fixnet' | 'system';
}

export function ConversationHistory({ blocks, onJumpToBlock, onClearHistory }: ConversationHistoryProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    // Convert blocks to history items
    const items: HistoryItem[] = blocks.map(block => {
      const preview = block.output.length > 60 
        ? block.output.slice(0, 60) + '...' 
        : block.output || 'No output';

      // Determine type
      let type: HistoryItem['type'] = 'shell';
      if (block.command.includes('llm') || block.command.includes('build') || block.command.includes('create')) {
        type = 'llm';
      } else if (block.command.includes('fix') || block.command.includes('fixnet')) {
        type = 'fixnet';
      } else if (block.command.startsWith('/') || block.command === 'help' || block.command === 'clear') {
        type = 'system';
      }

      return {
        id: block.id,
        command: block.command,
        timestamp: block.timestamp,
        preview,
        type
      };
    });

    setHistoryItems(items);
  }, [blocks]);

  const filteredItems = searchQuery
    ? historyItems.filter(item => 
        item.command.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.preview.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : historyItems;

  const handleItemClick = (item: HistoryItem) => {
    setSelectedId(item.id);
    onJumpToBlock(item.id);
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getTypeColor = (type: HistoryItem['type']) => {
    switch (type) {
      case 'llm': return '#79c0ff';
      case 'fixnet': return '#d29922';
      case 'system': return '#7ee787';
      default: return 'var(--text-muted)';
    }
  };

  const getTypeIcon = (type: HistoryItem['type']) => {
    switch (type) {
      case 'llm': return '✨';
      case 'fixnet': return '🔧';
      case 'system': return '⚡';
      default: return '$';
    }
  };

  if (isCollapsed) {
    return (
      <div className="h-full w-12 bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col items-center py-4">
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
          title="Show conversation history"
        >
          <ChevronRight size={20} className="text-[var(--text-muted)]" />
        </button>
        <div className="mt-4 flex flex-col gap-2">
          {historyItems.slice(-5).reverse().map(item => (
            <button
              key={item.id}
              onClick={() => {
                setIsCollapsed(false);
                handleItemClick(item);
              }}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-xs"
              style={{ color: getTypeColor(item.type) }}
              title={item.command}
            >
              {getTypeIcon(item.type)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-80 bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <TerminalIcon size={18} className="text-[var(--accent)]" />
          <h2 className="text-sm font-semibold">History</h2>
        </div>
        <div className="flex items-center gap-1">
          {onClearHistory && historyItems.length > 0 && (
            <button
              onClick={onClearHistory}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-muted)] hover:text-red-500"
              title="Clear history"
            >
              <Trash2 size={16} />
            </button>
          )}
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
            title="Collapse sidebar"
          >
            <ChevronLeft size={16} className="text-[var(--text-muted)]" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search commands..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-tertiary)]">
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>{filteredItems.length} command{filteredItems.length !== 1 ? 's' : ''}</span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-[var(--accent)] hover:underline"
            >
              Clear search
            </button>
          )}
        </div>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <TerminalIcon size={48} className="text-[var(--text-muted)] opacity-50 mb-3" />
            <p className="text-sm text-[var(--text-muted)] mb-1">
              {searchQuery ? 'No matching commands' : 'No commands yet'}
            </p>
            <p className="text-xs text-[var(--text-muted)] opacity-70">
              {searchQuery ? 'Try a different search query' : 'Start typing commands to see them here'}
            </p>
          </div>
        ) : (
          <div className="py-2">
            {filteredItems.reverse().map((item, index) => (
              <button
                key={item.id}
                onClick={() => handleItemClick(item)}
                className={`w-full text-left px-4 py-3 hover:bg-[var(--bg-tertiary)] transition-colors border-l-2 ${
                  selectedId === item.id
                    ? 'border-[var(--accent)] bg-[var(--bg-tertiary)]'
                    : 'border-transparent'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Type Icon */}
                  <div
                    className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs mt-0.5"
                    style={{
                      backgroundColor: `${getTypeColor(item.type)}20`,
                      color: getTypeColor(item.type)
                    }}
                  >
                    {getTypeIcon(item.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Command */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-mono font-semibold text-[var(--text-primary)] truncate">
                        {item.command}
                      </span>
                    </div>

                    {/* Preview */}
                    <p className="text-xs text-[var(--text-muted)] line-clamp-2 mb-1">
                      {item.preview}
                    </p>

                    {/* Time */}
                    <div className="flex items-center gap-1 text-xs text-[var(--text-muted)] opacity-70">
                      <Clock size={10} />
                      <span>{formatTime(item.timestamp)}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
