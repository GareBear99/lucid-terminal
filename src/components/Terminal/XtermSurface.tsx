/**
 * XtermSurface — the real terminal surface.
 *
 * Gary, 2026-11-07: "terminal is not a terminal at all." The old
 * surface was a Monaco editor feeding React state on Enter plus a
 * block list that re-parsed whole outputs — a simulated command UI.
 * This is xterm.js attached to the node-pty stream instead: the
 * shell owns echo, line editing, history, completion and job
 * control, and every keystroke reaches the PTY the moment it is
 * typed (via `onInput`). PTY output is written straight into the
 * terminal as it arrives — no completion timer, no re-parse.
 *
 * Warp-style look is preserved by what wraps this surface, not by
 * re-implementing the terminal: Terminal.tsx keeps the glass prompt
 * section (header, blood drop, Sentinel face) around it, and the
 * surface itself is transparent so the misty-black main screen
 * shows through.
 *
 * Fallback: jsdom (tests) has no canvas 2d context, so xterm
 * cannot open there. In that case a plain textarea + output pane
 * stands in, with the same `onInput` contract — per-keystroke
 * forwarding, Enter as '\r' — so tests drive the same code path
 * the real terminal takes. This is a test-only stand-in, never
 * used in the shipped app.
 */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useSettingsStore } from '../../stores/settingsStore';
import {
  DEFCON_DEFAULT,
  defconTerminalForeground,
} from '../../lib/defcon';

export interface XtermSurfaceHandle {
  /** Append PTY (or Lucid) output to the terminal. */
  write: (data: string) => void;
  /** Clear the visible screen (the shell's `clear` does this via
   *  the PTY stream itself; this is for Lucid-side clears). */
  clear: () => void;
  focus: () => void;
}

interface XtermSurfaceProps {
  /** Every keystroke / paste, forwarded to the PTY immediately. */
  onInput: (data: string) => void;
  /** The surface was fitted to a new size — resize the PTY. */
  onResize?: (cols: number, rows: number) => void;
  /** The shell has exited: stop accepting input. */
  disabled?: boolean;
}

/** xterm.js cannot open without a canvas 2d context (jsdom). */
function canvasSupported(): boolean {
  try {
    return !!document.createElement('canvas').getContext('2d');
  } catch {
    return false;
  }
}

