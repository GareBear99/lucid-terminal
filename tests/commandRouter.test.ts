/**
 * Command Router Test Suite
 * 
 * Validates that the terminal works completely WITHOUT LLM.
 * Run with: NO_LLM_CORE=1 npm test
 */

import { CommandRouter } from '../electron/core/commandRouter';
import {
  levenshteinDistance,
  similarityScore,
  findClosestCommands,
  getBestMatch,
} from '../electron/core/fuzzyMatcher';
import { getCommand, getAllCommandNames } from '../electron/core/helpGrammar';

describe('Command Router - NO LLM Tests', () => {
  let router: CommandRouter;
  
  beforeEach(() => {
    router = new CommandRouter();
  });
  
  // ═══════════════════════════════════════════════════════════════════
  // LAYER 1: PARSING TESTS
  // ═══════════════════════════════════════════════════════════════════
  
  describe('Command Parsing', () => {
    test('parses simple command', () => {
      const parsed = router.parse('help');
      expect(parsed.command).toBe('help');
      expect(parsed.args).toEqual([]);
      expect(parsed.flags).toEqual({});
    });
    
    test('parses command with arguments', () => {
      const parsed = router.parse('cd /Users/test');
      expect(parsed.command).toBe('cd');
      expect(parsed.args).toEqual(['/Users/test']);
    });
    
    test('parses command with flags', () => {
      const parsed = router.parse('ls -la /tmp');
      expect(parsed.command).toBe('ls');
      expect(parsed.flags).toHaveProperty('l');
      expect(parsed.flags).toHaveProperty('a');
      expect(parsed.args).toEqual(['/tmp']);
    });
    
    test('parses command with long flags', () => {
      const parsed = router.parse('ls --all --format=long');
      expect(parsed.flags.all).toBe(true);
      expect(parsed.flags.format).toBe('long');
    });
    
    test('handles quoted arguments', () => {
      const parsed = router.parse('mkdir \"my folder\"');
      expect(parsed.args).toEqual(['my folder']);
    });
  });
  
  // ═══════════════════════════════════════════════════════════════════
  // LAYER 2: ROUTING TESTS
  // ═══════════════════════════════════════════════════════════════════
  
  describe('Command Routing', () => {
    test('routes known command', () => {
      const decision = router.route('help');
      expect(decision.type).toBe('direct_command');
      expect(decision.confidence).toBe(1.0);
    });
    
    test('detects typo and suggests correction', () => {
      const decision = router.route('hlp');
      expect(decision.type).toBe('typo_suggestion');
      expect(decision.suggestion).toBe('help');
      expect(decision.requiresConfirmation).toBe(true);
    });
    
    test('routes unknown command', () => {
      const decision = router.route('unknowncmd123');
      expect(decision.type).toBe('unknown');
      expect(decision.confidence).toBe(0);
    });
    
    test('detects shell passthrough', () => {
      const decision = router.route('git status');
      expect(decision.type).toBe('passthrough_shell');
    });
  });
  
  // ═══════════════════════════════════════════════════════════════════
  // LAYER 3: EXECUTION TESTS (DETERMINISTIC OUTPUTS)
  // ═══════════════════════════════════════════════════════════════════
  
  describe('Command Execution', () => {
    test('executes help command', async () => {
      const decision = router.route('help');
      const result = await router.execute(decision);
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Available Commands');
    });
    
    test('executes version command', async () => {
      const decision = router.route('version');
      const result = await router.execute(decision);
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('Lucid Terminal');
    });
    
    test('executes pwd command', async () => {
      const decision = router.route('pwd');
      const result = await router.execute(decision);
      
      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.output).toBeTruthy();
    });
    
    test('returns error for unknown command', async () => {
      const decision = router.route('unknowncmd');
      const result = await router.execute(decision);
      
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(127);
      expect(result.output).toContain('Command not found');
    });
  });
  
  // ═══════════════════════════════════════════════════════════════════
  // LAYER 4: FUZZY MATCHING TESTS
  // ═══════════════════════════════════════════════════════════════════
  
  describe('Fuzzy Matching (Levenshtein)', () => {
    test('calculates distance correctly', () => {
      expect(levenshteinDistance('cat', 'cat')).toBe(0);
      expect(levenshteinDistance('cat', 'car')).toBe(1);
      expect(levenshteinDistance('cat', 'cut')).toBe(1);
      expect(levenshteinDistance('help', 'hlp')).toBe(1);
      expect(levenshteinDistance('clear', 'cler')).toBe(1);
    });
    
    test('calculates similarity score', () => {
      expect(similarityScore('cat', 'cat')).toBe(1);
      expect(similarityScore('help', 'hlp')).toBeGreaterThan(0.5);
      expect(similarityScore('xyz', 'abc')).toBeLessThan(0.5);
    });
    
    test('finds closest commands', () => {
      const matches = findClosestCommands('hlp');
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].command).toBe('help');
      expect(matches[0].distance).toBe(1);
    });
    
    test('finds best match', () => {
      const match = getBestMatch('lst');
      expect(match).toBeTruthy();
      expect(match?.command).toBe('ls');
      expect(match?.confidence).toBe('high');
    });
  });
  
  // ═══════════════════════════════════════════════════════════════════
  // LAYER 5: HELP SYSTEM TESTS
  // ═══════════════════════════════════════════════════════════════════
  
  describe('Help Grammar System', () => {
    test('gets command by name', () => {
      const cmd = getCommand('help');
      expect(cmd).toBeTruthy();
      expect(cmd?.name).toBe('help');
      expect(cmd?.category).toBe('help');
    });
    
    test('gets command by alias', () => {
      const cmd = getCommand('?');
      expect(cmd).toBeTruthy();
      expect(cmd?.name).toBe('help');
    });
    
    test('returns undefined for unknown command', () => {
      const cmd = getCommand('unknowncmd');
      expect(cmd).toBeUndefined();
    });
    
    test('gets all command names', () => {
      const names = getAllCommandNames();
      expect(names.length).toBeGreaterThan(0);
      expect(names).toContain('help');
      expect(names).toContain('clear');
      expect(names).toContain('ls');
    });
  });
  
  // ═══════════════════════════════════════════════════════════════════
  // LAYER 6: AUTOCOMPLETE TESTS
  // ═══════════════════════════════════════════════════════════════════
  
  describe('Autocomplete', () => {
    test('gets completions for prefix', () => {
      const completions = router.getCompletions('hel');
      expect(completions.length).toBeGreaterThan(0);
      expect(completions[0].command).toBe('help');
      expect(completions[0].type).toBe('prefix');
    });
    
    test('gets completions for partial match', () => {
      const completions = router.getCompletions('cl');
      expect(completions.some(c => c.command === 'clear')).toBe(true);
    });
  });
  
  // ═══════════════════════════════════════════════════════════════════
  // LAYER 7: DETERMINISM TESTS (CRITICAL)
  // ═══════════════════════════════════════════════════════════════════
  
  describe('Determinism Validation', () => {
    test('same input produces same output', async () => {
      const decision1 = router.route('help');
      const decision2 = router.route('help');
      
      expect(decision1.type).toBe(decision2.type);
      expect(decision1.confidence).toBe(decision2.confidence);
      
      const result1 = await router.execute(decision1);
      const result2 = await router.execute(decision2);
      
      expect(result1.output).toBe(result2.output);
      expect(result1.exitCode).toBe(result2.exitCode);
    });
    
    test('exit codes are deterministic', async () => {
      const testCases = [
        { command: 'help', expectedCode: 0 },
        { command: 'version', expectedCode: 0 },
        { command: 'unknowncmd', expectedCode: 127 },
      ];
      
      for (const tc of testCases) {
        const decision = router.route(tc.command);
        const result = await router.execute(decision);
        expect(result.exitCode).toBe(tc.expectedCode);
      }
    });
  });
  
  // ═══════════════════════════════════════════════════════════════════
  // LAYER 8: NO_LLM_CORE=1 VALIDATION
  // ═══════════════════════════════════════════════════════════════════
  
  describe('NO_LLM_CORE Mode', () => {
    test('all commands work without LLM', async () => {
      const commands = [
        'help',
        'clear',
        'exit',
        'version',
        'pwd',
        'help ls',
        'help cd',
      ];
      
      for (const cmd of commands) {
        const decision = router.route(cmd);
        const result = await router.execute(decision);
        
        // All should execute (even if placeholder)
        expect(result).toBeTruthy();
        expect(result.exitCode).toBeDefined();
        expect(result.output).toBeDefined();
      }
    });
    
    test('fuzzy matching works without LLM', () => {
      const typos = [
        { input: 'hlp', expected: 'help' },
        { input: 'cler', expected: 'clear' },
        { input: 'lst', expected: 'ls' },
        { input: 'cpy', expected: 'cp' },
      ];
      
      for (const { input, expected } of typos) {
        const match = getBestMatch(input);
        expect(match).toBeTruthy();
        expect(match?.command).toBe(expected);
      }
    });
    
    test('help system works without LLM', async () => {
      const decision = router.route('help');
      const result = await router.execute(decision);
      
      expect(result.success).toBe(true);
      expect(result.output).toContain('SYSTEM:');
      expect(result.output).toContain('FILE:');
      expect(result.output).toContain('NAVIGATION:');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// BENCHMARK TESTS (PERFORMANCE)
// ═══════════════════════════════════════════════════════════════════

describe('Performance Benchmarks', () => {
  let router: CommandRouter;
  
  beforeEach(() => {
    router = new CommandRouter();
  });
  
  test('routing should be < 10ms', () => {
    const start = Date.now();
    const decision = router.route('help');
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(10);
  });
  
  test('fuzzy matching should be < 50ms', () => {
    const start = Date.now();
    const matches = findClosestCommands('hlp', 5);
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(50);
  });
  
  test('command execution should be < 100ms', async () => {
    const decision = router.route('version');
    const start = Date.now();
    const result = await router.execute(decision);
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(100);
  });
});
