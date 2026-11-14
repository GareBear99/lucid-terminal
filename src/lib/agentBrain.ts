/**
 * The brain — the thing that turns a prompt into tool
 * calls (steal #4 — Continue, 2026-11-14).
 *
 * The seam is Continue's `BaseLLM` abstraction
 * (`core/llm/index.ts:90`): the whole agent talks to ONE
 * interface, and the provider behind it is swappable. In
 * Lucid the interface is `AgentBrain`: plan one turn from
 * a prompt + context, and return tool calls or a text
 * reply. The loop never knows which brain answered.
 *
 * The first brain is the LOCAL PLANNER — a deterministic,
 * rule-based planner over the parsing slice's own
 * machinery (`parseAgentInput` intent + `extractFileCandidates`
 * + `splitChainedCommands`). No model, no network, no SP,
 * never a bottleneck — the same rule as every slice before
 * it (parsing, Monaco, tree-sitter, TS-LSP are all local).
 *
 * Which artifact answers is still Gary's call (design
 * D4 / dissection Q1 — exemplar retrieval, a mounted
 * GGUF, or both). The retrieval brain returns record text,
 * not tool calls — it cannot plan, and this planner does
 * not pretend it can. When the driving intelligence lands
 * as a planning brain, it implements this same interface
 * and the loop does not change. Until then the planner
 * handles the concrete file-operation intents and answers
 * everything else honestly: "here is what I can do, and
 * here is what I understood" — never a faked model
 * answer, never an invented tool call.
 *
 * What the planner handles (each verified by tests):
 * - read / show / open / cat a file → read_file
 * - list / ls a directory → ls
 * - search / find / grep for text → grep_search (one
 *   file) or codebase_search (the workspace)
 * - where is / definition of a symbol → find_symbol /
 *   go_to_definition
 * - create a file (content from the quoted strings) →
 *   create_new_file
 * - replace / change X with/to Y in a file → multi_edit
 *   (old/new from the quoted strings, or from a
 *   "replace X with Y" / "change X to Y" phrasing)
 * - fix a file → read_file (the read carries the file's
 *   diagnostics — the planner reports what is broken;
 *   repairing it without a model is the Aider slice's
 *   job, #5, not this one's)
 * - chained prompts ("read X and rename Y to Z in it") →
 *   one plan per part, in order (splitChainedCommands)
 *
 * What it does NOT do: answer questions from knowledge
 * (question intents → an honest reply, no tools), or plan
 * a call for a file it cannot resolve (an unresolved file
 * candidate → a reply naming the file + close matches from
 * the index, never a guessed path).
 */

import type { AgentFileIndex } from './agentIndex';
import { resolveAgentPath } from './agentHost';
import { extractFileCandidates, parseAgentInput, splitChainedCommands } from './inputParse';
import { normalizeIntentVerbs, stripPoliteness } from './inputNormalize';

/** One planned tool call. */
export interface PlannedToolCall {
  name: string;
  args: Record<string, unknown>;
}

/** What a brain returns for a turn: tool calls to run,
 *  or a text reply when there is nothing to run (a
 *  question, an unplannable prompt, an unresolved file).
 *  Both may be set — the reply is the brain's own words
 *  for the run's final text. */
export interface BrainPlan {
  toolCalls: PlannedToolCall[];
  reply?: string;
}

/** What the brain sees. The index resolves bare
 *  filenames; the open files give the default target
 *  (the file the user is looking at). */
export interface BrainContext {
  workspaceRoot: string;
  cwd: string;
  openFiles: Array<{ path: string; name: string }>;
  activeFilePath: string | null;
  index: AgentFileIndex;
}

export interface AgentBrain {
  plan(prompt: string, ctx: BrainContext): Promise<BrainPlan>;
}

/** What the planner can do, in the user's words — the
 *  honest capability list, used in the unplannable reply. */
export const LOCAL_PLANNER_CAPABILITIES =
  'I can read, list, search, create, and edit files in this workspace. ' +
  'Tell me the file — for example "read src/foo.ts", "create notes.txt with hello", ' +
  'or "replace oldName with newName in src/foo.ts".';

const READ_WORDS = new Set(['read', 'show', 'display', 'cat', 'view', 'open']);
const LIST_WORDS = new Set(['list', 'ls', 'show']);
const SEARCH_WORDS = new Set(['search', 'find', 'locate', 'lookup', 'query', 'grep']);

