/**
 * The LLMBuilder brain — retrieval-driven planning.
 *
 * The brain retrieves the nearest task record (the
 * retrieval is LLMBuilder's TF-IDF; the corpus is the
 * loop's own task knowledge) and fills the tool args
 * from the values the user gave. These tests pin the
 * behaviour the calibration established: on-task prompts
 * plan the right tool (including the post-retrieval
 * routing — a named file means the named file, not the
 * open one; named files and no codebase marker mean the
 * replace, not the codebase search; two named files mean
 * one multi_file_edit), web questions plan a web search
 * (or a page read for a URL — never a file task, never a
 * garbage query), and off-task prompts plan
 * nothing (the brain abstains with an honest reply,
 * never a guessed tool call).
 */
import { describe, expect, it } from 'vitest';
import { LLMBuilderBrain } from '../src/lib/llmbuilderBrain';
import type { BrainContext } from '../src/lib/agentBrain';
import { AgentFileIndex } from '../src/lib/agentIndex';
import type { AgentFileIndex as AgentFileIndexType } from '../src/lib/agentIndex';
import { MemoryAgentHost, makeTestWorkspace } from './agentTestHost';

const ROOT = '/ws';

const FILES: Record<string, string> = {
  ...makeTestWorkspace(),
  '/ws/agent-test-scratch.txt': 'the word wrod is misspelled here\n',
  '/ws/src/App.tsx': 'export function App() { return null; }\n',
};

async function builtIndex(files: Record<string, string>): Promise<{ host: MemoryAgentHost; index: AgentFileIndex }> {
  const host = new MemoryAgentHost(files);
  const index = new AgentFileIndex(host);
  await index.build(ROOT);
  return { host, index };
}

function ctxFor(index: AgentFileIndexType, openFiles: BrainContext['openFiles'] = []): BrainContext {
  return {
    workspaceRoot: ROOT,
    cwd: ROOT,
    openFiles,
    activeFilePath: openFiles[0]?.path ?? null,
    index,
  };
}

const OPEN_APP = [{ path: '/ws/src/app.ts', name: 'app.ts' }];

describe('LLMBuilderBrain — on-task prompts plan the right tool', () => {
  it.each([
    ["fix the typo in agent-test-scratch.txt — 'wrod' should be 'word'", 'multi_edit'],
    ["the word 'wrod' should be 'word' in agent-test-scratch.txt", 'multi_edit'],
    ['read src/app.ts', 'read_file'],
    ['read the file I have open', 'read_currently_open_file'],
    ['list the files in src/', 'ls'],
    ['search for useState in src/App.tsx', 'grep_search'],
    ['search the codebase for useState', 'codebase_search'],
    ['where is greet defined', 'find_symbol'],
    ["create notes.txt with 'hello world'", 'create_new_file'],
    ["replace 'greet' with 'welcome' in src/app.ts", 'multi_edit'],
    ['rename greet to welcome in src/app.ts and src/util.ts', 'multi_file_edit'],
    ['rename greet to welcome across the codebase', 'codebase_search'],
    ['fix src/app.ts', 'read_file'],
    ['show the diff', 'view_diff'],
    ['show me what changed', 'view_diff'],
    ['find files matching src/*.ts', 'file_glob_search'],
    ['go to the definition of greet in src/app.ts', 'go_to_definition'],
    ['find all references to greet in src/app.ts', 'find_references'],
    ['search the web for the latest Electron version', 'web_search'],
    ['what is the current price of gold', 'web_search'],
    ['look up the weather in Williams Lake', 'web_search'],
    ['read https://example.com/docs', 'web_read_page'],
    ['what is the capital of France', 'web_search'],
    ['who won the game last night', 'web_search'],
    ['what time is it', 'web_search'],
    ['how do I make pancakes', 'web_search'],
    ['explain quantum entanglement', 'web_search'],
  ])('%s -> %s', async (prompt, want) => {
    const { index } = await builtIndex(FILES);
    const plan = await new LLMBuilderBrain().plan(prompt, ctxFor(index, OPEN_APP));
    expect(plan.toolCalls[0]?.name).toBe(want);
  });

  it('a modify with no old/new reads the file and asks what should change', async () => {
    const { index } = await builtIndex(FILES);
    const plan = await new LLMBuilderBrain().plan(
      'fix the typo in /ws/agent-test-scratch.txt',
      ctxFor(index, OPEN_APP),
    );
    expect(plan.toolCalls[0]?.name).toBe('read_file');
    expect(plan.reply).toMatch(/old text and the new text/i);
  });

  it('a rename with no file named asks which file', async () => {
    const { index } = await builtIndex(FILES);
    // No open files here: with an active file the brain
    // reads that file and asks what should change (the
    // useful half). With no file at all, it asks which.
    const plan = await new LLMBuilderBrain().plan(
      "replace 'greet' with 'welcome'",
      ctxFor(index, []),
    );
    expect(plan.toolCalls).toHaveLength(0);
    expect(plan.reply).toMatch(/which file/i);
  });

  it('an unresolved file is named, never guessed', async () => {
    const { index } = await builtIndex(FILES);
    const plan = await new LLMBuilderBrain().plan('read @nope.ts', ctxFor(index, OPEN_APP));
    expect(plan.toolCalls).toHaveLength(0);
    expect(plan.reply).toContain('nope.ts');
  });

  it('a rename across the codebase searches first, with a reply saying the rename follows', async () => {
    const { index } = await builtIndex(FILES);
    const plan = await new LLMBuilderBrain().plan(
      'rename greet to welcome across the codebase',
      ctxFor(index, OPEN_APP),
    );
    expect(plan.toolCalls).toHaveLength(1);
    expect(plan.toolCalls[0].name).toBe('codebase_search');
    expect(plan.reply).toMatch(/rename/i);
  });
});

