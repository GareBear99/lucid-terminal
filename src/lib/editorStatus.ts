/**
 * Editor status bar helpers (Atom steal #11 — 2026-11-14).
 *
 * Pure functions for the editor status bar: line-ending
 * detection/conversion and the grammar (language) choices.
 * No Electron, no editor — unit-tested.
 */

/** The line endings a buffer can be in. */
export type EolKind = 'LF' | 'CRLF' | 'Mixed';

/** Only the head of the buffer is scanned for endings — a full
 *  scan of a multi-megabyte file on every cursor move would be
 *  felt. 50k chars is far past the point where a mixed file
 *  shows both kinds. */
export const EOL_SCAN_LIMIT = 50000;

/**
 * Detect a buffer's line endings from its text: 'CRLF' when every
 * break is \r\n, 'LF' when every break is \n, 'Mixed' when both
 * appear. An empty buffer (or one with no breaks) is 'LF' —
 * Monaco's default.
 */
export function detectEol(text: string): EolKind {
  // A slice that ends between \r and \n would misread that
  // break as a lone \n — drop a trailing \r first.
  const sample = text.slice(0, EOL_SCAN_LIMIT).replace(/\r$/, '');
  const hasCrlf = sample.includes('\r\n');
  const hasLf = /(?:^|[^\r])\n/.test(sample);
  if (hasCrlf && hasLf) return 'Mixed';
  if (hasCrlf) return 'CRLF';
  return 'LF';
}

/** A minimal Monaco-model shape for line-ending conversion. */
export interface EolConvertibleModel {
  getValue: () => string;
  getFullModelRange: () => unknown;
  applyEdits: (edits: Array<{ range: unknown; text: string }>) => void;
  setEOL: (eol: string) => void;
}

/** Buffers over this size are not converted in one edit — the
 *  same 2 MB cap the git gutter uses to skip a buffer. */
export const EOL_CONVERT_MAX_BYTES = 2_000_000;

/**
 * Convert a whole buffer to LF or CRLF in a single edit (one
 * undo step), then set the model's EOL so new breaks follow.
 * Returns false (and changes nothing) when the buffer is over
 * the size cap. `setEOL` alone only affects new breaks — the
 * applyEdits is what converts the existing text, the way
 * Atom's line-ending selector converts the whole buffer.
 */
export function convertLineEndings(
  model: EolConvertibleModel,
  target: 'LF' | 'CRLF',
): boolean {
  const text = model.getValue();
  if (text.length > EOL_CONVERT_MAX_BYTES) return false;
  const unified = text.replace(/\r\n/g, '\n');
  const converted = target === 'LF' ? unified : unified.replace(/\n/g, '\r\n');
  model.applyEdits([{ range: model.getFullModelRange(), text: converted }]);
  model.setEOL(target === 'LF' ? '\n' : '\r\n');
  return true;
}

/**
 * The grammar choices the status bar's language tile offers —
 * the language ids CodeEditor's getLanguage maps extensions
 * to, plus Plain Text. Monaco's `setModelLanguage` is the
 * analogue of Atom's `assignGrammar`: switching re-highlights
 * the buffer without touching the file on disk.
 */
export const EDITOR_LANGUAGE_CHOICES: Array<{ id: string; label: string }> = [
  { id: 'typescript', label: 'TypeScript' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'java', label: 'Java' },
  { id: 'c', label: 'C' },
  { id: 'cpp', label: 'C++' },
  { id: 'csharp', label: 'C#' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'php', label: 'PHP' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'scss', label: 'SCSS' },
  { id: 'less', label: 'Less' },
  { id: 'json', label: 'JSON' },
  { id: 'xml', label: 'XML' },
  { id: 'yaml', label: 'YAML' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'sql', label: 'SQL' },
  { id: 'shell', label: 'Shell' },
  { id: 'plaintext', label: 'Plain Text' },
];

/** The display label for a language id, or the id itself when unknown. */
export function languageLabel(id: string | null | undefined): string {
  if (!id) return 'Plain Text';
  return EDITOR_LANGUAGE_CHOICES.find((c) => c.id === id)?.label ?? id;
}
