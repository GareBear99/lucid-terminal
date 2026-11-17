/**
 * Exemplar retrieval — LLMBuilder's retrieval base, in
 * TypeScript.
 *
 * This is the retrieval mechanism from LLMBuilder's
 * exemplar adapter (`adapters/exemplar_adapter.py`):
 * TF-IDF over exemplar records, plain sparse cosine
 * similarity, a capability boost (x2.0) and a generic
 * penalty (x0.8), and capability-first selection. The
 * math is replicated exactly — the same tokenizer, the
 * same natural-log IDF, the same cosine, the same
 * boost/penalty and selection rules — so a TS retrieval
 * over the same records ranks the same way the Python
 * adapter does (verified by a parity test against the
 * Python adapter's scores).
 *
 * The retrieval runs in-process, over records held in
 * memory. No Python, no subprocess, no network, no
 * model file to load per query. A query over the task
 * corpus is sub-millisecond after the one-time load.
 *
 * Two corpora use this retrieval:
 * - The TASK corpus (llmbuilderTaskCorpus, below): the
 *   agent loop's own task knowledge — one record per
 *   task type, each naming the tool sequence that does
 *   it. The planning brain retrieves from this corpus:
 *   the nearest task record is the plan. The corpus is
 *   Lucid-side and explicit (it is the loop's knowledge
 *   of its own tools), and the retrieval algorithm is
 *   LLMBuilder's.
 * - The LLMBUILDER corpus (the 669-record exemplar
 *   model): general knowledge, used for answers to
 *   questions (not for planning — it holds no file-task
 *   knowledge and no tool-call mapping; see the brain
 *   module's notes). Loaded from the model JSON when one
 *   is available.
 *
 * The retrieval returns records, not prose. The adapter's
 * text assembly (prose answer + "Supporting patterns" +
 * "Confidence: bounded…") is NOT replicated here — the
 * brain needs the matched records and their scores, not
 * a paragraph.
 */

/** One exemplar record, as the retrieval sees it. */
export interface RetrievalRecord {
  /** Human-readable id (for debugging / the reply). */
  id: string;
  /** The task / question this record is about. */
  prompt: string;
  /** Pre-tokenized prompt (the adapter reads these from
   *  the model JSON). When absent, the retriever
   *  tokenizes `prompt` itself with the same regex. */
  prompt_tokens?: string[];
  /** The record's capability (drives the x2.0 boost /
   *  x0.8 penalty and the capability-first selection). */
  capability: string;
  /** Where the record came from (provenance, for the
   *  matches list). */
  source_repo?: string;
  source_file?: string;
  /** The record's answer / target text (prose). Used for
   *  knowledge answers, not for planning. */
  target?: string;
}

/** One retrieved match: the record and its (boosted) score.
 *  `sharedTerms` is how many of the query's distinctive
 *  terms (IDF > 0) the record's prompt also has — the
 *  brain uses it with the score to decide whether the
 *  match is a file task at all (a single shared verb is
 *  not enough: "how do I make pancakes" shares "make"
 *  with the create record, and "write a poem" shares
 *  "write"). */
export interface RetrievalMatch {
  score: number;
  record: RetrievalRecord;
  sharedTerms: number;
}

/** The tokenizer — the adapter's single regex, lowercased.
 *  No stemming, no stopwords, no subword model. */
const TOKEN_RE = /[a-zA-Z0-9_']+/g;

export function tokenize(text: string): string[] {
  return (text || '').toLowerCase().match(TOKEN_RE) ?? [];
}

function norm(values: Map<string, number>): number {
  let sum = 0;
  for (const v of values.values()) sum += v * v;
  const n = Math.sqrt(sum);
  return n === 0 ? 1.0 : n;
}

/** Sparse cosine similarity — the adapter's `_cosine`. */
function cosine(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 || b.size === 0) return 0.0;
  const denom = norm(a) * norm(b);
  if (denom === 0) return 0.0;
  let numer = 0;
  for (const [term, v] of a) {
    numer += v * (b.get(term) ?? 0);
  }
  return numer / denom;
}