function firstWord(text: string): string {
  return text.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}

/** The non-verb remainder of a prompt — the search query,
 *  once the leading intent words are stripped. */
function remainderAfterVerbs(text: string, verbs: Set<string>): string {
  const words = text.trim().split(/\s+/);
  let i = 0;
  while (i < words.length && verbs.has(words[i].toLowerCase())) i++;
  // Drop a leading "for / in / the" before the query.
  while (i < words.length && ['for', 'in', 'the', 'a', 'an'].includes(words[i].toLowerCase())) i++;
  return words.slice(i).join(' ');
}

/**
 * Resolve a file candidate against the workspace: an
 * absolute path as given; a path under the cwd; a bare
 * filename via the index glob (first match wins — the
 * same rule as the composer file completion). Returns
 * null when nothing resolves (the planner never guesses
 * a path it cannot verify).
 */
export function resolveFileCandidate(
  candidate: string,
  ctx: BrainContext,
): string | null {
  const text = candidate.trim();
  if (!text) return null;
  if (text.startsWith('/')) return text;
  const cwdHit = `${ctx.cwd.replace(/\/$/, '')}/${text}`;
  if (ctx.index.getKnownPaths().includes(cwdHit)) return cwdHit;
  const rootHit = `${ctx.workspaceRoot.replace(/\/$/, '')}/${text}`;
  if (ctx.index.getKnownPaths().includes(rootHit)) return rootHit;
  const basename = text.split('/').pop() ?? text;
  const globbed = ctx.index.glob(`**/${basename}`);
  if (globbed.length > 0) return globbed[0];
  // An open file by basename (the user is looking at it).
  const open = ctx.openFiles.find((f) => f.name === basename || f.path.endsWith(`/${text}`));
  return open ? open.path : null;
}

/** Close matches for an unresolved file (the reply names
 *  them, so the user can correct the name). */
function closeMatches(candidate: string, ctx: BrainContext): string[] {
  const basename = candidate.split('/').pop() ?? candidate;
  const stem = basename.replace(/\.[^.]+$/, '');
  if (!stem) return [];
  return ctx.index.glob(`**/*${stem}*`).slice(0, 5);
}

/** Parse "replace X with Y" / "change X to Y" from the
 *  prompt text (unquoted form). Returns null when the
 *  phrasing is not there. */
function parseReplacePhrasing(text: string): { oldText: string; newText: string } | null {
  const match = /(?:replace|change)\s+(.+?)\s+(?:with|to)\s+(.+?)(?:\s+in\s+\S+)?$/i.exec(text.trim());
  if (!match) return null;
  return { oldText: match[1].trim(), newText: match[2].trim() };
}

/**
 * The local planner. Deterministic: the same prompt +
 * the same workspace always plans the same calls.
 */
export class LocalPlanner implements AgentBrain {
  async plan(prompt: string, ctx: BrainContext): Promise<BrainPlan> {
    const { parts } = splitChainedCommands(prompt);
    const toolCalls: PlannedToolCall[] = [];
    for (const part of parts) {
      const planned = await this.planPart(part, ctx);
      // A part may return both calls AND a reply (a modify
      // with no old/new reads the file and asks what should
      // change) — the calls run, and the reply is the run's
      // final text. A part that returns only a reply ends
      // the chain: the earlier parts still run, the reply
      // explains the part that did not.
      toolCalls.push(...planned.toolCalls);
      if (planned.reply !== undefined) {
        return { toolCalls, reply: planned.reply };
      }
    }
    if (toolCalls.length === 0) {
      return { toolCalls: [], reply: this.unplannableReply(prompt) };
    }
    return { toolCalls };
  }

  private unplannableReply(prompt: string): string {
    const parsed = parseAgentInput(prompt);
    const intent = parsed.intent;
    if (intent === 'question-simple' || intent === 'question-complex') {
      return (
        'I can’t answer that from your files — I work on the workspace, I don’t have general knowledge. ' +
        LOCAL_PLANNER_CAPABILITIES
      );
    }
    return `I’m not sure what to do with that. ${LOCAL_PLANNER_CAPABILITIES}`;
  }

