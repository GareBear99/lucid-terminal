/**
 * Scope at a position: the node-type path and
 * the descriptor derived from it, over a real tree-sitter
 * parse of a sample file.
 */

import { describe, it, expect } from 'vitest';
import {
  updateFileTree,
  getNodePathAtPosition,
  getScopeDescriptorAtPosition,
  dropFileTree,
} from '../src/lib/treeSitter';

const PATH = '/Users/gary/lucid-terminal/src/lib/scope-sample.ts';
const SOURCE = [
  'export function greet(name: string) {',
  '  // say hello',
  '  return "hello " + name;',
  '}',
  '',
].join('\n');

describe('scope at a position', () => {
  it('derives the descriptor from the node path at the cursor', async () => {
    expect(await updateFileTree(PATH, SOURCE)).toBe(true);
    try {
      // Inside the string literal on line 3: function → string.
      const descriptor = getScopeDescriptorAtPosition(PATH, 3, 12);
      expect(descriptor).not.toBeNull();
      expect(descriptor![0]).toBe('source.ts');
      expect(descriptor).toContain('meta.function');
      expect(descriptor![descriptor!.length - 1]).toBe('string.quoted.double');

      // Inside the comment on line 2.
      const comment = getScopeDescriptorAtPosition(PATH, 2, 5);
      expect(comment).not.toBeNull();
      expect(comment![comment!.length - 1]).toBe('comment');

      // The node path itself is root-first, leaf-last — the
      // smallest named node inside a literal is the fragment.
      const nodePath = getNodePathAtPosition(PATH, 3, 12);
      expect(nodePath).not.toBeNull();
      expect(nodePath![0]).toBe('program');
      expect(nodePath).toContain('string');
      expect(nodePath![nodePath!.length - 1]).toBe('string_fragment');
    } finally {
      dropFileTree(PATH);
    }
  });

  it('returns null for a file with no tree', () => {
    expect(getScopeDescriptorAtPosition('/no/such/file.ts', 1, 1)).toBeNull();
    expect(getNodePathAtPosition('/no/such/file.ts', 1, 1)).toBeNull();
  });
});