/**
 * The retriever — built once over a record set (the IDF
 * map and the TF-IDF vectors are computed at load, exactly
 * as the adapter does). `retrieve` is a single sparse-
 * cosine pass per query.
 */
export class ExemplarRetriever {
  private readonly records: RetrievalRecord[];
  private readonly idf = new Map<string, number>();
  private readonly vectors: Array<Map<string, number>> = [];
  readonly topK: number;

  constructor(records: RetrievalRecord[], topK = 3) {
    this.records = [...records];
    this.topK = topK;
    // Raw term-frequency vectors from pre-tokenized prompts.
    const rawVectors: Array<Map<string, number>> = this.records.map((record) => {
      const tokens = record.prompt_tokens ?? tokenize(record.prompt);
      const counter = new Map<string, number>();
      for (const token of tokens) counter.set(token, (counter.get(token) ?? 0) + 1);
      return counter;
    });
    // IDF: log(N / df) — natural log, computed at load.
    const N = Math.max(1, rawVectors.length);
    const df = new Map<string, number>();
    for (const vec of rawVectors) {
      for (const term of vec.keys()) df.set(term, (df.get(term) ?? 0) + 1);
    }
    for (const [term, count] of df) {
      this.idf.set(term, Math.log(N / count));
    }
    // TF-IDF vectors: tf * idf per term.
    for (const vec of rawVectors) {
      const tfidf = new Map<string, number>();
      for (const [term, tf] of vec) {
        tfidf.set(term, tf * (this.idf.get(term) ?? 0));
      }
      this.vectors.push(tfidf);
    }
  }

  get recordCount(): number {
    return this.records.length;
  }

  /**
   * Retrieve the top-k records for a prompt. Replicates
   * the adapter's `generate` scoring + selection exactly:
   * query TF-IDF (dropping terms with IDF <= 0), cosine
   * per record, discard score 0, capability match x2.0,
   * generic/unknown/empty x0.8, stable sort by score
   * desc, capability-first selection when a capability
   * is requested. Returns the chosen matches (score +
   * record), at most topK, possibly fewer (or empty).
   */
  retrieve(prompt: string, options: { capability?: string; topK?: number } = {}): RetrievalMatch[] {
    const topK = options.topK ?? this.topK;
    const requestCap = options.capability ?? '';
    // Query: tokenize, TF-IDF-weight, drop terms with IDF <= 0
    // (unseen terms, and terms in every record).
    const rawTokens = tokenize(prompt);
    const rawCounts = new Map<string, number>();
    for (const token of rawTokens) rawCounts.set(token, (rawCounts.get(token) ?? 0) + 1);
    const query = new Map<string, number>();
    for (const [term, tf] of rawCounts) {
      const idf = this.idf.get(term) ?? 0;
      if (idf > 0) query.set(term, tf * idf);
    }
    // Score every record.
    const scored: RetrievalMatch[] = [];
    for (let i = 0; i < this.records.length; i++) {
      const record = this.records[i];
      const vec = this.vectors[i];
      let score = cosine(query, vec);
      if (score <= 0) continue;
      // How many of the query's distinctive terms the
      // record also has (the brain's abstention rule).
      let sharedTerms = 0;
      for (const term of query.keys()) {
        if (vec.has(term)) sharedTerms += 1;
      }
      const recCap = record.capability || 'generic';
      if (requestCap && recCap === requestCap) {
        score *= 2.0;
      } else if (recCap === 'generic' || recCap === 'unknown' || recCap === '') {
        score *= 0.8;
      }
      scored.push({ score, record, sharedTerms });
    }
    // Stable sort by score desc (Array.sort is stable).
    scored.sort((a, b) => b.score - a.score);
    // Capability-first selection.
    if (requestCap) {
      const capMatched = scored.filter((m) => m.record.capability === requestCap && m.score > 0);
      if (capMatched.length >= topK) return capMatched.slice(0, topK);
      if (capMatched.length > 0) {
        const rest = scored.filter((m) => m.record.capability !== requestCap);
        return [...capMatched, ...rest.slice(0, topK - capMatched.length)];
      }
      return scored.slice(0, topK);
    }
    return scored.slice(0, topK);
  }
}

