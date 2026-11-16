// @vitest-environment jsdom
/**
 * Offline Worldmap full-screen view tests —
 * `src/components/Worldmap/WorldmapView.tsx`.
 *
 * The worldmap is an add-on + plugin with its OWN full screen
 * in the main UI (Gary, 2026-11-15) — a toolbar icon opens
 * this view, full width, outside Settings. It is NOT a module
 * and NOT a segment: no part of it lives in Settings > Modules
 * (the segment-in-Modules registration is deferred, not
 * rejected — Gary, 2026-11-15 ~17:10 PST: "the logic behind
 * your thinking was correct but that parts not ready").
 *
 * Covered here:
 * - the view gates on installed AND enabled (the same gate
 *   the segment used): not installed, or installed but toggled
 *   off, shows the fallback with a button to Settings > Plugins.
 * - installed + enabled renders the fetched plugin page in an
 *   iframe whose sandbox MUST be "allow-scripts
 *   allow-same-origin": without allow-same-origin Chromium
 *   refuses every file:// subresource load ("Not allowed to
 *   load local resource"), the page boots to dead static HTML,
 *   no worldmap:ready is ever posted, and the status stays
 *   "Not loaded." with a black map (proven in an Electron 28
 *   harness, 2026-11-15). The sandbox value is asserted
 *   exactly — do not weaken it.
 * - a worldmap:ready postMessage from the frame flips the
 *   status to "Plugin ready — offline."
 * - the settings form shows the Williams Lake defaults.
 * - toggleWorldmapView: the toolbar icon toggles worldmap <->
 *   terminal, like the Persona Plex toggle.
 *
 * Run with: npm test
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WorldmapView } from '../src/components/Worldmap/WorldmapView';
import { toggleWorldmapView } from '../src/lib/worldmapView';
import { useSettingsStore } from '../src/stores/settingsStore';

const INSTALL_PATH =
  '/Users/gary/.lucid/addons/offline-worldmap/602d304c3f9e44ff814565a6b784b4052973fad2/arc_serverless_v10_complete';

function setWorldmapState(installed: boolean, enabled: boolean) {
  const base = useSettingsStore.getState().settings;
  useSettingsStore.setState({
    settings: {
      ...base,
      worldmapInstall: installed
        ? {
            status: 'installed',
            version: '602d304c3f9e44ff814565a6b784b4052973fad2',
            path: INSTALL_PATH,
            error: null,
          }
        : null,
      worldmapSettings: null,
      installedAddons: installed ? ['offline-worldmap'] : [],
      customPlugins: enabled ? {} : { 'offline-worldmap': false },
    },
  });
}

describe('toggleWorldmapView', () => {
  test('toggles worldmap <-> terminal, opens from any other view', () => {
    expect(toggleWorldmapView('worldmap')).toBe('terminal');
    expect(toggleWorldmapView('terminal')).toBe('worldmap');
    expect(toggleWorldmapView('settings')).toBe('worldmap');
    expect(toggleWorldmapView('synth')).toBe('worldmap');
  });
});

describe('WorldmapView', () => {
  beforeEach(() => {
    setWorldmapState(true, true);
  });

  test('installed + enabled renders the fetched page in an iframe with the sandbox that loads local scripts', () => {
    render(<WorldmapView />);
    const frame = document.querySelector('iframe[title="Offline Worldmap"]') as HTMLIFrameElement;
    expect(frame).not.toBeNull();
    expect(frame.getAttribute('src')).toBe(`file://${INSTALL_PATH}/index.html`);
    // THE load fix: allow-same-origin is what lets the file://
    // frame load its own vendor/ + arc/ scripts. Without it the
    // map is black and the status never leaves "Not loaded."
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
    expect(frame.getAttribute('allow')).toBe('geolocation');
    expect(screen.getByText('Not loaded.')).toBeTruthy();
  });

  test('the settings form shows the Williams Lake defaults', () => {
    render(<WorldmapView />);
    expect((screen.getByLabelText('Centre latitude') as HTMLInputElement).value).toBe('52.131');
    expect((screen.getByLabelText('Centre longitude') as HTMLInputElement).value).toBe('-122.141');
    expect((screen.getByLabelText('Zoom') as HTMLInputElement).value).toBe('15');
    expect((screen.getByLabelText('Tile source') as HTMLSelectElement).value).toBe('grid');
    expect((screen.getByLabelText('GPS source') as HTMLSelectElement).value).toBe('none');
  });

  test('a worldmap:ready from the frame flips the status to ready', async () => {
    render(<WorldmapView />);
    const frame = document.querySelector('iframe[title="Offline Worldmap"]') as HTMLIFrameElement;
    expect(frame).not.toBeNull();
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'worldmap:ready', settings: {} },
        source: frame.contentWindow,
      }),
    );
    await waitFor(() => expect(screen.getByText('Plugin ready — offline.')).toBeTruthy());
  });

  test('not installed shows the fallback with a button to Settings > Plugins', () => {
    setWorldmapState(false, true);
    const onOpenPlugins = vi.fn();
    render(<WorldmapView onOpenPlugins={onOpenPlugins} />);
    expect(document.querySelector('iframe[title="Offline Worldmap"]')).toBeNull();
    expect(screen.getByText(/is not installed/)).toBeTruthy();
    fireEvent.click(screen.getByText('Open Settings > Plugins'));
    expect(onOpenPlugins).toHaveBeenCalledTimes(1);
  });

  test('installed but toggled off shows the turned-off fallback', () => {
    setWorldmapState(true, false);
    const onOpenPlugins = vi.fn();
    render(<WorldmapView onOpenPlugins={onOpenPlugins} />);
    expect(document.querySelector('iframe[title="Offline Worldmap"]')).toBeNull();
    expect(screen.getByText(/turned off/)).toBeTruthy();
    fireEvent.click(screen.getByText('Open Settings > Plugins'));
    expect(onOpenPlugins).toHaveBeenCalledTimes(1);
  });
});
