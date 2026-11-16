/**
 * The shared fuzzy modal (Atom steal #1/#2 — 2026-11-14).
 *
 * Atom renders its palette, fuzzy finder, go-to-symbol,
 * go-to-line and bookmarks view-all in ONE component — the
 * `atom-select-list` modal (`atom-packages/command-palette`,
 * `fuzzy-finder`, `symbols-view` all feed it). Lucid's shape
 * is this component: an input + a filtered list, with
 * different item sources per caller. The research is explicit:
 * do NOT build six separate modals.
 *
 * Behaviour (Atom's, kept): fuzzy filter over the item's
 * filter text, matched characters bolded, max 10 rows
 * (`MAX_RESULTS`), ↑/↓ wraps, Enter confirms, Esc cancels,
 * mouse hover highlights, click confirms. The input takes
 * focus on open; the query and selection reset on open.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { fuzzyFilter, fuzzyMatch } from '../../lib/fuzzyMatch';

/** One row in the modal. */
export interface FuzzyModalItem {
  /** Stable key. */
  id: string;
  /** Primary line. */
  label: string;
  /** Secondary line (path, "Line N", description). */
  detail?: string;
  /** The string the fuzzy filter scores (defaults to label). */
  filterText?: string;
  /** Right-side text (keybinding, kind). */
  right?: string;
  /** The section header the row renders under (Raycast's List sections). */
  section?: string;
}

/** Atom's MAX_RESULTS (fuzzy-finder-view.js:15). */
export const FUZZY_MODAL_MAX_RESULTS = 10;

export interface FuzzyModalProps {
  open: boolean;
  placeholder: string;
  items: FuzzyModalItem[];
  onSelect: (item: FuzzyModalItem) => void;
  onClose: () => void;
  /** Fires when the highlighted row changes (null = none). */
  onHighlightChange?: (item: FuzzyModalItem | null) => void;
  /** Fires on every keystroke (go-to-line's live navigation). */
  onQueryChange?: (query: string) => void;
  initialQuery?: string;
  emptyText?: string;
  /** Shown under the input while the source is still loading. */
  indexing?: boolean;
  /** The input only accepts these characters (go-to-line: digits + ':'). */
  allowedInput?: RegExp;
  /** Hide the list entirely (go-to-line: input-only mode). */
  hideList?: boolean;
  /** Extra text under the input (go-to-line's hint). */
  footer?: React.ReactNode;
  maxResults?: number;
  /**
   * False → the caller owns filtering/ranking (Raycast's List
   * `filtering` prop): items are shown as given, in order,
   * still capped at maxResults. Default true (the old behaviour).
   */
  filtering?: boolean;
  /**
   * Intercepts keys before the modal's own handling. Return true
   * when handled (the palette's ⌘K opens the Action Panel).
   */
  onKeyDown?: (e: React.KeyboardEvent) => boolean;
}

/** Render a label with the matched characters bolded. */
function MatchedLabel({
  label,
  indices,
}: {
  label: string;
  indices: number[];
}) {
  if (indices.length === 0) return <>{label}</>;
  const matched = new Set(indices);
  return (
    <>
      {label.split('').map((ch, i) => (
        <span
          key={i}
          className={
            matched.has(i)
              ? 'font-semibold text-[var(--text-primary)]'
              : undefined
          }
        >
          {ch}
        </span>
      ))}
    </>
  );
}