// ---------------------------------------------------------------------------
// The task corpus — the agent loop's own task knowledge.
// ---------------------------------------------------------------------------

/** One task record: a task type, and the tool sequence that
 *  does it. The `prompt` is the natural description the
 *  retrieval matches against (several phrasings per task,
 *  so different wordings retrieve the same record). The
 *  `tools` are the plan — the tool names in order. The
 *  brain fills each tool's args from the user's prompt
 *  (file candidates, quoted strings, the search text).
 *  The `params` note says, per tool, where its args come
 *  from — the brain's arg filler reads this. */
export interface TaskRecord extends RetrievalRecord {
  /** The tool names, in order — the plan this record is. */
  tools: string[];
  /** Where each tool's args come from (the brain's filler). */
  params: Record<string, string>;
  /** An optional reply that runs WITH the tools (the
   *  rename-across-the-codebase record: the search runs,
   *  and the reply says the rename follows from the files
   *  the search returns). `{old}` is the old text. */
  reply?: string;
}

/**
 * The task corpus. One record per task type the loop
 * handles. The prompts are written to cover the phrasings
 * users actually type (the retrieval matches on shared
 * terms, so a record with several phrasings catches more
 * wordings). The capabilities are task types, not the
 * LLMBuilder benchmark capabilities — no record here is
 * "generic", so no record takes the x0.8 penalty.
 *
 * Honest scope: this corpus is Lucid-side knowledge of
 * the loop's own tools. It is NOT LLMBuilder's 669-record
 * corpus (which holds no file-task knowledge and no
 * tool-call mapping — see llmbuilderBrain.ts). The
 * retrieval algorithm is LLMBuilder's; the task knowledge
 * is the loop's. When LLMBuilder's corpus gains task
 * records (the 3.0 work), those records replace these.
 */
