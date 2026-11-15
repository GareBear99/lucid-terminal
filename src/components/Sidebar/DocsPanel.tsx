/**
 * The docs panel (Kite mapping #4 — the sidebar pattern —
 * 2026-11-14).
 *
 * Kite's sidebar is a TS/React app (`kiteco-public/sidebar/`)
 * whose pattern that matters is a panel showing
 * documentation for the symbol under the cursor, fetched
 * from the engine: `loadDocs(language, identifier)` →
 * `SHOW_DOCS` with the fetched data, `LOAD_DOCS_FAILED` on
 * failure (`src/actions/docs.js`). The panel is a READER of
 * the engine, like Kite's: it never writes to the file, never
 * touches the stores directly — it receives what the client
 * returns for the cursor's symbol.
 *
 * Lucid's version lands in the Sidebar's panel system (a
 * `SidebarPanel` value alongside `'explorer' | 'history'`,
 * per the files-copilot design §2.4) and reads from the
 * engine client (`src/lib/engineClient.ts` — the same
 * `getHover` / symbol-report calls Kite's sidebar uses,
 * composed as `getSymbolReport`). The cursor comes from the
 * docs-cursor bus (`src/lib/docsCursor.ts`): the editor
 * publishes it, this panel subscribes. The Redux code is
 * NOT carried over — Lucid's stores are Zustand, and the
 * panel takes the client as a prop (defaulting to the
 * shared one) so tests can pass a stub.
 *
 * The round trip, in Lucid's form: cursor moves → the panel
 * asks the client for the symbol report → docs render, or
 * the empty state renders. Failure is silent, Kite's way:
 * an engine that is down shows "still loading", a symbol
 * with no docs shows "no documentation" — never an error
 * in the user's face.
 *
 * Known limits, stated here:
 *   - The panel refreshes on cursor moves (and when the
 *     engine becomes ready). An edit that changes a
 *     symbol's docs without moving the cursor leaves the
 *     shown docs stale until the next cursor move.
 *   - Definition and reference locations are jump targets:
 *     clicking one opens the file at the line in the
 *     editor (the open-file funnel + the editor-jump bus,
 *     the same route go-to-symbol uses). A location that
 *     cannot resolve to a file on disk stays plain text.
 *   - Non-TS/JS files have no engine document, so the
 *     panel shows "no documentation" for them.
 *   - In a detached window there is no editor view to land
 *     in: the click still opens the file in that window's
 *     file store and requests the jump, but the jump stays
 *     pending there — the Sidebar (main window) passes
 *     onJumpToEditor, MiniTerminal does not.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  getDocsCursor,
  subscribeDocsCursor,
  type DocsCursor,
} from '../../lib/docsCursor';
import { requestEditorJump } from '../../lib/editorJump';
import {
  getEngineClient,
  type EngineClient,
  type SymbolReport,
} from '../../lib/engineClient';
import {
  openFileInWorkspace,
  type OpenFileResult,
} from '../../lib/workspace';
import type { LspLocation } from '../../lib/tsLspContract';

/** Split the hover markdown (steal #3's shape — a fenced
 *  code block with the display, then the JSDoc) into the
 *  signature and the prose. A hover with no fence is all
 *  prose. */
export function splitHoverMarkdown(contents: string): {
  signature: string | null;
  prose: string;
} {
  const fence = contents.match(/^```[^\n]*\n([\s\S]*?)\n```(?:\n\n([\s\S]*))?$/);
  if (!fence) return { signature: null, prose: contents.trim() };
  return {
    signature: fence[1]?.trim() ? fence[1].trim() : null,
    prose: (fence[2] ?? '').trim(),
  };
}

/** A location as `basename:line` (1-based, the editor's
 *  numbering — the LSP range is 0-based). */
function locationLabel(uri: string, line0: number): string {
  const base = uri.split('/').pop() ?? uri;
  return `${base}:${line0 + 1}`;
}

/** A location's file path, or null when it cannot resolve
 *  to a file on disk. The in-process engine returns plain
 *  paths (`tsLanguageService.toLocations` uses the TS
 *  `fileName` as-is); a real LSP transport returns
 *  `file://` URIs, percent-encoded. Anything else — empty,
 *  a non-file scheme (`untitled:`, …), a relative path —
 *  is unresolvable and stays plain text, never a dead link.
 *  (The hover `Def` link in CodeEditor strips `file://`
 *  inline; this is the same normalisation, with the decode
 *  the inline copy lacks.) */
export function resolveLocationPath(uri: string): string | null {
  if (!uri) return null;
  let path = uri;
  if (path.startsWith('file://')) {
    path = path.slice('file://'.length);
    try {
      path = decodeURIComponent(path);
    } catch {
      return null;
    }
  }
  if (!path.startsWith('/')) return null;
  return path;
}

/** One definition/reference location: a jump target when
 *  it resolves, plain text when it does not. The label is
 *  identical either way — only the affordance changes. */
