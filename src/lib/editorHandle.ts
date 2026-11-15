/**
 * The active Monaco editor handle (Atom steal #11 — 2026-11-14).
 *
 * CodeEditor owns the Monaco instance; the status bar's grammar
 * and line-ending tiles need it to switch the model language
 * and convert line endings. This module-level handle is the
 * bridge — the same pattern as the docs-cursor bus and the
 * editor-jump bus: CodeEditor sets it on mount and clears it
 * on unmount, tiles read it and no-op when it is null (the
 * fallback textarea has no Monaco instance).
 *
 * The handle carries the monaco namespace too: switching a
 * language is `monaco.editor.setModelLanguage(model, id)`,
 * which lives on the namespace, not on the editor.
 */
export interface ActiveMonacoEditor {
  editor: any;
  monaco: any;
}

let active: ActiveMonacoEditor | null = null;

/** Set (or clear, with null) the active Monaco editor. */
export function setActiveMonacoEditor(next: ActiveMonacoEditor | null): void {
  active = next;
}

/** The active Monaco editor, or null when the editor is not mounted. */
export function getActiveMonacoEditor(): ActiveMonacoEditor | null {
  return active;
}

/** Test-only reset. */
export function resetActiveMonacoEditorForTests(): void {
  active = null;
}
