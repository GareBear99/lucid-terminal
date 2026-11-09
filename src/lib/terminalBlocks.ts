/**
 * DEFCON 3 Phase 2 — blocks in devmode (Gary, 2026-11-09 ~08:10 PST
 * — "proceed until complete", same composer in both modes).
 *
 * Pure block helpers, unit-testable without a browser or Electron.
 * The store is the REVIVED historyStore (`blocksByTab` /
 * `setBlocks` — zero callers before this phase, `blocksByTab`
 * always empty): reviving it is the smaller coherent choice over
 * a new store, because the Sidebar ConversationHistory already
 * reads `blocksByTab` and `clearBlocks` is already wired to the
 * `/history` clear path — writing blocks here lights all of that
 * up with no new store, no new sidebar wiring, and `jumpToBlock`
 * finally has `block-<id>` elements to find.
 *
 * BLOCK BOUNDARIES — HYBRID, DECIDED (dissection §4.3 / §8 Q9):
 * a block is stamped at submit time (the composer knows exactly
 * when a command is submitted) and ends at next-prompt detection.
 * The prompt is NEVER parsed out of the stream (fragile,
 * shell-dependent) and PS1 / the user's shell config is NEVER
 * touched. "Next prompt returned" is detected two ways, both
 * without parsing:
 *   (a) PTY QUIESCENCE — the stream goes quiet after a submit's
 *       output burst. The existing `ptyDataSeqRef` /
 *       `waitForPromptEcho` machinery already knows when the
 *       next PTY chunk arrives after a submit; the quiet timer
 *       is the other half of that signal: when no PTY chunk has
 *       arrived for BLOCK_QUIET_CLOSE_MS, the prompt is taken to
 *       have returned and the block closes with
 *       durationMs = close − submit. LIMITATION, recorded
 *       honestly: a command that pauses output longer than the
 *       window mid-run (e.g. `sleep 2; echo done`) closes early
 *       on header/duration only — its late output STILL lands
 *       in the same block (output attribution runs until the
 *       next submit, not until the close), so nothing is lost,
 *       only the duration understates the run.
 *   (b) NEXT SUBMIT — a new composer submit proves a fresh
 *       prompt had returned (the shell could only accept a new
 *       command at a prompt), so submitting force-closes the
 *       previous block. Slash blocks also close when
 *       `runSlashCommand` resolves — their output lands
 *       synchronously via termWriteLines, so the close is exact.
 *   (c) SHELL EXIT closes any open block.
 *
 * EXIT-CODE COLORING — DEFERRED, not faked (§6.1 secondary):
 * a per-command exit code is NOT capturable without parsing
 * the shell prompt or wrapping/altering the user's command,
 * and neither is acceptable — so no exit-code coloring ships
 * in this phase. The `exitCode?` field on TerminalBlock stays
 * unwritten (as before); the header shows RUNNING / COMPLETE
 * only. This is a deferred gap for the final report, not a
 * silent omission.
 *
 * RE-EXAMINED in Phase 3 (Gary, 2026-11-09) — ONE clean
 * mechanism was looked for, and none exists. Candidates
 * rejected: (a) OSC 133 / shell-integration sequences — they
 * need the shell to emit them, which means touching shell
 * config (precmd / PROMPT_COMMAND / PS1), forbidden; (b)
 * reading `$?` after the block closes — reading it IS a shell
 * command, so it would land in the user's history and stream
 * and change `$?` itself; (c) wrapping the submitted command
 * in a subshell that reports its status on a side channel —
 * that wraps/alters the user's command, forbidden; (d)
 * inferring the code from the output text — output carries no
 * exit status. The per-command code lives only inside the
 * shell; only the whole-tab exit ever reaches the UI
 * (shellManager → App → terminalStore → banner). Deferral
 * CONFIRMED: `exitCode?` stays unwritten until a mechanism
 * appears that needs none of the above.
 *
 * SCOPE: composer submits only, at DEFCON 3+ in devmode
 * (`prompterActive`). Xterm-typed submits and the delinked
 * dev bar below level 3 create NO blocks — the old paths are
 * untouched.
 */

import type { TerminalBlock } from '../types';

/** A block's output is a transcript, not a sink: cap what the
 *  store keeps per block (same order as XtermSurface's
 *  FALLBACK_OUTPUT_CAP) so a flooding command cannot grow the
 *  store without bound. */
export const BLOCK_OUTPUT_CAP = 100_000;
/** How long the PTY stream must stay quiet after a submit's
 *  output before the prompt is taken to have returned and the
 *  block closes (see the header comment). */
export const BLOCK_QUIET_CLOSE_MS = 500;

/**
 * DEFCON 3 fix — block transcript fidelity (Gary, 2026-11-09).
 * A block's output is a TEXT transcript of what the terminal
 * showed, but the PTY stream is not text: it is the raw byte
 * stream, and two of its artifacts read as corruption in a
 * `<pre>`:
 *
 *   (a) ANSI prompt codes — the shell's prompt redraw (colour
 *       CSI, bracketed-paste `CSI ? 2004 h/l`, erase-to-EOL
 *       `CSI K`, keypad `ESC =`/`ESC >`, …) arrives verbatim
 *       in the captured chunks. The live xterm interprets
 *       them; the DOM `<pre>` prints them raw.
 *
 *   (b) The doubled first character (`eecho`, `ssleep`) — NOT
 *       a double write. Verified against a real interactive
 *       zsh on a PTY: every submit echoes as
 *       `<first-char> BS <full line>` — e.g. `e\x08echo hi`
 *       — zsh echoes the first keystroke, then backs up and
 *       reprints the whole line. The live xterm reads the
 *       backspace as "cursor left", so the screen is correct;
 *       the raw-text transcript keeps both copies of the
 *       first character (the `<pre>` renders `\x08` as
 *       nothing). bash does not do this; zsh does, on every
 *       submit, one-shot or typed.
 *
 * The fix is at the capture funnel, not the write path: the
 * shell echo is correct (the xterm proves it) and the
 * composer write must not change. This function turns the
 * raw stream into the text the terminal showed — strip the
 * escape sequences, then replay the cursor-affecting controls
 * the way a terminal would: backspace / DEL move the cursor
 * left (the next char overwrites), a lone carriage return
 * returns to column 0 (the next chars overwrite), `CRLF` is
 * a newline. Trailing spaces are trimmed per line (the
 * prompt redraw pads with them). It is idempotent: running
 * it over already-clean text changes nothing, so it is safe
 * to apply to the concatenated output on every append —
 * which also makes it correct across chunk boundaries (an
 * escape or a `e\x08` pair split across two PTY chunks still
 * sanitizes as one stream).
 */
