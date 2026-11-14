/**
 * Intent + file extraction — the RULE PATH ONLY (Warp-like
 * parsing, 2026-11-14).
 *
 * Shape stolen from LuciferAI Local's `nlp_parser.py`
 * rule path (`_parse_with_rules`) and `command_keywords.py`
 * (Gary's own code — bits, no credit question): keyword
 * intent in a fixed order, file candidates from the text,
 * and the parse-result shape {intent, confidence,
 * fileCandidates, actionType, parameters, needsConfirmation,
 * reasoning}. The model path (`_parse_with_ollama`, a
 * 10-second-timeout LLM call) is deliberately NOT ported —
 * it is the bottleneck Gary forbids in the classifier.
 *
 * This runs ONLY for agent prompts — a shell command just
 * runs (Gary, 2026-11-14 ~03:29 PST). It runs at submit
 * time (the route: instant reply / context answer / agent)
 * and as-you-type (the pill context). It never blocks the
 * composer, never calls a model, never touches the network.
 *
 * Defects NOT copied: substring matching (every check here
 * is word-boundary), the len(word)>4 file-hint heuristic
 * (hints come only from quotes, @mentions, paths, and file
 * extensions), the ~/Desktop / ~/Documents search roots
 * (candidates are extracted from the TEXT, never resolved
 * against a root here), and blocking confirmation
 * (needsConfirmation surfaces in the hint line / pill, never
 * an input() prompt).
 *
 * Pure functions — no React, no stores — unit-testable.
 */

import { normalizeIntentVerbs, stripPoliteness } from './inputNormalize';
import type { TerminalBlock } from '../types';

/** What the prompt wants done. Question intents split on
 *  complexity (Local's Layer 3): simple questions are facts,
 *  complex ones are architecture / trade-off / optimization. */
export type ParseIntent =
  | 'create'
  | 'delete'
  | 'modify'
  | 'file-ops'
  | 'search'
  | 'execute'
  | 'fix'
  | 'watch'
  | 'install'
  | 'github'
  | 'environment'
  | 'system'
  | 'question-simple'
  | 'question-complex'
  | 'unknown';

export type ParseRoute = 'instant-reply' | 'context-answer' | 'agent';

/** Where a file candidate came from. */
export type FileCandidateSource = 'quoted' | 'mention' | 'path' | 'extension';

export interface FileCandidate {
  /** The candidate text, as typed (case preserved). */
  text: string;
  source: FileCandidateSource;
}

export interface AgentParseResult {
  intent: ParseIntent;
  /** Uncalibrated placeholder (Local's 0.8 / 0.7 / 0.6
   *  constants, carried over as-is — no accuracy
   *  measurement exists for any of this). */
  confidence: number;
  fileCandidates: FileCandidate[];
  /** The action the intent maps to (usually the intent
   *  itself; 'question' for the question intents). */
  actionType: string;
  parameters: { target: string | null };
  /** True when the parse is ambiguous enough to show the
   *  call in the hint line / pill: more than one file
   *  candidate, or a watch intent with any candidates. */
  needsConfirmation: boolean;
  /** A short human-readable account of the match. */
  reasoning: string;
  /** Where the prompt routes: an instant reply (greetings /
   *  canned questions, 0 SP), a context answer (questions
   *  about the tab's own recent work, answered from state),
   *  or the agent (the driving intelligence). */
  route: ParseRoute;
  /** The reply text for instant-reply / context-answer
   *  routes. Null for the agent route. */
  reply: string | null;
}

/** Exact-match greetings → instant reply, no model. */
const GREETINGS: Readonly<Record<string, string>> = {
  hello: 'Hey. The terminal is yours — type a command to run it, or ask me something.',
  hi: 'Hey. The terminal is yours — type a command to run it, or ask me something.',
  hey: 'Hey. The terminal is yours — type a command to run it, or ask me something.',
  hola: 'Hey. The terminal is yours — type a command to run it, or ask me something.',
  yo: 'Hey. The terminal is yours — type a command to run it, or ask me something.',
  'good morning': 'Good morning. The terminal is yours — type a command to run it, or ask me something.',
  'good afternoon': 'Good afternoon. The terminal is yours — type a command to run it, or ask me something.',
  'good evening': 'Good evening. The terminal is yours — type a command to run it, or ask me something.',
  'whats up': "Not much — just the terminal. What are we doing?",
  "what's up": "Not much — just the terminal. What are we doing?",
  howdy: 'Hey. The terminal is yours — type a command to run it, or ask me something.',
};

