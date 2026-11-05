/**
 * FixNet tests — canonical commands, parser extraction (F1), dual-form
 * `fix` actually fixing files (F2), offline lookup (F3), failed-fix
 * quarantine (F4), outcome reporting / usage_stats (decision h),
 * trust-band scoring, no phantom entries (F12), no sync claims in
 * user-facing text, and the honest local-only `fixnet sync` answer.
 *
 * SAFETY: every temp dir is created under os.tmpdir() and cleanup is
 * guarded to that prefix — nothing outside os.tmpdir() is ever deleted.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { parseIntent, IntentParser } from '../electron/core/parser/intentParser';
import { WorkflowOrchestrator } from '../electron/core/workflow/workflowOrchestrator';
import { FixNetRouter } from '../electron/core/fixnet/fixnetRouter';
import { FixDictionary } from '../electron/core/fixnet/fixDictionary';
import type { FixEntry } from '../electron/core/fixnet/fixDictionary';
import { TokenTracker } from '../electron/core/tracking/tokenTracker';
import { ToolRegistry } from '../electron/core/tools/toolRegistry';
import {
  FIXNET_COMMANDS,
  FIXNET_DIRECT_COMMANDS,
  matchFixnetCommand,
  FIXNET_SYNC_UNAVAILABLE,
} from '../electron/core/commands/fixnetCommands';
import { patternFixForError, validateFixForError } from '../electron/core/fixnet/patternFix';
import { runFile, applyImportFix } from '../electron/core/fixnet/fileFixer';
import {
  ConsensusEngine,
  TRUST_BANDS,
  AUTO_APPLY_THRESHOLD,
} from '../electron/core/fixnet/consensusEngine';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fixnet-test-'));
}

/** Delete a temp dir, but ONLY if it lives under os.tmpdir(). */
function safeRemoveDir(dir: string): void {
  const tmp = fs.realpathSync(os.tmpdir());
  const real = fs.realpathSync(dir);
  if (real !== tmp && real.startsWith(tmp + path.sep)) {
    fs.rmSync(real, { recursive: true, force: true });
  }
}

function makeOrchestrator(
  tmpDir: string,
  bypass: any = { executeQueued: async () => { throw new Error('LLM should not be called in this test'); } },
) {
  const router = new FixNetRouter(tmpDir);
  const orchestrator = new WorkflowOrchestrator(
    new IntentParser(),
    bypass,
    router,
    new TokenTracker(tmpDir),
    new ToolRegistry(),
    { userId: 'test', sessionId: 'test', workingDirectory: tmpDir, conversationHistory: [] },
  );
  return { orchestrator, router };
}

function runPy(filePath: string): { ok: boolean; code: number } {
  try {
    execFileSync('python3', [filePath], { encoding: 'utf-8', stdio: 'pipe' });
    return { ok: true, code: 0 };
  } catch (err: any) {
    return { ok: false, code: typeof err.status === 'number' ? err.status : 1 };
  }
}

/** Store a fix and return the stored entry (with its fix_hash). */
async function seedFix(router: FixNetRouter, error: string, fix: string): Promise<FixEntry> {
  await router.storeFix('error_fix', error, fix);
  const entries = router.listEntries();
  const entry = entries.find((e) => e.error_signature === error);
  expect(entry).toBeDefined();
  return entry!;
}

function fakeEntry(successes: number, failures: number): FixEntry {
  return {
    error_signature: "NameError: name 'json' is not defined",
    error_type: 'NameError',
    solution: 'import json',
    fix_hash: 'testhash',
    context: {},
    timestamp: new Date().toISOString(),
    keywords: ['json'],
    success_count: successes,
    failure_count: failures,
    relevance_score: successes + failures > 0 ? successes / (successes + failures) : 0.5,
    kind: 'error_fix',
    meta: {},
  };
}

