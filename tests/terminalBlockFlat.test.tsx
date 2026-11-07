// @vitest-environment jsdom
/**
 * Terminal Block flat-variant tests.
 *
 * Gary's rule (2026-11-06): with LuciferAI DISABLED there are no
 * bubbles anywhere — input or output. The flat-input fix only
 * flattened the prompt; the output `Block` kept rendering its rounded
 * bubble card because it never read `luciferAiEnabled`. `Block` now
 * takes a `flat` prop (Terminal passes `flat={!luciferAiEnabled}`):
 * flat renders the output directly on the terminal background,
 * Warp-style; the card renders as before when LuciferAI is on.
 *
 * Run with: npm test
 */

import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Block } from '../src/components/Terminal/Block';
import type { TerminalBlock } from '../src/types';

function block(overrides: Partial<TerminalBlock> = {}): TerminalBlock {
  return {
    id: 'b1',
    command: 'pwd',
    output: '/Users/gary',
    timestamp: 1000,
    isComplete: true,
    isCollapsed: false,
    isProcessing: false,
    ...overrides,
  };
}

/** Class tokens of an element (exact-token match, not substring). */
function tokens(el: Element | null): string[] {
  expect(el).not.toBeNull();
  return (el as HTMLElement).className.split(/\s+/).filter(Boolean);
}

function outerEl(container: HTMLElement): HTMLElement {
  return container.querySelector('.terminal-block') as HTMLElement;
}

describe('Block flat variant (LuciferAI disabled)', () => {
  test('default renders the bubble card', () => {
    const { container } = render(
      <Block block={block()} isActive={false} onToggle={() => {}} />,
    );
    const outer = tokens(outerEl(container));
    expect(outer).toContain('rounded-lg');
    expect(outer).toContain('border');
    expect(outer).toContain('bg-[var(--bg-secondary)]');
    // Header keeps its bubble chrome too.
    const header = tokens(outerEl(container).children[0]);
    expect(header).toContain('bg-[var(--bg-tertiary)]');
    expect(header).toContain('border-b');
    // Output sits on the card background.
    const outputWrap = container.querySelector('pre')?.parentElement;
    expect(tokens(outputWrap)).toContain('bg-[var(--bg-primary)]');
  });

  test('flat renders no bubble card anywhere', () => {
    const { container } = render(
      <Block block={block()} isActive={false} onToggle={() => {}} flat />,
    );
    const outer = tokens(outerEl(container));
    expect(outer).not.toContain('rounded-lg');
    expect(outer).not.toContain('border');
    expect(outer).not.toContain('bg-[var(--bg-secondary)]');
    const header = tokens(outerEl(container).children[0]);
    expect(header).not.toContain('bg-[var(--bg-tertiary)]');
    expect(header).not.toContain('border-b');
    const outputWrap = container.querySelector('pre')?.parentElement;
    expect(tokens(outputWrap)).not.toContain('bg-[var(--bg-primary)]');
  });

  test('flat with validation and tokens renders no bubble chrome', () => {
    const b = block({
      validation: {
        steps: [{ id: 's1', label: 'Parse', status: 'success', timestamp: 1000 }],
        currentStep: 1,
        status: 'complete',
      },
      tokens: {
        prompt_tokens: 10,
        generated_tokens: 5,
        total_tokens: 15,
        prompt_chars: 40,
        output_chars: 20,
        chars_per_token: 4,
      },
    });
    const { container } = render(
      <Block block={b} isActive={false} onToggle={() => {}} flat />,
    );
    const outer = tokens(outerEl(container));
    expect(outer).not.toContain('rounded-lg');
    expect(outer).not.toContain('bg-[var(--bg-secondary)]');
    // Every content section (validation, output, tokens) is flat too.
    const content = outerEl(container).children[1];
    for (const section of Array.from(content.children)) {
      expect(tokens(section)).not.toContain('bg-[var(--bg-secondary)]');
      expect(tokens(section)).not.toContain('bg-[var(--bg-tertiary)]');
      expect(tokens(section)).not.toContain('bg-[var(--bg-primary)]');
    }
  });

  test('flat=false explicitly renders the card', () => {
    const { container } = render(
      <Block block={block()} isActive={false} onToggle={() => {}} flat={false} />,
    );
    expect(tokens(outerEl(container))).toContain('rounded-lg');
  });

  test('an active flat block has no accent ring or shadow', () => {
    const { container } = render(
      <Block block={block()} isActive onToggle={() => {}} flat />,
    );
    const outer = tokens(outerEl(container));
    expect(outer).not.toContain('ring-1');
    expect(outer).not.toContain('shadow-md');
    expect(outer).not.toContain('border-[var(--accent)]');
  });
});
