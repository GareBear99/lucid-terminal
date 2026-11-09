/**
 * BrowserView background colour — regression test for the
 * example.com blank-page bug (Gary, 2026-11-09, live-proof pass).
 *
 * The bug: a page whose <html> background is painted via
 * `light-dark()` (color-scheme: light dark — example.com) renders
 * correctly in the compositor (capturePage shows white text on
 * #222) but its background does NOT paint on screen in the
 * BrowserView: the view shows its default white background and
 * the page's dark-mode (white) text goes invisible, so the page
 * looks blank white. Pages with an explicit background (Hacker
 * News, the phone page, a plain local page) paint fine — their
 * opaque background covers the view.
 *
 * The fix: give the view the app's dark background (via
 * `BrowserView.setBackgroundColor`, '#0d1117' — the same colour
 * the main window and the mini window hardcode), so light-dark()
 * text stays readable even when the page's own background does
 * not paint. This AST test pins the shape (the adapter runs in
 * the main process, so no Electron mock is needed).
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';

function createBrowserViewBody(): string {
  const src = readFileSync(
    join(__dirname, '..', 'electron', 'services', 'browserViewAdapter.ts'),
    'utf8',
  );
  const sf = ts.createSourceFile(
    'browserViewAdapter.ts',
    src,
    ts.ScriptTarget.Latest,
    true,
  );
  let found: ts.FunctionDeclaration | null = null;
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.getText(sf) === 'createBrowserView') {
      found = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!found) throw new Error('createBrowserView not found in browserViewAdapter.ts');
  return found.getText(sf);
}

describe('browserViewAdapter createBrowserView background', () => {
  it('sets the view background to the app dark colour', () => {
    const body = createBrowserViewBody();
    expect(body).toContain('setBackgroundColor');
    expect(body).toContain("'#0d1117'");
  });

  it('does not import nativeTheme (the electron mocks do not export it)', () => {
    const src = readFileSync(
      join(__dirname, '..', 'electron', 'services', 'browserViewAdapter.ts'),
      'utf8',
    );
    const electronImport = src.match(/import \{[^}]*\} from 'electron'/);
    expect(electronImport).toBeTruthy();
    expect(electronImport![0]).not.toContain('nativeTheme');
  });

  it('guards the call (the 12 hand-rolled BrowserView mocks lack it)', () => {
    const body = createBrowserViewBody();
    expect(body).toContain("typeof view.setBackgroundColor === 'function'");
  });
});
