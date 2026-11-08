import { useState, useEffect, type ReactNode } from 'react';
import { X, Search, ChevronRight } from 'lucide-react';
import { Tooltip } from '../Tooltip/Tooltip';
import { helpCategories, HelpCategory, HelpCommand, getCategoryById } from '../../data/helpData';
import { SovereignPointsInfo } from './SovereignPointsInfo';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Open straight onto a category (e.g. the "?" in the startup model
   * disclaimer opens 'tiers'). When not given, the modal opens as
   * before — category grid, or wherever it was left.
   */
  initialCategoryId?: string | null;
}

/**
 * The LuciferAI command reference browser — search + category grid +
 * command detail — shared by the Help modal AND the blood drop tab
 * (LuciferAITabPanel, Gary 2026-11-07): the tab shows this same
 * surface inline, as a panel, not as a modal overlay. The header is
 * part of the browser (back button, title, count, optional close):
 * the modal passes its close handler (and the Esc hint lives in the
 * modal's footer), the tab passes none — a tab is left by picking
 * another tab, never closed. The category selection lives here, so
 * both surfaces open on the same grid and drill into the same detail.
 */
export function HelpContent({
  title,
  titleIcon,
  onClose,
  initialCategoryId,
  showSovereignPoints,
}: {
  title: string;
  titleIcon?: ReactNode;
  onClose?: () => void;
  initialCategoryId?: string | null;
  /**
   * Show the Sovereign Points info section at the top of the grid
   * view (Gary, 2026-11-08 ~07:40 PST): SP info lives ONLY in the
   * Help/Info page (the Help modal) — NOT in the blood-drop tab,
   * which renders this same HelpContent without the prop.
   */
  showSovereignPoints?: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<HelpCategory | null>(null);

  // Land on the requested category when opened with one.
  useEffect(() => {
    if (!initialCategoryId) return;
    const category = getCategoryById(initialCategoryId);
    if (category) setSelectedCategory(category);
  }, [initialCategoryId]);

  // Filter categories and commands by search query
  const filteredCategories = helpCategories.map(category => ({
    ...category,
    commands: category.commands.filter(cmd =>
      cmd.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cmd.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cmd.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  })).filter(category => category.commands.length > 0);

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          {selectedCategory && (
            <Tooltip content="Back to categories">
              <button
                onClick={() => setSelectedCategory(null)}
                className="p-1 hover:bg-[var(--bg-tertiary)]/70 rounded transition-colors"
              >
                <ChevronRight size={20} className="rotate-180 text-[var(--text-muted)]" />
              </button>
            </Tooltip>
          )}
          {titleIcon}
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">
              {selectedCategory ? selectedCategory.title : title}
            </h2>
            <p className="text-sm text-[var(--text-muted)]">
              {selectedCategory
                ? `${selectedCategory.commands.length} commands`
                : `${filteredCategories.reduce((acc, cat) => acc + cat.commands.length, 0)} total commands`}
            </p>
          </div>
        </div>
        {onClose && (
          <Tooltip content="Close" shortcut="Esc">
            <button
              onClick={onClose}
              className="p-2 hover:bg-[var(--bg-tertiary)]/70 rounded transition-colors"
            >
              <X size={20} className="text-[var(--text-muted)]" />
            </button>
          </Tooltip>
        )}
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
            className="w-full pl-10 pr-4 py-2 bg-[var(--bg-tertiary)]/60 backdrop-blur-sm border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selectedCategory ? (
          // Category Grid View
          <>
            {/* Sovereign Points, heavily explained, with voice audio
                (Gary, 2026-11-08 ~07:20 PST). Shown at the top of the
                info page when the user is browsing, not searching —
                search filters the command grid, and the SP section
                would only get in its way there. Help modal ONLY
                (Gary, 2026-11-08 ~07:40 PST): the blood-drop tab
                renders this same HelpContent without
                showSovereignPoints, so the SP section never appears
                there. */}
            {showSovereignPoints && !searchQuery.trim() && <SovereignPointsInfo />}
            <div className="grid grid-cols-2 gap-4">
            {filteredCategories.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category)}
                className="group relative p-4 bg-[var(--bg-primary)]/60 hover:bg-[var(--bg-tertiary)]/70 backdrop-blur-md border border-[var(--border)] rounded-lg transition-all cursor-pointer text-left"
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
          </>
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
    </>
  );
}

export function HelpModal({ isOpen, onClose, initialCategoryId }: HelpModalProps) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-[800px] max-h-[85vh] bg-[var(--bg-secondary)]/80 backdrop-blur-xl rounded-lg shadow-2xl border border-[var(--border)] flex flex-col overflow-hidden">
        <HelpContent
          title="LuciferAI Command Reference"
          onClose={onClose}
          initialCategoryId={initialCategoryId}
          showSovereignPoints
        />

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[var(--border)] bg-[var(--bg-primary)]/70 backdrop-blur-md">
          <p className="text-xs text-[var(--text-muted)] text-center">
            Press <kbd className="px-2 py-1 bg-[var(--bg-tertiary)]/60 backdrop-blur-sm border border-[var(--border)] rounded text-[var(--text-primary)]">Esc</kbd> to close
          </p>
        </div>
      </div>
    </div>
  );
}

function CommandCard({ command, categoryColor }: { command: HelpCommand; categoryColor: string }) {
  return (
    <div className="p-4 bg-[var(--bg-primary)]/60 backdrop-blur-md border border-[var(--border)] rounded-lg">
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
        <code className="block mt-1 px-3 py-2 bg-[var(--bg-tertiary)]/60 backdrop-blur-sm border border-[var(--border)] rounded text-sm font-mono text-[var(--text-primary)]">
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
              <Tooltip content="Click to copy">
                <code
                  key={idx}
                  className="block px-3 py-2 bg-[var(--bg-tertiary)]/60 backdrop-blur-sm border border-[var(--border)] rounded text-xs font-mono text-[var(--accent)] hover:bg-[var(--bg-secondary)]/70 transition-colors cursor-pointer"
                  onClick={() => {
                    navigator.clipboard.writeText(example);
                  }}
                >
                  {example}
                </code>
              </Tooltip>
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
              className="px-2 py-0.5 bg-[var(--bg-tertiary)]/60 backdrop-blur-sm border border-[var(--border)] rounded text-xs text-[var(--text-muted)]"
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
