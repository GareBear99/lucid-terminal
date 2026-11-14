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
 *   - Definition locations are shown as text (file:line),
 *     not jump targets — click-to-jump is owed, not built.
 *   - Non-TS/JS files have no engine document, so the
 *     panel shows "no documentation" for them.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  getDocsCursor,
  subscribeDocsCursor,
  type DocsCursor,
} from '../../lib/docsCursor';
import {
  getEngineClient,
  type EngineClient,
  type SymbolReport,
} from '../../lib/engineClient';

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

/** The panel body. The header ("Docs" + minimize) lives in
 *  the Sidebar, like the Explorer's. */
export function DocsPanel({ client = getEngineClient() }: { client?: EngineClient }) {
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
            <span
              key={i}
              title={loc.uri}
              className="font-mono text-xs text-[var(--text-primary)] break-words"
            >
              {locationLabel(loc.uri, loc.range.start.line)}
            </span>
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
            <span
              key={i}
              title={loc.uri}
              className="font-mono text-xs text-[var(--text-primary)] break-words"
            >
              {locationLabel(loc.uri, loc.range.start.line)}
            </span>
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
