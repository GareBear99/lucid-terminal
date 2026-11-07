// @vitest-environment jsdom
/**
 * Lucid color-shift accent tests.
 *
 * Gary (2026-11-05): beautiful, subtle color shifting — but ONLY in
 * the places that make Lucid look futuristic, sleek and bigger than
 * it is. One shared effect (.lucid-color-shift in index.css, plus
 * .lucid-color-shift-text for the wordmark fill), applied to exactly
 * three accents: the sidebar divider, the splash "Lucid" wordmark,
 * and the input drag-handle grip. Nothing else gets it.
 *
 * These are DOM/class tests plus a read of the shared CSS — the
 * gradient itself is CSS, so no pixel colors or animation frames are
 * asserted here. Real frame-rate numbers for the splash come from
 * the perf harness (perf/measure-splash.mjs), not from jsdom.
 *
 * Run with: npm test
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { SplashScreen } from '../src/components/Splash/SplashScreen';
import { InputDragHandle } from '../src/components/InputDragHandle';
import Sidebar from '../src/components/Layout/Sidebar';

// Vitest runs from the repo root, so the shared stylesheet is read
// from there (same pattern as tests/packaging.test.ts).
const indexCssPath = path.join(process.cwd(), 'src', 'index.css');
const indexCss = fs.readFileSync(indexCssPath, 'utf-8');

const originalMatchMedia = window.matchMedia;

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeEach(() => {
  mockMatchMedia(false);
});

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: originalMatchMedia,
  });
  vi.restoreAllMocks();
});

describe('color-shift — sidebar divider', () => {
  test('the Settings/plugin divider carries the shifting gradient, same size as before', () => {
    const { container } = render(
      <Sidebar
        width={250}
        onWidthChange={() => {}}
        currentView="terminal"
        onViewChange={() => {}}
        showAI={false}
        onToggleAI={() => {}}
      />,
    );
    const divider = container.querySelector('.lucid-color-shift');
    expect(divider).not.toBeNull();
    // Same geometry as the old flat line: 32px wide, 1px tall, 4px margin.
    expect(divider!.classList.contains('w-8')).toBe(true);
    expect(divider!.classList.contains('h-px')).toBe(true);
    expect(divider!.classList.contains('my-1')).toBe(true);
    // The flat border is gone — the gradient is the line now.
    expect(divider!.classList.contains('border-t')).toBe(false);
    // It still sits between the plugin icons and Settings: in the
    // icon bar the divider's previous sibling is the plugin list
    // (holding the Synth button — the last plugin icon before
    // Settings in this render, where only Synth and the blood drop
    // are on by default; the blood drop is locked to the top spot now,
    // Gary 2026-11-07, so it is no longer the last plugin icon)
    // and its next sibling is the Settings button.
    // (Asserted structurally, not via title attributes — the tooltip
    // work removes native titles.)
    const synthBtn = screen.getByLabelText('Synth');
    expect(divider!.previousElementSibling?.contains(synthBtn)).toBe(true);
    // The next sibling holds the Settings button (possibly wrapped
    // in the tooltip trigger span — assert on what it contains).
    expect(divider!.nextElementSibling?.querySelector('button')).not.toBeNull();
  });
});

describe('color-shift — splash wordmark', () => {
  test('the "Lucid" wordmark carries the shifting text fill', () => {
    const onDone = vi.fn();
    render(<SplashScreen onDone={onDone} />);
    const wordmark = screen.getByTestId('splash-wordmark');
    expect(wordmark.textContent).toBe('Lucid');
    const text = wordmark.querySelector('.splash-wordmark-text');
    expect(text).not.toBeNull();
    expect(text!.classList.contains('lucid-color-shift-text')).toBe(true);
  });
});

describe('color-shift — input drag-handle grip', () => {
  test('at rest the grip carries the shifting gradient', () => {
    const { container } = render(
      <InputDragHandle isDragging={false} onDragHandlePointerDown={() => {}} />,
    );
    const grip = container.querySelector('.lucid-color-shift');
    expect(grip).not.toBeNull();
    // Still the same thin minimal pill.
    expect(grip!.classList.contains('h-[4px]')).toBe(true);
    expect(grip!.classList.contains('w-10')).toBe(true);
    expect(grip!.classList.contains('rounded-full')).toBe(true);
  });

  test('while dragging the grip stays solid accent (grab feedback wins)', () => {
    const { container } = render(
      <InputDragHandle isDragging={true} onDragHandlePointerDown={() => {}} />,
    );
    expect(container.querySelector('.lucid-color-shift')).toBeNull();
    const grip = screen.getByTestId('input-drag-handle').firstElementChild;
    expect(grip!.classList.contains('bg-[var(--accent)]')).toBe(true);
  });
});

describe('color-shift — shared CSS in index.css', () => {
  test('cycle time is a tunable variable, 8s (in the 6–10s band Gary asked for)', () => {
    const match = indexCss.match(/--color-shift-duration:\s*(\d+(?:\.\d+)?)s/);
    expect(match).not.toBeNull();
    const seconds = Number(match![1]);
    expect(seconds).toBeGreaterThanOrEqual(6);
    expect(seconds).toBeLessThanOrEqual(10);
  });

  test('the keyframes loop seamlessly: first and last gradient stops match', () => {
    // Both classes use a 200%-wide gradient whose first and last stops
    // are the same colour, so animating background-position 0% -> 200%
    // returns to the identical frame.
    const solid = indexCss.match(/\.lucid-color-shift\s*\{[^}]*\}/);
    expect(solid).not.toBeNull();
    expect(solid![0]).toContain('#7c5cff 0%');
    expect(solid![0]).toContain('#7c5cff 100%');
    expect(solid![0]).toContain('background-size: 200% 100%');
    const text = indexCss.match(/\.lucid-color-shift-text\s*\{[^}]*\}/);
    expect(text).not.toBeNull();
    expect(text![0]).toContain('#eef2ff 0%');
    expect(text![0]).toContain('#eef2ff 100%');
    expect(text![0]).toContain('background-clip: text');
  });

  test('the keyframes animate background-position only (paint-only, GPU-friendly)', () => {
    // The keyframes block contains nested braces, so slice it out
    // instead of regexing it (a [^}]* match stops at the first rule).
    const start = indexCss.indexOf('@keyframes lucid-color-shift');
    expect(start).toBeGreaterThan(-1);
    const keyframes = indexCss.slice(start, start + 200);
    expect(keyframes).toContain('background-position: 0% 50%');
    expect(keyframes).toContain('background-position: 200% 50%');
    // No runtime blur, no per-frame JS hooks in the effect. (Strip
    // comments first — the header comment itself mentions blur().)
    const block = indexCss
      .slice(
        indexCss.indexOf('/* ---- Lucid color-shift accents'),
        indexCss.indexOf('@media (prefers-reduced-motion: reduce)'),
      )
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(block).not.toContain('blur(');
  });

  test('reduced motion stops the animation (static gradient remains)', () => {
    const mediaStart = indexCss.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(mediaStart).toBeGreaterThan(-1);
    const mediaBlock = indexCss.slice(mediaStart, mediaStart + 400);
    expect(mediaBlock).toContain('.lucid-color-shift');
    expect(mediaBlock).toContain('.lucid-color-shift-text');
    expect(mediaBlock).toContain('animation: none');
  });
});
