// @vitest-environment jsdom
/**
 * Gaze face-switch reproduction (Gary, 2026-11-06).
 *
 * The eyes follow the mouse on the first face, then stop following
 * on the MAIN face AFTER switching faces (activating a different
 * Homunculus, which swaps the face on the main terminal pages).
 * This test reproduces that exact sequence: mount the main face,
 * move the mouse (gaze follows), switch faces, move the mouse again
 * (gaze must still follow).
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { SentinelFace } from '../src/components/Synth/SentinelFace';
import { useForgeStore } from '../src/stores/forgeStore';
import { useSettingsStore } from '../src/stores/settingsStore';

describe('SentinelFace gaze survives a face switch', () => {
  beforeEach(() => {
    useForgeStore.getState().resetForTests();
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, homunculusColor: 'pink' as never, gazeSensitivity: 50 },
    }));
  });

  afterEach(() => {
    useForgeStore.getState().resetForTests();
  });

  /** The eye-group's horizontal gaze shift, in px (0 = looking straight). */
  function gazeDx(): number {
    const el = document.querySelector('[data-gaze="true"]') as HTMLElement | null;
    const t = el?.style.transform ?? '';
    const m = /translate\((-?[\d.]+)px/.exec(t);
    return m ? parseFloat(m[1]) : Number.NaN;
  }

  function moveMouse(x: number, y: number): void {
    window.dispatchEvent(
      new PointerEvent('pointermove', { clientX: x, clientY: y }),
    );
  }

  test('eyes follow the mouse before AND after switching faces', async () => {
    render(<SentinelFace size={32} />);
    // First face (pink): move the mouse right — the eyes look right.
    moveMouse(200, 0);
    await waitFor(() => expect(gazeDx()).toBeGreaterThan(0.5), {
      timeout: 2000,
    });

    // Switch faces (what activateHomunculus does to the main face:
    // it sets the homunculusColor setting to the new Homunculus).
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, homunculusColor: 'purple' as never },
    }));
    // The face swaps to purple.
    await waitFor(() =>
      expect(
        document.querySelector('[data-head="true"]')?.getAttribute('stroke'),
      ).toBe('#a855f7'),
    );

    // Move the mouse left — the eyes must look left on the new face.
    moveMouse(-200, 0);
    await waitFor(() => expect(gazeDx()).toBeLessThan(-0.5), {
      timeout: 2000,
    });
  });

  test('eyes follow the mouse after the main face unmounts and remounts', async () => {
    const { unmount } = render(<SentinelFace size={32} />);
    moveMouse(200, 0);
    await waitFor(() => expect(gazeDx()).toBeGreaterThan(0.5), {
      timeout: 2000,
    });

    // The main face unmounts (view switch) and remounts.
    unmount();
    render(<SentinelFace size={32} />);
    moveMouse(-200, 0);
    await waitFor(() => expect(gazeDx()).toBeLessThan(-0.5), {
      timeout: 2000,
    });
  });

  test('eyes follow the mouse after roster faces unmount (Forge closes)', async () => {
    // The main face plus a Forge roster-card face (explicit colour).
    const { rerender } = render(
      <>
        <SentinelFace size={32} />
        <SentinelFace size={44} color="purple" />
      </>,
    );
    moveMouse(200, 0);
    await waitFor(() => expect(gazeDx()).toBeGreaterThan(0.5), {
      timeout: 2000,
    });

    // Switch faces, then the Forge closes (roster faces unmount).
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, homunculusColor: 'purple' as never },
    }));
    rerender(<SentinelFace size={32} />);
    moveMouse(-200, 0);
    await waitFor(() => expect(gazeDx()).toBeLessThan(-0.5), {
      timeout: 2000,
    });
  });

  test('eyes follow the mouse through the real activateHomunculus flow', async () => {
    // The real activation path: forgeStore.activateHomunculus, which
    // updates the forge store AND the homunculusColor setting (via
    // the async updateSetting IPC — mocked here so it resolves).
    const win = window as unknown as Record<string, unknown>;
    const prevLucidAPI = win.lucidAPI;
    win.lucidAPI = {
      settings: { set: async () => undefined },
    };
    try {
      const LUCIFER = {
        id: 'lucifer',
        name: 'Lucifer',
        color: 'pink' as const,
        biography: null,
        modelPath: null,
        status: 'untrained' as const,
        incumbentScore: null,
        lineage: [],
        createdAt: '2026-11-05T06:00:00.000Z',
      };
      const EVE = {
        ...LUCIFER,
        id: 'eve',
        name: 'EVE',
        color: 'purple' as const,
        createdAt: '2026-11-05T07:00:00.000Z',
      };
      useForgeStore.setState({ roster: [LUCIFER, EVE], selectedId: 'lucifer' });
      render(<SentinelFace size={32} />);
      moveMouse(200, 0);
      await waitFor(() => expect(gazeDx()).toBeGreaterThan(0.5), {
        timeout: 2000,
      });

      // Activate EVE (the real store function, not a bare setState).
      useForgeStore.getState().activateHomunculus('eve');
      await waitFor(() =>
        expect(
          document.querySelector('[data-head="true"]')?.getAttribute('stroke'),
        ).toBe('#a855f7'),
      );

      moveMouse(-200, 0);
      await waitFor(() => expect(gazeDx()).toBeLessThan(-0.5), {
        timeout: 2000,
      });
    } finally {
      if (prevLucidAPI === undefined) delete win.lucidAPI;
      else win.lucidAPI = prevLucidAPI;
    }
  });
});
