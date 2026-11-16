/**
 * Root Search (Raycast steal — 2026-11-16).
 *
 * Raycast's Root Search, Lucid-shaped: one input searching
 * commands (registry + extensions), quicklinks, files, tabs and
 * settings, ranked Raycast's way (exact alias > alias prefix >
 * title fuzzy > subtitle/keyword > frecency, favorites pinned
 * when the search is empty, calculator inline). ⌘K opens the
 * Action Panel for the highlighted row; commands that declare
 * arguments prompt for them inline before running (Raycast:
 * arguments are entered in Root Search, max 3, alias + space
 * focuses the first field).
 *
 * This EXTENDS the existing palette (⌘⇧P) — it does not replace
 * it with a separate launcher. The old PaletteModal becomes a
 * thin wrapper (see CommandPalette.tsx) that renders this with
 * the live providers.
 *
 * Tab actions go through the existing tab APIs only
 * (useTerminalStore.setActiveTab / closeTab). Palette state is
 * per profile, in the palette store's own key — never in the
 * profile record.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FuzzyModal, type FuzzyModalItem } from '../FuzzyModal/FuzzyModal';
import {
  commandRegistry,
  type CommandContext,
  type CommandRegistry,
} from '../../lib/commandRegistry';
import {
  buildRootSearchEntries,
  getQuickActions,
  paletteExtensions,
  paletteQuicklinks,
  palettePersonalization,
  resolveArguments,
  splitArgumentInput,
  type PaletteArgumentDef,
  type PaletteExtensionRegistry,
  type PalettePersonalization,
  type PaletteSelection,
  type QuickActionDef,
  type QuickActionDeps,
  type QuicklinkRegistry,
  type RootSearchEntry,
} from '../../lib/paletteExtensions';
import {
  collectLiveFileEntries,
  extensionCommandEntries,
  fileEntries as buildFileEntries,
  openQuicklinkTarget,
  quicklinkEntries,
  registryCommandEntries,
  settingsEntries,
  tabEntries as buildTabEntries,
} from '../../lib/paletteProviders';
import { usePaletteStore } from '../../stores/paletteStore';
import { useFileStore } from '../../stores/fileStore';
import { useTerminalStore } from '../../stores/terminalStore';
import { useFindReplaceStore } from '../../stores/findReplaceStore';
import { useModalStore } from '../../stores/modalStore';
import { openFileInWorkspace } from '../../lib/workspace';
import {
  getProjectFileIndex,
  markProjectFileOpened,
  refreshProjectFileIndex,
  subscribeProjectFileIndex,
} from '../../lib/projectFileIndex';
import type { View } from '../../types';

export interface RootSearchFileEntry {
  id: string;
  title: string;
  subtitle: string;
  filePath: string;
}

export interface RootSearchTabEntry {
  id: string;
  title: string;
  subtitle: string;
  tabId: string;
}

export interface RootSearchPaletteProps {
  context: CommandContext;
  switchView: (view: View) => void;
  onClose: () => void;
  /** Defaults to the shared registries (tests pass fresh ones). */
  registry?: CommandRegistry;
  extensions?: PaletteExtensionRegistry;
  quicklinks?: QuicklinkRegistry;
  personalization?: PalettePersonalization;
  copyText?: (text: string) => void;
  /** Overrides the live action wiring (tests pass spies). */
  actionDeps?: QuickActionDeps;
  /** Injected file/tab rows (tests); default: the live sources. */
  fileEntries?: RootSearchFileEntry[];
  tabEntries?: RootSearchTabEntry[];
}

type Mode = 'results' | 'actions' | 'arguments' | 'prompt';

function selectionForEntry(
  entry: RootSearchEntry,
  personalization: PalettePersonalization,
): PaletteSelection {
  const base: PaletteSelection = {
    kind: entry.kind === 'calculator' ? 'calculator' : entry.kind,
    id: entry.id,
    title: entry.title,
    subtitle: entry.subtitle,
    commandId: entry.commandId,
    extensionId: entry.extensionId,
    filePath: entry.filePath,
    tabId: entry.tabId,
    link: entry.link,
    favorite: personalization.isFavorite(entry.id),
    // Only extension commands can be disabled; the registry's
    // own commands have no disable.
    canDisable: entry.fromExtension === true,
  };
  if (entry.kind === 'calculator') {
    base.text = entry.title.replace(/^= /, '');
  }
  return base;
}