describe('canonical FixNet command table', () => {
  it('registers every FixNet command exactly once', () => {
    const names = FIXNET_COMMANDS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining([
        'fix',
        'fixnet stats',
        'fixnet search',
        'fixnet report',
        'fixnet apply',
        'fixnet delete',
      ]),
    );
  });

  it('has NO working fixnet sync entry — sync is recognised but unavailable', () => {
    expect(FIXNET_COMMANDS.find((c) => c.name === 'fixnet sync')).toBeUndefined();
    expect(FIXNET_DIRECT_COMMANDS).toContain('fixnet sync');
  });

  it('matchFixnetCommand returns the matched definition plus the remainder', () => {
    const stats = matchFixnetCommand('fixnet stats');
    expect(stats?.command.name).toBe('fixnet stats');
    expect(stats?.rest).toBe('');
    const search = matchFixnetCommand('fixnet search ModuleNotFoundError');
    expect(search?.command.name).toBe('fixnet search');
    expect(search?.rest).toBe('ModuleNotFoundError');
    const fix = matchFixnetCommand('fix broken_script.py');
    expect(fix?.command.name).toBe('fix');
    expect(fix?.rest).toBe('broken_script.py');
    expect(matchFixnetCommand('fixnet sync')).toBeNull();
    expect(matchFixnetCommand('help')).toBeNull();
  });

  it('the sync-unavailable message names the causal cloud sync as the follow-on', () => {
    expect(FIXNET_SYNC_UNAVAILABLE).toContain('local');
    expect(FIXNET_SYNC_UNAVAILABLE).toContain('causal cloud sync');
    expect(FIXNET_SYNC_UNAVAILABLE.toLowerCase()).not.toContain('decrypt-and-apply');
  });

  it('DIRECT_COMMANDS is the table minus fix, plus the recognised sync', () => {
    const tableNames = FIXNET_COMMANDS.map((c) => c.name).filter((n) => n !== 'fix');
    expect([...FIXNET_DIRECT_COMMANDS].sort()).toEqual([...tableNames, 'fixnet sync'].sort());
  });
});

describe('parser error-text extraction (F1)', () => {
  it('carries the full error text as the fix target', () => {
    const intent = parseIntent('fix ModuleNotFoundError: No module named requests');
    expect(intent.type).toBe('fix_request');
    expect(intent.target).toContain('ModuleNotFoundError');
    expect(intent.target).toContain('No module named requests');
  });

  it('keeps a file path as the fix target', () => {
    const intent = parseIntent('fix broken_script.py');
    expect(intent.type).toBe('fix_request');
    expect(intent.target).toBe('broken_script.py');
  });

  it('preserves file-path case (no lower-casing of the target)', () => {
    const intent = parseIntent('fix MyScript.PY');
    expect(intent.target).toBe('MyScript.PY');
  });

  it('fixnet sync is a direct command, not a fix request', () => {
    const intent = parseIntent('fixnet sync');
    expect(intent.type).toBe('direct_command');
    expect(intent.normalized).toBe('fixnet sync');
  });

  it('fixnet report / apply / delete are direct commands', () => {
    expect(parseIntent('fixnet report abc123 success').type).toBe('direct_command');
    expect(parseIntent('fixnet apply abc123 file.py').type).toBe('direct_command');
    expect(parseIntent('fixnet delete abc123').type).toBe('direct_command');
  });
});

describe('pattern fix (Python fast path, ported)', () => {
  it('missing module -> import line', () => {
    expect(patternFixForError("ModuleNotFoundError: No module named 'requests'")).toBe(
      'import requests',
    );
    expect(patternFixForError("ModuleNotFoundError: No module named 'json'")).toBe(
      'import json',
    );
  });

  it('undefined known name -> import line', () => {
    expect(patternFixForError("NameError: name 'json' is not defined")).toBe('import json');
    expect(patternFixForError("NameError: name 'Path' is not defined")).toBe(
      'from pathlib import Path',
    );
    expect(patternFixForError("NameError: name 'BeautifulSoup' is not defined")).toBe(
      'from bs4 import BeautifulSoup',
    );
  });

  it('unknown name -> null (never invents an import)', () => {
    expect(patternFixForError("NameError: name 'some_unknown_var' is not defined")).toBeNull();
    expect(patternFixForError('SyntaxError: invalid syntax')).toBeNull();
    expect(patternFixForError('')).toBeNull();
  });

  it('V2 validation accepts a matching import and rejects a mismatched one', () => {
    expect(validateFixForError("NameError: name 'json' is not defined", 'import json')).toBe(true);
    expect(validateFixForError("NameError: name 'json' is not defined", 'import requests')).toBe(false);
    expect(validateFixForError("ModuleNotFoundError: No module named 'json'", 'import json')).toBe(true);
    // An assignment fix for a missing name passes the name check.
    expect(validateFixForError("NameError: name 'x' is not defined", 'x = 42')).toBe(true);
    // An error with no named module is not covered by the V2 rule.
    expect(validateFixForError('some other error', 'import os')).toBe(true);
    // A blank solution is never accepted.
    expect(validateFixForError("NameError: name 'json' is not defined", '')).toBe(false);
    // A multi-name fix that imports the missing name is valid (V2 handles
    // multi-name fixes — the single-line requirement for auto-apply is
    // enforced separately by extractImportLine).
    expect(validateFixForError("NameError: name 'json' is not defined", 'import json\nimport os')).toBe(true);
  });
});

