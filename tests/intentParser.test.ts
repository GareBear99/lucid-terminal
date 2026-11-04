/**
 * Intent Parser regression tests — `fixnet search` routing.
 *
 * Regression: the synonym map rewrites 'search' -> 'find', so
 * 'fixnet search <query>' used to become 'fixnet find <query>', miss
 * DIRECT_COMMANDS, and be misclassified as a fix_request (because
 * 'fixnet' contains 'fix'). A literal direct command must survive
 * synonym normalization.
 */
import { parseIntent, isDirectCommand } from '../electron/core/parser/intentParser';

describe('Intent Parser - fixnet search routing', () => {
  test('fixnet search is a direct command, not a fix request', () => {
    const parsed = parseIntent('fixnet search sigil');
    expect(parsed.type).toBe('direct_command');
    expect(parsed.confidence).toBe(1.0);
  });

  test('fixnet search keeps its literal normalized form', () => {
    const parsed = parseIntent('fixnet search sigil');
    expect(parsed.normalized).toBe('fixnet search sigil');
  });

  test('fixnet stats is still a direct command', () => {
    const parsed = parseIntent('fixnet stats');
    expect(parsed.type).toBe('direct_command');
    expect(parsed.normalized).toBe('fixnet stats');
  });

  test('help is still a direct command', () => {
    expect(parseIntent('help').type).toBe('direct_command');
  });

  test('synonym normalization still applies to non-direct commands', () => {
    // 'search for my file' is not a direct command, so 'search' -> 'find'
    // must still happen.
    const parsed = parseIntent('search for my file');
    expect(parsed.normalized).toContain('find');
    expect(isDirectCommand('search for my file')).toBe(false);
  });

  test('isDirectCommand recognizes fixnet search with a query', () => {
    expect(isDirectCommand('fixnet search something broken')).toBe(true);
    expect(isDirectCommand('fixnet search')).toBe(true);
  });
});
