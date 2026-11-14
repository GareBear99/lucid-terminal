import { useRef, useEffect, useState } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import '../../lib/monacoLoader'; // Bundle Monaco locally instead of the CDN
import { ProcessingGlow } from './ProcessingGlow';
import { InputDragHandle } from '../InputDragHandle';
import {
  INPUT_DRAG_MAX_HEIGHT_VH,
  INPUT_MIN_HEIGHT_PX,
  resolveInputHeightPx,
  useDraggableInputHeight,
} from '../../lib/inputHeight';
import { useToastStore } from '../../stores/toastStore';
import { useCommandHistoryStore } from '../../stores/commandHistoryStore';
import { useFileStore } from '../../stores/fileStore';
import { useTerminalStore } from '../../stores/terminalStore';
import { registerComposerInlineCompletions, type InlineOffer } from '../../lib/composerInlineProvider';
import { getComposerStructureIdentifiers } from '../../lib/treeSitter';
import { verifyIdentifiers } from '../../lib/tsLanguageService';

// How long to wait for Monaco (bundled locally with the app) before giving
// up and rendering a plain textarea. Without this the prompt sits on
// "Loading..." forever if Monaco fails to load, and the user cannot type
// a command at all.
const MONACO_LOAD_TIMEOUT_MS = 8000;

// The default cap lives in src/lib/inputHeight.ts (INPUT_DEFAULT_HEIGHT_VH,
// one-third of the page) and the drag max there (INPUT_DRAG_MAX_HEIGHT_VH,
// half the page). The input grows upward with the content up to the
// default cap, then scrolls — and a drag handle on its top edge lets the
// user drag it taller or shorter, up to the drag max (Gary, 2026-11-05,
// c236ab3; the dragged height is a CAP, not a floor, so the input
// regresses to fit the content when it shrinks and is never stuck tall,
// 988a9a1). The drag was removed by ec33aa9 (Gary, 2026-11-07: "dont
// allow drag to extend") and is RESTORED here by Gary's 2026-11-08
// "recover it all" — that order overrides the no-drag order for this
// recovery. The squared glass backwall behind the prompt lives on the
// prompt panel in Terminal.tsx (prompt-input-wrap) — Warp-AI-terminal
// style, squared corners, in both the LuciferAI-on and flat states.

// Monaco types
declare global {
  interface Window {
    monaco: any;
  }
}


