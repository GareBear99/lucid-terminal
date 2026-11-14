/**
 * Auto-detection: does this composer draft look like a prompt for
 * the agent rather than a shell command? (Heavy terminal work,
 * 2026-11-13 — Warp auto-detects agent prompts in terminal
 * sessions; Lucid had no detection at all. UPGRADED 2026-11-14
 * to the Warp-like classifier: the detector now AUTO-FLIPS the
 * mode — it is no longer suggest-only. The flip is gated by the
 * caller (src/lib/inputClassifier.ts): the terminal lock, the
 * 250 ms post-manual suppression, and the unsure case all stop
 * a flip; the hint line shows the call instead.)
 *
 * The gate order is Warp's (see
 * ~/workspace/warp-classifier-steal-2026-11-13.md §2, §7):
 * cheap gates before expensive work, one-off allowlists first,
 * shell heuristic before the NL heuristic, and the NL ladder
 * last. The word lists are Lucid's own rebuild (same shape as
 * Warp's, own vocabulary) — Warp's 4,230 + 3,191 + 104 lists
 * are AGPL-covered data and are NOT pasted here. The keyword
 * dictionaries come from LuciferAI Local's command_keywords.py
 * (Gary's own code) and Lucid's existing marker words.
 *
 * Defects deliberately NOT copied (see the dissection doc):
 * substring matching ('get' inside 'forget'), the len(word)>4
 * file-hint heuristic, blocking confirmation. Every keyword
 * check here is whole-word / word-boundary, and confirmation
 * is hint-line / pill UI only — never a block.
 *
 * Pure function — no React, no stores — unit-testable on its own.
 * The context gates (denylist, history match, agent follow-up)
 * take their inputs as options so the function stays pure; the
 * caller (inputClassifier.ts) reads the stores.
 */

import { stripPoliteness, autocorrectTypos } from './inputNormalize';

/** First words that mark the line as a shell command, not a
 *  prompt. The common interactive-shell vocabulary (coreutils,
 *  git, package managers, runtimes, editors, system tools).
 *  `sudo` / `time` / `env` prefixes are stripped before the
 *  check, so `sudo apt update` still reads as a command.
 *  `yes` and `w` are real commands (coreutils `yes(1)`, `w(1)`)
 *  — they read as shell even though Warp lists "yes" as a
 *  natural-language one-off. */
export const SHELL_COMMAND_FIRST_WORDS: readonly string[] = [
  // coreutils / files
  'ls', 'cd', 'pwd', 'cat', 'less', 'more', 'head', 'tail', 'echo',
  'mkdir', 'rmdir', 'rm', 'cp', 'mv', 'touch', 'ln', 'chmod', 'chown',
  'find', 'grep', 'sed', 'awk', 'sort', 'uniq', 'wc', 'diff', 'tar',
  'zip', 'unzip', 'gzip', 'open', 'which', 'type', 'man', 'history',
  'clear', 'exit', 'kill', 'ps', 'top', 'htop', 'df', 'du', 'mount',
  'ssh', 'scp', 'curl', 'wget', 'ping', 'dig', 'nslookup',
  'yes', 'w',
  // editors
  'vim', 'vi', 'nvim', 'nano', 'emacs', 'code', 'subl',
  // vcs / builds
  'git', 'gh', 'hg', 'svn', 'make', 'cmake', 'ninja', 'gcc', 'clang',
  'cargo', 'rustc', 'go', 'javac', 'java',
  // runtimes / package managers
  'node', 'npm', 'npx', 'yarn', 'pnpm', 'bun', 'deno', 'python',
  'python3', 'pip', 'pip3', 'ruby', 'gem', 'bundle', 'php', 'composer',
  'brew', 'apt', 'apt-get', 'dnf', 'yum', 'pacman',
  // containers / infra
  'docker', 'kubectl', 'terraform', 'ansible', 'vagrant',
  // shells / misc
  'bash', 'zsh', 'sh', 'fish', 'tmux', 'screen', 'watch', 'sleep',
  'export', 'alias', 'unalias', 'source', 'eval', 'exec', 'test',
];

/** One-off shell keywords (Warp's set, adapted): a bare CLI
 *  name is always Shell, so the user never feels pushed into
 *  Agent Mode for running a CLI. `warp` / `agy` / `omp` are
 *  Warp's own CLIs and do not port; `claude` / `codex` /
 *  `gemini` are third-party CLIs a user runs in the terminal,
 *  so they stay. `#` is a shell comment. */
