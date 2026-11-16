/**
 * The scope system — pure descriptor build
 * and selector matching.
 */

import { describe, it, expect } from 'vitest';
import {
  scopeDescriptorForNodePath,
  scopeMatches,
} from '../src/lib/scopeDescriptor';

describe('scopeDescriptorForNodePath', () => {
  it('prefixes the language root scope', () => {
    expect(scopeDescriptorForNodePath('typescript', ['program'])).toEqual([
      'source.ts',
      'program',
    ]);
    expect(scopeDescriptorForNodePath('tsx', ['program'])).toEqual([
      'source.tsx',
      'program',
    ]);
  });

  it('maps known node types to TextMate-style scopes', () => {
    expect(
      scopeDescriptorForNodePath('typescript', [
        'program',
        'function_declaration',
        'string',
      ]),
    ).toEqual(['source.ts', 'program', 'meta.function', 'string.quoted.double']);
  });

  it('collapses consecutive duplicate scopes', () => {
    expect(
      scopeDescriptorForNodePath('typescript', [
        'program',
        'function_declaration',
        'function_expression',
      ]),
    ).toEqual(['source.ts', 'program', 'meta.function']);
  });

  it('passes unmapped node types through verbatim', () => {
    expect(
      scopeDescriptorForNodePath('typescript', ['program', 'statement_block']),
    ).toEqual(['source.ts', 'program', 'statement_block']);
  });

  it('a string fragment inherits the enclosing string scope', () => {
    expect(
      scopeDescriptorForNodePath('typescript', [
        'program',
        'function_declaration',
        'string',
        'string_fragment',
      ]),
    ).toEqual(['source.ts', 'program', 'meta.function', 'string.quoted.double']);
    expect(
      scopeDescriptorForNodePath('typescript', [
        'program',
        'template_string',
        'string_fragment',
      ]),
    ).toEqual(['source.ts', 'program', 'string.template']);
  });
});

describe('scopeMatches', () => {
  const descriptor = [
    'source.ts',
    'meta.function',
    'meta.arguments',
    'string.quoted.double',
  ];

  it('a single segment matches anywhere in the chain', () => {
    expect(scopeMatches(descriptor, 'string.quoted')).toBe(true);
    expect(scopeMatches(descriptor, 'meta.function')).toBe(true);
    expect(scopeMatches(descriptor, 'source.ts')).toBe(true);
    expect(scopeMatches(descriptor, 'comment')).toBe(false);
  });

  it('a segment prefix-matches its scope family', () => {
    expect(scopeMatches(descriptor, 'string')).toBe(true);
    // `stringy` is not a prefix family of `string.quoted.double`.
    expect(scopeMatches(descriptor, 'stringy')).toBe(false);
  });

  it('a `>` path needs a contiguous run, in order', () => {
    expect(scopeMatches(descriptor, 'meta.function > meta.arguments')).toBe(true);
    expect(scopeMatches(descriptor, 'meta.arguments > string.quoted')).toBe(true);
    // meta.function and the string are not adjacent — the
    // arguments scope sits between them.
    expect(scopeMatches(descriptor, 'meta.function > string.quoted')).toBe(false);
    // Reversed order never matches.
    expect(scopeMatches(descriptor, 'string.quoted > meta.function')).toBe(false);
  });

  it('comma-separated alternatives are OR', () => {
    expect(scopeMatches(descriptor, 'comment, string.quoted')).toBe(true);
    expect(scopeMatches(descriptor, 'comment, number')).toBe(false);
  });

  it('`*` matches any descriptor', () => {
    expect(scopeMatches(descriptor, '*')).toBe(true);
    expect(scopeMatches(descriptor, ' * ')).toBe(true);
  });

  it('an empty selector never matches', () => {
    expect(scopeMatches(descriptor, '')).toBe(false);
    expect(scopeMatches(descriptor, '   ')).toBe(false);
  });

  it('a null descriptor matches only `*`', () => {
    expect(scopeMatches(null, '*')).toBe(true);
    expect(scopeMatches(null, 'string')).toBe(false);
    expect(scopeMatches(null, '')).toBe(false);
  });
});
