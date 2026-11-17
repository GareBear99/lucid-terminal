/**
 * SplitDivider tests.
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
 * STABLE PANE HOMES (2026-11-16, audit item i): the divider is
 * an absolutely-positioned sibling of the pane homes. It carries
 * the split node's own rect (fractions of the container, from
 * computeSplitLayout) and the boundary within it, so it positions
 * itself at the boundary and the drag measures against the node's
 * pixel size — not the container's, which would be wrong for
 * nested nodes.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SplitDivider } from '../src/components/Terminal/SplitDivider';

const fullRect = { left: 0, top: 0, width: 1, height: 1 };

describe('SplitDivider', () => {
  it('renders a vertical separator with the group + node in its testid', () => {
    const html = renderToStaticMarkup(
      <SplitDivider groupId="split-1" nodeId="node-1" direction="vertical" nodeRect={fullRect} boundary={0.5} />,
    );
    expect(html).toContain('data-testid="split-divider-split-1-node-1"');
    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-orientation="vertical"');
    expect(html).toContain('Resize split panes');
    expect(html).toContain('cursor-col-resize');
  });

  it('renders a horizontal separator with row-resize cursor and orientation', () => {
    const html = renderToStaticMarkup(
      <SplitDivider groupId="split-1" nodeId="node-2" direction="horizontal" nodeRect={fullRect} boundary={0.6} />,
    );
    expect(html).toContain('data-testid="split-divider-split-1-node-2"');
    expect(html).toContain('aria-orientation="horizontal"');
    expect(html).toContain('cursor-row-resize');
  });

  it('renders a distinct testid per node', () => {
    const html = renderToStaticMarkup(
      <SplitDivider groupId="split-1" nodeId="node-3" direction="vertical" nodeRect={fullRect} boundary={0.5} />,
    );
    expect(html).toContain('data-testid="split-divider-split-1-node-3"');
  });

  it('positions itself absolutely at the boundary, centred on it (4 px thick)', () => {
    const vertical = renderToStaticMarkup(
      <SplitDivider groupId="split-1" nodeId="node-1" direction="vertical" nodeRect={fullRect} boundary={0.5} />,
    );
    // Vertical: left at 50% minus half the thickness, full height.
    expect(vertical).toContain('position:absolute');
    expect(vertical).toContain('left:calc(50% - 2px)');
    expect(vertical).toContain('height:100%');
    expect(vertical).toContain('width:4px');

    const horizontal = renderToStaticMarkup(
      <SplitDivider groupId="split-1" nodeId="node-2" direction="horizontal" nodeRect={fullRect} boundary={0.6} />,
    );
    // Horizontal: top at 60% minus half the thickness, full width.
    expect(horizontal).toContain('position:absolute');
    expect(horizontal).toContain('top:calc(60% - 2px)');
    expect(horizontal).toContain('width:100%');
    expect(horizontal).toContain('height:4px');
  });

  it('positions a nested node’s divider inside the node’s own rect, not the container', () => {
    const html = renderToStaticMarkup(
      <SplitDivider
        groupId="split-1"
        nodeId="node-2"
        direction="horizontal"
        nodeRect={{ left: 0, top: 0, width: 0.5, height: 1 }}
        boundary={0.5}
      />,
    );
    // The node is the left half: the divider spans only that half.
    expect(html).toContain('width:50%');
    expect(html).toContain('top:calc(50% - 2px)');
  });
});
