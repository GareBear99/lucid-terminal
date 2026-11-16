/**
 * The brain — the thing that turns a prompt into tool
 * calls.
 *
 * The seam is Continue's `BaseLLM` abstraction
 * (`core/llm/index.ts:90`): the whole agent talks to ONE
 * interface, and the provider behind it is swappable. In
 * Lucid the interface is `AgentBrain`: plan one turn from
 * a prompt + context, and return tool calls or a text
 * reply. The loop never knows which brain answered.
 *
 * The brain is the LLMBuilder brain
 * (`llmbuilderBrain.ts`): LLMBuilder's retrieval base
 * (exemplar retrieval, TF-IDF over a task corpus) as the
 * planning brain. The retrieval returns the nearest task
 * record, and the record names the tool sequence — the
 * tool choice comes from retrieval, not from verb
 * patterns. The brain fills each tool's args from the
 * values the user gave (the file it names, the quoted
 * old/new text, the search words). When it does not know,
 * it abstains with an honest reply — never a guessed
 * tool call.
 *
 * This module holds the seam (`AgentBrain`,
 * `BrainContext`, `BrainPlan`) and the shared helpers
 * every brain uses to resolve files against the workspace
 * (`resolveFileCandidate`, `fileDiscoveredInHistory`,
 * `closeMatches`, `parseReplacePhrasing`). It holds no
 * brain of its own.
 *
 * @-references pin explicit context — @file / @folder
 * attach a path, @code a symbol, @codebase the whole
 * indexed codebase; the guidance is to use @ when you
 * know which files matter and skip it when you do not
 * (the agent's own search finds them). A rename across
 * several named files plans ONE multi_file_edit call —
 * one plan, one Keep, one re-check — instead of one
 * multi_edit per file. A rename "across the codebase"
 * searches first (codebase_search) instead of guessing
 * the file list: the brain cannot know the files until
 * it has seen the search results, and it never invents
 * them.
 *
 * What a brain does NOT do: answer questions from
 * knowledge (question intents → an honest reply, no
 * tools), or plan a call for a file it cannot resolve
 * (an unresolved file candidate → a reply naming the
 * file + close matches from the index, never a guessed
 * path). @docs / @web / @git are honestly unsupported —
 * the local agent has no docs index and no network, so
 * they are answered, never planned around.
 */

import type { AgentFileIndex } from './agentIndex';

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

/** One round the loop already ran (Claude Code's
 *  `query.ts` `while (true)`: every iteration's tool
 *  results feed back into the next plan — the loop
 *  re-plans from what actually happened, not from the
 *  original prompt alone). The brain sees the calls it
 *  planned and what each returned, in order. */
export interface BrainRoundResult {
  toolCalls: PlannedToolCall[];
  results: Array<{
    call: PlannedToolCall;
    ok: boolean;
    output: string;
    error?: string;
  }>;
}

/** What the brain sees. The index resolves bare
 *  filenames; the open files give the default target
 *  (the file the user is looking at). `history` is the
 *  rounds already run this turn, oldest first — empty /
 *  absent on the first round. A brain that ignores it
 *  plans exactly as before (the old one-shot behaviour);
 *  a brain that reads it can plan the NEXT step from the
 *  last step's results. */
export interface BrainContext {
  workspaceRoot: string;
  cwd: string;
  openFiles: Array<{ path: string; name: string }>;
  activeFilePath: string | null;
  index: AgentFileIndex;
  history?: BrainRoundResult[];
  /** 0-based round number this turn. */
  round?: number;
}

export interface AgentBrain {
  plan(prompt: string, ctx: BrainContext): Promise<BrainPlan>;
}

/**
 * Resolve a file candidate against the workspace: an
 * absolute path as given; a path under the cwd; a bare
 * filename via the index glob (first match wins — the
 * same rule as the composer file completion). Returns
 * null when nothing resolves (the brain never guesses a
 * path it cannot verify).
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

/** A file a previous round's search NAMED — the
 *  follow-through step of the re-planning loop. When the
 *  prompt names a symbol but no file ("find where greet
 *  is defined and fix it"), round 1 searches, and round
 *  2 fixes the file the search found: the search tools
 *  print matches as `path:line` lines, so the first
 *  printed path the index knows is the file. Nothing
 *  is guessed — a printed path the workspace does not
 *  know is ignored. */
export function fileDiscoveredInHistory(ctx: BrainContext): string | null {
  const history = ctx.history ?? [];
  const known = new Set(ctx.index.getKnownPaths());
  for (const round of history) {
    for (const result of round.results) {
      if (!result.ok) continue;
      if (!['find_symbol', 'codebase_search', 'grep_search'].includes(result.call.name)) continue;
      for (const line of result.output.split('\n')) {
        const match = /^(\S+?):\d+/.exec(line.trim());
        if (match && known.has(match[1])) return match[1];
      }
    }
  }
  return null;
}

/** Close matches for an unresolved file (the reply names
 *  them, so the user can correct the name). */
export function closeMatches(candidate: string, ctx: BrainContext): string[] {
  const basename = candidate.split('/').pop() ?? candidate;
  const stem = basename.replace(/\.[^.]+$/, '');
  if (!stem) return [];
  return ctx.index.glob(`**/*${stem}*`).slice(0, 5);
}

/** Parse "replace X with Y" / "change X to Y" /
 *  "rename X to Y" from the prompt text (unquoted form).
 *  The trailing "in <files>" scope is stripped first —
 *  the files are resolved separately, so the phrasing
 *  only has to yield the old/new text. Returns null when
 *  the phrasing is not there. */
export function parseReplacePhrasing(text: string): { oldText: string; newText: string } | null {
  const withoutScope = text.trim().replace(/\s+in\s+.+$/i, '');
  const match = /(?:replace|change|rename)\s+(.+?)\s+(?:with|to)\s+(.+)$/i.exec(withoutScope);
  if (!match) return null;
  return { oldText: match[1].trim(), newText: match[2].trim() };
}
