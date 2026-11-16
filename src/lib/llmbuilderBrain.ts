/**
 * The LLMBuilder brain — LLMBuilder's retrieval base as
 * the agent loop's planning brain.
 *
 * The loop asks the brain to plan a turn; the brain
 * answers with tool calls (or an honest reply). This
 * brain is the driving intelligence's retrieval base:
 * LLMBuilder's exemplar retrieval (TF-IDF over exemplar
 * records — `llmbuilderRetrieval.ts`, the adapter's math
 * replicated exactly), pointed at the loop's task corpus.
 *
 * How retrieved record text becomes tool calls — the
 * design, plainly:
 * - The retrieval base returns RECORD TEXT, not tool
 *   calls, and its 669-record corpus holds no file-task
 *   knowledge and no tool-call mapping (no record
 *   describes an edit, a read, or a Keep). So the
 *   retrieval alone cannot plan a file task.
 * - The retrieval ALGORITHM and the CORPUS are separable.
 *   LLMBuilder contributes the algorithm (TF-IDF over
 *   exemplar records). The corpus that makes it useful
 *   for file tasks is the TASK corpus
 *   (`LLMBUILDER_TASK_CORPUS`, in llmbuilderRetrieval.ts):
 *   one record per task type the loop handles, each
 *   naming the tool sequence that does it
 *   ("fix a typo in a file" -> multi_edit,
 *   "read a file" -> read_file). The brain retrieves the
 *   nearest task record — the tool SELECTION comes from
 *   retrieval, not from verb patterns — and fills each
 *   tool's args from the user's prompt (the file it names,
 *   the quoted old/new text, the search words). Filling
 *   args from values the user gave is mechanical
 *   extraction, not "thinking".
 * - The LLMBuilder 669-record corpus is used for
 *   KNOWLEDGE answers (questions), not for planning.
 *   When it gains task records (the 3.0 work — flagged,
 *   NOT done here; LLMBuilder is a product), those
 *   records replace the Lucid-side task corpus.
 * - The brain ABSTAINS when it does not know: the top
 *   retrieved score below the threshold (or no match at
 *   all) returns an honest reply — "I don't know what to
 *   do with that" — never a guessed tool call. A guessed
 *   call is worse than no call.
 *
 * What this brain is NOT: it is not a model. It does not
 * understand language. It does not write novel code, hold
 * a conversation, or remember between sessions. It matches
 * a task description against the task corpus by term
 * overlap and fills in the values the user gave. The
 * improvement over the deterministic planner it replaces
 * is that the tool choice comes from retrieval — it
 * generalises over task descriptions ("the word 'wrod'
 * should be 'word'" has no "fix" verb but still matches
 * the typo-fix record) — and the knowledge it answers
 * from is a corpus, not a switch on the first word.
 *
 * The @-references are scope, not planning: the pins
 * resolve against the index before retrieval, the same
 * way they always have. A @file pin scopes the action;
 * @codebase makes the rest of the prompt the search;
 * an unresolved or unsupported pin stops the part with
 * an honest reply.
 *
 * The brain never executes anything. It only plans.
 * Nothing applies until Keep — the loop and the policy
 * gate own that.
 */

import type { AgentBrain, BrainContext, BrainPlan, PlannedToolCall } from './agentBrain';
import {
  closeMatches,
  fileDiscoveredInHistory,
  parseReplacePhrasing,
  resolveFileCandidate,
} from './agentBrain';
import { parseAtReferences, resolveAtReferences, stripAtReferences } from './agentAtRefs';
import { resolveAgentPath } from './agentHost';
import { extractFileCandidates, parseAgentInput, splitChainedCommands } from './inputParse';
import { stripPoliteness } from './inputNormalize';
import {
  buildTaskRetriever,
  LLMBUILDER_TASK_CORPUS,
  type ExemplarRetriever,
  type TaskRecord,
} from './llmbuilderRetrieval';

export const LLMBUILDER_BRAIN_CAPABILITIES =
  'I read, list, search, and edit files, I can search the codebase, find a symbol, show the diff, and fix a file’s diagnostics.';

