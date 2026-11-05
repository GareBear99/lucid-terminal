import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Clock, Terminal as TerminalIcon, Trash2, Search } from 'lucide-react';
import { TerminalBlock } from '../../types';
import { Tooltip } from '../Tooltip/Tooltip';

interface ConversationHistoryProps {
  blocks: TerminalBlock[];
  onJumpToBlock: (blockId: string) => void;
  onClearHistory?: () => void;
  /**
   * Expanded panel width in px. When unset the panel keeps its w-80
   * (320px) width. The collapsed tick rail is always w-12 regardless —
   * the width only applies to the expanded list. The Sidebar passes its
   * (resizable) history width so the resize handle works for this panel
   * too; the default is exactly w-80.
   */
  width?: number;
}

interface HistoryItem {
  id: string;
  command: string;
  timestamp: number;
  preview: string;
  type: 'shell' | 'llm' | 'fixnet' | 'system';
}

export function ConversationHistory({ blocks, onJumpToBlock, onClearHistory, width }: ConversationHistoryProps) {
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
    // Skinny rail: the chats track as ticks down the rail (newest first,
    // mirroring the expanded list), like ChatGPT's old collapsed sidebar.
    // Clicking a tick jumps to that block without expanding — the ticks
    // ARE the navigation in this state. The chevron above expands.
    const tickItems = [...historyItems].reverse();
    return (
      <div className="h-full w-12 bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col items-center py-3">
        <Tooltip content="Show conversation history" placement="right">
          <button
            onClick={() => setIsCollapsed(false)}
            className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors shrink-0"
          >
            <ChevronRight size={20} className="text-[var(--text-muted)]" />
          </button>
        </Tooltip>
        {/* Tick track — one tick per chat, newest at the top.
            No Tooltip on the track itself: each tick has its own tip
            (the command), and the count tip lives on the count span
            below — wrapping the track too would show two tips at once. */}
        <div
          className="mt-3 flex-1 w-full overflow-y-auto custom-scrollbar flex flex-col items-center gap-[3px] py-1"
        >
            {tickItems.map(item => (
              <Tooltip key={item.id} content={item.command} placement="right">
                <button
                  onClick={() => handleItemClick(item)}
                  aria-label={item.command}
                  className={`shrink-0 rounded-full transition-all ${
                    selectedId === item.id
                      ? 'w-8 h-[4px] opacity-100'
                      : 'w-5 h-[3px] opacity-60 hover:opacity-100 hover:w-7'
                  }`}
                  style={{ backgroundColor: getTypeColor(item.type) }}
                />
              </Tooltip>
            ))}
          </div>
          {historyItems.length > 0 && (
          <Tooltip content={`${historyItems.length} chat${historyItems.length !== 1 ? 's' : ''}`} placement="right">
            <span
              className="shrink-0 mt-2 text-[10px] font-mono text-[var(--text-muted)]"
            >
              {historyItems.length}
            </span>
          </Tooltip>
        )}
      </div>
    );
  }

  return (
    <div
      className={`h-full bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col ${width === undefined ? 'w-80' : ''}`}
      style={width !== undefined ? { width } : undefined}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <TerminalIcon size={18} className="text-[var(--accent)]" />
          <h2 className="text-sm font-semibold">History</h2>
        </div>
        <div className="flex items-center gap-1">
          {onClearHistory && historyItems.length > 0 && (
            <Tooltip content="Clear history">
              <button
                onClick={onClearHistory}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-muted)] hover:text-red-500"
              >
                <Trash2 size={16} />
              </button>
            </Tooltip>
          )}
          <Tooltip content="Collapse sidebar">
            <button
              onClick={() => setIsCollapsed(true)}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              <ChevronLeft size={16} className="text-[var(--text-muted)]" />
            </button>
          </Tooltip>
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
            {filteredItems.reverse().map((item) => (
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