  private async planPart(part: string, ctx: BrainContext): Promise<BrainPlan> {
    const parsed = parseAgentInput(part);
    const candidates = extractFileCandidates(part);
    const first = firstWord(stripPoliteness(part));
    const normalized = normalizeIntentVerbs(first);

    // The file candidate: the first candidate that LOOKS
    // like a path (a slash or a file extension). Quoted
    // strings that are not paths — 'hello world', 'const
    // answer = 42;' — are the edit text or the content,
    // not the file: the old code took candidates[0]
    // blindly, so a quoted old string became the "file"
    // and the real file (named after it) was never
    // reached — "replace 'a' with 'b' in src/app.ts"
    // planned nothing. A quoted string that IS a path
    // ("read 'src/app.ts'") still counts: it looks like
    // one. No path-like candidate is "no file named", and
    // the caller decides the default from there.
    const isPathLike = (text: string): boolean =>
      text.includes('/') || /\.[A-Za-z0-9]{1,10}$/.test(text);
    const fileCandidate = candidates.find((c) => isPathLike(c.text));

    // A file candidate the workspace cannot resolve is
    // never guessed — the reply names it + close matches.
    const resolveFirst = (): {
      path: string | null;
      missing?: string;
      matches?: string[];
    } => {
      if (!fileCandidate) return { path: null };
      const resolved = resolveFileCandidate(fileCandidate.text, ctx);
      if (resolved) return { path: resolved };
      return {
        path: null,
        missing: fileCandidate.text,
        matches: closeMatches(fileCandidate.text, ctx),
      };
    };
    const missingReply = (missing: string, matches: string[]): BrainPlan => ({
      toolCalls: [],
      reply:
        `I couldn’t find "${missing}" in this workspace.` +
        (matches.length > 0 ? ` Did you mean ${matches.map((m) => `"${m}"`).join(', ')}?` : ''),
    });

    // "where is X defined" / "definition of X" — symbol
    // lookup, before the intent verbs (the parse calls it
    // a question; the file answer is the useful one).
    if (/\b(where is|definition of|define|find)\b.*\b(defined|definition)\b/i.test(part) || /^(where is|what is)\s+\S+\s+defined/i.test(part)) {
      const symbol = part
        .replace(/^(where is|what is)\s+/i, '')
        .replace(/\s+defined\??$/i, '')
        .trim()
        .split(/\s+/)[0];
      if (symbol) {
        const file = resolveFirst();
        if (file.path) {
          return { toolCalls: [{ name: 'go_to_definition', args: { filepath: file.path, symbol } }] };
        }
        return { toolCalls: [{ name: 'find_symbol', args: { name: symbol } }] };
      }
    }

    switch (parsed.intent) {
      case 'file-ops': {
        if (READ_WORDS.has(normalized) || READ_WORDS.has(first)) {
          const file = resolveFirst();
          if (file.missing) return missingReply(file.missing, file.matches ?? []);
          if (!file.path && ctx.activeFilePath) {
            return { toolCalls: [{ name: 'read_currently_open_file', args: {} }] };
          }
          if (!file.path) {
            return { toolCalls: [], reply: 'Which file should I read? Give me its name or path.' };
          }
          return { toolCalls: [{ name: 'read_file', args: { filepath: file.path } }] };
        }
        if (LIST_WORDS.has(normalized) || LIST_WORDS.has(first)) {
          const file = candidates.length > 0 ? resolveFirst() : null;
          if (file?.missing) {
            // A directory is not a file — resolveFirst
            // cannot find it. A missing candidate that
            // names a directory (some known file lives
            // under it) lists that directory; a candidate
            // naming nothing is still a miss.
            const dirPath = resolveAgentPath(file.missing, ctx.cwd, ctx.workspaceRoot);
            const exists = ctx.index
              .getKnownPaths()
              .some((p) => p.startsWith(`${dirPath.replace(/\/$/, '')}/`));
            if (exists) {
              return { toolCalls: [{ name: 'ls', args: { dirPath } }] };
            }
            return missingReply(file.missing, file.matches ?? []);
          }
          const dir = file?.path ?? ctx.cwd;
          return { toolCalls: [{ name: 'ls', args: { dirPath: dir } }] };
        }
        // Other file-ops (copy/move) are not built — say so.
        return { toolCalls: [], reply: `I can’t ${first} files yet — ${LOCAL_PLANNER_CAPABILITIES}` };
      }

      case 'search': {
        let query = remainderAfterVerbs(stripPoliteness(part), new Set([...SEARCH_WORDS, 'for', 'in']));
        // The file candidate is not part of the query —
        // "find useState in src/App.tsx" searches for
        // "useState", not for the filename as well.
        for (const candidate of candidates) {
          query = query.split(candidate.text).join(' ').replace(/\s+/g, ' ').trim();
        }
        query = query.replace(/\s+in\s*$/i, '').trim();
        const file = candidates.length > 0 ? resolveFirst() : null;
        if (file?.missing) return missingReply(file.missing, file.matches ?? []);
        if (file?.path) {
          if (!query) {
            return { toolCalls: [], reply: 'What should I search for in that file?' };
          }
          return {
            toolCalls: [{ name: 'grep_search', args: { pattern: query, filepath: file.path } }],
          };
        }
        if (!query) {
          return { toolCalls: [], reply: 'What should I search for?' };
        }
        return { toolCalls: [{ name: 'codebase_search', args: { query } }] };
      }

      case 'create': {
        // create always names a file — without one there is
        // nothing to create. The filename is the path-like
        // candidate (a quoted string that is not a path is
        // the CONTENT, not the file — "create notes.txt
        // with 'hello world'" creates notes.txt, not a file
        // called "hello world"). A candidate that does not
        // resolve is EXPECTED here (it does not exist yet):
        // resolve it as a fresh path under the cwd.
        const filename = fileCandidate?.text ?? null;
        const target = filename
          ? (resolveFileCandidate(filename, ctx) ??
            `${ctx.cwd.replace(/\/$/, '')}/${filename}`)
          : null;
        if (!target) {
          return { toolCalls: [], reply: 'What file should I create? Give me its name or path.' };
        }
        // Quoted strings other than the filename are the
        // content ("create notes.txt with 'hello'" — the
        // filename is the path candidate, the rest is
        // content; "create 'notes.txt' with 'hello'" — the
        // filename is the quoted path, the rest is content).
        const quoted = [...part.matchAll(/"([^"]+)"|'([^']+)'|`([^`]+)`/g)].map(
          (m) => m[1] ?? m[2] ?? m[3] ?? '',
        );
        const content = quoted.filter((q) => q !== filename).join('\n');
        return { toolCalls: [{ name: 'create_new_file', args: { filepath: target, content } }] };
      }

      case 'modify': {
        const file = resolveFirst();
        if (file.missing) return missingReply(file.missing, file.matches ?? []);
        if (!file.path) {
          if (ctx.activeFilePath) {
            return { toolCalls: [{ name: 'read_file', args: { filepath: ctx.activeFilePath } }] };
          }
          return { toolCalls: [], reply: 'Which file should I change? Give me its name or path.' };
        }
        // old/new from the quoted strings ("replace 'a'
        // with 'b'") or from the phrasing ("replace a with b").
        const quoted = [...part.matchAll(/"([^"]+)"|'([^']+)'|`([^`]+)`/g)].map(
          (m) => m[1] ?? m[2] ?? m[3] ?? '',
        );
        const phrasing = parseReplacePhrasing(stripPoliteness(part));
        const oldText = quoted.length >= 2 ? quoted[0] : phrasing?.oldText;
        const newText = quoted.length >= 2 ? quoted[1] : phrasing?.newText;
        if (oldText !== undefined && newText !== undefined) {
          return {
            toolCalls: [
              {
                name: 'multi_edit',
                args: { filepath: file.path, edits: [{ old_string: oldText, new_string: newText }] },
              },
            ],
          };
        }
        // A modify with no old/new is a read + a question:
        // show the file, ask what should change. The read
        // is the useful half — the loop shows it, and the
        // user answers with the old/new text.
        return {
          toolCalls: [{ name: 'read_file', args: { filepath: file.path } }],
          reply: `Here is ${file.path}. Tell me the old text and the new text — for example "replace 'old' with 'new' in ${file.path}".`,
        };
      }

      case 'fix': {
        // Fix starts from what is broken: the read carries
        // the file's diagnostics (read_file appends them).
        // Repairing without a model is the Aider slice's
        // job (#5) — this slice finds, it does not invent
        // a fix.
        const file = resolveFirst();
        if (file.missing) return missingReply(file.missing, file.matches ?? []);
        const target = file.path ?? ctx.activeFilePath;
        if (!target) {
          return { toolCalls: [], reply: 'Which file should I fix? Give me its name or path.' };
        }
        return { toolCalls: [{ name: 'read_file', args: { filepath: target } }] };
      }

      default:
        return { toolCalls: [], reply: this.unplannableReply(part) };
    }
  }
}