/** The abstention threshold. The top retrieved task
 *  record must score at or above this, or the brain says
 *  it does not know instead of guessing a plan. The score
 *  alone does not separate tasks from non-tasks (a single
 *  shared verb scores ~0.3–0.45 either way), so the
 *  brain also requires the match to share two or more
 *  terms, or the prompt to carry file-task evidence (a
 *  named file, or quoted text). Calibrated by the
 *  retrieval calibration test
 *  (tests/llmbuilderRetrieval.test.ts). */
export const ABSTAIN_THRESHOLD = 0.25;

/** The brain's shared retriever — built once over the
 *  task corpus (the IDF map and the vectors are computed
 *  at load; a query is a single sparse-cosine pass). */
const taskRetriever: ExemplarRetriever = buildTaskRetriever();

function quotedStrings(text: string): string[] {
  return [...text.matchAll(/"([^"]+)"|'([^']+)'|`([^`]+)`/g)].map(
    (m) => m[1] ?? m[2] ?? m[3] ?? '',
  );
}

const isPathLike = (text: string): boolean =>
  text.includes('/') || /\.[A-Za-z0-9]{1,10}$/.test(text);

export class LLMBuilderBrain implements AgentBrain {
  private readonly retriever: ExemplarRetriever;
  private readonly taskCorpus: TaskRecord[];

  constructor(retriever: ExemplarRetriever = taskRetriever, taskCorpus: TaskRecord[] = LLMBUILDER_TASK_CORPUS) {
    this.retriever = retriever;
    this.taskCorpus = taskCorpus;
  }

  async plan(prompt: string, ctx: BrainContext): Promise<BrainPlan> {
    const fresh = await this.planFresh(prompt, ctx);
    const history = ctx.history ?? [];
    if (history.length === 0) return fresh;

    // Re-planning: the plan is re-made from the tool
    // results, not repeated blindly. A call already
    // executed in an earlier round is dropped — the
    // brain has nothing new to say about its own results,
    // and re-running it would loop forever on the same
    // work. A failed call is dropped too: the brain cannot
    // correct its own input the way a model would, so the
    // failure stands in the run's reply instead of being
    // retried verbatim.
    const executed = new Set<string>();
    for (const round of history) {
      for (const call of round.toolCalls) {
        executed.add(JSON.stringify({ name: call.name, args: call.args }));
      }
      // The verify step's fix calls are real tool calls
      // too — they ran, so a fresh plan must not
      // re-propose them either.
      for (const result of round.results) {
        executed.add(JSON.stringify({ name: result.call.name, args: result.call.args }));
      }
    }
    const toolCalls = fresh.toolCalls.filter(
      (c) => !executed.has(JSON.stringify({ name: c.name, args: c.args })),
    );
    return { toolCalls, reply: fresh.reply };
  }