/** Strip ANSI/OSC sequences for the plain-text fallback pane. */
function stripAnsi(data: string): string {
  return data
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\x1b[()][0-9A-B]/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

const FALLBACK_OUTPUT_CAP = 100_000;

export const XtermSurface = forwardRef<XtermSurfaceHandle, XtermSurfaceProps>(
  function XtermSurface({ onInput, onResize, disabled = false }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<XTerm | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    // DEFCON 2 whiter text (Gary, 2026-11-09 ~05:21 PST): the
    // foreground follows the level — the active theme's own
    // `terminal.brightWhite` at DEFCON 2+, the standing
    // foreground at DEFCON 1. The value comes from the theme
    // system, never a hardcoded off-palette white.
    const defconLevel = useSettingsStore(
      (s) => s.settings.defconLevel ?? DEFCON_DEFAULT,
    );
    const themeBrightWhite = useSettingsStore(
      (s) => s.currentTheme.colors.terminal.brightWhite,
    );
    const foreground = defconTerminalForeground(
      defconLevel,
      themeBrightWhite,
      '#e6edf3',
    );
    const onInputRef = useRef(onInput);
    onInputRef.current = onInput;
    const onResizeRef = useRef(onResize);
    onResizeRef.current = onResize;
    const [fallback] = useState(() => !canvasSupported());

    // --- Fallback (no canvas): plain output pane + input line. ---
    const [fallbackOutput, setFallbackOutput] = useState('');
    const [fallbackInput, setFallbackInput] = useState('');
    const fallbackPrevInput = useRef('');
    const fallbackInputRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(ref, () => ({
      write: (data: string) => {
        const term = termRef.current;
        if (term) {
          term.write(data);
          return;
        }
        if (fallback) {
          setFallbackOutput((prev) =>
            (prev + stripAnsi(data)).slice(-FALLBACK_OUTPUT_CAP),
          );
        }
      },
      clear: () => {
        const term = termRef.current;
        if (term) {
          term.clear();
          return;
        }
        if (fallback) setFallbackOutput('');
      },
      focus: () => {
        termRef.current?.focus();
        fallbackInputRef.current?.focus();
      },
    }));

    // --- Real xterm. ---
    useEffect(() => {
      if (fallback) return;
      const container = containerRef.current;
      if (!container) return;

      const term = new XTerm({
        allowTransparency: true,
        theme: {
          background: 'transparent',
          foreground,
          cursor: '#58a6ff',
          cursorAccent: '#0d1117',
          selectionBackground: 'rgba(88, 166, 255, 0.3)',
          black: '#0d1117',
          red: '#ff7b72',
          green: '#3fb950',
          yellow: '#d29922',
          blue: '#58a6ff',
          magenta: '#bc8cff',
          cyan: '#39c5cf',
          white: '#e6edf3',
          brightBlack: '#6e7681',
          brightRed: '#ffa198',
          brightGreen: '#56d364',
          brightYellow: '#e3b341',
          brightBlue: '#79c0ff',
          brightMagenta: '#d2a8ff',
          brightCyan: '#56d4dd',
          brightWhite: '#f0f6fc',
        },
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Monaco', 'Menlo', monospace",
        fontSize: 13,
        lineHeight: 1.5,
        cursorBlink: true,
        cursorStyle: 'block',
        scrollback: 5000,
        convertEol: false,
        disableStdin: disabled,
      });
      const fit = new FitAddon();
      const links = new WebLinksAddon();
      term.loadAddon(fit);
      term.loadAddon(links);
      term.open(container);
      termRef.current = term;
      fitRef.current = fit;

      const fitAndReport = () => {
        try {
          fit.fit();
        } catch {
          return;
        }
        onResizeRef.current?.(term.cols, term.rows);
      };
      fitAndReport();

      const observer = new ResizeObserver(fitAndReport);
      observer.observe(container);

      const dataDisposable = term.onData((data) => {
        onInputRef.current(data);
      });
      const resizeDisposable = term.onResize(({ cols, rows }) => {
        onResizeRef.current?.(cols, rows);
      });
      term.focus();

      return () => {
        dataDisposable.dispose();
        resizeDisposable.dispose();
        observer.disconnect();
        term.dispose();
        termRef.current = null;
        fitRef.current = null;
      };
      // Mount once: the terminal owns its own lifetime. onInput /
      // onResize / disabled reach it through refs / the effect below.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fallback]);

    // The shell exited (or came back): stop / resume stdin.
    useEffect(() => {
      if (termRef.current) termRef.current.options.disableStdin = disabled;
    }, [disabled]);

    // DEFCON 2 whiter text (Gary, 2026-11-09 ~05:21 PST): the
    // mount effect above runs once, so re-apply the theme when
    // the foreground follows a level or theme change. At
    // DEFCON 1 the foreground is exactly the standing one, so
    // this is a no-op there.
    useEffect(() => {
      const term = termRef.current;
      if (term) {
        term.options.theme = { ...(term.options.theme ?? {}), foreground };
      }
    }, [foreground]);

    if (fallback) {
      // Per-keystroke forwarding, same contract as xterm onData:
      // printable chars as they arrive (diffed out of the change
      // event), Enter as '\r', control keys as their byte.
      const forwardChange = (next: string) => {
        const prev = fallbackPrevInput.current;
        let common = 0;
        while (
          common < prev.length &&
          common < next.length &&
          prev[common] === next[common]
        ) {
          common++;
        }
        const removed = prev.length - common;
        const added = next.slice(common);
        fallbackPrevInput.current = next;
        setFallbackInput(next);
        if (removed > 0) onInput('\x7f'.repeat(removed));
        if (added) onInput(added);
      };
      const forwardKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const ctrl = e.ctrlKey || e.metaKey;
        if (e.key === 'Enter') {
          e.preventDefault();
          onInput('\r');
          fallbackPrevInput.current = '';
          setFallbackInput('');
        } else if (e.key === 'Tab') {
          e.preventDefault();
          onInput('\t');
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          onInput('\x1b[A');
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          onInput('\x1b[B');
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          onInput('\x1b[D');
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          onInput('\x1b[C');
        } else if (ctrl && e.key.toLowerCase() === 'c') {
          e.preventDefault();
          onInput('\x03');
        } else if (ctrl && e.key.toLowerCase() === 'd') {
          e.preventDefault();
          onInput('\x04');
        } else if (ctrl && e.key.toLowerCase() === 'l') {
          e.preventDefault();
          onInput('\x0c');
        } else if (ctrl && e.key.toLowerCase() === 'u') {
          e.preventDefault();
          onInput('\x15');
        } else if (ctrl && e.key.toLowerCase() === 'w') {
          e.preventDefault();
          onInput('\x17');
        } else if (ctrl && e.key.toLowerCase() === 'a') {
          e.preventDefault();
          onInput('\x01');
        } else if (ctrl && e.key.toLowerCase() === 'e') {
          e.preventDefault();
          onInput('\x05');
        } else if (ctrl && e.key.toLowerCase() === 'r') {
          e.preventDefault();
          onInput('\x12');
        } else if (ctrl && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          onInput('\x1a');
        }
      };
      return (
        <div
          ref={containerRef}
          data-testid="xterm-surface"
          className="flex h-full w-full flex-col overflow-hidden"
        >
          <pre
            data-testid="xterm-fallback-output"
            className="m-0 flex-1 overflow-y-auto whitespace-pre-wrap p-2 font-mono text-[13px] leading-[1.5] text-[var(--text-primary)]"
          >
            {fallbackOutput}
          </pre>
          <textarea
            ref={fallbackInputRef}
            data-testid="xterm-fallback-input"
            value={fallbackInput}
            onChange={(e) => forwardChange(e.target.value)}
            onKeyDown={forwardKey}
            rows={1}
            autoFocus
            aria-label="Terminal input"
            placeholder="Type a command… (plain input — terminal surface unavailable)"
            className="w-full resize-none bg-transparent px-3 py-2 font-mono text-[13px] text-[var(--text-primary)] outline-none"
          />
        </div>
      );
    }

    return (
      <div
        ref={containerRef}
        data-testid="xterm-surface"
        className="h-full w-full overflow-hidden"
        onClick={() => termRef.current?.focus()}
      />
    );
  },
);