export function RootSearchPalette({
  context,
  switchView,
  onClose,
  registry = commandRegistry,
  extensions = paletteExtensions,
  quicklinks = paletteQuicklinks,
  personalization = palettePersonalization,
  copyText,
  actionDeps: actionDepsProp,
  fileEntries: fileEntriesProp,
  tabEntries: tabEntriesProp,
}: RootSearchPaletteProps) {
  const close = useModalStore((s) => s.close);
  // Re-render when palette state changes (favorite/alias/…)
  // — the store's version bumps on every registry mutation.
  const paletteVersion = usePaletteStore((s) => s.version);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>('results');
  const [highlighted, setHighlighted] = useState<RootSearchEntry | null>(null);
  const [argValues, setArgValues] = useState<Record<string, string>>({});
  const [argErrors, setArgErrors] = useState<string[]>([]);
  const [promptValue, setPromptValue] = useState('');
  const [promptError, setPromptError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<QuickActionDef | null>(null);

  // Live file index (the FinderModal pattern): subscribe + refresh on open.
  const [fileIndex, setFileIndex] = useState(() => getProjectFileIndex());
  const activeFilePath = useFileStore((s) => s.activeFilePath);
  const root = useFileStore((s) => s.currentDir);
  useEffect(() => subscribeProjectFileIndex(setFileIndex), []);
  useEffect(() => {
    if (fileEntriesProp === undefined) void refreshProjectFileIndex(activeFilePath ?? root);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabs = useTerminalStore((s) => s.tabs);
  const activeTabId = useTerminalStore((s) => s.activeTabId);

  const copy = useCallback(
    (text: string) => {
      if (copyText) {
        copyText(text);
        return;
      }
      void navigator.clipboard?.writeText?.(text);
    },
    [copyText],
  );

  const closePalette = useCallback(() => {
    close();
    onClose();
  }, [close, onClose]);

  const openFile = useCallback(
    (path: string) => {
      markProjectFileOpened(path);
      void openFileInWorkspace(path);
      switchView('editor');
    },
    [switchView],
  );

  const switchTab = useCallback(
    (tabId: string) => {
      useTerminalStore.getState().setActiveTab(tabId);
      switchView('terminal');
    },
    [switchView],
  );

  /** Run an entry (with resolved arguments when it has any). */
  const runEntry = useCallback(
    async (entry: RootSearchEntry, ctx: CommandContext, args?: Record<string, string>) => {
      personalization.recordUse(entry.id);
      if (args !== undefined && entry.runWithArgs) {
        await entry.runWithArgs(ctx, args);
        return;
      }
      await entry.run(ctx);
    },
    [personalization],
  );

  /** The live action wiring — tab/file actions go through the existing APIs. */
  const actionDeps: QuickActionDeps = useMemo(() => {
    if (actionDepsProp) return actionDepsProp;
    return {
      copyText: copy,
      toggleFavorite: (entryId) => personalization.toggleFavorite(entryId),
      setAlias: (entryId, alias) => personalization.setAlias(entryId, alias),
      disableCommand: (commandId) => {
        extensions.setCommandEnabled(commandId, false);
      },
      runCommand: async (commandId, ctx) => {
        const def = extensions.getCommand(commandId);
        if (def) {
          if (def.arguments && def.arguments.length > 0) return;
          personalization.recordUse(commandId);
          await def.run(ctx, {});
          return;
        }
        personalization.recordUse(commandId);
        await registry.dispatch(commandId, ctx);
      },
      openFile: (path) => {
        closePalette();
        openFile(path);
      },
      revealFile: (path) => {
        void window.lucidAPI?.fs?.openInExplorer?.(path);
      },
      switchTab: (tabId) => {
        closePalette();
        switchTab(tabId);
      },
      closeTab: (tabId) => {
        useTerminalStore.getState().closeTab(tabId);
      },
      searchProject: (text) => {
        closePalette();
        useFindReplaceStore.getState().openPanel(text);
      },
      openQuicklink: (link) => {
        closePalette();
        openQuicklinkTarget(link, openFile);
      },
      deleteQuicklink: (id) => {
        quicklinks.unregister(id);
      },
      toggleQuicklinkHidden: (id) => {
        const ql = quicklinks.get(id);
        if (ql) quicklinks.setHidden(id, !ql.hiddenInRootSearch);
      },
      openSettings: () => {
        closePalette();
        switchView('settings');
      },
    };
  }, [actionDepsProp, copy, personalization, extensions, registry, quicklinks, closePalette, openFile, switchTab, switchView]);

  // The ranked entries. The file/tab rows come from the injected
  // props in tests, from the live stores in the app.
  const entries = useMemo(() => {
    const fileRows: RootSearchEntry[] =
      fileEntriesProp !== undefined
        ? buildFileEntries(
            fileEntriesProp.map((f) => f.filePath),
            '',
            (path) => actionDeps.openFile?.(path),
          )
        : collectLiveFileEntries(query, activeFilePath, (path) => actionDeps.openFile?.(path));
    const tabRows: RootSearchEntry[] =
      tabEntriesProp !== undefined
        ? buildTabEntries(
            tabEntriesProp.map((t) => ({ id: t.tabId, title: t.title, cwd: t.subtitle, isActive: t.tabId === activeTabId })),
            (tabId) => actionDeps.switchTab?.(tabId),
          )
        : buildTabEntries(tabs, (tabId) => actionDeps.switchTab?.(tabId));
    const sources = {
      commands: [
        ...registryCommandEntries(registry, context),
        ...extensionCommandEntries(extensions),
      ],
      quicklinks: quicklinkEntries(quicklinks, (link) => actionDeps.openQuicklink?.(link)),
      files: fileRows,
      tabs: tabRows,
      settings: settingsEntries((view) => switchView(view)),
    };
    return buildRootSearchEntries(sources, query, personalization, { copyText: copy });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, registry, extensions, quicklinks, personalization, paletteVersion, fileIndex, tabs, activeTabId, context, fileEntriesProp, tabEntriesProp, copy, actionDeps, switchView, activeFilePath]);

  // Keep the highlight inside the ranked list.
  useEffect(() => {
    if (highlighted && !entries.some((e) => e.id === highlighted.id)) {
      setHighlighted(entries[0] ?? null);
    } else if (!highlighted && entries.length > 0) {
      setHighlighted(entries[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  const highlightedActions = useMemo(() => {
    if (!highlighted) return [];
    return getQuickActions(selectionForEntry(highlighted, personalization), context, actionDeps);
  }, [highlighted, personalization, context, actionDeps]);

  const openArguments = useCallback(
    (entry: RootSearchEntry) => {
      const args = entry.arguments ?? [];
      const initial: Record<string, string> = {};
      // Alias + space prefills the fields (Raycast): the tail
      // after the alias is split into argument values.
      const alias = personalization.getAlias(entry.id);
      if (alias) {
        const lower = query.trim().toLowerCase();
        if (lower.startsWith(alias + ' ')) {
          const tail = query.trim().slice(alias.length + 1);
          const parts = splitArgumentInput(tail);
          args.forEach((arg, i) => {
            if (parts[i] !== undefined) initial[arg.name] = parts[i];
          });
        }
      }
      setArgValues(initial);
      setArgErrors([]);
      setMode('arguments');
    },
    [personalization, query],
  );

  const selectEntry = useCallback(
    (entry: RootSearchEntry) => {
      if (entry.arguments && entry.arguments.length > 0) {
        setHighlighted(entry);
        openArguments(entry);
        return;
      }
      closePalette();
      void runEntry(entry, context);
    },
    [closePalette, runEntry, context, openArguments],
  );

  const submitArguments = useCallback(async () => {
    if (!highlighted || !highlighted.arguments) return;
    const def = {
      id: highlighted.commandId ?? highlighted.id,
      title: highlighted.title,
      mode: highlighted.mode ?? 'no-view',
      arguments: highlighted.arguments,
      run: () => {},
    };
    const { values, errors } = resolveArguments(def, argValues);
    if (errors.length > 0) {
      setArgErrors(errors);
      return;
    }
    const entry = highlighted;
    closePalette();
    await runEntry(entry, context, values);
  }, [highlighted, argValues, closePalette, runEntry, context]);

  const runAction = useCallback(
    async (action: QuickActionDef, input?: string) => {
      if (!highlighted) return;
      if (action.prompt && input === undefined) {
        setActiveAction(action);
        setPromptValue(action.prompt.initialValue ?? '');
        setPromptError(null);
        setMode('prompt');
        return;
      }
      const selection = selectionForEntry(highlighted, personalization);
      const result = await action.run(selection, context, input);
      if (typeof result === 'string' && result !== '') {
        // A prompt validation error — stay open and show it.
        setPromptError(result);
        return;
      }
      closePalette();
    },
    [highlighted, personalization, context, closePalette],
  );

  const argFieldRefs = useRef<(HTMLInputElement | HTMLSelectElement | null)[]>([]);
  const focusArgField = useCallback((index: number) => {
    argFieldRefs.current[index]?.focus();
  }, []);

  if (mode === 'arguments' && highlighted?.arguments) {
    const args: PaletteArgumentDef[] = highlighted.arguments;
    return (
      <div
        data-testid="palette-arguments"
        className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm pt-[15vh]"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setMode('results');
        }}
      >
        <div className="w-[560px] max-w-[90vw] rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl overflow-hidden">
          <div className="px-4 py-3 text-sm text-[var(--text-primary)] border-b border-[var(--border)]">
            {highlighted.title}
          </div>
          <div className="px-4 py-3 flex flex-col gap-2">
            {args.map((arg, i) => (
              <div key={arg.name}>
                {arg.type === 'dropdown' ? (
                  <select
                    ref={(el) => {
                      argFieldRefs.current[i] = el;
                    }}
                    data-testid={`palette-arg-${arg.name}`}
                    aria-label={arg.placeholder ?? arg.name}
                    value={argValues[arg.name] ?? ''}
                    onChange={(e) => setArgValues((v) => ({ ...v, [arg.name]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void submitArguments();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setMode('results');
                      } else if (e.key === 'ArrowLeft' && i > 0) {
                        e.preventDefault();
                        focusArgField(i - 1);
                      } else if (e.key === 'ArrowRight' && i < args.length - 1) {
                        e.preventDefault();
                        focusArgField(i + 1);
                      }
                    }}
                    className="w-full px-3 py-2 bg-transparent text-sm text-[var(--text-primary)] border border-[var(--border)] rounded focus:outline-none"
                  >
                    <option value="">{arg.placeholder ?? arg.name}</option>
                    {(arg.data ?? []).map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    ref={(el) => {
                      argFieldRefs.current[i] = el;
                    }}
                    data-testid={`palette-arg-${arg.name}`}
                    type={arg.type === 'password' ? 'password' : 'text'}
                    placeholder={arg.placeholder ?? arg.name}
                    value={argValues[arg.name] ?? ''}
                    autoFocus={i === 0}
                    onChange={(e) => setArgValues((v) => ({ ...v, [arg.name]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void submitArguments();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setMode('results');
                      } else if (e.key === 'ArrowLeft' && i > 0) {
                        e.preventDefault();
                        focusArgField(i - 1);
                      } else if (e.key === 'ArrowRight' && i < args.length - 1) {
                        e.preventDefault();
                        focusArgField(i + 1);
                      }
                    }}
                    className="w-full px-3 py-2 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-[var(--border)] rounded focus:outline-none"
                  />
                )}
              </div>
            ))}
            {argErrors.length > 0 && (
              <div className="text-xs text-red-400">
                {argErrors.map((err) => (
                  <div key={err}>{err}</div>
                ))}
              </div>
            )}
          </div>
          <div className="px-4 py-2 text-xs text-[var(--text-muted)] border-t border-[var(--border)]">
            ← → move between fields · ↵ run{highlighted.arguments.length > 1 ? ` · ${highlighted.arguments.length} arguments` : ''} · Esc back
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'prompt' && activeAction?.prompt) {
    return (
      <div
        data-testid="palette-prompt"
        className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm pt-[15vh]"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setMode('actions');
        }}
      >
        <div className="w-[560px] max-w-[90vw] rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl overflow-hidden">
          <div className="px-4 py-3 text-sm text-[var(--text-primary)] border-b border-[var(--border)]">
            {activeAction.title}
          </div>
          <div className="px-4 py-3">
            <input
              data-testid="palette-prompt-input"
              type="text"
              placeholder={activeAction.prompt.placeholder}
              value={promptValue}
              autoFocus
              onChange={(e) => setPromptValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void runAction(activeAction, promptValue);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setMode('actions');
                }
              }}
              className="w-full px-3 py-2 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-[var(--border)] rounded focus:outline-none"
            />
            {promptError && <div className="pt-2 text-xs text-red-400">{promptError}</div>}
          </div>
          <div className="px-4 py-2 text-xs text-[var(--text-muted)] border-t border-[var(--border)]">
            ↵ confirm · Esc back
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'actions') {
    const items: FuzzyModalItem[] = highlightedActions.map((action) => ({
      id: action.id,
      label: action.title,
      detail: action.destructive ? 'Destructive' : undefined,
      filterText: action.title,
      right: action.shortcut,
      section: action.section,
    }));
    return (
      <FuzzyModal
        open
        placeholder="Search for actions…"
        items={items}
        emptyText="No actions"
        filtering
        onSelect={(item) => {
          const action = highlightedActions.find((a) => a.id === item.id);
          if (action) void runAction(action);
        }}
        onClose={() => setMode('results')}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
            setMode('results');
            return true;
          }
          return false;
        }}
      />
    );
  }

  // Results — Root Search.
  const items: FuzzyModalItem[] = entries.map((entry) => ({
    id: entry.id,
    label: entry.title,
    detail: entry.subtitle,
    filterText: entry.title,
    right: entry.right,
    section: entry.section,
  }));
  const primary = highlightedActions[0]?.title ?? 'Run';
  return (
    <FuzzyModal
      open
      placeholder="Type a command or search files, tabs, settings…"
      items={items}
      emptyText="No matches"
      filtering={false}
      maxResults={12}
      initialQuery={query}
      footer={`↵ ${primary} · ⌘K actions`}
      onQueryChange={setQuery}
      onHighlightChange={(item) => {
        setHighlighted(item ? (entries.find((e) => e.id === item.id) ?? null) : null);
      }}
      onSelect={(item) => {
        const entry = entries.find((e) => e.id === item.id);
        if (entry) selectEntry(entry);
      }}
      onClose={closePalette}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
          if (highlighted) {
            setMode('actions');
            return true;
          }
        }
        return false;
      }}
    />
  );
}
