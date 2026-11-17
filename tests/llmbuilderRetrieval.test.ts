/**
 * The LLMBuilder retrieval — parity with the Python
 * exemplar adapter, and the task corpus's separation.
 *
 * Parity: the TS retriever replicates the adapter's math
 * exactly (tokenizer, natural-log IDF at load, sparse
 * cosine, the x2.0 capability boost and x0.8 generic
 * penalty, capability-first selection). The expected
 * scores below are the Python adapter's own
 * `meta.matches` scores (rounded to 4dp) for the same
 * fixture records and queries — run against
 * `adapters/exemplar_adapter.py` (2026-11-16). If the
 * Python adapter's math ever changes, these numbers
 * change with it; the TS side must match.
 *
 * Calibration: the task corpus must separate on-task
 * prompts (a file task, with a named file or quoted
 * text) from off-task prompts (general knowledge, no
 * file evidence). The brain's abstention rule is the
 * score threshold (ABSTAIN_THRESHOLD) plus the
 * shared-terms / file-evidence rule — these tests pin
 * the scores that rule is built on, so a corpus change
 * that breaks the separation fails here instead of
 * silently planning the wrong thing.
 */
import { describe, expect, it } from 'vitest';
import {
  ABSTAIN_THRESHOLD,
} from '../src/lib/llmbuilderBrain';
import {
  buildTaskRetriever,
  ExemplarRetriever,
  type RetrievalRecord,
} from '../src/lib/llmbuilderRetrieval';

/** The parity fixture — the same 5 records the Python
 *  adapter was run against (see the module comment). */
const PARITY_RECORDS: RetrievalRecord[] = [
  {
    id: 'f1',
    prompt: 'fix the typo in a file replace the wrong word with the right word',
    prompt_tokens: ['fix', 'the', 'typo', 'in', 'a', 'file', 'replace', 'the', 'wrong', 'word', 'with', 'the', 'right', 'word'],
    capability: 'file-edit',
    source_repo: 'r',
    source_file: 'f1',
    target: 'Replace the old text with the new text.',
  },
  {
    id: 'f2',
    prompt: 'read a file show me the file contents',
    prompt_tokens: ['read', 'a', 'file', 'show', 'me', 'the', 'file', 'contents'],
    capability: 'file-read',
    source_repo: 'r',
    source_file: 'f2',
    target: 'Read the file.',
  },
  {
    id: 'f3',
    prompt: 'how confident are you that a small sample difference is a real signal',
    prompt_tokens: ['how', 'confident', 'are', 'you', 'that', 'a', 'small', 'sample', 'difference', 'is', 'a', 'real', 'signal'],
    capability: 'reasoning',
    source_repo: 'r',
    source_file: 'f3',
    target: 'Low confidence.',
  },
  {
    id: 'f4',
    prompt: 'what is the weather like today in the city',
    prompt_tokens: ['what', 'is', 'the', 'weather', 'like', 'today', 'in', 'the', 'city'],
    capability: 'generic',
    source_repo: 'r',
    source_file: 'f4',
    target: 'I do not know the weather.',
  },
  {
    id: 'f5',
    prompt: 'plan the migration from one system to another without breaking users',
    prompt_tokens: ['plan', 'the', 'migration', 'from', 'one', 'system', 'to', 'another', 'without', 'breaking', 'users'],
    capability: 'planning',
    source_repo: 'r',
    source_file: 'f5',
    target: 'Step 1.',
  },
];

/** Python's `meta.matches` scores (4dp) per query, in
 *  order — the top 3, with their record ids. */
const PARITY_EXPECTED: Array<{ query: string; matches: Array<[string, number]> }> = [
  {
    query: 'fix the typo in my notes file',
    matches: [['f1', 0.5013], ['f2', 0.1756], ['f4', 0.0742]],
  },
  {
    query: 'read the file for me',
    matches: [['f2', 0.7487], ['f1', 0.0755], ['f4', 0.0084]],
  },
  {
    query: 'what is the weather today',
    matches: [['f4', 0.6149], ['f3', 0.0541], ['f1', 0.0095]],
  },
  {
    query: 'plan a migration',
    matches: [['f5', 0.4359], ['f3', 0.0424], ['f2', 0.0299]],
  },
];

