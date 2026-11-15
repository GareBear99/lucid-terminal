/**
 * SplitPaneTree tests (Atom steal #9 — PaneAxis tree, 2026-11-14).
 *
 * The tree renders one split group's nodes as nested flex
 * containers: a vertical node is a row, a horizontal node is a
 * column, each with its two children at the node's sizes and a
 * SplitDivider between them. A leaf renders the caller's pane
 * for that tab id. SSR markup only — the drag itself is covered
 * by the divider tests and the live check.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SplitPaneTree } from '../src/components/Terminal/SplitPaneTree';
import type { SplitGroup } from '../src/stores/splitPaneStore';

function groupWith(root: SplitGroup['root']): SplitGroup {
  return { id: 'split-1', root };
}

const pane = (tabId: string) => <span data-pane={tabId}>{tabId}</span>;

describe('SplitPaneTree', () => {
  it('renders a vertical split as a row with one divider and both panes', () => {
    const html = renderToStaticMarkup(
      <SplitPaneTree
        group={groupWith({
          type: 'split',
          id: 'node-1',
          direction: 'vertical',
          sizes: [50, 50],
          first: { type: 'leaf', tabId: 'terminal-1' },
          second: { type: 'leaf', tabId: 'terminal-2' },
        })}
        renderPane={pane}
      />,
    );
    expect(html).toContain('flex-row');
    expect(html).toContain('data-testid="split-divider-split-1-node-1"');
    expect(html).toContain('data-pane="terminal-1"');
    expect(html).toContain('data-pane="terminal-2"');
    expect(html).toContain('flex:1 1 50%');
  });

  it('renders a horizontal split as a column', () => {
    const html = renderToStaticMarkup(
      <SplitPaneTree
        group={groupWith({
          type: 'split',
          id: 'node-1',
          direction: 'horizontal',
          sizes: [60, 40],
          first: { type: 'leaf', tabId: 'terminal-1' },
          second: { type: 'leaf', tabId: 'terminal-2' },
        })}
        renderPane={pane}
      />,
    );
    expect(html).toContain('flex-col');
    expect(html).toContain('aria-orientation="horizontal"');
    expect(html).toContain('flex:1 1 60%');
    expect(html).toContain('flex:1 1 40%');
  });

  it('nests a horizontal split inside a vertical one — a stack inside a column', () => {
    const html = renderToStaticMarkup(
      <SplitPaneTree
        group={groupWith({
          type: 'split',
          id: 'node-1',
          direction: 'vertical',
          sizes: [50, 50],
          first: {
            type: 'split',
            id: 'node-2',
            direction: 'horizontal',
            sizes: [50, 50],
            first: { type: 'leaf', tabId: 'terminal-1' },
            second: { type: 'leaf', tabId: 'terminal-3' },
          },
          second: { type: 'leaf', tabId: 'terminal-2' },
        })}
        renderPane={pane}
      />,
    );
    // Both dividers, one per node, in leaf order.
    expect(html).toContain('data-testid="split-divider-split-1-node-1"');
    expect(html).toContain('data-testid="split-divider-split-1-node-2"');
    const order = ['terminal-1', 'terminal-3', 'terminal-2'].map((id) =>
      html.indexOf(`data-pane="${id}"`),
    );
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
    expect(html).toContain('flex-row');
    expect(html).toContain('flex-col');
  });

  it('renders a single leaf as just its pane', () => {
    const html = renderToStaticMarkup(
      <SplitPaneTree
        group={groupWith({ type: 'leaf', tabId: 'terminal-1' })}
        renderPane={pane}
      />,
    );
    expect(html).toContain('data-pane="terminal-1"');
    expect(html).not.toContain('split-divider');
  });
});
