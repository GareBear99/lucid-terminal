// @vitest-environment jsdom
/**
 * SentinelFace stop-colour tests (Gary, 2026-11-06).
 *
 * When a stop is hit, the action face colours to the stop's colour —
 * and when the colour expires, the face regresses to the last
 * validated solid (the active Homunculus's colour). The override
 * applies only to faces that read the setting (the main displayed
 * face); a face with an explicit colour prop (a Forge roster card)
 * wears its own Homunculus's colour and is never recoloured.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SentinelFace } from '../src/components/Synth/SentinelFace';
import { useForgeStore } from '../src/stores/forgeStore';
import { useSettingsStore } from '../src/stores/settingsStore';

describe('SentinelFace stop colour', () => {
  beforeEach(() => {
    useForgeStore.getState().resetForTests();
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, homunculusColor: 'pink' as never },
    }));
  });

  afterEach(() => {
    useForgeStore.getState().resetForTests();
    vi.useRealTimers();
  });

  function headStroke(): string | null {
    return document
      .querySelector('[data-head="true"]')
      ?.getAttribute('stroke');
  }

  test('the face wears the active Homunculus colour, then the stop colour, then regresses', async () => {
    render(<SentinelFace size={32} />);
    await waitFor(() => expect(headStroke()).toBe('#ff2d95'));
    // A stop is hit: the action face colours to the stop's colour.
    useForgeStore.setState((s) => ({
      unison: {
        ...s.unison,
        stopColor: '#ef4444',
        stopFaceColorActive: true,
      },
    }));
    await waitFor(() => expect(headStroke()).toBe('#ef4444'));
    // The colour expires: the face regresses to the last validated
    // solid (pink, the active Homunculus's colour).
    useForgeStore.getState().regressStopFaceColor();
    await waitFor(() => expect(headStroke()).toBe('#ff2d95'));
  });

  test('a face with an explicit colour prop is never recoloured by a stop', async () => {
    render(<SentinelFace size={32} color="purple" />);
    await waitFor(() => expect(headStroke()).toBe('#a855f7'));
    useForgeStore.setState((s) => ({
      unison: {
        ...s.unison,
        stopColor: '#ef4444',
        stopFaceColorActive: true,
      },
    }));
    // The roster card's own purple stays — no stop recolour.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(headStroke()).toBe('#a855f7');
  });
});