describe('llmbuilderRetrieval — parity with the Python exemplar adapter', () => {
  it('ranks the same records with the same scores (within rounding)', () => {
    const retriever = new ExemplarRetriever(PARITY_RECORDS, 3);
    for (const { query, matches } of PARITY_EXPECTED) {
      const got = retriever.retrieve(query);
      expect(got.map((m) => m.record.id)).toEqual(matches.map(([id]) => id));
      for (let i = 0; i < matches.length; i++) {
        // Python rounds to 4dp; the TS score is unrounded.
        // 0.001 covers the rounding plus float noise.
        expect(got[i].score).toBeCloseTo(matches[i][1], 3);
      }
    }
  });

  it('applies the generic penalty (x0.8) and the capability boost (x2.0)', () => {
    const retriever = new ExemplarRetriever(PARITY_RECORDS, 3);
    // The generic record's score is its cosine x0.8 — a
    // weather query matches the generic record, and the
    // penalty is visible in the score (0.6149, not the
    // raw cosine).
    const weather = retriever.retrieve('what is the weather today');
    expect(weather[0].record.capability).toBe('generic');
    expect(weather[0].score).toBeCloseTo(0.6149, 3);
    // A requested capability boosts its records x2.0 and
    // selects them first.
    const boosted = retriever.retrieve('fix the typo in my notes file', { capability: 'file-edit' });
    expect(boosted[0].record.id).toBe('f1');
    expect(boosted[0].score).toBeCloseTo(0.5013 * 2, 3);
  });

  it('drops terms with IDF <= 0 (unseen terms, and terms in every record)', () => {
    const retriever = new ExemplarRetriever(PARITY_RECORDS, 3);
    // A query of only unseen terms matches nothing.
    expect(retriever.retrieve('zzzz qqqq')).toHaveLength(0);
  });
});

describe('llmbuilderRetrieval — the task corpus separates tasks from non-tasks', () => {
  const retriever = buildTaskRetriever(3);

  it('on-task prompts score at or above the abstention threshold', () => {
    const onTask = [
      "fix the typo in /Users/gary/agent-test-scratch.txt",
      "fix the typo in agent-test-scratch.txt — 'wrod' should be 'word'",
      "the word 'wrod' should be 'word' in agent-test-scratch.txt",
      'read src/app.ts',
      'read the file I have open',
      'list the files in src/',
      'search for useState in src/App.tsx',
      'search the codebase for useState',
      'where is greet defined',
      "create notes.txt with 'hello world'",
      "replace 'greet' with 'welcome' in src/app.ts",
      'rename greet to welcome in src/app.ts and src/util.ts',
      'rename greet to welcome across the codebase',
      'fix src/app.ts',
      'show the diff',
      'show me what changed',
      'find files matching src/*.ts',
      'go to the definition of greet in src/app.ts',
      'find all references to greet',
      'search the web for the latest Electron version',
      'what is the current price of gold',
      'look up the weather in Williams Lake',
    ];
    for (const q of onTask) {
      const top = retriever.retrieve(q)[0];
      expect(top, `no match for: ${q}`).toBeDefined();
      expect(top.score, `score for: ${q}`).toBeGreaterThanOrEqual(ABSTAIN_THRESHOLD);
    }
  });

  it('off-task prompts either match nothing or share fewer than two terms', () => {
    const offTask = [
      'what is the weather today',
      'tell me a joke',
      'how do I make pancakes',
      'what is the capital of France',
      'write a poem about the moon',
      'explain quantum entanglement',
      'what time is it',
      'who won the game last night',
      'play some music',
      'set a timer for 10 minutes',
    ];
    for (const q of offTask) {
      const top = retriever.retrieve(q)[0];
      // A single shared verb ("make", "write") can score
      // above the threshold — the brain's rule is the
      // score PLUS the shared-terms / file-evidence rule,
      // so a lone-verb match must not look like a task.
      if (top) {
        expect(top.sharedTerms, `shared terms for: ${q}`).toBeLessThan(2);
      }
    }
  });
});