export function FuzzyModal({
  open,
  placeholder,
  items,
  onSelect,
  onClose,
  onHighlightChange,
  onQueryChange,
  initialQuery = '',
  emptyText = 'No matches',
  indexing = false,
  allowedInput,
  hideList = false,
  footer,
  maxResults = FUZZY_MODAL_MAX_RESULTS,
  filtering = true,
  onKeyDown,
}: FuzzyModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Reset on open; focus the input.
  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setSelectedIndex(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open, initialQuery]);

  const filtered = useMemo(() => {
    if (hideList) return [];
    if (!filtering) return items.slice(0, maxResults);
    const ranked = fuzzyFilter(items, query, (item) => item.filterText ?? item.label);
    return ranked.slice(0, maxResults);
  }, [items, query, hideList, maxResults, filtering]);

  // Clamp the selection into the filtered list.
  const selected = filtered.length > 0
    ? filtered[Math.min(selectedIndex, filtered.length - 1)]
    : undefined;

  // Keep the highlighted row in view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-selected="true"]');
    // jsdom has no scrollIntoView — guard, never crash the modal.
    if (typeof el?.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, filtered.length]);

  // Notify the caller when the highlight moves (go-to-symbol's
  // quick-jump preview). The ref dance keeps the effect from
  // firing on every render — only when the item changes.
  const selectedId = selected?.id ?? null;
  const highlightRef = useRef(onHighlightChange);
  highlightRef.current = onHighlightChange;
  useEffect(() => {
    highlightRef.current?.(selected ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  if (!open) return null;

  const handleQueryChange = (value: string) => {
    if (allowedInput && value.length > 0 && !allowedInput.test(value)) return;
    setQuery(value);
    setSelectedIndex(0);
    onQueryChange?.(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onKeyDown?.(e)) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) =>
        filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length,
      );
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selected) onSelect(selected);
      return;
    }
  };

  // The matched indices for the visible rows (computed once per
  // filter, so the list render is cheap).
  const matchedById = new Map<string, number[]>();
  for (const item of filtered) {
    const match = fuzzyMatch(query, item.filterText ?? item.label);
    matchedById.set(item.id, match?.indices ?? []);
  }

  return (
    <div
      data-testid="fuzzy-modal"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm pt-[15vh]"
      onMouseDown={(e) => {
        // Clicking the backdrop cancels (Atom's modal closes on
        // outside click); clicking inside the panel does not.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[560px] max-w-[90vw] rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl overflow-hidden">
        <input
          ref={inputRef}
          data-testid="fuzzy-modal-input"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          aria-label={placeholder}
          className="w-full px-4 py-3 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none border-b border-[var(--border)]"
        />
        {indexing && (
          <div className="px-4 py-1.5 text-xs text-[var(--text-muted)] border-b border-[var(--border)]">
            Indexing files…
          </div>
        )}
        {!hideList && (
          <div ref={listRef} className="max-h-[320px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-sm text-[var(--text-muted)]">
                {emptyText}
              </div>
            ) : (
              filtered.map((item, i) => {
                const isSelected = selected !== undefined && item.id === selected.id;
                // A section header before the first row of each
                // section (Raycast's List sections).
                const showSection =
                  item.section !== undefined &&
                  (i === 0 || filtered[i - 1]?.section !== item.section);
                return (
                  <div key={item.id}>
                    {showSection && (
                      <div className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        {item.section}
                      </div>
                    )}
                    <button
                      data-testid={`fuzzy-modal-item-${item.id}`}
                      data-selected={isSelected ? 'true' : 'false'}
                      onMouseEnter={() => setSelectedIndex(i)}
                      onClick={() => onSelect(item)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left text-sm ${
                        isSelected
                          ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                          : 'text-[var(--text-muted)]'
                      }`}
                    >
                      <span className="flex-1 min-w-0">
                        <span className="block truncate">
                          <MatchedLabel
                            label={item.label}
                            indices={matchedById.get(item.id) ?? []}
                          />
                        </span>
                        {item.detail && (
                          <span className="block truncate text-xs text-[var(--text-muted)]">
                            {item.detail}
                          </span>
                        )}
                      </span>
                      {item.right && (
                        <span className="shrink-0 text-xs text-[var(--text-muted)]">
                          {item.right}
                        </span>
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
        {footer && (
          <div className="px-4 py-2 text-xs text-[var(--text-muted)] border-t border-[var(--border)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