interface InputAreaProps {
    onSubmit: (command: string) => void;
    onHistoryUp: () => void;
    onHistoryDown: () => void;
    input: string;
    setInput: (value: string) => void;
    isProcessing?: boolean;
    /** Flat prompt (LuciferAI disabled): no bubble chrome — but the
     *  cursor/text padding stays (Gary, 2026-11-05): the input sits
     *  12px in from the edge in BOTH states, flat or not, so the
     *  cursor never hugs the edge. The drag handle keeps working
     *  too: resizing the input is not bubbling. The rainbow
     *  processing glow is NOT bubble chrome — it is a platform
     *  appearance trait (Gary, 2026-11-08), governed only by its
     *  own settings (processingGlowColor / Intensity / Speed), so
     *  flat does not suppress it. The squared glass backwall is
     *  the prompt panel itself (Terminal.tsx), not bubble
     *  chrome, so it shows in both states. */
    flat?: boolean;
    /** Dragged-height state lifted out of the input (DEFCON 3,
     *  Gary, 2026-11-09 — dissection gap #19): when the
     *  composer is ONE component across LuciferAI on/off, the
     *  drag state must live above it — inside InputArea it
     *  resets every time the on/off branch remounts it. The
     *  parent (Terminal) owns the hook and passes it down;
     *  when absent the input keeps its own, as before. */
    dragState?: ReturnType<typeof useDraggableInputHeight>;
    /** Show the drag-to-extend handle on the input's top edge
     *  (Gary, 2026-11-10 ~03:58 PST — "when devMode is OFF, get
     *  rid of the extend drag tab so it's clean black"): the
     *  shared prompter composer passes devMode here, so the
     *  handle is gone in non-devmode and stays in devmode.
     *  Defaults to true — every other caller keeps it. */
    showDragHandle?: boolean;
    /** DEFCON 3 Phase 3 ghost suggestion — the full suggested
     *  text (composer history or a slash-command name, computed
     *  by the parent from `computeGhostSuggestion`), or null.
     *  Rendered as faded ghost text after the input; accepted
     *  with Right-arrow (cursor at end) or Tab. Passed ONLY
     *  by the linked composer (prompterActive) — the delinked
     *  bar below level 3 gets no ghost. */
    ghostSuggestion?: string | null;
    /** True-placeholder ghost words (Gary, 2026-11-13 ~02:02 PST,
     *  Warp reference): the prompt hint words, rendered INSIDE
     *  the composer as a placeholder overlay at the caret's
     *  origin — the caret overlaps the start of the ghost text,
     *  exactly like Warp. Shown only while the input is empty;
     *  the parent gates it further (first prompt per tab, icon
     *  enabled). Null = no words. Placeholder behaviour only —
     *  the auto-detection ghost suggestion stays future. */
    hintPlaceholder?: string | null;
    /** Accept the ghost suggestion (parent sets the input to
     *  it). Called by Right-arrow / Tab when a ghost is shown. */
    onAcceptSuggestion?: () => void;
    /** DEFCON 3 Phase 3 — control keys the xterm-input gate
     *  drops (Phase 1 flag). The composer has focus, so the
     *  composer forwards them: Ctrl+C interrupts the running
     *  shell command, Ctrl+D sends EOF. Passed ONLY by the
     *  linked composer — the delinked bar never writes to the
     *  PTY. SELECTION RULE (decided): Ctrl+C copies when text
     *  is selected, interrupts only when nothing is selected —
     *  the smallest rule that does not break copy. */
    onInterrupt?: () => void;
    /** Ctrl+D (EOF) — same forwarding as onInterrupt. */
    onEof?: () => void;
    /** ⌘⏎ / Ctrl+⏎ hand-off (heavy terminal work, 2026-11-13):
     *  send the draft to a new agent conversation (Warp §7).
     *  Passed by the linked composer and the dev bar; the
     *  handler lives in Terminal (it owns the session switch). */
    onHandoff?: () => void;
    /** Esc in an agent session (heavy terminal work, 2026-11-13):
     *  back to the terminal session. Passed by the linked
     *  composer only; in a terminal session Esc belongs to the
     *  shell and is never intercepted. */
    onEscape?: () => void;
  /**
   * Which mode the composer is in, for the inline-completion
   * provider (ghost answers, steal #1 — 2026-11-14): terminal
   * mode completes from command history + slash names + open
   * files; agent mode defers to the parent's ghost (the tab's
   * own agent prompts) and the provider stays silent. Defaults
   * to 'terminal' — the delinked/dev bars and the detached
   * window are terminal input.
   */
  completionMode?: 'terminal' | 'agent';
}

