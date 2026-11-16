/**
 * Offline Worldmap — the full-screen view (Gary, 2026-11-15:
 * ARC v10 as an offline worldmap plugin, add-on + plugin,
 * installed through the custom plugin setup, with its OWN
 * full screen in the main UI — a toolbar icon opens this
 * view, full width, outside Settings).
 *
 * This is the former WorldmapSegment, repurposed: the map +
 * controls are the same code, wired as a main-UI view/tab
 * instead of a segment. It is NOT a module and NOT a segment.
 *
 * DEFERRED, NOT REJECTED (Gary, 2026-11-15 ~17:10 PST: "the
 * logic behind your thinking was correct but that parts not
 * ready"): the segment-in-Modules idea — a worldmap section
 * in Settings > Modules — was correct in principle but is
 * NOT ready, so it ships LATER. The segment registration was
 * removed from the build (no 'worldmap' category in
 * segmentCategories.ts, no section in SegmentsPanel) and the
 * design is preserved here: to re-register it later, add the
 * category back and render this view's map inside a
 * SegmentCategorySection, gated the same way (installed AND
 * enabled). Until then, no part of the worldmap lives in
 * Settings > Modules.
 *
 * The map is the fetched plugin page, embedded like the
 * vendored MATRIX SYNTH shell (SynthView): an <iframe>
 * pointed at the fetched package's index.html (the install
 * path in settings.worldmapInstall). The plugin is never
 * bundled in Lucid's asar — the iframe loads it from the
 * fetched directory on disk. Settings flow over postMessage:
 * Lucid's settings store is the source of truth; the view
 * posts settings into the frame on load and on every change,
 * and writes back anything the page itself changes. The
 * settings form beside the map is the Lucid side of the same
 * settings — the user changes them here, not in hardcoded
 * values.
 *
 * SANDBOX (the "Not loaded." fix, Gary 2026-11-15): the
 * iframe MUST carry allow-same-origin alongside allow-scripts.
 * With sandbox="allow-scripts" alone the file:// frame is an
 * opaque origin and Chromium refuses EVERY one of its local
 * subresource loads ("Not allowed to load local resource":
 * vendor/leaflet.js, vendor/leaflet-heat.js, all ten arc/*.js,
 * leaflet.css) — the page loads as dead static HTML, its boot
 * throws "WorldmapSettings is not defined", no Leaflet map is
 * ever built, no worldmap:ready is ever posted, and the status
 * stays "Not loaded." with a black map. Proven in an Electron
 * 28 harness on the same page (2026-11-15): sandbox="allow-scripts"
 * blocks all 13 subresources; sandbox="allow-scripts
 * allow-same-origin" loads all 13, the map builds, and
 * worldmap:ready arrives with the Williams Lake defaults. Do
 * NOT remove allow-same-origin — the map goes black again.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { worldmapPluginPageUrl } from '../../lib/worldmapAddon';
import {
  sanitizeWorldmapSettings,
  WORLDMAP_DEFAULT_SETTINGS,
  type WorldmapSettings,
} from '../../lib/worldmapSettings';
import { CUSTOM_PLUGINS, isCustomPluginEnabled } from '../../data/customPlugins';
import { useSettingsStore } from '../../stores/settingsStore';

interface WorldmapViewProps {
  /** Open Settings at the Plugins tab (the install + toggle live there). */
  onOpenPlugins?: () => void;
}

