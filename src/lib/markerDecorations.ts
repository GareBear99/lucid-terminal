/**
 * The marker + decoration API (Atom steal #4 — 2026-11-14).
 *
 * Atom's contract (`atom/src/text-editor.js:2715-2815,2925-2960`,
 * MIT): every annotation is a *marker* (a range that tracks its
 * logical position as the buffer changes) plus a *decoration* (a
 * visual rendering of that marker). Plugins never touch the DOM;
 * they call `editor.markBufferRange(range, {invalidate})` then
 * `editor.decorateMarker(marker, {type, class, …})`. Markers live
 * in named layers with a 5-step invalidation ladder:
 * `never` → `surround` → `overlap` (default) → `inside` →
 * `touch`.
 *
 * This module is that API over Monaco. Monaco decorations
 * already track edits; the ladder is emulated on content
 * change — a change that invalidates a marker (per the ladder)
 * drops its decoration, and the layer reports it. The mapping
 * from decoration type to Monaco options is the pure part,
 * unit-tested on its own; the layer itself takes a minimal
 * editor interface so tests run without Monaco.
 *
 * Decoration types implemented here: `line`, `line-number`,
 * `gutter`, `text`, `highlight`. Atom's `overlay` and `block`
 * types are not implemented (they need content widgets / view
 * zones — a later slice, not this one) and the API says so
 * rather than silently dropping them.
 */

export type DecorationType =
  | 'line'
  | 'line-number'
  | 'gutter'
  | 'text'
  | 'highlight';

/** Atom's 5-step invalidation ladder (default `overlap`). */
export type MarkerInvalidate =
  | 'never'
  | 'surround'
  | 'overlap'
  | 'inside'
  | 'touch';

/** A 1-based Monaco-style range (end exclusive, like Monaco). */
export interface MarkerRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

/** One model content change, in the same coordinates. */
export interface ModelChange {
  range: MarkerRange;
  /** The text that replaced the range ('' for a pure deletion). */
  text: string;
}

export interface DecorationOptions {
  type: DecorationType;
  /** The CSS class rendered for the decoration. */
  className: string;
  /** Hover text for the decoration (gutter + line-number only). */
  hoverMessage?: string;
}

/** The Monaco decoration options one decoration type maps to. */
export interface MonacoDecorationOptions {
  isWholeLine?: boolean;
  className?: string;
  inlineClassName?: string;
  linesDecorationsClassName?: string;
  glyphMarginClassName?: string;
  glyphMarginHoverMessage?: { value: string } | undefined;
  stickiness?: number;
}

/** Monaco's TrackedRangeStickiness values (kept as numbers so
 *  this module never imports monaco). */
export const STICKINESS = {
  NeverGrowsWhenTypingAtEdges: 0,
  AlwaysGrowsWhenTypingAtEdges: 1,
  GrowsOnlyWhenTypingBefore: 2,
  GrowsOnlyWhenTypingAfter: 3,
} as const;

/**
 * Map a decoration type + class onto Monaco decoration options
 * — the rendering half of the API. `stickiness` is the caller's
 * invalidation mapping (see `invalidateToStickiness`).
 */
export function decorationToMonacoOptions(
  decoration: DecorationOptions,
  stickiness?: number,
): MonacoDecorationOptions {
  const options: MonacoDecorationOptions = {};
  if (stickiness !== undefined) options.stickiness = stickiness;
  switch (decoration.type) {
    case 'line':
      options.isWholeLine = true;
      options.className = decoration.className;
      break;
    case 'line-number':
      options.linesDecorationsClassName = decoration.className;
      break;
    case 'gutter':
      options.glyphMarginClassName = decoration.className;
      if (decoration.hoverMessage !== undefined) {
        options.glyphMarginHoverMessage = { value: decoration.hoverMessage };
      }
      break;
    case 'text':
      options.inlineClassName = decoration.className;
      break;
    case 'highlight':
      options.className = decoration.className;
      break;
  }
  return options;
}

/**
 * The ladder, as a stickiness hint for Monaco: a marker that
 * must never be invalidated stays put at its edges; one that
 * invalidates on any touch grows with the edit so the layer's
 * change check can see the overlap. The real invalidation is
 * `doesChangeInvalidate` below — stickiness only keeps the
 * decoration's tracking honest.
 */