  private async planFresh(prompt: string, ctx: BrainContext): Promise<BrainPlan> {
    const { parts } = splitChainedCommands(prompt);
    const toolCalls: PlannedToolCall[] = [];
    for (const part of parts) {
      const planned = await this.planPart(part, ctx);
      // A part may return both calls AND a reply (a
      // modify with no old/new reads the file and asks
      // what should change) — the calls run, and the
      // reply is the run's final text. A part that returns
      // only a reply ends the chain: the earlier parts
      // still run, the reply explains the part that did
      // not.
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

  private unplannableReply(prompt: string, topScore?: number, weakMatch = false): string {
    const parsed = parseAgentInput(prompt);
    const intent = parsed.intent;
    if (intent === 'question-simple' || intent === 'question-complex') {
      return (
        'I can’t answer that from your files — I work on the workspace, I don’t have general knowledge. ' +
        LLMBUILDER_BRAIN_CAPABILITIES
      );
    }
    const scoreNote =
      topScore !== undefined && topScore < ABSTAIN_THRESHOLD
        ? ` (the closest task I know scored ${topScore.toFixed(2)}, below the ${ABSTAIN_THRESHOLD.toFixed(2)} I need to be sure)`
        : weakMatch
          ? ` (the closest task I know only shares one word with that, so I’m not sure it’s a file task)`
          : '';
    return `I’m not sure what to do with that${scoreNote}. ${LLMBUILDER_BRAIN_CAPABILITIES}`;
  }

  private async planPart(part: string, ctx: BrainContext): Promise<BrainPlan> {
    // @-references first: the pins resolve against the
    // index before anything else is parsed — an
    // unresolved or unsupported pin stops the part with
    // an honest reply, never a guessed plan.
    const atRefs = parseAtReferences(part);
    const resolvedRefs = resolveAtReferences(atRefs, {
      index: ctx.index,
      workspaceRoot: ctx.workspaceRoot,
      cwd: ctx.cwd,
    });
    const unsupported = resolvedRefs.find((r) => r.status === 'unsupported');
    if (unsupported) {
      return {
        toolCalls: [],
        reply: unsupported.reason ?? `I can’t use @${unsupported.raw} here.`,
      };
    }
    const unresolved = resolvedRefs.find((r) => r.status === 'unresolved');
    if (unresolved) {
      const matches = unresolved.kind === 'file' ? closeMatches(unresolved.target, ctx) : [];
      return {
        toolCalls: [],
        reply:
          (unresolved.reason ?? `I couldn’t find "${unresolved.target}" in this workspace.`) +
          (matches.length > 0
            ? ` Did you mean ${matches.map((m) => `"${m}"`).join(', ')}?`
            : ''),
      };
    }
    // The pins are scope, not instruction text: the rest
    // of the part parses without them.
    const scopedPart = atRefs.length > 0 ? stripAtReferences(part, atRefs) : part;
    const atFilePaths = resolvedRefs
      .filter((r) => r.kind === 'file')
      .flatMap((r) => r.paths ?? []);
    const atFolderDirs = resolvedRefs
      .filter((r) => r.kind === 'folder')
      .map((r) => resolveAgentPath(r.target.replace(/\/+$/, ''), ctx.cwd, ctx.workspaceRoot));
    const atSymbolNames = resolvedRefs
      .filter((r) => r.kind === 'symbol')
      .map((r) => r.target);
    const hasCodebase = resolvedRefs.some((r) => r.kind === 'codebase');

    // @codebase: the rest of the prompt IS the search —
    // the whole indexed codebase, no file to name.
    if (hasCodebase) {
      const query = scopedPart.trim();
      if (!query) {
        return { toolCalls: [], reply: 'What should I search for in the codebase?' };
      }
      return { toolCalls: [{ name: 'codebase_search', args: { query } }] };
    }
    // A @symbol pin with no file pin is a symbol lookup.
    if (atSymbolNames.length > 0 && atFilePaths.length === 0) {
      return { toolCalls: [{ name: 'find_symbol', args: { name: atSymbolNames[0] } }] };
    }

    const candidates = extractFileCandidates(scopedPart);
    // A @file pin IS a file candidate (the mention source
    // the parser already knows) — pinned first, so the
    // pin scopes the action instead of the text guessing.
    for (const path of [...atFilePaths].reverse()) {
      if (!candidates.some((c) => c.text === path)) {
        candidates.unshift({ text: path, source: 'mention' });
      }
    }
    const fileCandidate = candidates.find((c) => isPathLike(c.text));

    // A file candidate the workspace cannot resolve is
    // never guessed — the reply names it + close matches.
    // The fast path may not have indexed it yet (a bare
    // filename resolves by glob, which needs the full
    // build), so a miss waits briefly for the background
    // build and retries once — the wait is bounded (10s),
    // and the UI shows the index progress while it waits,
    // instead of a bare "Working…".
    const resolveFirst = async (): Promise<{
      path: string | null;
      missing?: string;
      matches?: string[];
    }> => {
      if (!fileCandidate) return { path: null };
      const resolved = resolveFileCandidate(fileCandidate.text, ctx);
      if (resolved) return { path: resolved };
      const built = await ctx.index.whenBuilt(10_000);
      if (built) {
        const retried = resolveFileCandidate(fileCandidate.text, ctx);
        if (retried) return { path: retried };
      }
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

    // The retrieval: the nearest task record is the plan.
    // The prompt (pins stripped) is the query — the pins
    // already scoped it, and the retrieval matches on the
    // task description, not on the file path.
    const matches = this.retriever.retrieve(scopedPart, { topK: 3 });
    const top = matches[0];
    if (!top || top.score < ABSTAIN_THRESHOLD) {
      return { toolCalls: [], reply: this.unplannableReply(scopedPart, top?.score) };
    }
    // A single shared verb is not a file task: "how do I
    // make pancakes" shares "make" with the create record,
    // and "write a poem" shares "write". The match only
    // counts as a task when it shares two or more terms,
    // or when the prompt carries evidence for the task the
    // record names — a named file or quoted text for a
    // file task, or the search text / symbol for a search
    // task ("search for greet" shares only "search", but
    // "greet" is the search text). Otherwise the brain
    // abstains — it does not ask "which file should I
    // create?" about pancakes.
    let record = top.record as TaskRecord;
    if (!record.tools || record.tools.length === 0) {
      return { toolCalls: [], reply: this.unplannableReply(scopedPart, top.score) };
    }
    const isSearchRecord = [
      'search-file',
      'search-codebase',
      'glob-files',
      'find-symbol',
      'go-to-definition',
      'find-references',
    ].includes(record.id);
    const searchEvidence =
      isSearchRecord &&
      (this.searchText(scopedPart, candidates) !== '' ||
        atSymbolNames.length > 0 ||
        this.symbolFrom(scopedPart) !== null);
    const fileEvidence =
      candidates.some((c) => isPathLike(c.text)) ||
      quotedStrings(scopedPart).length > 0 ||
      atFilePaths.length > 0 ||
      atFolderDirs.length > 0;
    // A file a previous round's search found, or the open
    // file, is evidence too — "fix it" after a search
    // means the file the search named.
    const historyEvidence =
      ctx.activeFilePath !== null || fileDiscoveredInHistory(ctx) !== null;
    if (top.sharedTerms < 2 && !fileEvidence && !searchEvidence && !historyEvidence) {
      return { toolCalls: [], reply: this.unplannableReply(scopedPart, top.score, true) };
    }
    // Post-retrieval routing — the retrieval cannot tell
    // these apart from the text alone, but the prompt's
    // evidence can:
    // - "read src/app.ts" retrieves the open-file record
    //   (the text is "read the file" either way), but a
    //   named file means the named file, not the open one.
    // - "replace X with Y in src/app.ts" retrieves the
    //   across-the-codebase record (both share "replace"),
    //   but named files and no codebase marker mean the
    //   replace, not the codebase search.
    if (record.id === 'read-open-file' && candidates.some((c) => isPathLike(c.text))) {
      record = this.taskCorpus.find((r) => r.id === 'read-file') ?? record;
    }
    // A search with no file named is a codebase search;
    // a search with a file named is a grep in that file.
    // The retrieval cannot tell them apart (both share
    // "search") — the file candidate does.
    if (record.id === 'search-file' && !candidates.some((c) => isPathLike(c.text))) {
      record = this.taskCorpus.find((r) => r.id === 'search-codebase') ?? record;
    } else if (record.id === 'search-codebase' && candidates.some((c) => isPathLike(c.text))) {
      record = this.taskCorpus.find((r) => r.id === 'search-file') ?? record;
    }
    if (record.id === 'rename-across-codebase') {
      const codebaseMarker =
        /\bacross the codebase\b|\beverywhere\b|\bin every file\b|\ball files\b/i.test(scopedPart);
      if (!codebaseMarker) {
        // No codebase marker means it is a replace, not a
        // codebase search — named files or not. The
        // replace record asks "which file?" when none is
        // named, instead of searching the whole codebase
        // on a guess.
        record = this.taskCorpus.find((r) => r.id === 'replace-text') ?? record;
      }
    }

    // A replace across SEVERAL named files is ONE
    // multi_file_edit call, not one multi_edit per file.
    // The retrieval cannot tell one file from several
    // (the text does not say "several") — the count of
    // resolved path-like candidates does. A file that
    // cannot be resolved stops the part the same way a
    // single missing file does.
    let toolNames = [...record.tools];
    if (record.id === 'replace-text') {
      const targets: string[] = [];
      for (const candidate of candidates.filter((c) => isPathLike(c.text))) {
        const resolved = resolveFileCandidate(candidate.text, ctx);
        if (!resolved) {
          return missingReply(candidate.text, closeMatches(candidate.text, ctx));
        }
        if (!targets.includes(resolved)) targets.push(resolved);
      }
      if (targets.length >= 2) {
        toolNames = ['multi_file_edit'];
      }
    }

    // Fill each tool's args from the prompt. A tool whose
    // required arg cannot be filled stops the part with
    // an honest reply — never a guessed arg.
    const filled: PlannedToolCall[] = [];
    for (const toolName of toolNames) {
      const call = await this.fillTool(
        toolName,
        record,
        scopedPart,
        ctx,
        candidates,
        fileCandidate?.text ?? null,
        resolveFirst,
        atFolderDirs,
        atSymbolNames,
      );
      // A fill may return a call AND a reply (a modify
      // with no old/new reads the file and asks what
      // should change) — the call runs, and the reply is
      // the run's final text. Push the call first, then
      // return with the reply.
      if (call.call) filled.push(call.call);
      if ('reply' in call) return { toolCalls: filled, reply: call.reply };
    }
    if (filled.length === 0) {
      return { toolCalls: [], reply: this.unplannableReply(scopedPart, top.score) };
    }
    // A task record may carry its own reply (the
    // rename-across-the-codebase record: the search runs,
    // and the reply says the rename follows from the
    // files the search returns).
    if (record.reply) {
      return { toolCalls: filled, reply: this.renderRecordReply(record, scopedPart) };
    }
    return { toolCalls: filled };
  }

  private renderRecordReply(record: TaskRecord, scopedPart: string): string {
    const quoted = quotedStrings(scopedPart);
    const phrasing = parseReplacePhrasing(stripPoliteness(scopedPart));
    const oldText = quoted.length >= 2 ? quoted[0] : phrasing?.oldText ?? '';
    return (record.reply ?? '').replace('{old}', oldText);
  }

  /** Fill one tool's args from the prompt. Returns the
   *  call, or a reply when a required arg cannot be
   *  filled. The `resolveFirst` helper resolves the first
   *  path-like file candidate; the brain never guesses a
   *  file, a symbol, or an old/new text it was not given. */
  private async fillTool(
    toolName: string,
    record: TaskRecord,
    scopedPart: string,
    ctx: BrainContext,
    candidates: ReturnType<typeof extractFileCandidates>,
    fileCandidateText: string | null,
    resolveFirst: () => Promise<{ path: string | null; missing?: string; matches?: string[] }>,
    atFolderDirs: string[],
    atSymbolNames: string[],
  ): { call?: PlannedToolCall; reply?: string } {
    const missingReply = (missing: string, matches: string[]): { reply: string } => ({
      reply:
        `I couldn’t find "${missing}" in this workspace.` +
        (matches.length > 0 ? ` Did you mean ${matches.map((m) => `"${m}"`).join(', ')}?` : ''),
    });
    const quoted = quotedStrings(scopedPart);
    const phrasing = parseReplacePhrasing(stripPoliteness(scopedPart));

    switch (toolName) {
      case 'read_file': {
        const file = await resolveFirst();
        if (file.missing) return missingReply(file.missing, file.matches ?? []);
        // No file named: the open file, or the file a
        // previous round's search found (re-planning
        // follow-through — "find where X is defined and
        // fix it" fixes the file round 1 found), or ask.
        // The open file is a different tool (read the file
        // that is open), not a guessed path.
        if (!file.path) {
          if (ctx.activeFilePath) {
            return { call: { name: 'read_currently_open_file', args: {} } };
          }
          const discovered = fileDiscoveredInHistory(ctx);
          if (discovered) {
            return { call: { name: 'read_file', args: { filepath: discovered } } };
          }
          return { reply: 'Which file should I read? Give me its name or path.' };
        }
        return { call: { name: 'read_file', args: { filepath: file.path } } };
      }

      case 'read_currently_open_file': {
        return { call: { name: 'read_currently_open_file', args: {} } };
      }

      case 'ls': {
        const file = candidates.length > 0 ? await resolveFirst() : null;
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
            return { call: { name: 'ls', args: { dirPath } } };
          }
          return missingReply(file.missing, file.matches ?? []);
        }
        const dir = file?.path ?? atFolderDirs[0] ?? ctx.cwd;
        return { call: { name: 'ls', args: { dirPath: dir } } };
      }

      case 'grep_search': {
        const file = candidates.length > 0 ? await resolveFirst() : null;
        if (file?.missing) return missingReply(file.missing, file.matches ?? []);
        const query = this.searchText(scopedPart, candidates);
        if (!query) {
          return { reply: 'What should I search for?' };
        }
        return {
          call: {
            name: 'grep_search',
            args: file?.path ? { pattern: query, filepath: file.path } : { pattern: query },
          },
        };
      }

      case 'codebase_search': {
        // The rename-across-the-codebase record searches
        // for the OLD text; the plain search record
        // searches for the search text.
        const query =
          record.id === 'rename-across-codebase'
            ? quoted.length >= 2
              ? quoted[0]
              : phrasing?.oldText
            : this.searchText(scopedPart, candidates);
        if (!query) {
          return { reply: 'What should I search for?' };
        }
        return { call: { name: 'codebase_search', args: { query } } };
      }

      case 'file_glob_search': {
        const pattern = fileCandidateText ?? this.searchText(scopedPart, candidates);
        if (!pattern) {
          return { reply: 'What file pattern should I look for?' };
        }
        return { call: { name: 'file_glob_search', args: { pattern } } };
      }

      case 'find_symbol': {
        const symbol = atSymbolNames[0] ?? this.symbolFrom(scopedPart);
        if (!symbol) {
          return { reply: 'Which symbol should I find?' };
        }
        return { call: { name: 'find_symbol', args: { name: symbol } } };
      }

      case 'go_to_definition': {
        const symbol = atSymbolNames[0] ?? this.symbolFrom(scopedPart);
        const file = await resolveFirst();
        if (file.missing) return missingReply(file.missing, file.matches ?? []);
        if (!symbol) {
          return { reply: 'Which symbol should I find the definition of?' };
        }
        if (!file.path) {
          return { call: { name: 'find_symbol', args: { name: symbol } } };
        }
        return {
          call: { name: 'go_to_definition', args: { filepath: file.path, symbol } },
        };
      }

      case 'find_references': {
        const symbol = atSymbolNames[0] ?? this.symbolFrom(scopedPart);
        const file = await resolveFirst();
        if (file.missing) return missingReply(file.missing, file.matches ?? []);
        if (!symbol) {
          return { reply: 'Which symbol should I find references to?' };
        }
        if (!file.path) {
          return { call: { name: 'find_symbol', args: { name: symbol } } };
        }
        return {
          call: { name: 'find_references', args: { filepath: file.path, symbol } },
        };
      }

      case 'create_new_file': {
        // Create always names a file — without one there
        // is nothing to create. A candidate that does
        // not resolve is EXPECTED here (it does not exist
        // yet): resolve it as a fresh path under the cwd.
        const filename = fileCandidateText;
        const target = filename
          ? (resolveFileCandidate(filename, ctx) ??
            `${ctx.cwd.replace(/\/$/, '')}/${filename}`)
          : null;
        if (!target) {
          return { reply: 'What file should I create? Give me its name or path.' };
        }
        // Quoted strings other than the filename are the
        // content (a quoted string that is not a path is
        // the CONTENT, not the file).
        const content = quoted.filter((q) => q !== filename).join('\n');
        return { call: { name: 'create_new_file', args: { filepath: target, content } } };
      }

      case 'multi_edit': {
        const file = await resolveFirst();
        if (file.missing) return missingReply(file.missing, file.matches ?? []);
        if (!file.path) {
          if (ctx.activeFilePath) {
            // The active file, read + the question — the
            // user is looking at it, so show it and ask
            // what should change (the same read + ask as
            // a modify with no old/new, below).
            return {
              call: { name: 'read_file', args: { filepath: ctx.activeFilePath } },
              reply: `Here is ${ctx.activeFilePath}. Tell me the old text and the new text — for example "replace 'old' with 'new' in ${ctx.activeFilePath}".`,
            };
          }
          return { reply: 'Which file should I change? Give me its name or path.' };
        }
        const oldText = quoted.length >= 2 ? quoted[0] : phrasing?.oldText;
        const newText = quoted.length >= 2 ? quoted[1] : phrasing?.newText;
        if (oldText !== undefined && newText !== undefined) {
          return {
            call: {
              name: 'multi_edit',
              args: { filepath: file.path, edits: [{ old_string: oldText, new_string: newText }] },
            },
          };
        }
        // A modify with no old/new is a read + a question:
        // show the file, ask what should change. The read
        // is the useful half — the loop shows it, and the
        // user answers with the old/new text.
        return {
          call: { name: 'read_file', args: { filepath: file.path } },
          reply: `Here is ${file.path}. Tell me the old text and the new text — for example "replace 'old' with 'new' in ${file.path}".`,
        };
      }

      case 'multi_file_edit': {
        const targets: string[] = [];
        for (const candidate of candidates.filter((c) => isPathLike(c.text))) {
          const resolved = resolveFileCandidate(candidate.text, ctx);
          if (!resolved) {
            return missingReply(candidate.text, closeMatches(candidate.text, ctx));
          }
          if (!targets.includes(resolved)) targets.push(resolved);
        }
        if (targets.length === 0) {
          return { reply: 'Which files should I change? Give me their names or paths.' };
        }
        const oldText = quoted.length >= 2 ? quoted[0] : phrasing?.oldText;
        const newText = quoted.length >= 2 ? quoted[1] : phrasing?.newText;
        if (oldText === undefined || newText === undefined) {
          return {
            reply: `Tell me the old text and the new text — for example "replace 'old' with 'new' in ${targets.join(', ')}".`,
          };
        }
        return {
          call: {
            name: 'multi_file_edit',
            args: {
              files: targets.map((filepath) => ({
                filepath,
                edits: [{ old_string: oldText, new_string: newText, replace_all: true }],
              })),
            },
          },
        };
      }

      case 'fix_diagnostics': {
        // Fix starts from what is broken: the read (the
        // previous call in the record) carries the file's
        // diagnostics, then fix_diagnostics reflects on
        // them. No file named: the active file, or the
        // file a previous round's search found.
        const file = await resolveFirst();
        if (file.missing) return missingReply(file.missing, file.matches ?? []);
        const target = file.path ?? ctx.activeFilePath ?? fileDiscoveredInHistory(ctx);
        if (!target) {
          return { reply: 'Which file should I fix? Give me its name or path.' };
        }
        return { call: { name: 'fix_diagnostics', args: { filepath: target } } };
      }

      case 'view_diff': {
        const file = candidates.length > 0 ? await resolveFirst() : null;
        if (file?.missing) return missingReply(file.missing, file.matches ?? []);
        return {
          call: {
            name: 'view_diff',
            args: file?.path ? { filepath: file.path } : {},
          },
        };
      }

      default:
        return {
          reply: `I don’t know how to do that yet — ${LLMBUILDER_BRAIN_CAPABILITIES}`,
        };
    }
  }

  /** The search text: the prompt minus the verbs, the
   *  file candidates, and the trailing "in". The file
   *  candidate is not part of the query — "find useState
   *  in src/App.tsx" searches for "useState", not for the
   *  filename as well. */
  private searchText(
    scopedPart: string,
    candidates: ReturnType<typeof extractFileCandidates>,
  ): string {
    const SEARCH_WORDS = new Set(['search', 'find', 'locate', 'lookup', 'query', 'grep', 'for', 'in']);
    let query = stripPoliteness(scopedPart).trim();
    const words = query.split(/\s+/);
    while (words.length > 0 && SEARCH_WORDS.has(words[0].toLowerCase())) words.shift();
    query = words.join(' ');
    for (const candidate of candidates) {
      query = query.split(candidate.text).join(' ').replace(/\s+/g, ' ').trim();
    }
    query = query.replace(/\s+in\s*$/i, '').trim();
    return query;
  }

  /** The symbol: the word after "where is"/"definition
   *  of", or the first word of the remainder. */
  private symbolFrom(scopedPart: string): string | null {
    const symbol = scopedPart
      .replace(/^(where is|what is)\s+/i, '')
      .replace(/\s+defined\??$/i, '')
      .trim()
      .split(/\s+/)[0];
    return symbol || null;
  }
}
