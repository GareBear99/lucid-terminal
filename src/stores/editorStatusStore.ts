/**
 * Published editor state for the status bar (*).
 *
 * CodeEditor owns the Monaco instance and publishes what the
 * status bar shows: the cursor position, the selection size,
 * the model language, the line endings, and the line count.
 * The bar reads this store — it never touches Monaco itself —
 * so the tiles stay testable without an editor.
 *
 * Two publish paths, because the costs differ: cursor moves
 * publish the cheap position/selection (getPosition /
 * getSelection, no text read); model changes publish the
 * language/endings/line count (which need the model text,
 * scanned only up to EOL_SCAN_LIMIT). Both are debounced
 * 150 ms in CodeEditor, the diagnostics cadence.
 */
import { create } from 'zustand';
import type { EolKind } from '../lib/editorStatus';

export interface EditorStatusState {
  /** The active file's path, or null when no file is open. */
  filePath: string | null;
  /** The model language id (CodeEditor's getLanguage value), or null. */
  languageId: string | null;
  /** The buffer's line endings, or null when unknown. */
  eol: EolKind | null;
  /** 1-based cursor line. */
  lineNumber: number;
  /** 1-based cursor column. */
  column: number;
  /** Selected character count — 0 means no selection (the
   *  selection tile hides itself at 0, Atom's rule). */
  selectionCount: number;
  /** The file's line count. */
  lineCount: number;
  /** Merge a partial publish into the state. */
  publish: (partial: Partial<Omit<EditorStatusState, 'publish' | 'resetForTests'>>) => void;
  /** Test-only reset. */
  resetForTests: () => void;
}

const initialState = {
  filePath: null as string | null,
  languageId: null as string | null,
  eol: null as EolKind | null,
  lineNumber: 1,
  column: 1,
  selectionCount: 0,
  lineCount: 0,
};

export const useEditorStatusStore = create<EditorStatusState>((set) => ({
  ...initialState,
  publish: (partial) => set(partial),
  resetForTests: () => set(initialState),
}));