export const SHELL_ONE_OFF_WORDS: readonly string[] = [
  '#', 'echo', 'man', 'sudo', 'claude', 'codex', 'gemini',
];

/** One-off natural-language words (Warp's set): a lone
 *  greeting or question word is a prompt, not a command.
 *  "yes" is deliberately NOT here — `yes(1)` is a real
 *  command; "yes" reaches the agent only as a follow-up
 *  (see AGENT_FOLLOW_UP_INPUTS, checked against the tab's
 *  last block). */
export const NL_ONE_OFF_WORDS: readonly string[] = [
  'hello', 'hi', 'hey', 'hola', 'thanks', 'explain', 'what', 'nice',
];

/** Agent follow-up inputs (Warp's set): short replies that
 *  mean "go on" — agent only when the tab's last block is an
 *  agent block, so a bare "yes" at a shell prompt stays shell. */
export const AGENT_FOLLOW_UP_INPUTS: readonly string[] = [
  'yes', 'continue', 'do it', 'approve',
];

/** Words that carry no intent signal and are dropped from
 *  the NL ladder's denominator — the function words of a
 *  request ("fix THE build" scores on [fix, build], 2/2,
 *  not 2/3). None of these is in the NL vocabulary, so
 *  dropping them never hides a match; it only stops a
 *  stopword from diluting a real request below the 1.0
 *  short-input threshold. */
const STOPWORDS: ReadonlySet<string> = new Set([
  'the', 'a', 'an', 'to', 'of', 'in', 'on', 'for', 'with', 'and',
  'or', 'is', 'are', 'was', 'were', 'it', 'this', 'that', 'these',
  'those', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'me',
  'you', 'he', 'she', 'we', 'they', 'i', 'do', 'does', 'did', 'am',
  'be', 'been', 'being', 'as', 'at', 'by', 'from', 'into', 'over',
  'under', 'after', 'before', 'then', 'than', 'so', 'but', 'not',
  'no', 'if',
]);

/** A token that is a file reference, not a content word:
 *  it contains a path separator, or it is a dotted word
 *  ("README.md", "src/foo.ts"). A file reference is the
 *  OBJECT of a request, not part of the request's wording —
 *  "explain src/foo.ts" scores on [explain], not 1/2. */
function isFileReferenceToken(text: string): boolean {
  if (text.includes('/')) return true;
  return /\.[A-Za-z0-9]+$/.test(text);
}

/** The content tokens of a list: non-quoted tokens minus
 *  stopwords minus file references. The NL ladder, the
 *  long-bare-line fallback and the unsure determination all
 *  score on these — never on the raw token list. */
function contentTokens(tokens: readonly ParsedToken[]): ParsedToken[] {
  return tokens.filter(
    (t) =>
      !t.quoted &&
      !STOPWORDS.has(t.text.toLowerCase()) &&
      !isFileReferenceToken(t.text),
  );
}

/** Shell-syntax characters (Warp's set, `natural_language_
 *  detection::check_if_token_has_shell_syntax`): a single
 *  unquoted token containing one is a shell token — for the
 *  SCORED ladders only. `-` counts only as a leading flag
 *  (a mid-word hyphen in prose, e.g. "well-known", is not
 *  shell syntax — Warp v1 counted it; that is a false
 *  positive on ordinary prose). */
const SHELL_SYNTAX_CHARS = new Set(['$', '=', '{', '}', '[', ']', '>', '<', '*', '~', '&', '(', ')', '|', '/']);

function hasShellSyntax(tokenText: string): boolean {
  if (tokenText.startsWith('-')) return true;
  for (const ch of tokenText) {
    if (SHELL_SYNTAX_CHARS.has(ch)) return true;
  }
  return false;
}

/** The HARD gate set: shell operators that are almost never
 *  prose in a terminal draft — pipe, redirect, chain,
 *  substitution, glob, statement separator. `/` and `=` are
 *  NOT here: a `/` is a file reference in a prompt
 *  ("explain src/foo.ts") and `=` is an assignment the
 *  first-word gate already catches ("export FOO=bar") — they
 *  count in the scored ladders, they do not force shell on
 *  their own. Quoted tokens are exempt either way. */
const HARD_SHELL_SYNTAX_CHARS = new Set(['|', '>', '<', '&', ';', '$', '`', '*']);

