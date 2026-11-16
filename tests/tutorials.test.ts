/**
 * Tutorials — schema validation
 * + the built-in tutorials' shape.
 */
import { describe, it, expect } from 'vitest';
import { parseTutorial, BUILTIN_TUTORIALS } from '../src/lib/tutorials';

describe('parseTutorial — strict shape check', () => {
  it('accepts a well-formed tutorial', () => {
    const tutorial = parseTutorial({
      id: 'demo',
      title: 'Demo',
      description: 'A demo tutorial.',
      steps: [{ title: 'Step one', prompt: 'Try it.', solution: 'Like this.' }],
    });
    expect(tutorial?.id).toBe('demo');
    expect(tutorial?.steps).toHaveLength(1);
  });

  it('rejects anything malformed — never a half-tutorial', () => {
    expect(parseTutorial(null)).toBeNull();
    expect(parseTutorial('nope')).toBeNull();
    expect(parseTutorial({})).toBeNull();
    expect(parseTutorial({ id: 'x', title: 'X', description: 'D', steps: [] })).toBeNull();
    expect(
      parseTutorial({
        id: 'x',
        title: 'X',
        description: 'D',
        steps: [{ title: 'S', prompt: 'P' }],
      }),
    ).toBeNull();
    expect(
      parseTutorial({
        id: 'x',
        title: 'X',
        description: 'D',
        steps: [{ title: '', prompt: 'P', solution: 'S' }],
      }),
    ).toBeNull();
  });

  it('ignores extra fields, keeps the shape', () => {
    const tutorial = parseTutorial({
      id: 'x',
      title: 'X',
      description: 'D',
      author: 'someone',
      steps: [{ title: 'S', prompt: 'P', solution: 'S', extra: 1 }],
    });
    expect(tutorial).toEqual({
      id: 'x',
      title: 'X',
      description: 'D',
      steps: [{ title: 'S', prompt: 'P', solution: 'S' }],
    });
  });
});

describe('BUILTIN_TUTORIALS', () => {
  it('every built-in is valid and every step has a title, prompt and solution', () => {
    expect(BUILTIN_TUTORIALS.length).toBeGreaterThanOrEqual(2);
    for (const tutorial of BUILTIN_TUTORIALS) {
      expect(parseTutorial(tutorial)).not.toBeNull();
      expect(tutorial.steps.length).toBeGreaterThanOrEqual(1);
      for (const step of tutorial.steps) {
        expect(step.title.trim()).not.toBe('');
        expect(step.prompt.trim()).not.toBe('');
        expect(step.solution.trim()).not.toBe('');
      }
    }
    const ids = BUILTIN_TUTORIALS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