describe('LLMBuilderBrain — web questions plan a web search, not a file task', () => {
  it('a web search fills the query from the user’s own words', async () => {
    const { index } = await builtIndex(FILES);
    const plan = await new LLMBuilderBrain().plan(
      'search the web for the latest Electron version',
      ctxFor(index, OPEN_APP),
    );
    expect(plan.toolCalls).toHaveLength(1);
    expect(plan.toolCalls[0].name).toBe('web_search');
    expect(plan.toolCalls[0].args.query).toBe('the latest Electron version');
  });

  it('a page read fills the URL from the prompt', async () => {
    const { index } = await builtIndex(FILES);
    const plan = await new LLMBuilderBrain().plan(
      'read https://example.com/docs',
      ctxFor(index, OPEN_APP),
    );
    expect(plan.toolCalls).toHaveLength(1);
    expect(plan.toolCalls[0].name).toBe('web_read_page');
    expect(plan.toolCalls[0].args.url).toBe('https://example.com/docs');
  });

  it('a question about a file never falls back to the web', async () => {
    const { index } = await builtIndex(FILES);
    const plan = await new LLMBuilderBrain().plan(
      'what is useState in src/App.tsx',
      ctxFor(index, OPEN_APP),
    );
    // A named file means a file question — the brain abstains
    // instead of web-searching it.
    expect(plan.toolCalls).toHaveLength(0);
    expect(plan.reply).toBeTruthy();
  });

  it('a question about the workspace itself ("what does this do?") never falls back to the web', async () => {
    const { index } = await builtIndex(FILES);
    const plan = await new LLMBuilderBrain().plan(
      'what does this do?',
      ctxFor(index, OPEN_APP),
    );
    expect(plan.toolCalls).toHaveLength(0);
    expect(plan.reply).toBeTruthy();
  });

  it('a question with no topic ("what does it do") abstains instead of searching for garbage', async () => {
    const { index } = await builtIndex(FILES);
    const plan = await new LLMBuilderBrain().plan(
      'what does it do',
      ctxFor(index, []),
    );
    expect(plan.toolCalls).toHaveLength(0);
    expect(plan.reply).toBeTruthy();
  });
});

describe('LLMBuilderBrain — off-task prompts plan nothing', () => {
  it.each([
    'tell me a joke',
    'write a poem about the moon',
    'play some music',
    'set a timer for 10 minutes',
  ])('%s -> no tool calls', async (prompt) => {
    const { index } = await builtIndex(FILES);
    const plan = await new LLMBuilderBrain().plan(prompt, ctxFor(index, OPEN_APP));
    expect(plan.toolCalls).toHaveLength(0);
    expect(plan.reply).toBeTruthy();
  });
});