describe('file fixer', () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTempDir(); });
  afterEach(() => { safeRemoveDir(tmp); });

  it('runFile reports success and failure honestly', async () => {
    const good = path.join(tmp, 'good.py');
    const bad = path.join(tmp, 'bad.py');
    fs.writeFileSync(good, 'print("ok")\n');
    fs.writeFileSync(bad, 'print(json.dumps(1))\n');
    expect((await runFile(good)).ok).toBe(true);
    const badRun = await runFile(bad);
    expect(badRun.ok).toBe(false);
    expect(badRun.error).toContain('json');
  });

  it('applyImportFix inserts after the shebang and refuses duplicates', () => {
    const file = path.join(tmp, 'script.py');
    fs.writeFileSync(file, '#!/usr/bin/env python3\nprint(json.dumps(1))\n');
    const first = applyImportFix(file, 'import json');
    expect(first.applied).toBe(true);
    expect(fs.readFileSync(file, 'utf-8')).toMatch(/^#!/);
    expect(fs.readFileSync(file, 'utf-8').split('\n')[1]).toBe('import json');
    const second = applyImportFix(file, 'import json');
    expect(second.applied).toBe(false);
    expect(second.reason).toContain('already present');
  });

  it('applyImportFix refuses non-Python files', () => {
    const file = path.join(tmp, 'notes.txt');
    fs.writeFileSync(file, 'hello\n');
    expect(applyImportFix(file, 'import json').applied).toBe(false);
  });
});