function LocationLink({
  loc,
  onJump,
}: {
  loc: LspLocation;
  onJump: (loc: LspLocation) => void;
}) {
  const label = locationLabel(loc.uri, loc.range.start.line);
  if (!resolveLocationPath(loc.uri)) {
    return (
      <span
        title={loc.uri}
        className="font-mono text-xs text-[var(--text-primary)] break-words"
      >
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      title={loc.uri}
      onClick={() => void onJump(loc)}
      className="cursor-pointer break-words bg-transparent p-0 text-left font-mono text-xs text-[var(--text-primary)] hover:underline"
    >
      {label}
    </button>
  );
}

/** The panel body. The header ("Docs" + minimize) lives in
 *  the Sidebar, like the Explorer's. */
export function DocsPanel({
  client = getEngineClient(),
  onJumpToEditor,
  openFile = openFileInWorkspace,
}: {
  client?: EngineClient;
  /** Switch to the editor view after a jump. The Sidebar
   *  passes its onViewChange('editor'); a surface with no
   *  editor view (MiniTerminal) passes nothing, and the
   *  jump stays pending in that window's bus. */
  onJumpToEditor?: () => void;
  /** The open-file funnel (openFileInWorkspace); a test
   *  passes a stub — the same prop pattern as `client`. */
  openFile?: (
    path: string,
  ) => Promise<{ result: OpenFileResult; path: string } | null>;
}) {
  const [cursor, setCursor] = useState<DocsCursor | null>(() => getDocsCursor());
  useEffect(
    () =>
      // A fresh object per publish, even when the bus
      // force-republishes the same cursor (the engine just
      // became ready) — React bails out on an identical
      // reference, and the panel would keep showing the
      // "still loading" state.
      subscribeDocsCursor((c) => setCursor(c ? { ...c } : null)),
    [],
  );

  const engineReady = client.isReady();
  const report = useMemo<SymbolReport | null>(() => {
    if (!cursor || !cursor.word || !engineReady) return null;
    return client.getSymbolReport(
      cursor.path,
      { line: cursor.lineNumber - 1, character: cursor.column - 1 },
      cursor.word,
    );
  }, [cursor, engineReady, client]);

  /** Click-to-jump (Kite follow-on #1): open the location's
   *  file through the open-file funnel, switch to the
   *  editor, and request the jump at the location's start
   *  (LSP 0-based → editor 1-based). A failed open stops
   *  here — no view switch, no jump, never an error — the
   *  same rule the Explorer's file click follows. */
  const jumpToLocation = async (loc: LspLocation): Promise<void> => {
    const path = resolveLocationPath(loc.uri);
    if (!path) return;
    const opened = await openFile(path);
    if (!opened) return;
    onJumpToEditor?.();
    requestEditorJump({
      path,
      lineNumber: loc.range.start.line + 1,
      column: loc.range.start.character + 1,
    });
  };

  if (!cursor) {
    return (
      <div aria-label="Docs panel" className="p-3 text-sm text-[var(--text-muted)]">
        Open a file and place the cursor on a symbol to see its documentation.
      </div>
    );
  }
  if (!cursor.word) {
    return (
      <div aria-label="Docs panel" className="p-3 text-sm text-[var(--text-muted)]">
        No symbol under the cursor.
      </div>
    );
  }
  if (!engineReady) {
    return (
      <div aria-label="Docs panel" className="p-3 text-sm text-[var(--text-muted)]">
        The language service is still loading — docs will appear when it is
        ready.
      </div>
    );
  }
  if (!report) {
    return (
      <div aria-label="Docs panel" className="p-3 text-sm text-[var(--text-muted)]">
        No documentation for{' '}
        <code className="font-mono text-[var(--text-primary)]">{cursor.word}</code>.
      </div>
    );
  }

  const { signature, prose } = report.hover
    ? splitHoverMarkdown(report.hover.contents)
    : { signature: null, prose: '' };
  const references = report.references ?? [];
  const shownReferences = references.slice(0, 5);

  return (
    <div aria-label="Docs panel" className="flex flex-col gap-3 p-3">
      {/* The symbol the report is about. */}
      <div className="font-mono text-sm text-[var(--text-primary)] break-words">
        {report.identifier}
      </div>

      {/* The signature — the fenced block from the hover. */}
      {signature && (
        <pre className="whitespace-pre-wrap break-words rounded-md bg-[var(--bg-secondary)] p-2 font-mono text-xs text-[var(--text-primary)]">
          {signature}
        </pre>
      )}

      {/* The JSDoc prose below the signature. */}
      {prose &&
        prose.split(/\n\n+/).map((paragraph, i) => (
          <p key={i} className="text-sm text-[var(--text-primary)] whitespace-pre-wrap break-words">
            {paragraph}
          </p>
        ))}

      {/* Where the symbol is defined. */}
      {report.definition.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Defined in
          </span>
          {report.definition.map((loc, i) => (
            <LocationLink key={i} loc={loc} onJump={jumpToLocation} />
          ))}
        </div>
      )}

      {/* Every use of the symbol, capped at five. */}
      {references.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            References ({references.length})
          </span>
          {shownReferences.map((loc, i) => (
            <LocationLink key={i} loc={loc} onJump={jumpToLocation} />
          ))}
          {references.length > shownReferences.length && (
            <span className="text-xs text-[var(--text-muted)]">
              +{references.length - shownReferences.length} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default DocsPanel;