export function invalidateToStickiness(invalidate: MarkerInvalidate): number {
  switch (invalidate) {
    case 'never':
      return STICKINESS.NeverGrowsWhenTypingAtEdges;
    case 'surround':
      return STICKINESS.GrowsOnlyWhenTypingBefore;
    case 'overlap':
      return STICKINESS.AlwaysGrowsWhenTypingAtEdges;
    case 'inside':
      return STICKINESS.GrowsOnlyWhenTypingAfter;
    case 'touch':
      return STICKINESS.AlwaysGrowsWhenTypingAtEdges;
  }
}

function comparePositions(
  a: { lineNumber: number; column: number },
  b: { lineNumber: number; column: number },
): number {
  if (a.lineNumber !== b.lineNumber) return a.lineNumber - b.lineNumber;
  return a.column - b.column;
}

function rangeStart(range: MarkerRange) {
  return { lineNumber: range.startLineNumber, column: range.startColumn };
}

function rangeEnd(range: MarkerRange) {
  return { lineNumber: range.endLineNumber, column: range.endColumn };
}

/**
 * Does this change invalidate a marker with this ladder step?
 * The ladder, in order of how much of the marker the change
 * must touch before the marker is dropped:
 * - `never`: nothing invalidates it.
 * - `surround`: only a change that covers the whole marker.
 * - `overlap`: any change that overlaps the marker at all.
 * - `inside`: a change fully inside the marker (or overlapping
 *   — an overlap that is not fully inside is a surround, which
 *   also invalidates at this step and above).
 * - `touch`: any change that overlaps or touches an edge.
 * A pure insertion at an edge counts as a touch, not an overlap.
 */
export function doesChangeInvalidate(
  invalidate: MarkerInvalidate,
  marker: MarkerRange,
  change: MarkerRange,
): boolean {
  if (invalidate === 'never') return false;
  const mStart = rangeStart(marker);
  const mEnd = rangeEnd(marker);
  const cStart = rangeStart(change);
  const cEnd = rangeEnd(change);
  const changeIsEmpty =
    comparePositions(cStart, cEnd) === 0;
  const changeStartsBeforeMarker = comparePositions(cStart, mStart) < 0;
  const changeEndsAfterMarker = comparePositions(cEnd, mEnd) > 0;
  const changeStartsInsideOrAtEnd =
    comparePositions(cStart, mStart) >= 0 &&
    comparePositions(cStart, mEnd) <= 0;
  const changeEndsInsideOrAtStart =
    comparePositions(cEnd, mStart) >= 0 &&
    comparePositions(cEnd, mEnd) <= 0;
  const overlaps =
    (changeStartsInsideOrAtEnd && !changeIsEmpty) ||
    (changeEndsInsideOrAtStart && !changeIsEmpty) ||
    (changeStartsBeforeMarker && changeEndsAfterMarker);
  const surrounds = changeStartsBeforeMarker && changeEndsAfterMarker;
  // A change fully inside the marker invalidates at this step —
  // including a pure insertion strictly inside it (an empty
  // change never overlaps, so this is the one case `inside`
  // adds over `overlap`). An insertion exactly at an edge is a
  // `touch`, not an `inside`.
  const inside =
    (!changeIsEmpty &&
      comparePositions(cStart, mStart) >= 0 &&
      comparePositions(cEnd, mEnd) <= 0) ||
    (changeIsEmpty &&
      comparePositions(cStart, mStart) > 0 &&
      comparePositions(cEnd, mEnd) < 0);
  const touches =
    comparePositions(cEnd, mStart) === 0 ||
    comparePositions(cStart, mEnd) === 0;

  switch (invalidate) {
    case 'surround':
      return surrounds;
    case 'overlap':
      return overlaps || surrounds;
    case 'inside':
      return inside || overlaps || surrounds;
    case 'touch':
      return overlaps || surrounds || touches;
    default:
      return false;
  }
}

/** The minimal editor surface the layer needs (Monaco's
 *  `IStandaloneCodeEditor` subset, so tests can stub it).
 *  NOTE: monaco-editor 0.57's EditorDecorationsCollection has
 *  NO dispose method (set/clear/append/has only) — the
 *  collection is GC'd with the editor, so the layer clears it
 *  on dispose instead. The old interface declared a dispose
 *  here and MarkerLayer.dispose() called it, which crashed
 *  the live app on Editor unmount (2026-11-14). */
