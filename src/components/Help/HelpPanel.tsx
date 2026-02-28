import { useState, useMemo } from 'react';
import { Search, Copy, Check, X, ChevronRight, Terminal } from 'lucide-react';
import { helpCategories, searchCommands, systemStats, HelpCategory, HelpCommand } from '../../data/helpData';

interface HelpPanelProps {
  onClose: () => void;
}

export function HelpPanel({ onClose }: HelpPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  // Filter categories/commands based on search
  const filteredContent = useMemo(() => {
    if (!searchQuery.trim()) {
      return { categories: helpCategories, searchResults: null };
    }

    const results = searchCommands(searchQuery);
    return {
      categories: helpCategories.map(cat => ({
        ...cat,
        commands: cat.commands.filter(cmd => results.includes(cmd))
      })).filter(cat => cat.commands.length > 0),
      searchResults: results
    };
  }, [searchQuery]);

  const handleCopyCommand = (syntax: string) => {
    navigator.clipboard.writeText(syntax);
    setCopiedCommand(syntax);
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  const currentCategory = selectedCategory 
    ? helpCategories.find(c => c.id === selectedCategory)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-6xl h-[85vh] bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--bg-tertiary)]">
          <div className="flex items-center gap-3">
            <Terminal size={20} className="text-[var(--accent)]" />
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                🩸 LuciferAI Command Reference
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                {systemStats.offlineCoverage} offline • {systemStats.totalTemplates} templates • {systemStats.modelTiers} model tiers
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--bg-primary)] transition-colors"
            title="Close"
          >
            <X size={18} className="text-[var(--text-muted)]" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-6 py-4 border-b border-[var(--border)]">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search commands, examples, or tags..."
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] 
                       text-[var(--text-primary)] placeholder:text-[var(--text-muted)]
                       focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
          {filteredContent.searchResults && (
            <div className="mt-2 text-xs text-[var(--text-muted)]">
              Found {filteredContent.searchResults.length} command{filteredContent.searchResults.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Categories Sidebar */}
          {!selectedCategory && (
            <div className="w-full overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredContent.categories.map((category) => (
                  <CategoryCard
                    key={category.id}
                    category={category}
                    onClick={() => setSelectedCategory(category.id)}
                    commandCount={category.commands.length}
                  />
                ))}
              </div>

              {/* System Stats Footer */}
              <div className="mt-8 p-4 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)]">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">
                  System Features
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {systemStats.features.map((feature, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <div className="w-1 h-1 rounded-full bg-[var(--accent)]" />
                      {feature}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Category Detail View */}
          {selectedCategory && currentCategory && (
            <div className="w-full flex flex-col overflow-hidden">
              {/* Category Header */}
              <div className="px-6 py-4 border-b border-[var(--border)] bg-[var(--bg-tertiary)]">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-3 transition-colors"
                >
                  <ChevronRight size={14} className="rotate-180" />
                  Back to all categories
                </button>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{currentCategory.icon}</span>
                  <div>
                    <h3 className="text-lg font-semibold" style={{ color: currentCategory.color }}>
                      {currentCategory.title}
                    </h3>
                    <p className="text-sm text-[var(--text-muted)]">{currentCategory.description}</p>
                  </div>
                </div>
                {currentCategory.stats && (
                  <div className="mt-3 inline-block px-3 py-1 rounded-full bg-[var(--bg-primary)] border border-[var(--border)]">
                    <span className="text-xs font-medium" style={{ color: currentCategory.color }}>
                      {currentCategory.stats.label}: {currentCategory.stats.value}
                    </span>
                  </div>
                )}
              </div>

              {/* Commands List */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {currentCategory.commands.map((command, idx) => (
                  <CommandCard
                    key={idx}
                    command={command}
                    onCopy={handleCopyCommand}
                    copied={copiedCommand === command.syntax}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Category Card Component
function CategoryCard({ 
  category, 
  onClick, 
  commandCount 
}: { 
  category: HelpCategory; 
  onClick: () => void; 
  commandCount: number;
}) {
  return (
    <button
      onClick={onClick}
      className="p-4 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)]
               hover:border-[var(--border)] hover:shadow-md transition-all duration-200
               text-left group"
      style={{
        '--hover-color': category.color,
      } as React.CSSProperties}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-2xl">{category.icon}</span>
        <ChevronRight size={16} className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors" />
      </div>
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1 group-hover:opacity-90">
        {category.title}
      </h3>
      <p className="text-xs text-[var(--text-muted)] mb-2 line-clamp-2">
        {category.description}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium px-2 py-0.5 rounded-full" 
              style={{ 
                backgroundColor: category.color + '20',
                color: category.color 
              }}>
          {commandCount} command{commandCount !== 1 ? 's' : ''}
        </span>
        {category.stats && (
          <span className="text-xs text-[var(--text-muted)]">
            • {category.stats.value}
          </span>
        )}
      </div>
    </button>
  );
}

// Command Card Component
function CommandCard({ 
  command, 
  onCopy, 
  copied 
}: { 
  command: HelpCommand; 
  onCopy: (syntax: string) => void; 
  copied: boolean;
}) {
  return (
    <div className="p-4 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)]">
      {/* Command Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <code className="text-sm font-semibold text-[var(--accent)]">
              {command.name}
            </code>
            {command.aliases && command.aliases.length > 0 && (
              <span className="text-xs text-[var(--text-muted)]">
                ({command.aliases.join(', ')})
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            {command.description}
          </p>
        </div>
        <button
          onClick={() => onCopy(command.syntax)}
          className="p-1.5 rounded hover:bg-[var(--bg-secondary)] transition-colors"
          title="Copy syntax"
        >
          {copied ? (
            <Check size={14} className="text-[var(--success)]" />
          ) : (
            <Copy size={14} className="text-[var(--text-muted)]" />
          )}
        </button>
      </div>

      {/* Syntax */}
      <div className="mb-3 p-2 rounded bg-[var(--bg-secondary)] border border-[var(--border)]">
        <code className="text-xs font-mono text-[var(--text-primary)]">
          {command.syntax}
        </code>
      </div>

      {/* Examples */}
      {command.examples && command.examples.length > 0 && (
        <div>
          <div className="text-xs font-medium text-[var(--text-muted)] mb-2">
            Examples:
          </div>
          <div className="space-y-1">
            {command.examples.map((example, idx) => (
              <div key={idx} className="flex items-center gap-2 group">
                <code className="flex-1 text-xs font-mono text-[var(--text-secondary)] px-2 py-1 rounded bg-[var(--bg-secondary)]">
                  {example}
                </code>
                <button
                  onClick={() => onCopy(example)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[var(--bg-secondary)] transition-all"
                  title="Copy example"
                >
                  <Copy size={12} className="text-[var(--text-muted)]" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {command.tags && command.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {command.tags.map((tag, idx) => (
            <span
              key={idx}
              className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-muted)] border border-[var(--border)]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