export function InputArea({ onSubmit, onHistoryUp, onHistoryDown, input, setInput, isProcessing = false, flat = false, dragState, showDragHandle = true, ghostSuggestion = null, hintPlaceholder = null, onAcceptSuggestion, onInterrupt, onEof, onHandoff, onEscape, completionMode = 'terminal' }: InputAreaProps) {
  const editorRef = useRef<any>(null);
  /** The inline-completion provider's live offer (the ghost the
   *  user can accept with Tab / Right-arrow). Stashed by the
   *  provider, read by the mounted key handlers. */
  const inlineOfferRef = useRef<InlineOffer | null>(null);
  // The ghost remainder (the part after what is typed) — the
  // overlay renders this faded after the input text. Null when
  // there is no ghost, or the ghost is not a completion of the
  // current input (defensive: the parent computes it, but the
  // prop must never render stale text).
  const ghostRemainder =
    ghostSuggestion && ghostSuggestion !== input && ghostSuggestion.startsWith(input)
      ? ghostSuggestion.slice(input.length)
      : null;
  // Monaco registers its keybindings once, at mount — but the
  // ghost and the handlers change every keystroke. The ref
  // keeps the mounted handlers reading the latest values.
  // The history handlers and onSubmit ride the same ref:
  // without it the mounted Up/Down/Enter commands keep
  // calling the first render's closures — the history as it
  // was at mount (empty), so Up did nothing until a remount
  // (Gary, 2026-11-14 — the stale-closure fix).
  const latestRef = useRef({ ghostSuggestion, onSubmit, onHistoryUp, onHistoryDown, onAcceptSuggestion, onInterrupt, onEof, onHandoff, onEscape, setInput, completionMode });
  latestRef.current = { ghostSuggestion, onSubmit, onHistoryUp, onHistoryDown, onAcceptSuggestion, onInterrupt, onEof, onHandoff, onEscape, setInput, completionMode };
  // True-placeholder ghost words (Gary, 2026-11-13 ~02:02 PST):
  // the overlay shows only while the input is empty — the
  // parent also gates it on the tab's first prompt and the
  // icon. Never overlaps the ghost suggestion: that one needs
  // non-empty input (computeGhostSuggestion returns null for
  // empty input), so the two overlays are mutually exclusive.
  const showHintPlaceholder = hintPlaceholder != null && input.length === 0;

  // The ghost overlay hides while the editor is scrolled —
  // the mirror can only align with unscrolled text (the
  // textarea path syncs its scroll instead; see onScroll).
  const [ghostHiddenByScroll, setGhostHiddenByScroll] = useState(false);
  const ghostRef = useRef<HTMLDivElement>(null);
  // Content height from the editor (Monaco) or the fallback textarea;
  // the input height derives from it plus the dragged cap (below).
  const [contentHeightPx, setContentHeightPx] = useState(INPUT_MIN_HEIGHT_PX);
  const [viewportHeightPx, setViewportHeightPx] = useState(
    () => window.innerHeight,
  );
  // The drag state: the parent's when lifted (DEFCON 3 — one
  // composer across LuciferAI on/off), else this input's own.
  // The hook below always runs (rules of hooks); the lifted
  // state simply wins when provided.
  const internalDrag = useDraggableInputHeight();
  const { draggedHeightPx, isDragging, onDragHandlePointerDown, noteHeight } =
    dragState ?? internalDrag;
  // The input height: default cap 33.33vh; the dragged height is a
  // cap — the input regresses to fit the content and is never stuck
  // tall — direct pointer follow while dragging.
  const editorHeight = resolveInputHeightPx(
    contentHeightPx,
    draggedHeightPx,
    viewportHeightPx,
    isDragging,
  );
  const fallbackRef = useRef<HTMLTextAreaElement>(null);
  const editorDisposers = useRef<Array<() => void>>([]);

  // Monaco fallback: the editor is bundled locally, but if it still fails
  // to mount the prompt is stuck on "Loading..." with no way to type.
  // Fall back to a plain textarea so the terminal stays usable.
  const [monacoFailed, setMonacoFailed] = useState(false);
  const fallbackToastShown = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const fallBack = () => {
      if (cancelled || editorRef.current) return;
      setMonacoFailed(true);
      if (!fallbackToastShown.current) {
        fallbackToastShown.current = true;
        useToastStore.getState().warning(
          'Monaco editor failed to load — using plain input. Commands still work.'
        );
      }
    };
    // Fast path: the loader promise rejects when the Monaco bundle fails to load.
    loader.init().catch(fallBack);
    // Slow path: the Monaco load can hang instead of failing outright.
    const timer = setTimeout(fallBack, MONACO_LOAD_TIMEOUT_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

    // Drop the editor's size/resize listeners when the input unmounts.
    useEffect(() => {
        return () => {
            editorDisposers.current.forEach((dispose) => dispose());
        };
    }, []);

    // Keep the drag's start height current, and track viewport resizes
    // so the vh caps stay right when the window changes size.
    useEffect(() => {
        noteHeight(editorHeight);
    }, [editorHeight, noteHeight]);

    // Track viewport resizes so the vh cap stays right when the window
    // changes size.
    useEffect(() => {
        const onResize = () => setViewportHeightPx(window.innerHeight);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // Sync external input state with editor
    useEffect(() => {
        if (editorRef.current && input !== editorRef.current.getValue()) {
            editorRef.current.setValue(input);
            // Move cursor to end
            const model = editorRef.current.getModel();
            if (model) {
                editorRef.current.setPosition({
                    lineNumber: model.getLineCount(),
                    column: model.getLineMaxColumn(model.getLineCount())
                });
            }
        }
    }, [input]);

    // Plain-textarea fallback: grow with the content up to the cap,
    // then scroll - long input stays readable instead of clipping.
    // The dragged height caps how tall the input may grow; the
    // input regresses to fit the content when it shrinks.
    useEffect(() => {
        const el = fallbackRef.current;
        if (!el) return;
        el.style.height = 'auto';
        const heightPx = resolveInputHeightPx(
            el.scrollHeight,
            draggedHeightPx,
            window.innerHeight,
            isDragging,
        );
        el.style.height = `${heightPx}px`;
        noteHeight(heightPx);
    }, [input, monacoFailed, draggedHeightPx, isDragging, noteHeight]);

    // Handle Monaco Editor mount
    const handleEditorDidMount = (editor: any, monaco: any) => {
        editorRef.current = editor;
        
        // Define custom theme with glass effect
        monaco.editor.defineTheme('lucid-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: '', foreground: 'e6edf3', background: '00000000' },
                { token: 'string', foreground: '7ee787' },
                { token: 'keyword', foreground: 'ff7b72' },
                { token: 'number', foreground: '79c0ff' },
                { token: 'comment', foreground: '8b949e' },
            ],
            colors: {
                'editor.background': '#00000000', // Transparent
                'editor.foreground': '#e6edf3',
                'editorCursor.foreground': '#58a6ff',
                'editor.lineHighlightBackground': '#00000000',
                'editorLineNumber.foreground': '#6e7681',
                'editor.selectionBackground': '#58a6ff40',
                'editor.inactiveSelectionBackground': '#58a6ff20',
            }
        });
        
        // Apply theme
        monaco.editor.setTheme('lucid-dark');
        
        // Add keyboard shortcuts
        editor.addCommand(
            monaco.KeyCode.Enter,
            () => {
                const value = editor.getValue().trim();
                if (value) {
                    // Routed through latestRef (above): the mounted
                    // command calls the CURRENT submit handler.
                    latestRef.current.onSubmit(value);
                }
            }
        );
        
        editor.addCommand(
            monaco.KeyCode.UpArrow,
            () => {
                // Routed through latestRef (above): the mounted
                // command calls the CURRENT history handler.
                latestRef.current.onHistoryUp();
            }
        );
        
        editor.addCommand(
            monaco.KeyCode.DownArrow,
            () => {
                // Routed through latestRef (above): the mounted
                // command calls the CURRENT history handler.
                latestRef.current.onHistoryDown();
            }
        );
        
        // DEFCON 3 Phase 3 — the rest of the prompter (Gary,
        // 2026-11-09). Registered only when the linked composer
        // passed the handlers at mount (the prompter branch
        // remounts this input when the level changes, so the
        // mount-time props are the branch's props): the delinked
        // bar keeps Monaco's defaults untouched.
        //   Tab — accepts the ghost suggestion when one is
        // shown; otherwise SWALLOWED. Tab never goes to the
        // shell (the shell is not the input here) and never
        // inserts a tab character into the command.
        if (onAcceptSuggestion) {
            editor.addCommand(
                monaco.KeyCode.Tab,
                () => {
                    // Inline-completion offer first (Monaco-native
                    // ghost, steal #1 — 2026-11-14): the provider
                    // stashes its live offer in inlineOfferRef.
                    // It is valid while it still completes the
                    // current input — the user may have typed
                    // along it since it was offered (forward
                    // stability), so the check is the prefix rule,
                    // not an exact match. Then the parent's overlay
                    // ghost. Otherwise SWALLOWED — Tab never goes
                    // to the shell and never inserts a tab
                    // character into the command.
                    const current = editor.getValue();
                    const offer = inlineOfferRef.current;
                    if (offer && offer.text.length > current.length && offer.text.startsWith(current)) {
                        latestRef.current.setInput(offer.text);
                        return;
                    }
                    if (latestRef.current.ghostSuggestion) {
                        latestRef.current.onAcceptSuggestion?.();
                    }
                }
            );
        }
        //   Ctrl+C — the Phase 1 flag: the xterm-input gate
        // drops ALL xterm input including Ctrl+C, so the
        // composer forwards it. WinCtrl is the physical
        // Control key on every platform (CtrlCmd would be
        // Cmd on macOS — the copy chord, not interrupt).
        // Selection rule: text selected → copy wins (the
        // keybinding is ours now, so copy is re-triggered
        // explicitly); nothing selected → interrupt.
        if (onInterrupt) {
            editor.addCommand(
                monaco.KeyMod.WinCtrl | monaco.KeyCode.KeyC,
                () => {
                    const selection = editor.getSelection();
                    if (selection && !selection.isEmpty()) {
                        editor.trigger('keyboard', 'editor.action.clipboardCopyAction', null);
                        return;
                    }
                    latestRef.current.onInterrupt?.();
                }
            );
        }
        //   Ctrl+D — EOF to the PTY. Monaco's default here is
        // "add selection to next find match"; the composer
        // replaces it — there is no find in the prompt.
        if (onEof) {
            editor.addCommand(
                monaco.KeyMod.WinCtrl | monaco.KeyCode.KeyD,
                () => {
                    latestRef.current.onEof?.();
                }
            );
        }
        //   ⌘⏎ — hand-off to a new agent conversation (Warp §7).
        //   CtrlCmd is Cmd on macOS (the hand-off chord) and Ctrl
        //   elsewhere. Monaco has no default here, so the command
        //   only fires when the parent passed a handler.
        if (onHandoff) {
            editor.addCommand(
                monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                () => {
                    latestRef.current.onHandoff?.();
                }
            );
        }
        //   Esc — back to the terminal session, agent sessions
        //   only. Monaco has no default here either.
        if (onEscape) {
            editor.addCommand(
                monaco.KeyCode.Escape,
                () => {
                    latestRef.current.onEscape?.();
                }
            );
        }
        //   Right-arrow — accepts the ghost ONLY when the
        // cursor is at the end of the input. onKeyDown, not
        // addCommand: when there is no ghost (or the cursor
        // is mid-line) the key must fall through to Monaco's
        // normal cursor movement, and swallowing it would
        // break that. If preventDefault ever failed to stop
        // the movement it would still be harmless — the
        // cursor is already at the end after an accept.
        // Guarded: the real editor always has these, but a
        // stubbed editor (tests) may not — the ghost accept
        // is an enhancement, never a mount failure.
        if (typeof editor.onKeyDown === 'function') {
            const keyDownDisposable = editor.onKeyDown((e: any) => {
                if (e.keyCode !== monaco.KeyCode.RightArrow) return;
                const model = editor.getModel();
                const pos = editor.getPosition();
                if (!model || !pos) return;
                const atEnd =
                    pos.lineNumber === model.getLineCount() &&
                    pos.column === model.getLineMaxColumn(pos.lineNumber);
                if (!atEnd) return;
                // The ghost to accept: the provider's live offer
                // first (valid while it still completes the
                // current input), then the parent's overlay ghost.
                // Either way Right-arrow accepts only at the end
                // of the input.
                const current = editor.getValue();
                const offer = inlineOfferRef.current;
                if (offer && offer.text.length > current.length && offer.text.startsWith(current)) {
                    e.preventDefault();
                    latestRef.current.setInput(offer.text);
                    return;
                }
                const suggestion = latestRef.current.ghostSuggestion;
                if (!suggestion) return;
                e.preventDefault();
                latestRef.current.onAcceptSuggestion?.();
            });
            editorDisposers.current.push(() => keyDownDisposable.dispose());
        }
        // The ghost overlay mirrors unscrolled text only — hide
        // it while the editor is scrolled (the fallback
        // textarea syncs its scroll instead).
        if (typeof editor.onDidScrollChange === 'function') {
            const scrollDisposable = editor.onDidScrollChange((e: any) => {
                setGhostHiddenByScroll(e.scrollLeft > 0 || e.scrollTop > 0);
            });
            editorDisposers.current.push(() => scrollDisposable.dispose());
        }
        
        // Monaco inline completions (ghost answers, steal #1 —
        // 2026-11-14): a real ghost after the caret, computed
        // locally from history / slash names / open files. The
        // provider is the composer's inline source; the parent's
        // overlay ghost is the fallback (the plain textarea when
        // Monaco fails) — the provider stays silent while the
        // parent has a ghost, so the two never double-render.
        // Guarded: a stubbed monaco without `languages` (tests)
        // registers nothing, so the mount never fails on it.
        // Disposed on unmount with the other editor listeners.
        const disposeInlineProvider = registerComposerInlineCompletions(monaco, {
            getContext: () => {
                const terminalState = useTerminalStore.getState();
                const activeTab = terminalState.tabs.find(
                    (t) => t.id === terminalState.activeTabId,
                );
                const activeFilePath = useFileStore.getState().activeFilePath;
                return {
                    history: useCommandHistoryStore.getState().entries,
                    openFiles: useFileStore.getState().openFiles.map((f) => ({ path: f.path, name: f.name })),
                    mode: latestRef.current.completionMode,
                    parentGhost: latestRef.current.ghostSuggestion ?? null,
                    // Steal #2 - the live tree-sitter structure feeds
                    // the ghost (top-level definitions + imports of
                    // the file being edited), and the active tab's
                    // cwd lets a relative `src/com` token resolve
                    // against the open files' absolute paths.
                    // Both are best-effort: the engine may not be
                    // ready yet, and the provider degrades to
                    // history / slash / files without them.
                    cwd: activeTab?.cwd,
                    // Steal #3 — the fact-checker verifies the
                    // structure identifiers before the ghost
                    // offers them: a name the language service
                    // cannot resolve at the end of the file is
                    // dropped (a made-up name, a keyword, a
                    // primitive). The verify is synchronous once
                    // the engine is loaded, and passes the
                    // candidates through unchanged while it is
                    // not — the ghost degrades to tree-sitter,
                    // it never goes silent because the
                    // fact-checker is not up yet.
                    structureIdentifiers: activeFilePath
                        ? verifyIdentifiers(
                            activeFilePath,
                            getComposerStructureIdentifiers(activeFilePath),
                          )
                        : [],
                };
            },
            offerRef: inlineOfferRef,
        });
        editorDisposers.current.push(disposeInlineProvider);
        
        // Focus editor
        editor.focus();
        
        // Record the content height; the bubble height derives from it
        // (default cap, dragged cap, drag follow). Window
        // resizes are tracked by the viewport effect above.
        const syncHeight = () => {
            setContentHeightPx(editor.getContentHeight());
        };
        syncHeight();
        const sizeDisposable = editor.onDidContentSizeChange(syncHeight);
        editorDisposers.current.push(() => sizeDisposable.dispose());
    };

    // Plain-textarea fallback: same behaviour as the editor — Enter submits,
    // Up/Down walk command history.
    const handleFallbackKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const el = e.currentTarget;
        const hasSelection = el.selectionStart !== el.selectionEnd;
        // DEFCON 3 Phase 3 — the rest of the prompter.
        // Ctrl+C: copy wins when text is selected (the browser
        // copies — we do nothing); with nothing selected it
        // interrupts the running shell command via onInterrupt.
        // Cmd+C is the platform copy chord and never interrupts.
        if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
            if (e.ctrlKey && !e.metaKey && !hasSelection && onInterrupt) {
                e.preventDefault();
                onInterrupt();
            }
            return;
        }
        // Ctrl+D: EOF to the PTY via onEof.
        if (e.ctrlKey && !e.metaKey && (e.key === 'd' || e.key === 'D')) {
            e.preventDefault();
            onEof?.();
            return;
        }
        // ⌘⏎ / Ctrl+⏎: hand-off to a new agent conversation.
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            onHandoff?.();
            return;
        }
        // Esc: agent mode flips back to terminal; terminal mode
        // cancels the history walk (Gary, 2026-11-14). The parent
        // passes onEscape in both modes now.
        if (e.key === 'Escape' && onEscape) {
            e.preventDefault();
            onEscape();
            return;
        }
        // Tab: accepts the ghost suggestion when one is shown;
        // otherwise SWALLOWED — never the shell, never a tab
        // character in the command.
        if (e.key === 'Tab') {
            e.preventDefault();
            if (ghostRemainder !== null) onAcceptSuggestion?.();
            return;
        }
        // Right-arrow: accepts the ghost only with the cursor
        // at the end of the input; anywhere else it is normal
        // cursor movement (no preventDefault).
        if (e.key === 'ArrowRight') {
            if (ghostRemainder !== null && !hasSelection && el.selectionStart === input.length) {
                e.preventDefault();
                onAcceptSuggestion?.();
            }
            return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const value = input.trim();
            if (value) {
                onSubmit(value);
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            onHistoryUp();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            onHistoryDown();
        }
    };

    return (
        // Prompt shape (Gary, 2026-11-08): when LuciferAI is ON,
        // the squared bottom-drop section (rounded-none). When it
        // is OFF, the ORIGINAL Lucid terminal prompt (pre-ec33aa9,
        // 4d8ef4e) — flat, bare: no rounding, no box — BUT with the
        // 12px side padding back (Gary, 2026-11-05 + 2026-11-08
        // "recover it all"): the cursor/text sits 12px in from the
        // edge in BOTH states, so it never hugs the bubble edge.
        // The rainbow glow inherits this (it is a platform trait
        // and still shows, flat or not).
        <div className={flat ? 'w-full h-auto min-h-[40px] flex items-center relative px-3' : 'w-full h-auto min-h-[40px] flex items-center relative rounded-none px-3'}>
            {/* Rainbow swirl processing glow — a platform appearance
                trait, not a LuciferAI trait (Gary, 2026-11-08): it
                shows while a command is processing in ALL modes,
                flat or not, devmode or not. Governed only by its
                own appearance settings. Processing-only, not
                always-on. */}
            <ProcessingGlow isProcessing={isProcessing} />
            {/* Drag handle on the input's top edge: drag up to grow,
                down to shrink, up to half the page (Gary, 2026-11-08:
                "recover it all" — restored from c236ab3). Gone when
                showDragHandle is false (Gary, 2026-11-10: no extend
                drag tab in non-devmode — clean black). */}
            {showDragHandle && (
            <InputDragHandle
                isDragging={isDragging}
                onDragHandlePointerDown={onDragHandlePointerDown}
            />
            )}
            
            {/* Ghost suggestion (DEFCON 3 Phase 3): a faded
                mirror of the input text with the suggestion's
                remainder after it — same font, size, line
                height and top padding as the editor/textarea,
                so the remainder sits exactly where the typed
                text would continue. pointer-events-none: it
                never blocks typing or clicks. Theme vars only
                (text-muted at 60% opacity). Single-line only
                — the suggestion is null for multi-line input,
                and the overlay hides while Monaco is scrolled
                (the textarea syncs its scroll instead). */}
            {monacoFailed ? (
                <textarea
                    ref={fallbackRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleFallbackKeyDown}
                    onScroll={(e) => {
                        const g = ghostRef.current;
                        if (g) g.scrollLeft = e.currentTarget.scrollLeft;
                    }}
                    rows={1}
                    wrap="off"
                    autoFocus
                    placeholder={showHintPlaceholder ? '' : 'Type a command… (plain input — Monaco unavailable)'}
                    title="Monaco editor unavailable — using plain input"
                    className="w-full bg-transparent text-[var(--text-primary)] font-mono text-[13px] leading-5 px-0 py-[10px] outline-none resize-none overflow-y-auto overflow-x-auto whitespace-nowrap"
                    style={{ fontFamily: "'JetBrains Mono', 'SF Mono', 'Monaco', 'Menlo', monospace", maxHeight: `${INPUT_DRAG_MAX_HEIGHT_VH}vh` }}
                />
            ) : (
            <Editor
                height={editorHeight}
                language="shell"
                theme="lucid-dark"
                value={input || ''}
                onChange={(val) => setInput(val || '')}
                onMount={handleEditorDidMount}
                loading={<div className="text-[var(--text-muted)] text-sm">Loading...</div>}
                options={{
                    minimap: { enabled: false },
                    lineNumbers: 'off',
                    glyphMargin: false,
                    folding: false,
                    lineDecorationsWidth: 0,
                    lineNumbersMinChars: 0,
                    scrollbar: {
                        vertical: 'auto',
                        horizontal: 'auto',
                        handleMouseWheel: true
                    },
                    scrollBeyondLastLine: false,
                    // Long text scrolls RIGHT (Gary, 2026-11-08): no wrap,
                    // horizontal scroll on — typing past the edge scrolls
                    // the line right so the cursor stays visible, instead
                    // of the line wrapping (and growing the bar tall).
                    wordWrap: 'off',
                    wrappingIndent: 'none',
                    automaticLayout: true,
                    quickSuggestions: false,
                    suggestOnTriggerCharacters: false,
                    acceptSuggestionOnEnter: 'off',
                    tabCompletion: 'off',
                    wordBasedSuggestions: 'off',
                    // Monaco inline completions (ghost answers,
                    // steal #1): the provider registered at mount
                    // offers the ghost and the editor renders it
                    // after the caret. prefix mode: the ghost
                    // only shows when the typed text is a prefix
                    // of the suggestion. No toolbar in a one-line
                    // prompt; the suggest widget stays off
                    // (quickSuggestions false above).
                    inlineSuggest: {
                        enabled: true,
                        mode: 'prefix',
                        showToolbar: 'never',
                        suppressSuggestions: true,
                        minShowDelay: 0,
                    },
                    contextmenu: false,
                    renderLineHighlight: 'none',
                    overviewRulerLanes: 0,
                    hideCursorInOverviewRuler: true,
                    overviewRulerBorder: false,
                    fontFamily: "'JetBrains Mono', 'SF Mono', 'Monaco', 'Menlo', monospace",
                    fontSize: 13,
                    fontWeight: '400',
                    lineHeight: 20,
                    letterSpacing: 0,
                    padding: { top: 10, bottom: 10 },
                    renderWhitespace: 'none',
                    renderControlCharacters: false,
                    matchBrackets: 'never',
                    fontLigatures: false,
                }}
            />
            )}
            {ghostRemainder !== null && !ghostHiddenByScroll && (
                <div
                    ref={ghostRef}
                    data-testid="composer-ghost-suggestion"
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-3 right-3 z-10 overflow-hidden whitespace-pre py-[10px] font-mono text-[13px] leading-5"
                    style={{ fontFamily: "'JetBrains Mono', 'SF Mono', 'Monaco', 'Menlo', monospace" }}
                >
                    <span style={{ visibility: 'hidden' }}>{input}</span>
                    <span className="text-[var(--text-muted)] opacity-60">{ghostRemainder}</span>
                </div>
            )}
            {showHintPlaceholder && (
                <div
                    data-testid="composer-hint-placeholder"
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-3 right-3 z-10 overflow-hidden whitespace-pre py-[10px] font-mono text-[13px] leading-5"
                    style={{ fontFamily: "'JetBrains Mono', 'SF Mono', 'Monaco', 'Menlo', monospace" }}
                >
                    <span className="text-[var(--text-muted)] opacity-80">{hintPlaceholder}</span>
                </div>
            )}
        </div>
    );
}
