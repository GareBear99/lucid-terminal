import { useState, useEffect } from 'react';
import { X, Search, ChevronRight } from 'lucide-react';
import { helpCategories, HelpCategory, HelpCommand } from '../../data/helpData';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HelpModal({ isOpen, onClose }: HelpModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<HelpCategory | null>(null);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Filter categories and commands by search query
  const filteredCategories = helpCategories.map(category => ({
    ...category,
    commands: category.commands.filter(cmd =>
      cmd.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cmd.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cmd.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  })).filter(category => category.commands.length > 0);

  const handleCategoryClick = (category: HelpCategory) => {
    setSelectedCategory(category);
  };

  const handleBack = () => {
    setSelectedCategory(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-[800px] max-h-[85vh] bg-[var(--bg-secondary)] rounded-lg shadow-2xl border border-[var(--border)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            {selectedCategory && (
              <button
                onClick={handleBack}
                className="p-1 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
              >
                <ChevronRight size={20} className="rotate-180 text-[var(--text-muted)]" />
              </button>
            )}
            <div>
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                {selectedCategory ? selectedCategory.title : 'LuciferAI Command Reference'}
              </h2>
              <p className="text-sm text-[var(--text-muted)]">
                {selectedCategory 
                  ? `${selectedCategory.commands.length} commands` 
                  : `${filteredCategories.reduce((acc, cat) => acc + cat.commands.length, 0)} total commands`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
          >
            <X size={20} className="text-[var(--text-muted)]" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-6 py-3 border-b border-[var(--border)]">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search commands, examples, or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selectedCategory ? (
            // Category Grid View
            <div className="grid grid-cols-2 gap-4">
              {filteredCategories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => handleCategoryClick(category)}
                  className="group relative p-4 bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg transition-all cursor-pointer text-left"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{category.icon}</span>
                      <div>
                        <h3 className="font-semibold text-[var(--text-primary)]">
                          {category.title}
                        </h3>
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                          {category.description}
                        </p>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors" />
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
                    <span className="text-xs text-[var(--text-muted)]">
                      {category.commands.length} {category.commands.length === 1 ? 'command' : 'commands'}
                    </span>
                    {category.stats && (
                      <span className="text-xs font-medium" style={{ color: category.color }}>
                        {category.stats.label}: {category.stats.value}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            // Command Detail View
            <div className="space-y-4">
              {selectedCategory.commands.map((command, idx) => (
                <CommandCard key={idx} command={command} categoryColor={selectedCategory.color} />
              ))}
            </div>
          )}

          {filteredCategories.length === 0 && (
            <div className="text-center py-12">
              <p className="text-[var(--text-muted)]">No commands found matching "{searchQuery}"</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[var(--border)] bg-[var(--bg-primary)]">
          <p className="text-xs text-[var(--text-muted)] text-center">
            Press <kbd className="px-2 py-1 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded text-[var(--text-primary)]">Esc</kbd> to close
          </p>
        </div>
      </div>
    </div>
  );
}

function CommandCard({ command, categoryColor }: { command: HelpCommand; categoryColor: string }) {
  return (
    <div className="p-4 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg">
      {/* Command Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <code className="font-mono text-sm font-semibold" style={{ color: categoryColor }}>
              {command.name}
            </code>
            {command.aliases && command.aliases.length > 0 && (
              <span className="text-xs text-[var(--text-muted)]">
                (aliases: {command.aliases.join(', ')})
              </span>
            )}
          </div>
          <p className="text-sm text-[var(--text-secondary)]">{command.description}</p>
        </div>
      </div>

      {/* Syntax */}
      <div className="mb-3">
        <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
          Syntax
        </label>
        <code className="block mt-1 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded text-sm font-mono text-[var(--text-primary)]">
          {command.syntax}
        </code>
      </div>

      {/* Examples */}
      {command.examples && command.examples.length > 0 && (
        <div className="mb-3">
          <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
            Examples
          </label>
          <div className="mt-1 space-y-1">
            {command.examples.map((example, idx) => (
              <code
                key={idx}
                className="block px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded text-xs font-mono text-[var(--accent)] hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer"
                onClick={() => {
                  navigator.clipboard.writeText(example);
                }}
                title="Click to copy"
              >
                {example}
              </code>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {command.tags && command.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {command.tags.map((tag, idx) => (
            <span
              key={idx}
              className="px-2 py-0.5 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded text-xs text-[var(--text-muted)]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Keyboard shortcut handler
export function useHelpModalShortcut(onOpen: () => void) {
  if (typeof window === 'undefined') return;

  const handleKeyDown = (e: KeyboardEvent) => {
    // Cmd+/ or Ctrl+/ to open help
    if ((e.metaKey || e.ctrlKey) && e.key === '/') {
      e.preventDefault();
      onOpen();
    }
    // F1 to open help
    if (e.key === 'F1') {
      e.preventDefault();
      onOpen();
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}