export function WorldmapView({ onOpenPlugins }: WorldmapViewProps) {
  const install = useSettingsStore((s) => s.settings.worldmapInstall);
  const settings = useSettingsStore((s) => s.settings.worldmapSettings);
  const customPlugins = useSettingsStore((s) => s.settings.customPlugins);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [frameStatus, setFrameStatus] = useState<string>('Not loaded.');
  const [form, setForm] = useState<WorldmapSettings>(settings ?? WORLDMAP_DEFAULT_SETTINGS);

  useEffect(() => {
    setForm(settings ?? WORLDMAP_DEFAULT_SETTINGS);
  }, [settings]);

  const pageUrl = worldmapPluginPageUrl(install?.path ?? null);
  const worldmapPlugin = CUSTOM_PLUGINS.find((plugin) => plugin.id === 'offline-worldmap');
  const worldmapEnabled = worldmapPlugin
    ? isCustomPluginEnabled(worldmapPlugin, customPlugins)
    : false;

  const postSettings = useCallback((next: WorldmapSettings) => {
    const frame = iframeRef.current;
    if (frame?.contentWindow) {
      frame.contentWindow.postMessage({ type: 'worldmap:settings', settings: next }, '*');
    }
  }, []);

  useEffect(() => {
    postSettings(settings ?? WORLDMAP_DEFAULT_SETTINGS);
  }, [settings, postSettings]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const frame = iframeRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const data = event.data as { type?: string; settings?: unknown } | null;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'worldmap:ready') {
        setFrameStatus('Plugin ready — offline.');
        postSettings(settings ?? WORLDMAP_DEFAULT_SETTINGS);
      }
      if (data.type === 'worldmap:settings-changed' && data.settings) {
        const next = sanitizeWorldmapSettings(data.settings);
        setForm(next);
        void updateSetting('worldmapSettings', next);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [settings, postSettings, updateSetting]);

  const installed = Boolean(install && install.status === 'installed' && pageUrl);

  if (!installed || !worldmapEnabled) {
    return (
      <div className="flex h-full items-center justify-center overflow-y-auto p-8">
        <div className="max-w-md space-y-3">
          <h2 className="text-lg font-semibold">Offline Worldmap</h2>
          <p className="text-sm leading-[1.5] text-[var(--text-muted)]">
            {!installed
              ? 'Offline Worldmap is not installed. Install it from Settings > Plugins — it is fetched from its repo at install time, never bundled.'
              : 'Offline Worldmap is installed but turned off. Turn it on in Settings > Plugins — the toggle under Custom plugins.'}
          </p>
          {onOpenPlugins && (
            <button onClick={onOpenPlugins} className="btn btn-secondary text-xs">
              Open Settings &gt; Plugins
            </button>
          )}
        </div>
      </div>
    );
  }

  const applyForm = () => {
    const next = sanitizeWorldmapSettings(form);
    setForm(next);
    void updateSetting('worldmapSettings', next);
    postSettings(next);
  };

  const setField = <K extends keyof WorldmapSettings>(key: K, value: WorldmapSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Map — fills the view. The iframe is the fetched plugin
          page; see the SANDBOX note above — allow-same-origin is
          what lets its local scripts load. */}
      <div className="relative min-w-0 flex-1 bg-black">
        <iframe
          ref={iframeRef}
          title="Offline Worldmap"
          src={pageUrl ?? undefined}
          sandbox="allow-scripts allow-same-origin"
          allow="geolocation"
          onLoad={() => postSettings(settings ?? WORLDMAP_DEFAULT_SETTINGS)}
          className="h-full w-full border-0 bg-black"
        />
      </div>

      {/* Settings — inspector panel beside the map. The same
          form the segment carried; the user changes settings
          here, not in hardcoded values. */}
      <div className="w-[340px] shrink-0 space-y-3 overflow-y-auto border-l border-[var(--border)] p-4">
        <h2 className="text-lg font-semibold">Offline Worldmap</h2>
        <p className="text-xs text-[var(--text-muted)]">{frameStatus}</p>

        <div className="space-y-2 text-sm">
          <div className="flex gap-2">
            <label className="flex-1">
              <span className="block text-xs text-[var(--text-muted)]">Centre latitude</span>
              <input
                type="number"
                step="0.001"
                min="-90"
                max="90"
                value={form.centerLat}
                onChange={(e) => setField('centerLat', Number(e.target.value))}
                className="w-full bg-transparent border border-[var(--border)] rounded px-2 py-1"
              />
            </label>
            <label className="flex-1">
              <span className="block text-xs text-[var(--text-muted)]">Centre longitude</span>
              <input
                type="number"
                step="0.001"
                min="-180"
                max="180"
                value={form.centerLon}
                onChange={(e) => setField('centerLon', Number(e.target.value))}
                className="w-full bg-transparent border border-[var(--border)] rounded px-2 py-1"
              />
            </label>
            <label className="w-24">
              <span className="block text-xs text-[var(--text-muted)]">Zoom</span>
              <input
                type="number"
                step="1"
                min="0"
                max="19"
                value={form.zoom}
                onChange={(e) => setField('zoom', Number(e.target.value))}
                className="w-full bg-transparent border border-[var(--border)] rounded px-2 py-1"
              />
            </label>
          </div>

          <label className="block">
            <span className="block text-xs text-[var(--text-muted)]">Tile source</span>
            <select
              value={form.tileMode}
              onChange={(e) => setField('tileMode', e.target.value as WorldmapSettings['tileMode'])}
              className="w-full bg-transparent border border-[var(--border)] rounded px-2 py-1"
            >
              <option value="grid">Grid (no tiles — offline)</option>
              <option value="local">Local tile directory</option>
              <option value="url">Tile URL template</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-[var(--text-muted)]">Tile directory / path</span>
            <input
              type="text"
              value={form.tilePath}
              onChange={(e) => setField('tilePath', e.target.value)}
              placeholder="tiles or file:///path/to/tiles"
              className="w-full bg-transparent border border-[var(--border)] rounded px-2 py-1"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-[var(--text-muted)]">Tile URL template</span>
            <input
              type="text"
              value={form.tileUrlTemplate}
              onChange={(e) => setField('tileUrlTemplate', e.target.value)}
              placeholder="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              className="w-full bg-transparent border border-[var(--border)] rounded px-2 py-1"
            />
          </label>

          <label className="block">
            <span className="block text-xs text-[var(--text-muted)]">GPS source</span>
            <select
              value={form.gpsSource}
              onChange={(e) => setField('gpsSource', e.target.value as WorldmapSettings['gpsSource'])}
              className="w-full bg-transparent border border-[var(--border)] rounded px-2 py-1"
            >
              <option value="none">None</option>
              <option value="simulator">Simulator (demo)</option>
              <option value="geolocation">Device GPS</option>
              <option value="gpx">GPX file</option>
              <option value="nmea">NMEA file</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-[var(--text-muted)]">Simulator devices (comma separated)</span>
            <input
              type="text"
              value={form.simulatorDevices.join(', ')}
              onChange={(e) =>
                setField(
                  'simulatorDevices',
                  e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                )
              }
              className="w-full bg-transparent border border-[var(--border)] rounded px-2 py-1"
            />
          </label>
          <div className="flex gap-2">
            <label className="flex-1">
              <span className="block text-xs text-[var(--text-muted)]">Simulator interval (ms)</span>
              <input
                type="number"
                step="100"
                min="100"
                max="60000"
                value={form.simulatorIntervalMs}
                onChange={(e) => setField('simulatorIntervalMs', Number(e.target.value))}
                className="w-full bg-transparent border border-[var(--border)] rounded px-2 py-1"
              />
            </label>
            <label className="flex items-end gap-2 pb-1">
              <input
                type="checkbox"
                checked={form.showPaths}
                onChange={(e) => setField('showPaths', e.target.checked)}
              />
              <span className="text-xs text-[var(--text-muted)]">Show paths</span>
            </label>
          </div>

          <div className="flex gap-2">
            <button onClick={applyForm} className="btn btn-secondary text-xs shrink-0">
              Apply settings
            </button>
            <button
              onClick={() => {
                setForm(WORLDMAP_DEFAULT_SETTINGS);
                void updateSetting('worldmapSettings', WORLDMAP_DEFAULT_SETTINGS);
                postSettings(WORLDMAP_DEFAULT_SETTINGS);
              }}
              className="btn btn-secondary text-xs shrink-0"
            >
              Reset to defaults
            </button>
          </div>
          <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
            GPX and NMEA files are picked inside the map itself. Device GPS works where the shell provides it; where it does not, the map says so.
          </p>
        </div>
      </div>
    </div>
  );
}
