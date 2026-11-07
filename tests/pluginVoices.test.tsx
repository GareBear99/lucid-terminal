/**
 * Plugin voice message tests (Gary, 2026-11-07 ~02:54 PST):
 * plugins should have voice recordings all throughout — every
 * plugin, on every page/view, explaining what you are looking at.
 * Each message is synthesized in Lily's voice and saved as an mp3
 * under public/plugins/, and the plugin's page plays it from a
 * speaker button — never auto-play.
 *
 * These tests render with react-dom/server's renderToStaticMarkup
 * (effects never run under SSR). The voice button creates its
 * Audio element lazily on click, so it renders safely here.
 *
 * Devices is wired separately: the Devices tab lives in
 * SettingsPanel.tsx (owned by the permissions work), so the
 * Devices voice button is tested as its own component here, and
 * the one-line wiring into the Devices tab is documented in
 * public/plugins/README.md.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { pluginVoiceSrc } from '../src/lib/pluginVoice';
import { PluginVoiceButton } from '../src/components/PluginVoiceButton';
import { DevicesVoiceButton } from '../src/components/Settings/DevicesVoiceButton';
import { SynthView } from '../src/components/Synth/SynthView';
import { PersonaPlexView } from '../src/components/PersonaPlex/PersonaPlexView';
import { ModulesTab } from '../src/components/Modules/ModulesTab';

// Vitest runs from the repo root, so the voice files are read from
// there (same pattern as tests/packaging.test.ts).
const PLUGIN_VOICES = ['synth-main', 'devices-explanation', 'persona-plex-view', 'modules-main'];

describe('plugin voice messages', () => {
  it('every plugin voice has a path named after its id', () => {
    for (const voiceId of PLUGIN_VOICES) {
      expect(pluginVoiceSrc(voiceId)).toBe(`./plugins/${voiceId}.mp3`);
    }
  });

  it('every plugin voice mp3 exists on disk and is non-empty', () => {
    for (const voiceId of PLUGIN_VOICES) {
      const filePath = path.join(process.cwd(), 'public', 'plugins', `${voiceId}.mp3`);
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.statSync(filePath).size).toBeGreaterThan(0);
    }
  });

  it('the Synth view renders its voice play button', () => {
    const html = renderToStaticMarkup(React.createElement(SynthView));
    expect(html).toContain('data-plugin-voice="synth-main"');
    expect(html).toContain('Play Synth explanation');
  });

  it('the Persona Plex view renders its voice play button', () => {
    const html = renderToStaticMarkup(React.createElement(PersonaPlexView));
    expect(html).toContain('data-plugin-voice="persona-plex-view"');
    expect(html).toContain('Play Persona Plex explanation');
  });

  it('the Modules tab renders its voice play button', () => {
    const html = renderToStaticMarkup(React.createElement(ModulesTab));
    expect(html).toContain('data-plugin-voice="modules-main"');
    expect(html).toContain('Play Modules explanation');
  });

  it('the Devices voice button renders its voice play button', () => {
    const html = renderToStaticMarkup(React.createElement(DevicesVoiceButton));
    expect(html).toContain('data-plugin-voice="devices-explanation"');
    expect(html).toContain('Play Devices explanation');
  });

  it('the generic voice button renders the mp3 path for its voice', () => {
    const html = renderToStaticMarkup(
      React.createElement(PluginVoiceButton, {
        voiceId: 'synth-main',
        title: 'Synth',
        src: pluginVoiceSrc('synth-main'),
      }),
    );
    expect(html).toContain('data-plugin-voice="synth-main"');
  });
});