describe('dual-form fix end to end (F2)', () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTempDir(); });
  afterEach(() => { safeRemoveDir(tmp); });

  it('fixes a real file: missing import added, file re-runs clean', async () => {
    const { orchestrator } = makeOrchestrator(tmp);
    const file = path.join(tmp, 'needs_json.py');
    fs.writeFileSync(file, 'print(json.dumps({"a": 1}))\n');
    expect(runPy(file).ok).toBe(false);

    const result = await orchestrator.processRequest(`fix ${file}`);
    expect(result.success).toBe(true);
    expect(result.fixApplied).toBe(true);
    expect(result.fixCount).toBe(1);
    expect(fs.readFileSync(file, 'utf-8')).toContain('import json');
    expect(runPy(file).ok).toBe(true);
  });

  it('a fix that does not resolve the error is reverted and reported honestly', async () => {
    const { orchestrator } = makeOrchestrator(tmp);
    const file = path.join(tmp, 'two_errors.py');
    const before = 'print(json.dumps({"a": 1}))\nprint(os.getcwd())\n';
    fs.writeFileSync(file, before);

    const result = await orchestrator.processRequest(`fix ${file}`);
    expect(result.fixApplied).toBe(false);
    expect(fs.readFileSync(file, 'utf-8')).toBe(before); // reverted
    expect(result.output).toMatch(/revert/i);
  });

  it('a clean file reports "runs clean" and changes nothing', async () => {
    const { orchestrator } = makeOrchestrator(tmp);
    const file = path.join(tmp, 'clean.py');
    const before = 'print("hello")\n';
    fs.writeFileSync(file, before);
    const result = await orchestrator.processRequest(`fix ${file}`);
    expect(result.success).toBe(true);
    // Nothing was applied: the field is false or (per the interface)
    // left undefined on paths that present rather than write.
    expect(result.fixApplied ?? false).toBe(false);
    expect(fs.readFileSync(file, 'utf-8')).toBe(before);
  });

  it('an error message (not a file) goes through the error path, not "no such file"', async () => {
    const { orchestrator } = makeOrchestrator(tmp);
    const result = await orchestrator.processRequest(
      "fix name 'json' is not defined",
    );
    expect(result.output).not.toMatch(/No such file/i);
    // No file to edit and no LLM in this stub, so it fails honestly.
    expect(result.success).toBe(false);
  });

  it('a traceback containing a path is error text, not a file path', async () => {
    const { orchestrator } = makeOrchestrator(tmp);
    const result = await orchestrator.processRequest(
      'fix FileNotFoundError: [Errno 2] No such file or directory: \'/tmp/foo.py\'',
    );
    expect(result.output).not.toMatch(/No such file: /i);
  });

  it('a missing file path is reported as missing, not as an error', async () => {
    const { orchestrator } = makeOrchestrator(tmp);
    const result = await orchestrator.processRequest('fix /tmp/definitely-not-here.py');
    expect(result.output).toMatch(/No such file/i);
  });

  it('LLM fallback: a fake model fix that passes V2 is stored and returned', async () => {
    const fakeBackend = { generate: async () => ({ text: 'some_unknown_var = 42', tokenStats: undefined }) };
    const bypass = {
      executeQueued: async (op: (model: string) => Promise<any>) => ({
        result: await op('tinyllama'),
        route: { selected_model: 'tinyllama', selected_tier: 2 },
      }),
      backendManager: { get: () => fakeBackend },
    };
    const { orchestrator, router } = makeOrchestrator(tmp, bypass);
    const file = path.join(tmp, 'unknown_var.py');
    fs.writeFileSync(file, 'print(some_unknown_var)\n');

    const result = await orchestrator.processRequest(`fix ${file}`);
    expect(result.success).toBe(true);
    expect(result.output).toContain('some_unknown_var = 42');
    // The fix was stored for the next offline lookup.
    expect((await router.getStats()).dictionary.total_fixes).toBeGreaterThanOrEqual(1);
  });

  it('LLM fallback: a fake model fix that fails V2 is rejected and nothing is stored', async () => {
    const fakeBackend = { generate: async () => ({ text: 'import json', tokenStats: undefined }) };
    const bypass = {
      executeQueued: async (op: (model: string) => Promise<any>) => ({
        result: await op('tinyllama'),
        route: { selected_model: 'tinyllama', selected_tier: 2 },
      }),
      backendManager: { get: () => fakeBackend },
    };
    const { orchestrator, router } = makeOrchestrator(tmp, bypass);
    const file = path.join(tmp, 'unknown_var2.py');
    fs.writeFileSync(file, 'print(some_unknown_var)\n');

    const result = await orchestrator.processRequest(`fix ${file}`);
    expect(result.output).toMatch(/did not pass validation/i);
    expect((await router.getStats()).dictionary.total_fixes).toBe(0);
  });
});