function hasHardShellSyntax(tokenText: string): boolean {
  for (const ch of tokenText) {
    if (HARD_SHELL_SYNTAX_CHARS.has(ch)) return true;
  }
  return false;
}

/** The natural-language vocabulary (Lucid's own rebuild —
 *  same shape as Warp's stemmed English + StackOverflow
 *  lists, own words, drawn from LuciferAI Local's keyword
 *  dictionaries and Lucid's marker words). Matched on stems,
 *  whole words only. */
const NL_WORDS: readonly string[] = [
  // questions
  'how', 'why', 'what', 'when', 'where', 'which', 'who', 'whose', 'whom',
  // modals / ask words
  'can', 'could', 'should', 'would', 'will', 'shall', 'may', 'might',
  'please', 'help',
  // explain verbs
  'explain', 'describe', 'summarize', 'summarise', 'translate', 'tell',
  'show', 'give', 'mean', 'define',
  // action verbs (Local's ACTION_KEYWORDS, canonicalized)
  'create', 'build', 'make', 'generate', 'add', 'write', 'fix',
  'repair', 'change', 'update', 'modify', 'edit', 'delete', 'remove',
  'move', 'copy', 'search', 'find', 'locate', 'run', 'execute',
  'install', 'setup', 'test', 'review', 'debug', 'refactor',
  'implement', 'design', 'plan', 'improve', 'check', 'list', 'watch',
  'monitor', 'read', 'open', 'save', 'start', 'stop', 'fail', 'report',
  'answer', 'ask',
  // target nouns
  'file', 'folder', 'directory', 'script', 'program', 'code',
  'project', 'test', 'build', 'error', 'bug', 'feature', 'function',
  'class', 'app', 'terminal', 'command', 'output', 'result',
  'snapshot', 'model', 'agent', 'chat', 'history', 'settings',
  'theme', 'window', 'tab', 'panel', 'plugin', 'package', 'library',
  'version', 'branch', 'repo', 'repository', 'commit', 'server',
  'client', 'page', 'view', 'screen', 'input', 'prompt', 'message',
  'answer', 'question', 'problem', 'issue', 'task', 'work', 'way',
  'reason', 'difference', 'example', 'steps', 'guide', 'docs',
  'documentation', 'conversation', 'new',
];

/** A small English stemmer (Warp stems with rust_stemmers;
 *  this is the same shape, approximate): strip contractions,
 *  then -ies → -y, -ing / -ed (with doubled-consonant guard),
 *  -es, -s. Applied to both tokens and the vocabulary at load,
 *  so "tests" matches "test" and "running" matches "run". */
