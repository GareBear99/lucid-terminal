// @vitest-environment jsdom
/**
 * Compass widget tests — the exact demo compass as a widget, for any
 * blueprint. The dial points at the heading and the line is the
 * shell's own compass line; with no direction the widget says so
 * instead of inventing a heading.
 */

import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CompassWidget } from '../src/components/Synth/widgets/CompassWidget';
import type { SynthWidgetContext } from '../src/lib/synthWidgets';
import {
  DEFAULT_SHELL_BLUEPRINT,
  eyeDirection,
} from '../src/lib/synthBlueprint';

function context(direction: SynthWidgetContext['direction']): SynthWidgetContext {
  return {
    activePluginId: 'lucifer',
    seedHex: 'F1B49B1CB10D6FED',
    selectedTileId: 'tile_0000',
    eyeMode: 'AUTO',
    boot: 'READY',
    build: 'EMPTY_REPO_READY',
    mounted: true,
    shellId: 'SHELL_OCTAGON_ALPHA',
    direction,
  };
}

describe('CompassWidget', () => {
  test('the default octagon eye shows the dial at 78.7° E, pole +Z LOCK', () => {
    render(
      <CompassWidget
        {...context(eyeDirection(DEFAULT_SHELL_BLUEPRINT))}
      />,
    );
    const widget = screen.getByTestId('compass-widget');
    expect(widget).toBeTruthy();
    expect(widget.getAttribute('data-heading')).toBe('78.7');
    expect(widget.getAttribute('data-pole')).toBe('+Z');
    // Testing Library normalizes whitespace (the line's double
    // spaces collapse to one); the exact string is asserted in
    // synthCompass.test.ts via formatCompassLine.
    expect(screen.getByText(/hdg=78\.7° E lat=1\.1° poleOff=0\.980/)).toBeTruthy();
    expect(screen.getByText(/pole \+Z · LOCK/)).toBeTruthy();
    // The needle points at the heading.
    const needle = widget.querySelector('line');
    expect(needle).not.toBeNull();
    expect(needle!.getAttribute('transform')).toMatch(/^rotate\(78\.69/);
    // The dial carries all four poles.
    expect(widget.querySelector('svg')).toBeTruthy();
    expect(widget.textContent).toContain('N');
    expect(widget.textContent).toContain('E');
  });

  test('with no direction the widget says so and draws no needle', () => {
    render(<CompassWidget {...context(null)} />);
    const widget = screen.getByTestId('compass-widget');
    expect(screen.getByText(/No heading/)).toBeTruthy();
    expect(widget.querySelector('line')).toBeNull();
    expect(widget.getAttribute('data-heading')).toBeNull();
  });
});
