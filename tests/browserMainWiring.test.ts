/**
 * Browser wiring in electron/main.ts — regression test for the
 * Phase B settings that were nested inside the `mini` object
 * (Gary, 2026-11-07, browser up-to-par pass).
 *
 * The bug: `getAgentSettings` / `setBrowserFingerLocked` were
 * written inside `mini: { ... }` in the `setupBrowserHandlers`
 * options. At runtime `options.getAgentSettings` was undefined,
 * so the agent session always saw LuciferAI ON + finger
 * unlocked — the LuciferAI-off stop/take-control bar could never
 * appear and the finger lock never persisted. Plain `tsc` did
 * not catch it (it only typechecks src/); tsconfig.node.json
 * DOES flag it (TS2353) but is already red with pre-existing
 * errors, so this AST test pins the shape instead.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';

function optionsObject(): ts.ObjectLiteralExpression {
  const src = readFileSync(join(__dirname, '..', 'electron', 'main.ts'), 'utf8');
  const sf = ts.createSourceFile('main.ts', src, ts.ScriptTarget.Latest, true);
  let found: ts.ObjectLiteralExpression | null = null;
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(sf) === 'setupBrowserHandlers' &&
      node.arguments.length >= 3 &&
      ts.isObjectLiteralExpression(node.arguments[2])
    ) {
      found = node.arguments[2];
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!found) throw new Error('setupBrowserHandlers call not found in electron/main.ts');
  return found;
}

function propNames(obj: ts.ObjectLiteralExpression): string[] {
  return obj.properties
    .filter(ts.isPropertyAssignment)
    .map((p) => p.name.getText());
}

describe('electron/main.ts browser wiring', () => {
  it('getAgentSettings / setBrowserFingerLocked are top-level options, not inside mini', () => {
    const options = optionsObject();
    const top = propNames(options);
    expect(top).toContain('getAgentSettings');
    expect(top).toContain('setBrowserFingerLocked');
    expect(top).toContain('mini');

    const mini = options.properties.find(
      (p): p is ts.PropertyAssignment =>
        ts.isPropertyAssignment(p) && p.name.getText() === 'mini',
    );
    expect(mini).toBeTruthy();
    expect(ts.isObjectLiteralExpression(mini!.initializer)).toBe(true);
    const miniProps = propNames(mini!.initializer as ts.ObjectLiteralExpression);
    expect(miniProps).toEqual(expect.arrayContaining(['create', 'get']));
    expect(miniProps).not.toContain('getAgentSettings');
    expect(miniProps).not.toContain('setBrowserFingerLocked');
  });

  it('getAgentSettings defaults LuciferAI to OFF (the quick-disable default)', () => {
    const src = readFileSync(join(__dirname, '..', 'electron', 'main.ts'), 'utf8');
    expect(src).toContain("settings.get<boolean>('luciferAiEnabled') ?? false");
  });
});
