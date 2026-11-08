/**
 * Settings Modules-tab tests (Gary, 2026-11-06).
 *
 * Modules is another ANCHORED plugin: built in, always present, no
 * install step, no toolbar button. Its tab lives in the Settings.
 * Segments is Modules' anchored ADD-ON — anchored to the Modules
 * plugin, LABELED as an extension to the Modules plugin, and it does
 * NOT have an install (no install button, no install action).
 * When a starship is detected, Segments show up in the Modules tab;
 * the detection mechanism itself is still open (an explicit hook in
 * src/lib/starshipDetection.ts), so today the tab shows the
 * "no starship detected" state.
 *
 * These tests render with react-dom/server's renderToStaticMarkup
 * (effects never run under SSR). The component takes an optional
 * initialTab prop so a tab's content is renderable.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SettingsPanel from '../src/components/Settings/SettingsPanel';
import { MODULES_PLUGIN } from '../src/data/modules';
import {
  PLUGIN_ADDONS,
  ANCHORED_PLUGIN_IDS,
  isAddonInstalled,
} from '../src/data/pluginAddons';
import { detectStarship } from '../src/lib/starshipDetection';
import { useSettingsStore } from '../src/stores/settingsStore';

const renderSettings = (initialTab?: 'modules') =>
  renderToStaticMarkup(
    React.createElement(SettingsPanel, {
      onClose: () => undefined,
      ...(initialTab ? { initialTab } : {}),
    }),
  );

describe('Modules anchored plugin', () => {
  it('is registered as an anchored plugin with id modules', () => {
    expect(MODULES_PLUGIN.id).toBe('modules');
    expect(MODULES_PLUGIN.name).toBe('Modules');
    expect(MODULES_PLUGIN.description).toBeTruthy();
    expect(ANCHORED_PLUGIN_IDS).toContain('modules');
  });
});

describe('Modules tab', () => {
  it('appears in the tab list', () => {
    const html = renderSettings();
    expect(html).toContain('Modules');
  });

  it('shows the Modules plugin as built-in and anchored', () => {
    const html = renderSettings('modules');
    expect(html).toContain('Modules');
    expect(html).toContain('Built-in · Anchored');
    expect(html).toContain('Container for Segments');
  });

  it('shows Segments labeled as an extension of the Modules plugin', () => {
    const html = renderSettings('modules');
    expect(html).toContain('Segments');
    expect(html).toContain('An extension of the Modules plugin');
  });

  it('shows Segments as installed via the Modules anchor, with no install action', () => {
    const segments = PLUGIN_ADDONS.find((a) => a.id === 'segments');
    expect(segments).toBeDefined();
    expect(segments?.anchor).toBe('modules');
    expect(isAddonInstalled(segments!)).toBe(true);
    const html = renderSettings('modules');
    expect(html).toContain('Installed · Anchored with Modules');
    // No install button or install action anywhere in the tab.
    // (The anchored "Installed" label contains "Install" as a
    // substring, so the assertion targets the button text itself.)
    expect(html).not.toContain('>Install<');
  });

  it('shows the no-starship-detected state until detection is wired', () => {
    expect(detectStarship().detected).toBe(false);
    const html = renderSettings('modules');
    expect(html).toContain('No starship detected');
    expect(html).toContain('Starship segments');
  });
});

describe('Modules tab overview (heavy update 2026-11-07)', () => {
  it('maps what lives here — all six segment groups, with live statuses', () => {
    const html = renderSettings('modules');
    expect(html).toContain('What lives here');
    expect(html).toContain('Segments');
    expect(html).toContain('Computer control');
    expect(html).toContain('AI Chat');
    expect(html).toContain('Google Drive');
    expect(html).toContain('Starship segments');
    expect(html).toContain('Forge ↔ Persona Plex bridge');
    // Statuses are read from live state, never hardcoded: the
    // add-on is installed via its anchor, computer control is
    // pre-installed and live, the starship is waiting.
    expect(html).toContain('Installed · Anchored with Modules');
    expect(html).toContain('Pre-installed · Live');
    expect(html).toContain('Waiting — no starship detected');
  });

  it('shows the Forge bridge hidden until Persona Plex is installed', () => {
    // SSR only: zustand 4.5.7 passes getInitialState as the server
    // snapshot, so renderToStaticMarkup always reads the initial
    // installedAddons ([]) and setState is invisible to it. The
    // "live once installed" branch is covered by
    // tests/modulesInventoryLive.test.tsx (jsdom, live subscription).
    const html = renderSettings('modules');
    expect(html).toContain('Hidden — install Persona Plex to show it');
  });

  it('explains how a segment gets here — the three arrival routes', () => {
    const html = renderSettings('modules');
    expect(html).toContain('How a segment gets here');
    expect(html).toContain('Pre-installed');
    expect(html).toContain('Starship-detected');
    expect(html).toContain('Add-on-carried');
    // Each route names an example that actually arrives that way.
    expect(html).toContain('Computer control, AI Chat and Google Drive arrive this way');
    expect(html).toContain('The Forge ↔ Persona Plex bridge arrives this way');
  });

  it('describes Modules as the container for all three segment kinds, not just starships', () => {
    expect(MODULES_PLUGIN.description).toContain('Container for Segments');
    expect(MODULES_PLUGIN.description).toContain('pre-installed segments');
    expect(MODULES_PLUGIN.description).toContain('starship segments');
    expect(MODULES_PLUGIN.description).toContain('bridges carried by installed add-ons');
    const html = renderSettings('modules');
    expect(html).toContain('pre-installed segments');
  });
});