/** Canned questions → instant reply, no model. The
 *  capability answer is honest about what is not built yet
 *  (the driving intelligence is step 3). */
const CANNED_QUESTIONS: Readonly<Record<string, string>> = {
  'how are you': 'Running. What are we doing?',
  'how are you doing': 'Running. What are we doing?',
  'what can you do':
    "Right now I run your shell commands and flip between terminal and agent with the pill or /agent. The driving intelligence — the part that actually does things for you — isn't built yet (step 3). Ask me again once it lands.",
  'what can you do for me':
    "Right now I run your shell commands and flip between terminal and agent with the pill or /agent. The driving intelligence — the part that actually does things for you — isn't built yet (step 3). Ask me again once it lands.",
  'who are you':
    'Lucid — the terminal. The driving intelligence that lives in me is not built yet (step 3).',
  help: "Type a command to run it. Ask me something to send it to the agent. /agent flips the mode, Esc flips back to terminal.",
};

/** Words that mark a question COMPLEX (Local's complexity
 *  indicators). */
const COMPLEX_INDICATORS: readonly string[] = [
  'architecture', 'best practice', 'optimize', 'optimise',
  'performance', 'security', 'compare', 'pros and cons',
  'trade-off', 'tradeoff', 'design', 'scalab',
];

/** Words that mark a question SIMPLE. */
const SIMPLE_INDICATORS: readonly string[] = [
  'what is', 'who is', 'how do i', 'define', 'what does', 'what are',
];

/** Intent verb sets, checked in the order below
 *  (first match wins). Canonical verbs — the input is
 *  synonym-normalized first, so 'make' / 'build' /
 *  'generate' all arrive as 'create'. */
const INTENT_VERBS: ReadonlyArray<{ intent: ParseIntent; verbs: readonly string[]; confidence: number }> = [
  { intent: 'fix', verbs: ['fix', 'repair', 'debug', 'autofix'], confidence: 0.8 },
  { intent: 'delete', verbs: ['delete', 'remove', 'rm', 'trash', 'erase', 'drop'], confidence: 0.8 },
  { intent: 'create', verbs: ['create', 'generate', 'initialize'], confidence: 0.7 },
  { intent: 'modify', verbs: ['change', 'update', 'modify', 'edit', 'refactor', 'rename', 'replace'], confidence: 0.7 },
  { intent: 'search', verbs: ['search', 'find', 'locate', 'lookup', 'query', 'grep'], confidence: 0.7 },
  { intent: 'execute', verbs: ['run', 'execute', 'start', 'launch', 'test'], confidence: 0.8 },
  { intent: 'watch', verbs: ['watch', 'monitor', 'daemon'], confidence: 0.8 },
  { intent: 'install', verbs: ['install', 'uninstall', 'setup'], confidence: 0.7 },
  { intent: 'github', verbs: ['github', 'repo', 'repository', 'clone', 'push', 'pull', 'commit'], confidence: 0.7 },
  { intent: 'environment', verbs: ['env', 'environment', 'config', 'setting', 'variable'], confidence: 0.7 },
  { intent: 'system', verbs: ['system', 'restart', 'reboot', 'shutdown', 'kill', 'process'], confidence: 0.7 },
  { intent: 'file-ops', verbs: ['read', 'show', 'display', 'cat', 'view', 'open', 'list', 'ls', 'copy', 'cp', 'move', 'mv'], confidence: 0.7 },
];

const FILE_EXTENSIONS = new Set([
  'py', 'js', 'jsx', 'ts', 'tsx', 'json', 'yaml', 'yml', 'sh',
  'html', 'css', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'md', 'txt',
]);

const MAX_FILE_CANDIDATES = 5;

/** Extract file candidates from the ORIGINAL draft (case
 *  preserved): quoted strings, @mentions, paths, and words
 *  with a known file extension. Never the len(word)>4
 *  heuristic — a long word is not a file. */