export function sanitizeBlockTranscript(text: string): string {
  if (!text) return text;
  // 0. A sequence split across PTY chunks: a trailing
  // INCOMPLETE escape (CSI with no final byte, OSC with no
  // terminator, a bare ESC) is peeled off and re-appended
  // verbatim, so the next chunk's continuation completes it
  // instead of the strip below mangling it. The stream
  // essentially never ends mid-escape (a command's output
  // completes), so a peeled partial is completed by the
  // next append, not left dangling.
  const partialMatch = /(?:\x1b\[[0-?]*[ -/]*|\x1b\][^\x07\x1b]*|\x1b[()]|\x1b)$/.exec(text);
  const partial = partialMatch ? partialMatch[0] : '';
  const body = partial ? text.slice(0, -partial.length) : text;
  // 1. Strip escape sequences: OSC (… BEL or ST), CSI
  // (params 0x30–0x3F, intermediates 0x20–0x2F, final
  // 0x40–0x7E), charset designations, keypad modes.
  const stripped = body
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[()][0-9A-B]/g, '')
    .replace(/\x1b[=>]/g, '');
  // 2. Replay BS / DEL / CR / LF over the visible text,
  // column-aware: overwriting, not deleting, so a lone CR
  // before a newline keeps the line it returns over (the
  // `echo hi\r\r\n` the shell emits after a submit).
  const lines: string[] = [];
  let cur: string[] = [];
  let col = 0;
  const put = (ch: string) => {
    if (col < cur.length) cur[col] = ch;
    else cur.push(ch);
    col++;
  };
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (ch === '\n') {
      lines.push(cur.join('').replace(/[ \t]+$/, ''));
      cur = [];
      col = 0;
    } else if (ch === '\r') {
      if (stripped[i + 1] === '\n') {
        i++;
        lines.push(cur.join('').replace(/[ \t]+$/, ''));
        cur = [];
        col = 0;
      } else {
        col = 0;
      }
    } else if (ch === '\x08' || ch === '\x7f') {
      col = Math.max(0, col - 1);
    } else if (ch === '\t') {
      put(ch);
    } else if (ch < ' ') {
      // Any other C0 control (BEL included — the bell
      // already rang upstream) is noise in a transcript.
    } else {
      put(ch);
    }
  }
  lines.push(cur.join('').replace(/[ \t]+$/, ''));
  return lines.join('\n') + partial;
}

/** A stable block id: submit timestamp + a per-process counter,
 *  so two submits in the same millisecond still differ. */
let blockSeq = 0;
export function newBlockId(now: number): string {
  blockSeq += 1;
  return `block-${now}-${blockSeq}`;
}

/** A fresh open block for a composer submit: command + the
 *  submit stamp (`timestamp`) + the live cwd at submit time.
 *  `durationMs` is absent until the block closes. */
export function newBlock(command: string, cwd: string | undefined, now: number): TerminalBlock {
  return {
    id: newBlockId(now),
    command,
    output: '',
    timestamp: now,
    isComplete: false,
    cwd,
  };
}

/** Append transcript text to a block, capped at
 *  BLOCK_OUTPUT_CAP (oldest text is dropped past the cap —
 *  the tail, the part the user is reading, is what survives).
 *  The text is sanitized first (see
 *  sanitizeBlockTranscript): the block keeps the text the
 *  terminal showed, not the raw PTY bytes. Sanitizing the
 *  concatenation (not each chunk alone) keeps escapes and
 *  backspace pairs correct across chunk boundaries. */
export function appendBlockOutput(block: TerminalBlock, text: string): TerminalBlock {
  if (!text) return block;
  const next = sanitizeBlockTranscript(block.output + text).slice(-BLOCK_OUTPUT_CAP);
  if (next === block.output) return block;
  return { ...block, output: next };
}

/** Close a block: mark it complete and stamp the duration
 *  (submit → close). Closing an already-closed block is a
 *  no-op — the first close wins, so a quiet-close followed by
 *  a force-close at next submit cannot restamp the duration. */
export function closeBlock(block: TerminalBlock, now: number): TerminalBlock {
  if (block.isComplete) return block;
  return { ...block, isComplete: true, durationMs: Math.max(0, now - block.timestamp) };
}

/** A duration for the header: milliseconds under a second,
 *  one-decimal seconds above it. */
export function formatBlockDuration(durationMs: number): string {
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

/** Copy text to the clipboard where one exists. Returns false
 *  (never throws) when there is no clipboard — jsdom, a denied
 *  permission, or any other failure — so a copy button can
 *  never crash the terminal. */
export async function copyText(text: string): Promise<boolean> {
  try {
    const clipboard = (globalThis as unknown as { navigator?: { clipboard?: { writeText?: (t: string) => Promise<void> } } }).navigator?.clipboard;
    if (!clipboard?.writeText) return false;
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