export const LLMBUILDER_TASK_CORPUS: TaskRecord[] = [
  {
    id: 'read-file',
    prompt: 'read file show display cat view contents',
    capability: 'file-read',
    target: 'Read the named file and show its contents.',
    tools: ['read_file'],
    params: { read_file: 'filepath from the file candidate' },
  },
  {
    id: 'read-open-file',
    prompt: 'read file have open current',
    capability: 'file-read',
    target: 'Read the file currently open in the editor.',
    tools: ['read_currently_open_file'],
    params: { read_currently_open_file: 'no args — the open file' },
  },
  {
    id: 'list-directory',
    prompt: 'list directory files folder ls',
    capability: 'file-list',
    target: 'List the files in the named directory.',
    tools: ['ls'],
    params: { ls: 'dirPath from the directory candidate, else the cwd' },
  },
  {
    id: 'search-file',
    prompt: 'search text file find grep look word',
    capability: 'file-search',
    target: 'Search for the text inside the named file.',
    tools: ['grep_search'],
    params: { grep_search: 'pattern from the search text, filepath from the file candidate' },
  },
  {
    id: 'search-codebase',
    prompt: 'search codebase everywhere project all files find text',
    capability: 'codebase-search',
    target: 'Search for the text across the whole indexed codebase.',
    tools: ['codebase_search'],
    params: { codebase_search: 'query from the search text' },
  },
  {
    id: 'glob-files',
    prompt: 'find files matching pattern glob name named',
    capability: 'file-glob',
    target: 'Find files whose names match the pattern.',
    tools: ['file_glob_search'],
    params: { file_glob_search: 'pattern from the file candidate' },
  },
  {
    id: 'find-symbol',
    prompt: 'where defined definition symbol function locate',
    capability: 'symbol-find',
    target: 'Find where the named symbol is defined.',
    tools: ['find_symbol'],
    params: { find_symbol: 'name from the symbol' },
  },
  {
    id: 'go-to-definition',
    prompt: 'go definition symbol file show where jump',
    capability: 'symbol-definition',
    target: 'Jump to the definition of the symbol in the named file.',
    tools: ['go_to_definition'],
    params: { go_to_definition: 'filepath from the file candidate, symbol from the symbol' },
  },
  {
    id: 'find-references',
    prompt: 'find references symbol used every use function',
    capability: 'symbol-references',
    target: 'Find every reference to the named symbol.',
    tools: ['find_references'],
    params: { find_references: 'filepath from the file candidate, symbol from the symbol' },
  },
  {
    id: 'create-file',
    prompt: 'create new file make write content',
    capability: 'file-create',
    target: 'Create the named file with the given content.',
    tools: ['create_new_file'],
    params: { create_new_file: 'filepath from the file candidate, content from the quoted strings' },
  },
  {
    id: 'replace-text',
    prompt: 'replace text file change rename word edit fix typo correct spelling mistake should',
    capability: 'file-edit',
    target: 'Replace the old text with the new text in the named file.',
    tools: ['multi_edit'],
    params: { multi_edit: 'filepath from the file candidate, old and new text from the quoted strings or the replace phrasing' },
  },
  {
    id: 'replace-across-files',
    prompt: 'replace text several files rename across change all every',
    capability: 'file-edit-multi',
    target: 'Replace the old text with the new text in each named file, in one pass.',
    tools: ['multi_file_edit'],
    params: { multi_file_edit: 'files from the file candidates, old and new text from the quoted strings or the replace phrasing' },
  },
  {
    id: 'rename-across-codebase',
    prompt: 'rename across codebase everywhere every file replace change all',
    capability: 'codebase-rename',
    target: 'Search for the old text across the codebase; the rename follows from the files the search returns.',
    tools: ['codebase_search'],
    params: { codebase_search: 'query from the old text (the quoted string or the replace phrasing)' },
    reply: 'I searched for "{old}" across the codebase — tell me which of the files it’s in should be renamed, and I’ll rename it in all of them in one pass.',
  },
  {
    id: 'fix-file',
    prompt: 'fix file repair errors broken debug',
    capability: 'file-fix',
    target: 'Read the file, then fix its diagnostics with safe automatic repairs.',
    tools: ['read_file', 'fix_diagnostics'],
    params: {
      read_file: 'filepath from the file candidate, the active file, or the file a search found',
      fix_diagnostics: 'filepath — the same file',
    },
  },
  {
    id: 'show-diff',
    prompt: 'show diff changed changes',
    capability: 'file-diff',
    target: 'Show the workspace diff, or the diff for the named file.',
    tools: ['view_diff'],
    params: { view_diff: 'filepath from the file candidate when one is named, else the whole workspace' },
  },
  {
    id: 'web-search',
    prompt: 'search web internet online look up current latest news price version weather',
    capability: 'web-search',
    target: 'Search the web and return the top results.',
    tools: ['web_search'],
    params: { web_search: 'query from the web question text' },
  },
  {
    id: 'web-read-page',
    prompt: 'read web page open url link site visit',
    capability: 'web-read',
    target: 'Open the named URL in the browser tab and return the page text.',
    tools: ['web_read_page'],
    params: { web_read_page: 'url from the URL in the prompt' },
  },
];

/** The task retriever — built once, shared by the brain. */
export function buildTaskRetriever(topK = 3): ExemplarRetriever {
  return new ExemplarRetriever(LLMBUILDER_TASK_CORPUS, topK);
}
