/**
 * Hint line component tests (heavy terminal work, 2026-11-13 —
 * Warp teaches the flow with one context-sensitive line above
 * the prompt).
 *
 * The text comes from src/lib/hintLine.ts (pure, tested in
 * tests/hintLine.test.ts); this component only renders it. Null
 * text renders nothing — the line never reserves space when
 * there is nothing to hint.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HintLine } from '../src/components/Terminal/HintLine';

describe('HintLine', () => {
  it('renders the hint text with the terminal-hint-line testid', () => {
    const html = renderToStaticMarkup(
      React.createElement(HintLine, { text: '⏎ run · ⌘⏎ send to agent' }),
    );
    expect(html).toContain('data-testid="terminal-hint-line"');
    expect(html).toContain('⏎ run · ⌘⏎ send to agent');
  });

  it('renders nothing when the text is null', () => {
    const html = renderToStaticMarkup(React.createElement(HintLine, { text: null }));
    expect(html).toBe('');
  });
});
