/**
 * Kite signature assist:
 * the callee at the cursor, and the augmented signature
 * documentation (Docs link + "How others used this").
 */
import { describe, it, expect } from 'vitest';
import {
  extractCalleeName,
  buildSignatureDocumentation,
  SIGNATURE_INVOCATION_LIMIT,
  SIGNATURE_INVOCATION_MAX_LENGTH,
} from '../src/lib/signatureAssist';

describe('extractCalleeName', () => {
  it('finds a plain call', () => {
    expect(extractCalleeName('greet(name, ', 12)).toEqual({ chain: 'greet', word: 'greet' });
  });

  it('finds the innermost call in a nested call', () => {
    expect(extractCalleeName('foo(bar(x, ', 11)).toEqual({ chain: 'bar', word: 'bar' });
  });

  it('keeps a dotted chain and reports the last segment as the word', () => {
    expect(extractCalleeName('obj.foo(a, ', 10)).toEqual({ chain: 'obj.foo', word: 'foo' });
  });

  it('stops the chain at an inner paren — the call chain last link', () => {
    expect(extractCalleeName('store.getState().openFiles(', 28)).toEqual({
      chain: 'openFiles',
      word: 'openFiles',
    });
  });

  it('returns null with no paren, no identifier, or control flow', () => {
    expect(extractCalleeName('const x = 1', 12)).toBeNull();
    expect(extractCalleeName('foo', 4)).toBeNull();
    expect(extractCalleeName('if (x > 0', 5)).toBeNull();
    expect(extractCalleeName('for (let i = 0; ', 6)).toBeNull();
    expect(extractCalleeName('  (', 4)).toBeNull();
  });

  it('handles a new expression and the cursor past the paren', () => {
    expect(extractCalleeName('const d = new Date(', 20)).toEqual({ chain: 'Date', word: 'Date' });
    expect(extractCalleeName('greet(  ', 8)).toEqual({ chain: 'greet', word: 'greet' });
  });
});

describe('buildSignatureDocumentation', () => {
  it('returns null when there is nothing to add', () => {
    expect(buildSignatureDocumentation('Greets.', undefined, [])).toBeNull();
    expect(buildSignatureDocumentation(undefined, undefined, [])).toBeNull();
  });

  it('appends the Docs link after the existing documentation', () => {
    const out = buildSignatureDocumentation('Greets.', 'lucid-docs://x', []);
    expect(out).toBe('Greets.\n\n[Docs](lucid-docs://x)');
  });

  it('adds the invocations block, capped at 3, as code lines', () => {
    const out = buildSignatureDocumentation(undefined, undefined, [
      'greet("a", true)',
      'greet("b", false)',
      'greet(name, loud)',
      'greet("c", true)',
    ]);
    expect(out).toContain('**How others used this:**');
    expect(out).toContain('- `greet("a", true)`');
    expect(out).toContain('- `greet(name, loud)`');
    expect(out).not.toContain('greet("c", true)');
    expect(out?.split('\n').filter((l) => l.startsWith('- `'))).toHaveLength(
      SIGNATURE_INVOCATION_LIMIT,
    );
  });

  it('trims long invocation lines and skips blank ones', () => {
    const long = `greet("${'x'.repeat(200)}")`;
    const out = buildSignatureDocumentation(undefined, undefined, ['   ', long]);
    expect(out).toContain('…');
    const line = out?.split('\n').find((l) => l.startsWith('- `')) ?? '';
    expect(line.length).toBeLessThanOrEqual(SIGNATURE_INVOCATION_MAX_LENGTH + 6);
  });

  it('combines docs and invocations in order', () => {
    const out = buildSignatureDocumentation('Greets.', 'lucid-docs://x', ['greet("a")']);
    expect(out).toBe(
      'Greets.\n\n[Docs](lucid-docs://x)\n\n**How others used this:**\n- `greet("a")`',
    );
  });
});
