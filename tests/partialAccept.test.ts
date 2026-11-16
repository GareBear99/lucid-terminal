/**
 * Partial accept (Tabnine S1 — 2026-11-15): accept only the
 * next word or the next line of a ghost offer, instead of the
 * whole thing.
 *
 * Run with: npx vitest run tests/partialAccept.test.ts
 */
import { describe, it, expect } from 'vitest';
import { acceptNextWord, acceptNextLine } from '../src/lib/partialAccept';

describe('acceptNextWord', () => {
  it('takes exactly one word of the remainder', () => {
    expect(acceptNextWord('echo hello world', 'echo ')).toBe('echo hello');
    expect(acceptNextWord('echo hello world', 'echo')).toBe('echo hello');
  });

  it('repeated partial accepts walk the offer word by word', () => {
    let input = 'echo ';
    input = acceptNextWord('echo hello world', input)!;
    expect(input).toBe('echo hello');
    input = acceptNextWord('echo hello world', input)!;
    expect(input).toBe('echo hello world');
    expect(acceptNextWord('echo hello world', input)).toBeNull();
  });

  it('takes the leading whitespace with the word', () => {
    expect(acceptNextWord('git checkout main', 'git')).toBe('git checkout');
    expect(acceptNextWord('ls --all --long', 'ls')).toBe('ls --all');
  });

  it('takes a trailing-space-only remainder whole', () => {
    expect(acceptNextWord('echo ', 'echo')).toBe('echo ');
    expect(acceptNextWord('echo ', 'echo ')).toBeNull();
  });

  it('returns null with no offer, or when the offer is not a completion', () => {
    expect(acceptNextWord(null, 'echo')).toBeNull();
    expect(acceptNextWord(undefined, 'echo')).toBeNull();
    expect(acceptNextWord('echo', 'echo')).toBeNull();
    expect(acceptNextWord('pwd', 'echo')).toBeNull();
    expect(acceptNextWord('ech', 'echo')).toBeNull();
  });
});

describe('acceptNextLine', () => {
  it('takes up to and including the next newline', () => {
    expect(acceptNextLine('echo a\necho b\necho c', 'echo ')).toBe('echo a\n');
    expect(acceptNextLine('echo a\necho b', 'echo a\n')).toBe('echo a\necho b');
  });

  it('repeated partial accepts walk the offer line by line', () => {
    let input = '';
    input = acceptNextLine('echo a\necho b\necho c', input)!;
    expect(input).toBe('echo a\n');
    input = acceptNextLine('echo a\necho b\necho c', input)!;
    expect(input).toBe('echo a\necho b\n');
    input = acceptNextLine('echo a\necho b\necho c', input)!;
    expect(input).toBe('echo a\necho b\necho c');
    expect(acceptNextLine('echo a\necho b\necho c', input)).toBeNull();
  });

  it('takes the whole remainder when there is no newline (one line)', () => {
    expect(acceptNextLine('echo hello world', 'echo ')).toBe('echo hello world');
  });

  it('returns null with no offer, or when the offer is not a completion', () => {
    expect(acceptNextLine(null, 'echo')).toBeNull();
    expect(acceptNextLine('echo', 'echo')).toBeNull();
    expect(acceptNextLine('pwd', 'echo')).toBeNull();
  });
});
