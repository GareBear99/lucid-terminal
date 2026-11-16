/**
 * Offline Worldmap segment — the map itself, in the Modules
 * tab (Gary, 2026-11-15: ARC v10 as an offline worldmap
 * plugin for offline GPS projects, installed through the
 * custom plugin setup, showing up as a plugin when
 * installed, user-customizable).
 *
 * The segment appears only when the add-on is installed
 * AND its custom-plugin toggle is on (see SegmentsPanel) —
 * installing it carries this segment with it; removing it
 * (or toggling it off) hides it again, the Forge pattern.
 *
 * The map is the fetched plugin page, embedded like the
 * vendored MATRIX SYNTH shell (SynthView): an <iframe>
 * pointed at the fetched package's index.html (the install
 * path in settings.worldmapInstall). The plugin is never
 * bundled in Lucid's asar — the iframe loads it from the
 * fetched directory on disk. Settings flow over postMessage:
 * Lucid's settings store is the source of truth; the
 * segment posts settings into the frame on load and on
 * every change, and writes back anything the page itself
 * changes. The settings form below the map is the Lucid
 * side of the same settings — the user changes them here,
 * not in hardcoded values.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { worldmapPluginPageUrl } from '../../lib/worldmapAddon';
import {
  sanitizeWorldmapSettings,
  WORLDMAP_DEFAULT_SETTINGS,
  type WorldmapSettings,
} from '../../lib/worldmapSettings';
import { useSettingsStore } from '../../stores/settingsStore';

export function WorldmapSegment() {
  const install = useSettingsStore((s) => s.settings.worldmapInstall);
  const settings = useSettingsStore((s) => s.settings.worldmapSettings);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [frameStatus, setFrameStatus] = useState<string>('Not loaded.');
  const [form, setForm] = useState<WorldmapSettings>(settings ?? WORLDMAP_DEFAULT_SETTINGS);

  useEffect(() => {
    setForm(settings ?? WORLDMAP_DEFAULT_SETTINGS);
  }, [settings]);

  const pageUrl = worldmapPluginPageUrl(install?.path ?? null);

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

  if (!install || install.status !== 'installed' || !pageUrl) {
    return (
      <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
        Offline Worldmap is not installed. Install it from Settings &gt; Plugins — it is fetched from its repo at install time, never bundled.
      </p>
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
    <div className="space-y-3">
      <div className="relative h-[420px] overflow-hidden rounded border border-[var(--border)] bg-black">
        <iframe
          ref={iframeRef}
          title="Offline Worldmap"
          src={pageUrl}
          sandbox="allow-scripts"
          allow="geolocation"
          onLoad={() => postSettings(settings ?? WORLDMAP_DEFAULT_SETTINGS)}
          className="w-full h-full border-0 bg-black"
        />
      </div>
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
  );
}