describe('outcome reporting, trust bands and quarantine (decision h, F4)', () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTempDir(); });
  afterEach(() => { safeRemoveDir(tmp); });

  const ERROR = "NameError: name 'json' is not defined";

  it('a fresh fix is Experimental (no usage data yet) and cannot auto-apply', async () => {
    const router = new FixNetRouter(tmp);
    const entry = await seedFix(router, ERROR, 'import json');
    const graded = router.gradeEntry(entry.fix_hash);
    expect(graded).not.toBeNull();
    expect(graded!.trust_level).toBe('experimental');
    expect(graded!.score).toBeLessThan(AUTO_APPLY_THRESHOLD);
  });

  it('repeated successes lift a fix through the bands to Highly Trusted', async () => {
    const router = new FixNetRouter(tmp);
    const entry = await seedFix(router, ERROR, 'import json');
    for (let i = 0; i < 6; i++) router.recordOutcome(entry.fix_hash, true);
    const graded = router.gradeEntry(entry.fix_hash);
    expect(graded!.trust_level).toBe('highly_trusted');
    expect(graded!.score).toBeGreaterThanOrEqual(AUTO_APPLY_THRESHOLD);
    expect(graded!.score).toBeGreaterThanOrEqual(TRUST_BANDS.highlyTrusted);
  });

  it('repeated failures quarantine a fix and findFix stops serving it', async () => {
    const router = new FixNetRouter(tmp);
    const entry = await seedFix(router, ERROR, 'import json');
    // Served while unproven-but-not-failed.
    const before = await router.findFix({ error: ERROR });
    expect(before.success).toBe(true);
    expect(before.fix?.solution).toBe('import json');
    for (let i = 0; i < 5; i++) router.recordOutcome(entry.fix_hash, false);
    const graded = router.gradeEntry(entry.fix_hash);
    expect(graded!.trust_level).toBe('quarantined');
    expect(graded!.safe_to_use).toBe(false);
    const after = await router.findFix({ error: ERROR });
    expect(after.success).toBe(false);
    expect(after.fix).toBeUndefined();
  });

  it('outcome_success_rate is null before outcomes and moves with them', async () => {
    const router = new FixNetRouter(tmp);
    expect((await router.getStats()).performance.outcome_success_rate).toBeNull();
    const entry = await seedFix(router, ERROR, 'import json');
    router.recordOutcome(entry.fix_hash, true);
    router.recordOutcome(entry.fix_hash, false);
    router.recordOutcome(entry.fix_hash, true);
    const stats = await router.getStats();
    expect(stats.performance.total_attempts).toBe(3);
    expect(stats.performance.outcome_success_rate).toBeCloseTo(2 / 3, 5);
  });

  it('grade band boundaries match the decided bands (success-rate rule)', () => {
    const engine = new ConsensusEngine();
    expect(engine.grade(fakeEntry(0, 0), 1.0).trust_level).toBe('experimental');
    expect(engine.grade(fakeEntry(10, 0), 1.0).trust_level).toBe('highly_trusted');
    expect(engine.grade(fakeEntry(7, 3), 1.0).trust_level).toBe('trusted');
    expect(engine.grade(fakeEntry(4, 6), 1.0).trust_level).toBe('experimental');
    expect(engine.grade(fakeEntry(2, 8), 1.0).trust_level).toBe('quarantined');
    // The weighted score is the auto-apply signal, separate from the band:
    // ten straight successes score exactly at the 0.90 auto-apply bar.
    expect(engine.grade(fakeEntry(10, 0), 1.0).score).toBeCloseTo(0.9, 5);
  });

  it('fixnet report records an outcome and fixnet delete removes the entry', async () => {
    const { orchestrator, router } = makeOrchestrator(tmp);
    const entry = await seedFix(router, ERROR, 'import json');
    const report = await orchestrator.processRequest(`fixnet report ${entry.fix_hash} success`);
    expect(report.success).toBe(true);
    expect(report.output).toMatch(/recorded/i);
    expect((await router.getStats()).performance.total_attempts).toBe(1);

    const del = await orchestrator.processRequest(`fixnet delete ${entry.fix_hash}`);
    expect(del.success).toBe(true);
    expect(router.getEntry(entry.fix_hash)).toBeUndefined();
  });

  it('fixnet apply applies a stored import fix to a file and verifies it', async () => {
    const { orchestrator, router } = makeOrchestrator(tmp);
    const entry = await seedFix(router, ERROR, 'import json');
    const file = path.join(tmp, 'apply_me.py');
    fs.writeFileSync(file, 'print(json.dumps(1))\n');
    const result = await orchestrator.processRequest(`fixnet apply ${entry.fix_hash} ${file}`);
    expect(result.success).toBe(true);
    expect(result.fixApplied).toBe(true);
    expect(fs.readFileSync(file, 'utf-8')).toContain('import json');
    expect(runPy(file).ok).toBe(true);
  });

  it('fixnet apply refuses a quarantined fix', async () => {
    const { orchestrator, router } = makeOrchestrator(tmp);
    const entry = await seedFix(router, ERROR, 'import json');
    for (let i = 0; i < 5; i++) router.recordOutcome(entry.fix_hash, false);
    const file = path.join(tmp, 'apply_quarantined.py');
    fs.writeFileSync(file, 'print(json.dumps(1))\n');
    const result = await orchestrator.processRequest(`fixnet apply ${entry.fix_hash} ${file}`);
    expect(result.success).toBe(false);
    expect(fs.readFileSync(file, 'utf-8')).not.toContain('import json');
  });

  it('fixnet sync answers honestly: local-only, causal cloud sync is the follow-on', async () => {
    const { orchestrator } = makeOrchestrator(tmp);
    const result = await orchestrator.processRequest('fixnet sync');
    expect(result.output).toContain('local');
    expect(result.output).toContain('causal cloud sync');
  });

  it('stats report measured numbers, not the old hardcoded claims', async () => {
    const { orchestrator, router } = makeOrchestrator(tmp);
    await seedFix(router, ERROR, 'import json');
    const result = await orchestrator.processRequest('fixnet stats');
    const out = result.output ?? '';
    expect(out).toContain('Dictionary hit rate');
    expect(out).toMatch(/no outcomes recorded yet/i);
    expect(out).not.toContain('17 templates');
    expect(out).not.toContain('67%');
  });
});

