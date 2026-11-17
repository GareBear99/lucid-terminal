/**
 * computeSplitLayout tests — the flat geometry of a PaneAxis tree
 * (STABLE PANE HOMES, 2026-11-16, audit item i).
 *
 * App positions every pane's home div absolutely from this
 * layout: each leaf's rect and each divider's geometry, all as
 * fractions of the terminal container. The layout is pure — no
 * React, no store — so these tests lock the geometry directly:
 * a wrong rect here puts a pane in the wrong place live.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import { computeSplitLayout } from '../src/stores/splitPaneStore';
import type { SplitNode } from '../src/stores/splitPaneStore';

describe('computeSplitLayout', () => {
  it('a single leaf fills the whole container, no dividers', () => {
    const { leaves, dividers } = computeSplitLayout({ type: 'leaf', tabId: 'terminal-1' });
    expect(leaves.get('terminal-1')).toEqual({ left: 0, top: 0, width: 1, height: 1 });
    expect(dividers).toEqual([]);
  });

  it('a vertical 50/50 split is two side-by-side halves, one divider at the middle', () => {
    const { leaves, dividers } = computeSplitLayout({
      type: 'split',
      id: 'node-1',
      direction: 'vertical',
      sizes: [50, 50],
      first: { type: 'leaf', tabId: 'terminal-1' },
      second: { type: 'leaf', tabId: 'terminal-2' },
    } as SplitNode);
    expect(leaves.get('terminal-1')).toEqual({ left: 0, top: 0, width: 0.5, height: 1 });
    expect(leaves.get('terminal-2')).toEqual({ left: 0.5, top: 0, width: 0.5, height: 1 });
    expect(dividers).toEqual([
      {
        nodeId: 'node-1',
        direction: 'vertical',
        nodeRect: { left: 0, top: 0, width: 1, height: 1 },
        boundary: 0.5,
      },
    ]);
  });

  it('a horizontal 60/40 split stacks the panes, divider at 0.6', () => {
    const { leaves, dividers } = computeSplitLayout({
      type: 'split',
      id: 'node-1',
      direction: 'horizontal',
      sizes: [60, 40],
      first: { type: 'leaf', tabId: 'terminal-1' },
      second: { type: 'leaf', tabId: 'terminal-2' },
    } as SplitNode);
    expect(leaves.get('terminal-1')).toEqual({ left: 0, top: 0, width: 1, height: 0.6 });
    expect(leaves.get('terminal-2')).toEqual({ left: 0, top: 0.6, width: 1, height: 0.4 });
    expect(dividers).toHaveLength(1);
    expect(dividers[0].boundary).toBeCloseTo(0.6, 10);
    expect(dividers[0].direction).toBe('horizontal');
  });

  it('nests a horizontal split inside a vertical one — a stack inside a column', () => {
    const { leaves, dividers } = computeSplitLayout({
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
    } as SplitNode);
    // Left column, top half / bottom half; right column full height.
    expect(leaves.get('terminal-1')).toEqual({ left: 0, top: 0, width: 0.5, height: 0.5 });
    expect(leaves.get('terminal-3')).toEqual({ left: 0, top: 0.5, width: 0.5, height: 0.5 });
    expect(leaves.get('terminal-2')).toEqual({ left: 0.5, top: 0, width: 0.5, height: 1 });
    // One divider per split node; the inner node's rect is the
    // left half of the container — the drag measures against it.
    expect(dividers).toHaveLength(2);
    const inner = dividers.find((d) => d.nodeId === 'node-2')!;
    expect(inner.nodeRect).toEqual({ left: 0, top: 0, width: 0.5, height: 1 });
    expect(inner.boundary).toBe(0.5);
    const root = dividers.find((d) => d.nodeId === 'node-1')!;
    expect(root.nodeRect).toEqual({ left: 0, top: 0, width: 1, height: 1 });
  });

  it('uneven sizes divide exactly — the second share is the complement, no drift', () => {
    const { leaves } = computeSplitLayout({
      type: 'split',
      id: 'node-1',
      direction: 'vertical',
      sizes: [70, 30],
      first: { type: 'leaf', tabId: 'terminal-1' },
      second: { type: 'leaf', tabId: 'terminal-2' },
    } as SplitNode);
    const a = leaves.get('terminal-1')!;
    const b = leaves.get('terminal-2')!;
    expect(a.width).toBeCloseTo(0.7, 10);
    expect(b.width).toBeCloseTo(0.3, 10);
    expect(a.width + b.width).toBe(1);
    expect(a.left + a.width).toBe(b.left);
  });

  it('fractions tile the container: every leaf inside [0,1], no gaps at the edges', () => {
    const { leaves } = computeSplitLayout({
      type: 'split',
      id: 'node-1',
      direction: 'vertical',
      sizes: [33, 67],
      first: {
        type: 'split',
        id: 'node-2',
        direction: 'horizontal',
        sizes: [25, 75],
        first: { type: 'leaf', tabId: 'terminal-1' },
        second: { type: 'leaf', tabId: 'terminal-3' },
      },
      second: { type: 'leaf', tabId: 'terminal-2' },
    } as SplitNode);
    for (const rect of leaves.values()) {
      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.top).toBeGreaterThanOrEqual(0);
      expect(rect.left + rect.width).toBeLessThanOrEqual(1);
      expect(rect.top + rect.height).toBeLessThanOrEqual(1);
    }
    // The right edge and bottom edge are both covered exactly.
    expect(Math.max(...[...leaves.values()].map((r) => r.left + r.width))).toBe(1);
    expect(Math.max(...[...leaves.values()].map((r) => r.top + r.height))).toBe(1);
  });
});