export function stemWord(word: string): string {
  let w = word.toLowerCase();
  w = w.replace(/n't$/, '').replace(/'re$/, '').replace(/'ve$/, '').replace(/'ll$/, '').replace(/'m$/, '').replace(/'d$/, '').replace(/'s$/, '');
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith('ing')) {
    w = w.slice(0, -3);
    if (w.length > 1 && w[w.length - 1] === w[w.length - 2]) w = w.slice(0, -1);
    return w;
  }
  if (w.length > 3 && w.endsWith('ed')) {
    w = w.slice(0, -2);
    if (w.length > 1 && w[w.length - 1] === w[w.length - 2]) w = w.slice(0, -1);
    return w;
  }
  if (w.length > 3 && w.endsWith('es')) {
    // -es strips only after a sibilant (classes → class,
    // passes → pass, watches → watch). 'files' ends in 'les',
    // not a sibilant — it falls through to the -s rule below
    // (files → file), never 'fil'.
    const before = w[w.length - 3];
    if (before === 's' || before === 'x' || before === 'z' || w.endsWith('ches') || w.endsWith('shes')) {
      return w.slice(0, -2);
    }
  }
  if (w.length > 2 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

const NL_STEMS: ReadonlySet<string> = new Set(NL_WORDS.map(stemWord));

/** One token from the quote-aware tokenizer (Warp's
 *  `parser.rs` shape, reimplemented in TypeScript). */
export interface ParsedToken {
  /** The token text, quotes stripped. */
  text: string;
  /** True when the token came from inside quotes — quoted
   *  tokens never count as shell syntax. */
  quoted: boolean;
}

const TOKEN_SEPARATORS = new Set([',', '.', '!', '?']);
const WHITESPACE = new Set([' ', '\t', '\n', '\r']);
const QUOTE_CHARS = new Set(["'", '"', '`']);

/** Quote-aware tokenizer: quoted content stays ONE token
 *  (closed quotes included); empty quotes are skipped; a
 *  separator mid-word — not followed by whitespace or the end
 *  of the input — stays inside the token ("file.txt" is one
 *  token; "hello, world" splits at the comma). A quote char
 *  opens a quoted token only at a token boundary, so the
 *  apostrophe in "don't" stays literal. An unclosed quote at
 *  the end (still typing) yields one quoted token. */
export function tokenizeInput(input: string): ParsedToken[] {
  const tokens: ParsedToken[] = [];
  let current = '';
  let currentQuoted = false;
  let inQuote: string | null = null;
  let tokenStarted = false;

  const flush = () => {
    if (!tokenStarted) return;
    // Empty quotes ("") are skipped — they carry no token.
    if (current.length > 0) {
      tokens.push({ text: current, quoted: currentQuoted });
    }
    current = '';
    currentQuoted = false;
    tokenStarted = false;
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];
    if (inQuote !== null) {
      if (ch === inQuote) {
        inQuote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (QUOTE_CHARS.has(ch) && !tokenStarted) {
      // A quote at a token boundary opens a quoted token.
      inQuote = ch;
      currentQuoted = true;
      tokenStarted = true;
      continue;
    }
    if (WHITESPACE.has(ch)) {
      // Whitespace always ends the token.
      flush();
      continue;
    }
    if (TOKEN_SEPARATORS.has(ch)) {
      const followedBySpace = next === undefined || WHITESPACE.has(next);
      if (followedBySpace) {
        flush();
      } else if (tokenStarted) {
        // A punctuation separator mid-word stays inside the
        // token ("file.txt" is one token).
        current += ch;
      }
      // A leading separator (no token open) is just skipped.
      continue;
    }
    current += ch;
    tokenStarted = true;
  }
  // An unclosed quote is still a quoted token (typing).
  flush();
  return tokens;
}

/** Keys that complete a token: the buffer ends in one of
 *  these, or the last token is finished. (Warp's
 *  END_TOKEN_COMPLETE_KEYS.) */
const COMPLETE_END_KEYS = new Set([' ', '?', '!', '.', '"', ',']);

function isCompleteBuffer(text: string): boolean {
  if (text.length === 0) return true;
  return COMPLETE_END_KEYS.has(text[text.length - 1]);
}

/**
 * The polite-shell-command guard (Local's `_route_request`
 * question check, CORRECTED for Lucid): strip leading
 * politeness and a trailing `?`; if what is left starts
 * with a REAL shell command, it is a command, however
 * politely phrased — "please cat README.md" runs, "can you
 * ls the files?" runs. Local's version fired on any file-op
 * verb WITH a path ("can you read /path/file for me?" →
 * command), but Local's "command" is not Lucid's shell:
 * there is no bare `read` / `fix` / `show` command in the
 * shell, so a file request phrased as a question belongs to
 * the agent — "can you read README.md for me?" is a prompt
 * (the agent reads the file), and "please fix src/foo.ts"
 * is a prompt (the agent fixes the file). The guard only
 * fires when the stripped first word is in
 * SHELL_COMMAND_FIRST_WORDS / SHELL_ONE_OFF_WORDS — a
 * command the shell actually has.
 */
export function isPoliteShellCommand(draft: string): boolean {
  const lower = draft.trim().toLowerCase();
  let text = stripPoliteness(lower);
  if (text.endsWith('?')) text = text.slice(0, -1).trim();
  const first = text.split(/\s+/)[0] ?? '';
  return SHELL_COMMAND_FIRST_WORDS.includes(first) || SHELL_ONE_OFF_WORDS.includes(first);
}

/** Why the detector decided what it decided — Warp's
 *  decision-source idea, in miniature (the `reason` string
 *  is the human-readable form; `source` is the enum). */
export type DecisionSource =
  | 'empty'
  | 'slash-command'
  | 'multi-line'
  | 'denylist'
  | 'nl-one-off'
  | 'nl-one-off-prefix'
  | 'agent-follow-up'
  | 'history-match'
  | 'path'
  | 'shell-metacharacters'
  | 'shell-one-off'
  | 'known-shell-command'
  | 'polite-shell-command'
  | 'question'
  | 'shell-heuristic'
  | 'nl-heuristic'
  | 'long-bare-line'
  | 'too-short-or-plain'
  | 'unsure';

export type InputVerdict = 'shell' | 'agent' | 'unsure';

export interface AgentPromptDetection {
  /** True only when the verdict is 'agent'. Kept for the
   *  existing call sites — prefer `verdict` for new code. */
  isPrompt: boolean;
  verdict: InputVerdict;
  reason: string;
  source: DecisionSource;
  /** The winning fraction (0–1). For hard gates it is 1. */
  confidence: number;
}

/** Context the detector needs for the gates that look
 *  beyond the text. All optional — the text-only call
 *  (`detectAgentPrompt(draft)`) behaves as before. */
export interface DetectAgentPromptOptions {
  /** First-token denylist (default empty): a first token in
   *  here is forced Shell, checked before anything else. */
  denylist?: readonly string[];
  /** The tab's command history, newest LAST (the store's
   *  order). Scanned newest-first, capped at 100. */
  commandHistory?: readonly string[];
  /** The tab's past agent prompts, newest FIRST. Scanned
   *  newest-first, capped at 100. */
  agentPromptHistory?: readonly string[];
  /** Kind of the tab's last block — 'agent-prompt' /
   *  'agent-response' arms the follow-up allowlist. */
  lastBlockKind?: string | null;
}

/** Levenshtein-based similarity ratio (0–1), the history
 *  match's scorer. Warp uses difflib's SequenceMatcher; this
 *  is the same 0.9-cutoff shape with a simpler scorer — a
 *  one-character typo on a 10-char line still matches (0.9),
 *  a half-typed prefix does not. */
export function similarityRatio(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0 || lb === 0) return la === lb ? 1 : 0;
  const maxLen = Math.max(la, lb);
  const prev = new Array<number>(lb + 1);
  const curr = new Array<number>(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= lb; j++) prev[j] = curr[j];
  }
  return 1 - prev[lb] / maxLen;
}

/** The NL score of a token list: stemmed NL-word matches,
 *  minus unquoted shell-syntax tokens (saturating at 0).
 *  Quoted tokens never count either way. */
export function nlScore(tokens: readonly ParsedToken[]): number {
  let score = 0;
  for (const token of tokens) {
    if (token.quoted) continue;
    if (hasShellSyntax(token.text)) {
      score = Math.max(0, score - 1);
      continue;
    }
    if (NL_STEMS.has(stemWord(token.text))) score += 1;
  }
  return score;
}

/** The shell score of a token list: tokens that are known
 *  shell words or carry shell syntax. */
export function shellScore(tokens: readonly ParsedToken[]): number {
  let score = 0;
  for (const token of tokens) {
    if (token.quoted) continue;
    const lower = token.text.toLowerCase();
    if (SHELL_COMMAND_FIRST_WORDS.includes(lower) || SHELL_ONE_OFF_WORDS.includes(lower)) {
      score += 1;
    } else if (hasShellSyntax(token.text)) {
      score += 1;
    }
  }
  return score;
}

/** Token-count-scaled thresholds (Warp's ladders): short
 *  input demands total agreement, long input tolerates noise. */
function shellThreshold(total: number): number {
  if (total <= 2) return 1.0;
  if (total <= 4) return 0.7;
  return 0.5;
}

function nlThreshold(total: number): number {
  if (total <= 3) return 1.0;
  if (total <= 4) return 0.8;
  return 0.6;
}

/** The first command word of a token list, after stripping
 *  `sudo` / `time` prefixes and `env` + its VAR=val pairs.
 *  A lone prefix word ("sudo" with nothing after it) IS the
 *  first word — it is only stripped when a next token
 *  exists. */
function firstCommandWord(tokens: readonly ParsedToken[]): string {
  let i = 0;
  while (i < tokens.length) {
    const lower = tokens[i].text.toLowerCase();
    if ((lower === 'sudo' || lower === 'time') && i + 1 < tokens.length) {
      i += 1;
      continue;
    }
    if (lower === 'env' && i + 1 < tokens.length) {
      i += 1;
      while (i < tokens.length && tokens[i].text.includes('=')) i += 1;
      continue;
    }
    return lower;
  }
  return '';
}

function shellResult(reason: string, source: DecisionSource): AgentPromptDetection {
  return { isPrompt: false, verdict: 'shell', reason, source, confidence: 1 };
}

function agentResult(reason: string, source: DecisionSource, confidence: number): AgentPromptDetection {
  return { isPrompt: true, verdict: 'agent', reason, source, confidence };
}

/** Does this draft look like an agent prompt? The gate order
 *  is Warp's app-level order (§2.2 of the steal doc): hard
 *  gates → denylist → one-off NL → agent follow-up → history
 *  match → the classifier's own gates (path, shell syntax,
 *  first word, polite-shell-command guard) → question → shell ladder →
 *  NL ladder (two-pass, incomplete last token dropped on the
 *  first pass) → long-bare-line fallback → unsure / plain. */
export function detectAgentPrompt(
  input: string,
  options: DetectAgentPromptOptions = {},
): AgentPromptDetection {
  const trimmed = input.trim();
  if (!trimmed) return shellResult('empty', 'empty');
  // A Lucid slash line is a Lucid command, never an agent prompt.
  if (trimmed.startsWith('/')) return shellResult('slash-command', 'slash-command');
  // A multi-line draft is a script / paste, not a prompt.
  if (trimmed.includes('\n')) return shellResult('multi-line', 'multi-line');

  const tokens = tokenizeInput(trimmed);
  if (tokens.length === 0) return shellResult('too-short-or-plain', 'too-short-or-plain');
  const lower = trimmed.toLowerCase();

  // Denylist: a first token in the user denylist is forced
  // Shell, checked before anything else (default empty).
  const denylist = options.denylist ?? [];
  if (denylist.length > 0) {
    const first = firstCommandWord(tokens);
    if (denylist.some((d) => d.toLowerCase() === first)) {
      return shellResult('denylist', 'denylist');
    }
  }

  // One-off NL words: a lone greeting or question word is a
  // prompt. A lone PREFIX of one ("h" → hello/hi/hey) counts
  // too, so the mode does not flip while the word is still
  // being typed — but a token that is itself a shell word
  // ("w", "yes") never takes this branch.
  if (tokens.length === 1) {
    const word = tokens[0].text.toLowerCase();
    const isShellWord =
      SHELL_COMMAND_FIRST_WORDS.includes(word) || SHELL_ONE_OFF_WORDS.includes(word);
    if (!isShellWord) {
      if (NL_ONE_OFF_WORDS.includes(word)) {
        return agentResult('one-off-natural-language', 'nl-one-off', 1);
      }
      if (NL_ONE_OFF_WORDS.some((w) => w.startsWith(word))) {
        return agentResult('one-off-natural-language-prefix', 'nl-one-off-prefix', 0.8);
      }
    }
  }

  // Agent follow-up: "yes" / "continue" / "do it" /
  // "approve" is an agent reply ONLY when the tab's last
  // block is an agent block.
  const lastKind = options.lastBlockKind ?? null;
  if (lastKind === 'agent-prompt' || lastKind === 'agent-response') {
    if (AGENT_FOLLOW_UP_INPUTS.includes(lower)) {
      return agentResult('agent-follow-up', 'agent-follow-up', 1);
    }
  }

  // History match: a near-exact retype (ratio ≥ 0.9) of a
  // past agent prompt recalls agent; of a past command,
  // shell. Prompts are checked first — a timestamped prompt
  // beats an untimestamped command (Warp's rule; Lucid's
  // command entries carry no timestamp). Newest-first, capped
  // at 100 entries each, and only for drafts of 4+ chars
  // (a half-typed prefix can never reach 0.9 anyway).
  if (trimmed.length >= 4) {
    const prompts = options.agentPromptHistory ?? [];
    for (let i = 0; i < Math.min(prompts.length, 100); i++) {
      if (similarityRatio(lower, prompts[i].toLowerCase()) >= 0.9) {
        return agentResult('history-match-prompt', 'history-match', 0.9);
      }
    }
    const commands = options.commandHistory ?? [];
    for (let i = commands.length - 1; i >= Math.max(0, commands.length - 100); i--) {
      if (similarityRatio(lower, commands[i].toLowerCase()) >= 0.9) {
        return shellResult('history-match-command', 'history-match');
      }
    }
  }

  // A path or a command substitution is a shell line.
  if (/^(~\/|\/|\.\/)/.test(trimmed)) return shellResult('path', 'path');
  // Shell OPERATORS in any UNQUOTED token are a shell line —
  // quoted content is exempt ("a | b" in quotes is prose,
  // not a pipeline). Only the operator set counts here; `/`
  // and `=` are file references / assignments, scored in the
  // ladders below, not forced shell (see hasHardShellSyntax).
  if (tokens.some((t) => !t.quoted && hasHardShellSyntax(t.text))) {
    return shellResult('shell-metacharacters', 'shell-metacharacters');
  }

  // Known shell first word (after sudo/time/env stripping).
  const first = firstCommandWord(tokens);
  if (SHELL_ONE_OFF_WORDS.includes(first)) {
    return shellResult('shell-one-off', 'shell-one-off');
  }
  if (SHELL_COMMAND_FIRST_WORDS.includes(first)) {
    return shellResult('known-shell-command', 'known-shell-command');
  }

  // The polite-shell-command guard: a real shell command,
  // however politely phrased, stays a command. A file
  // request that is NOT a shell command ("can you read
  // README.md for me?") falls through to the question
  // check below — it is a prompt, not a command.
  if (isPoliteShellCommand(trimmed)) {
    return shellResult('polite-shell-command', 'polite-shell-command');
  }

  // A question is a prompt, however short.
  if (trimmed.endsWith('?')) return agentResult('question', 'question', 1);

  // The ladders score a TYPO-FIXED view of the draft
  // ("hlep me fix the build" scores as "help me fix the
  // build") — but NOT a politeness-stripped one: stripping
  // "can you" / "please" would remove NL words and shrink
  // the token count, raising the threshold, so "can you run
  // the tests" would fall from agent to unsure. The shell
  // gates above already ran on the raw tokens.
  const scoreTokens = tokenizeInput(autocorrectTypos(trimmed));

  // Shell ladder: most tokens are shell words → shell.
  const sScore = shellScore(scoreTokens);
  if (sScore >= scoreTokens.length * shellThreshold(scoreTokens.length)) {
    return shellResult('shell-heuristic', 'shell-heuristic');
  }

  // Warp's minimum: fewer than 2 tokens is pure shell for
  // the ladders — a lone "fix" is the start of a line being
  // typed, not a prompt yet, and it must not flip the tab
  // mid-word. (One-off NL words and prefixes are handled
  // above, before the ladders, so "hello" / "h" still flip.)
  if (scoreTokens.length < 2) {
    return shellResult('too-short-or-plain', 'too-short-or-plain');
  }

  // NL ladder, two passes: the first pass drops the last
  // token when the buffer does not end in a complete key
  // (the user may still be typing it); AI from either pass
  // wins. Short input demands total agreement. Both passes
  // score on CONTENT tokens only — stopwords and file
  // references are dropped from the denominator, so "fix
  // the build" scores 2/2 and "explain src/foo.ts" scores
  // 1/1, instead of diluting below the 1.0 short threshold.
  const passes: ParsedToken[][] = [scoreTokens];
  if (!isCompleteBuffer(trimmed) && scoreTokens.length > 2) {
    passes.unshift(scoreTokens.slice(0, -1));
  }
  for (const pass of passes) {
    const content = contentTokens(pass);
    if (content.length === 0) continue;
    const score = nlScore(content);
    const threshold = nlThreshold(content.length);
    if (score >= content.length * threshold) {
      return agentResult('natural-language-heuristic', 'nl-heuristic', score / content.length);
    }
  }

  // Eight-plus bare words with at least one NL word is
  // almost never a shell one-liner — it reads as a sentence.
  // (Lucid's old long-line rule, raised 6 → 8: the NL ladder
  // above already catches the 6–7-word sentences that are
  // actually requests.)
  const contentScoreTokens = contentTokens(scoreTokens);
  const totalNl = nlScore(contentScoreTokens);
  if (scoreTokens.length >= 8 && totalNl > 0) {
    return agentResult(
      'long-bare-line',
      'long-bare-line',
      contentScoreTokens.length > 0 ? totalNl / contentScoreTokens.length : 0,
    );
  }

  // Neither ladder fired. Some NL words but below threshold
  // is UNSURE — do not flip, show the call in the hint line.
  // No NL words at all is plain shell.
  if (totalNl > 0) {
    return {
      isPrompt: false,
      verdict: 'unsure',
      reason: 'unsure',
      source: 'unsure',
      confidence: contentScoreTokens.length > 0 ? totalNl / contentScoreTokens.length : 0,
    };
  }
  return shellResult('too-short-or-plain', 'too-short-or-plain');
}
