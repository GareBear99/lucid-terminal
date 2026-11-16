/**
 * Project symbol index store.
 *
 * Owns the cached index: `buildIndex` walks the warm project
 * file index, keeps TS/TSX files (the only grammars Lucid
 * has), reads each one — in-memory content for open files,
 * disk through the bridge for the rest — parses it with
 * tree-sitter, and flattens the definitions. The build is
 * capped (MAX_INDEXED_FILES files, MAX_INDEXED_FILE_BYTES per
 * file) so a huge project cannot freeze the modal; the caps
 * are reported in `indexedFiles` / `skippedFiles`.
 *
 * The index is built on demand (the modal builds it when it
 * opens with nothing cached) and rebuilt on `refresh()`. Files
 * edited after a build stay stale until the next build — the
 * modal's subtitle says when the index was built.
 */

import { create } from 'zustand';
import {
  buildProjectSymbolIndex,
  isIndexableSymbolPath,
  MAX_INDEXED_FILES,
  MAX_INDEXED_FILE_BYTES,
  type ProjectSymbol,
} from '../lib/projectSymbols';
import {
  extractDefinitions,
  type FileDefinition,
} from '../lib/fileStructure';
import {
  getLanguageForPath,
  makeStandaloneRunner,
  parseText,
} from '../lib/treeSitter';
import { getProjectFileIndex } from '../lib/projectFileIndex';
import { useFileStore } from './fileStore';

export interface ProjectSymbolsState {
  symbols: ProjectSymbol[];
  /** ms epoch of the last successful build, or null. */
  indexedAt: number | null;
  indexing: boolean;
  indexedFiles: number;
  skippedFiles: number;
  error: string | null;
  buildIndex: () => Promise<void>;
  refresh: () => Promise<void>;
  resetForTests: () => void;
}

async function parseFileContent(
  path: string,
  content: string,
): Promise<FileDefinition[]> {
  const lang = getLanguageForPath(path);
  if (!lang) return [];
  const tree = await parseText(content, lang);
  if (!tree) return [];
  try {
    const run = makeStandaloneRunner(lang);
    if (!run) return [];
    return extractDefinitions(tree.rootNode, run);
  } finally {
    tree.delete();
  }
}

export const useProjectSymbolsStore = create<ProjectSymbolsState>()(
  (set, get) => ({
    symbols: [],
    indexedAt: null,
    indexing: false,
    indexedFiles: 0,
    skippedFiles: 0,
    error: null,

    buildIndex: async () => {
      if (get().indexing) return;
      set({ indexing: true, error: null });
      try {
        const index = getProjectFileIndex();
        const openFiles = useFileStore.getState().openFiles;
        const openByPath = new Map(openFiles.map((f) => [f.path, f.content]));
        const candidates = index.files.filter(isIndexableSymbolPath);
        const entries: { path: string; definitions: FileDefinition[] }[] = [];
        let skipped = 0;
        for (const path of candidates.slice(0, MAX_INDEXED_FILES)) {
          try {
            const content =
              openByPath.get(path) ??
              (await window.lucidAPI.fs.readFile(path));
            if (content.length > MAX_INDEXED_FILE_BYTES) {
              skipped += 1;
              continue;
            }
            const definitions = await parseFileContent(path, content);
            entries.push({ path, definitions });
          } catch {
            // One unreadable / unparsable file must not kill
            // the index — skip it and keep going.
            skipped += 1;
          }
        }
        if (candidates.length > MAX_INDEXED_FILES) {
          skipped += candidates.length - MAX_INDEXED_FILES;
        }
        set({
          symbols: buildProjectSymbolIndex(entries),
          indexedAt: Date.now(),
          indexing: false,
          indexedFiles: entries.length,
          skippedFiles: skipped,
        });
      } catch (error) {
        set({
          indexing: false,
          error:
            error instanceof Error ? error.message : 'Failed to build the symbol index',
        });
      }
    },

    refresh: async () => {
      await get().buildIndex();
    },

    resetForTests: () => {
      set({
        symbols: [],
        indexedAt: null,
        indexing: false,
        indexedFiles: 0,
        skippedFiles: 0,
        error: null,
      });
    },
  }),
);