export function extractFileCandidates(draft: string): FileCandidate[] {
  const found: FileCandidate[] = [];
  const seen = new Set<string>();
  const add = (text: string, source: FileCandidateSource) => {
    const key = text.toLowerCase();
    if (!text || seen.has(key) || found.length >= MAX_FILE_CANDIDATES) return;
    seen.add(key);
    found.push({ text, source });
  };
  // Quoted strings are candidates in full — their inner
  // words are NOT separate candidates (a quoted "my file.txt"
  // must not also yield a bare 'file.txt' extension hit).
  // The same holds for mentions and paths: a path's last
  // segment ('src/foo.ts' → 'foo.ts') and a mention's file
  // ('@src/index.ts' → 'index.ts') are the same file, not a
  // second candidate.
  const spans: Array<[number, number]> = [];
  for (const m of draft.matchAll(/"([^"]+)"|'([^']+)'|`([^`]+)`/g)) {
    spans.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
    add(m[1] ?? m[2] ?? m[3] ?? '', 'quoted');
  }
  const insideSpan = (index: number): boolean =>
    spans.some(([start, end]) => index >= start && index < end);
  for (const m of draft.matchAll(/@([\w./-]+)/g)) {
    spans.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
    add(m[1], 'mention');
  }
  for (const m of draft.matchAll(/(?:^|\s)(~\/[^\s]*|\/[^\s]*|\.\/[^\s]*|\.\.\/[^\s]*|[\w.~/-]*\/[\w.~/-]+)/g)) {
    // m.index is the leading space (or start); the candidate
    // itself starts after it.
    const start = (m.index ?? 0) + (m[0].length - m[1].length);
    if (insideSpan(start)) continue;
    spans.push([start, start + m[1].length]);
    add(m[1], 'path');
  }
  for (const m of draft.matchAll(/\b[\w.-]+\.([A-Za-z0-9]+)\b/g)) {
    if (insideSpan(m.index ?? 0)) continue;
    if (FILE_EXTENSIONS.has(m[1].toLowerCase())) add(m[0], 'extension');
  }
  return found;
}

/** Questions about the tab's own recent work ("what did the
 *  script do?", "did it work?") — answered from stored state,
 *  never from a model (Local's SCRIPT_CONTEXT_QUESTION
 *  pattern). */
const CONTEXT_QUESTION_PATTERNS: readonly RegExp[] = [
  /(?:what|how)\s+(?:does|did|is|was)\s+(?:it|that|the script|the build|the test)\s+(?:do|doing|work|happen)/i,
  /did\s+(?:it|that|the script|the build|the test)\s+work/i,
  /what happened/i,
  /did it\s+(?:fail|succeed|pass)/i,
  /what did\s+(?:it|that|the script|the build|the test)\s+do/i,
];

function isContextQuestion(text: string): boolean {
  return CONTEXT_QUESTION_PATTERNS.some((re) => re.test(text));
}

/** Build the context answer from the tab's last command
 *  block: what ran, whether it worked (exit code, when the
 *  block carries one), and the tail of its output. */
export function buildContextAnswer(lastBlock: TerminalBlock | null | undefined): string {
  if (!lastBlock || !lastBlock.command) {
    return 'Nothing has run in this tab yet.';
  }
  const verdict =
    lastBlock.exitCode === undefined
      ? ''
      : lastBlock.exitCode === 0
        ? ' It worked (exit 0).'
        : ` It failed (exit ${lastBlock.exitCode}).`;
  const output = (lastBlock.output ?? '').trim();
  const tail = output.length > 500 ? `…${output.slice(-500)}` : output;
  const outputPart = tail ? `\n${tail}` : '\n(no output)';
  return `Last command: ${lastBlock.command}.${verdict}${outputPart}`;
}

/** Verbs allowed to start a chained command part (Local's
 *  chain-split list, plus the intent verbs). */
const CHAIN_VERBS: ReadonlySet<string> = new Set([
  'enable', 'disable', 'install', 'uninstall', 'llm', 'help',
  'list', 'show', 'mainmenu', 'test', 'run', 'fix', 'create',
  'delete', 'open', 'read', 'build', 'update',
]);

/**
 * Command chaining (Local's `process_request` split on
 * ' and ', with the known flaw fixed): split on ' and ',
 * keep a part only if its first word is a known verb; a part
 * that is a bare argument (no verb) is joined back onto the
 * previous part instead of aborting the chain. ≥2 valid parts
 * → chained; anything else → one command.
 */
