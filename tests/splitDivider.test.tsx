/**
 * SplitDivider tests (2026-11-14, sweep fix 2; PaneAxis tree,
 * Atom steal #9).
 *
 * The divider is the draggable boundary between two split panes
 * (role="separator"). It belongs to ONE split node — it carries
 * the node's id and direction: a vertical node drags on X
 * (cursor-col-resize), a horizontal node on Y
 * (cursor-row-resize). The drag math lives in
 * computePaneSizesAfterDrag and is covered in
 * tests/splitPaneStore.test.ts; the pointer handling mirrors the
 * AI panel's resize handle (App.tsx) and is verified by the live
 * VM check — SSR markup cannot fire pointer events.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SplitDivider } from '../src/components/Terminal/SplitDivider';

describe('SplitDivider', () => {
  it('renders a vertical separator with the group + node in its testid', () => {
    const html = renderToStaticMarkup(
      <SplitDivider groupId="split-1" nodeId="node-1" direction="vertical" />,
    );
    expect(html).toContain('data-testid="split-divider-split-1-node-1"');
    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-orientation="vertical"');
    expect(html).toContain('Resize split panes');
    expect(html).toContain('cursor-col-resize');
  });

  it('renders a horizontal separator with row-resize cursor and orientation', () => {
    const html = renderToStaticMarkup(
      <SplitDivider groupId="split-1" nodeId="node-2" direction="horizontal" />,
    );
    expect(html).toContain('data-testid="split-divider-split-1-node-2"');
    expect(html).toContain('aria-orientation="horizontal"');
    expect(html).toContain('cursor-row-resize');
  });

  it('renders a distinct testid per node', () => {
    const html = renderToStaticMarkup(
      <SplitDivider groupId="split-1" nodeId="node-3" direction="vertical" />,
    );
    expect(html).toContain('data-testid="split-divider-split-1-node-3"');
  });
});
