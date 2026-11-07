// @vitest-environment jsdom
/**
 * Settings Forge-tab tests.
 *
 * The Forge tab in Settings (after Devices, Hammer icon) shows the
 * Forge itself — the actual Forge panel (ForgeView: roster, Dual
 * Unison and Tail Generator tabs, voice messages), exactly as the
 * toolbar Forge does (Gary, 2026-11-06). It is NOT a settings page
 * about the Forge: the old settings-page version (stop-colour
 * duration UI, Forge status, placeholder note) was removed and
 * stays out.
 *
 * These tests render with react-dom/server's renderToStaticMarkup
 * (effects never run under SSR), like the Plugins-tab tests. The
 * component takes an optional initialTab prop so a tab's content
 * is renderable.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SettingsPanel from '../src/components/Settings/SettingsPanel';

const renderSettings = (initialTab?: 'forge') =>
  renderToStaticMarkup(
    React.createElement(SettingsPanel, {
      onClose: () => undefined,
      ...(initialTab ? { initialTab } : {}),
    }),
  );

describe('Settings Forge tab', () => {
  it('appears in the tab list after Devices', () => {
    const html = renderSettings();
    expect(html).toContain('Forge');
    // Devices still precedes it in the tab order.
    expect(html.indexOf('Devices')).toBeLessThan(html.indexOf('Forge'));
  });

  it('renders the Forge panel itself, not a settings page about the Forge', () => {
    const html = renderSettings('forge');
    // ForgeView content: the explanation line and the Forge tab bar.
    expect(html).toContain('How does the Forge work?');
    expect(html).toContain('Forge tabs');
    // The removed settings-page content stays out: no Forge status
    // section and no stop-duration control.
    expect(html).not.toContain('Forge status');
    expect(html).not.toContain('stop-duration');
  });
});