export function splitChainedCommands(draft: string): { chained: boolean; parts: string[] } {
  const raw = draft.split(/\s+and\s+/i).map((p) => p.trim()).filter(Boolean);
  if (raw.length < 2) return { chained: false, parts: [draft.trim()] };
  const parts: string[] = [];
  for (const part of raw) {
    const first = part.split(/\s+/)[0]?.toLowerCase() ?? '';
    if (CHAIN_VERBS.has(first)) {
      parts.push(part);
    } else if (parts.length > 0) {
      // Bare argument, not a command — join it back.
      parts[parts.length - 1] = `${parts[parts.length - 1]} and ${part}`;
    } else {
      parts.push(part);
    }
  }
  return parts.length >= 2 ? { chained: true, parts } : { chained: false, parts: [draft.trim()] };
}

export interface ParseAgentInputOptions {
  /** The tab's last command block (for context answers). */
  lastBlock?: TerminalBlock | null;
}

function hasWord(text: string, word: string): boolean {
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text);
}

/** Parse an agent prompt: intent + file candidates + route.
 *  Rule path only — no model, no network, no SP. */
export function parseAgentInput(
  draft: string,
  options: ParseAgentInputOptions = {},
): AgentParseResult {
  const trimmed = draft.trim();
  const lower = trimmed.toLowerCase();
  const bare = lower.replace(/[?.!]+$/, '').trim();

  const base = (
    partial: Omit<AgentParseResult, 'fileCandidates' | 'parameters' | 'needsConfirmation' | 'reasoning' | 'route' | 'reply'>,
  ): AgentParseResult => {
    const fileCandidates = extractFileCandidates(trimmed);
    return {
      ...partial,
      fileCandidates,
      parameters: { target: fileCandidates[0]?.text ?? null },
      needsConfirmation:
        fileCandidates.length > 1 ||
        (partial.intent === 'watch' && fileCandidates.length > 0),
      reasoning: '',
      route: 'agent',
      reply: null,
    };
  };

  // Exact-match greetings and canned questions → instant
  // reply (0 SP, no model).
  const greeting = GREETINGS[bare];
  if (greeting) {
    return {
      ...base({ intent: 'question-simple', confidence: 0.8, actionType: 'greet' }),
      reasoning: 'exact-match greeting',
      route: 'instant-reply',
      reply: greeting,
    };
  }
  const canned = CANNED_QUESTIONS[bare];
  if (canned) {
    return {
      ...base({ intent: 'question-simple', confidence: 0.8, actionType: 'answer' }),
      reasoning: 'canned question',
      route: 'instant-reply',
      reply: canned,
    };
  }

  // Context questions → answered from the tab's own blocks.
  if (isContextQuestion(trimmed)) {
    return {
      ...base({ intent: 'question-simple', confidence: 0.8, actionType: 'answer' }),
      reasoning: 'context question — answered from the tab state',
      route: 'context-answer',
      reply: buildContextAnswer(options.lastBlock ?? null),
    };
  }

  // Normalize verbs, then intent in a fixed first-match-wins
  // order. Questions first (a question word or a trailing
  // `?` beats any action verb in the same line).
  const normalized = normalizeIntentVerbs(stripPoliteness(lower));
  const isQuestion =
    trimmed.endsWith('?') ||
    /^(how|why|what|when|where|which|who)\b/.test(normalized) ||
    hasWord(normalized, 'explain') ||
    hasWord(normalized, 'describe');
  if (isQuestion) {
    const complex =
      COMPLEX_INDICATORS.some((w) => normalized.includes(w)) &&
      !SIMPLE_INDICATORS.some((w) => normalized.includes(w));
    return {
      ...base({
        intent: complex ? 'question-complex' : 'question-simple',
        confidence: 0.7,
        actionType: 'question',
      }),
      reasoning: complex ? 'complex question indicators' : 'question',
    };
  }

  for (const { intent, verbs, confidence } of INTENT_VERBS) {
    const hit = verbs.find((v) => hasWord(normalized, v));
    if (hit) {
      return {
        ...base({ intent, confidence, actionType: intent }),
        reasoning: `matched intent verb '${hit}'`,
      };
    }
  }

  return {
    ...base({ intent: 'unknown', confidence: 0.6, actionType: 'unknown' }),
    reasoning: 'no intent verb matched',
  };
}