describe('dictionary hygiene (F12)', () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTempDir(); });
  afterEach(() => { safeRemoveDir(tmp); });

  it('storeFix refuses an empty error signature', async () => {
    const router = new FixNetRouter(tmp);
    await router.storeFix('error_fix', '', 'import json');
    await router.storeFix('error_fix', '   ', 'import json');
    expect((await router.getStats()).dictionary.total_fixes).toBe(0);
  });

  it('load purges phantom empty-signature entries written by old code', () => {
    const bad = {
      error_signature: '', error_type: 'Unknown', solution: 'import json',
      fix_hash: 'deadbeef', context: {}, timestamp: new Date().toISOString(),
      keywords: [], success_count: 0, failure_count: 0, relevance_score: 0,
      kind: 'error_fix', meta: {},
    };
    const file = path.join(tmp, 'fix_dictionary.json');
    fs.writeFileSync(file, JSON.stringify({ version: 1, entries: { Unknown: [bad] }, scripts: [] }));
    const reloaded = new FixDictionary(tmp);
    expect(reloaded.all().length).toBe(0);
  });
});

describe('offline lookup is fast and model-free (F3)', () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTempDir(); });
  afterEach(() => { safeRemoveDir(tmp); });

  it('findFix answers in under 100ms with no model involved', async () => {
    const router = new FixNetRouter(tmp);
    await seedFix(router, "NameError: name 'json' is not defined", 'import json');
    const start = Date.now();
    const found = await router.findFix({ error: "NameError: name 'json' is not defined" });
    const elapsed = Date.now() - start;
    expect(found.success).toBe(true);
    expect(found.fix?.solution).toBe('import json');
    expect(elapsed).toBeLessThan(100);
  });
});

describe('no sync or hardcoded claims remain in user-facing text', () => {
  const USER_FACING = [
    'electron/core/display/commandDisplay.ts',
    'electron/core/commands/fixnetCommands.ts',
    'electron/core/workflow/workflowOrchestrator.ts',
    'electron/core/fixnet/fixnetRouter.ts',
    'electron/core/fixnet/consensusEngine.ts',
    'src/data/helpData.ts',
    'src/components/Terminal/Terminal.tsx',
    'src/components/Account/AccountButton.tsx',
  ];

  it('no file claims a working fixnet sync, 17 templates, 67%, 71.4% or 10K+ fixes', () => {
    for (const rel of USER_FACING) {
      const abs = path.join(process.cwd(), rel);
      const text = fs.readFileSync(abs, 'utf-8');
      expect(text, rel).not.toContain('17 templates');
      expect(text, rel).not.toContain('17 offline templates');
      expect(text, rel).not.toContain('67%');
      expect(text, rel).not.toContain('71.4%');
      expect(text, rel).not.toContain('10K+');
      expect(text, rel).not.toContain('AES-256-GCM');
      expect(text, rel).not.toContain('Synced with FixNet');
    }
  });

  it('help data no longer carries a templates count field', () => {
    const text = fs.readFileSync(path.join(process.cwd(), 'src/data/helpData.ts'), 'utf-8');
    expect(text).not.toContain('totalTemplates:');
  });
});
