/**
 * Add-on voice message tests (Gary, 2026-11-06): every add-on has
 * a spoken message in Lily's voice, like the Forge does, and the
 * Add-ons list in Settings > Plugins plays it from a speaker
 * button next to the add-on — never auto-play.
 *
 * These tests render with react-dom/server's renderToStaticMarkup
 * (effects never run under SSR). The voice button creates its
 * Audio element lazily on click, so it renders safely here.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SettingsPanel from '../src/components/Settings/SettingsPanel';
import { PLUGIN_ADDONS } from '../src/data/pluginAddons';
import { addonVoiceSrc } from '../src/lib/addonVoice';

describe('addon voice messages', () => {
  it('every add-on has a voice message path named after its id', () => {
    expect(PLUGIN_ADDONS.length).toBeGreaterThan(0);
    for (const addon of PLUGIN_ADDONS) {
      expect(addonVoiceSrc(addon.id)).toBe(`./addons/${addon.id}.mp3`);
    }
  });

  it('the Add-ons list renders a voice play button for every add-on', () => {
    const html = renderToStaticMarkup(
      React.createElement(SettingsPanel, {
        onClose: () => undefined,
        initialTab: 'plugins',
      }),
    );
    for (const addon of PLUGIN_ADDONS) {
      expect(html).toContain(`data-addon-voice="${addon.id}"`);
      expect(html).toContain(`Play ${addon.name} voice message`);
    }
  });
});