export interface MarkerEditor {
  createDecorationsCollection: (
    decorations?: Array<{
      range: MarkerRange;
      options: MonacoDecorationOptions;
    }>,
  ) => {
    set: (
      decorations: Array<{
        range: MarkerRange;
        options: MonacoDecorationOptions;
      }>,
    ) => void;
    clear: () => void;
  };
  onDidChangeModelContent: (
    listener: (changes: ModelChange[]) => void,
  ) => { dispose: () => void };
}

export interface Marker {
  id: number;
  range: MarkerRange;
  invalidate: MarkerInvalidate;
  decoration: DecorationOptions | null;
}

export interface MarkerLayerOptions {
  /** Called when a change invalidates a marker (the layer has
   *  already dropped its decoration). */
  onDidInvalidateMarker?: (marker: Marker) => void;
}

/**
 * One named layer of markers over an editor. The layer owns a
 * single Monaco decorations collection and re-sets it whenever
 * markers change — Atom's `decorateMarkerLayer` batching, in
 * Monaco's `createDecorationsCollection` shape.
 */
export class MarkerLayer {
  private readonly collection: ReturnType<MarkerEditor['createDecorationsCollection']>;
  private readonly changeDisposable: { dispose: () => void };
  private readonly markers = new Map<number, Marker>();
  private nextId = 1;
  private readonly onDidInvalidateMarker?: MarkerLayerOptions['onDidInvalidateMarker'];
  private disposed = false;

  constructor(editor: MarkerEditor, options: MarkerLayerOptions = {}) {
    this.onDidInvalidateMarker = options.onDidInvalidateMarker;
    this.collection = editor.createDecorationsCollection([]);
    this.changeDisposable = editor.onDidChangeModelContent((changes) => {
      this.handleChanges(changes);
    });
  }

  /** Mark a range — Atom's `markBufferRange`. Returns the marker. */
  markRange(
    range: MarkerRange,
    opts?: { invalidate?: MarkerInvalidate },
  ): Marker {
    const marker: Marker = {
      id: this.nextId++,
      range: { ...range },
      invalidate: opts?.invalidate ?? 'overlap',
      decoration: null,
    };
    this.markers.set(marker.id, marker);
    return marker;
  }

  /** Render a marker — Atom's `decorateMarker`. */
  decorateMarker(marker: Marker, decoration: DecorationOptions): void {
    const stored = this.markers.get(marker.id);
    if (!stored) return;
    stored.decoration = decoration;
    this.sync();
  }

  /** Render every marker on this layer at once — Atom's
   *  `decorateMarkerLayer`. Markers without a decoration are
   *  left unrendered. */
  decorateMarkerLayer(decoration: DecorationOptions): void {
    for (const marker of this.markers.values()) {
      marker.decoration = decoration;
    }
    this.sync();
  }

  /** One marker by id, or undefined. */
  getMarker(id: number): Marker | undefined {
    return this.markers.get(id);
  }

  /** Every marker on this layer, in creation order. */
  getMarkers(): Marker[] {
    return [...this.markers.values()];
  }

  /** Drop one marker (and its decoration). */
  destroyMarker(id: number): void {
    if (this.markers.delete(id)) this.sync();
  }

  /** Drop every marker on this layer. */
  clear(): void {
    this.markers.clear();
    this.sync();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.changeDisposable.dispose();
    // Monaco 0.57's EditorDecorationsCollection has no dispose()
    // — clear() drops the decorations; the collection itself is
    // GC'd with the editor. (Calling dispose() here crashed the
    // live app on Editor unmount, 2026-11-14.)
    this.collection.clear();
    this.markers.clear();
  }

  private sync(): void {
    if (this.disposed) return;
    this.collection.set(
      this.getMarkers()
        .filter((m) => m.decoration !== null)
        .map((m) => ({
          range: m.range,
          options: decorationToMonacoOptions(
            m.decoration as DecorationOptions,
            invalidateToStickiness(m.invalidate),
          ),
        })),
    );
  }

  private handleChanges(changes: ModelChange[]): void {
    let dropped = false;
    for (const change of changes) {
      for (const marker of [...this.markers.values()]) {
        if (doesChangeInvalidate(marker.invalidate, marker.range, change.range)) {
          this.markers.delete(marker.id);
          dropped = true;
          this.onDidInvalidateMarker?.(marker);
        }
      }
    }
    if (dropped) this.sync();
  }
}
