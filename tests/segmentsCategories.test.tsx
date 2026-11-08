/**
 * Segments categorised sections tests (Gary, 2026-11-07 ~02:50 PST).
 *
 * The Segments panel is organised into categorised sections, each
 * with an info explanatory page and a voice that reads the EXACT
 * words on that page — the same as the Settings tabs info page +
 * voice. The info text is the single source of truth
 * (src/lib/segmentCategories.ts): the panel renders it verbatim
 * and the voice mp3 is synthesized from it.
 *
 * These tests render with react-dom/server's renderToStaticMarkup
 * (effects never run under SSR). The Forge category only renders
 * when Persona Plex is installed; the default settings have no
 * add-ons installed, so it is asserted at the data level here.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SettingsPanel from '../src/components/Settings/SettingsPanel';
import {
  SEGMENT_CATEGORIES,
  segmentCategory,
  segmentVoiceSrc,
} from '../src/lib/segmentCategories';

const renderModules = () =>
  renderToStaticMarkup(
    React.createElement(SettingsPanel, {
      onClose: () => undefined,
      initialTab: 'modules',
    }),
  );

describe('Segments categories', () => {
  it('has seven categories, in panel order, each with a title and info text', () => {
    expect(SEGMENT_CATEGORIES.map((c) => c.id)).toEqual([
      'about',
      'computer-control',
      'ai-chat',
      'google-drive',
      'telegram',
      'starship',
      'forge-persona-plex',
    ]);
    for (const category of SEGMENT_CATEGORIES) {
      expect(category.title).toBeTruthy();
      // The info page is the voice script: speakable, no digits,
      // no Markdown, no URLs, no abbreviations.
      expect(category.info.length).toBeGreaterThan(50);
      expect(category.info).not.toMatch(/\d/);
      expect(category.info).not.toContain('#');
      expect(category.info).not.toContain('http');
    }
  });

  it('resolves a voice mp3 per category under public/segments', () => {
    for (const category of SEGMENT_CATEGORIES) {
      expect(segmentCategory(category.id)).toBe(category);
      expect(segmentVoiceSrc(category.id)).toBe(`./segments/${category.id}.mp3`);
    }
    expect(segmentCategory('no-such-category')).toBeUndefined();
  });

  it('renders the About, Computer control, AI Chat, Google Drive, Telegram and Starship category headings in the Modules tab', () => {
    const html = renderModules();
    expect(html).toContain('About segments');
    expect(html).toContain('Computer control');
    expect(html).toContain('AI Chat segment');
    expect(html).toContain('Google Drive segment');
    expect(html).toContain('Telegram segment');
    expect(html).toContain('Starship segments');
  });

  it('renders each visible category info page verbatim, with a voice button', () => {
    const html = renderModules();
    for (const id of ['about', 'computer-control', 'ai-chat', 'google-drive', 'telegram', 'starship'] as const) {
      const category = segmentCategory(id)!;
      expect(html).toContain(category.info);
      expect(html).toContain(`data-segment-voice="${id}"`);
      expect(html).toContain(`Play ${category.title} explanation`);
    }
  });

  it('places Google Drive between AI Chat and Telegram, as a pre-installed connectable segment', () => {
    const category = segmentCategory('google-drive')!;
    expect(category.title).toBe('Google Drive segment');
    // The info page is the voice script: it names what the segment
    // does, that it stays when LuciferAI is off, and that connecting
    // is tap Connect and sign in with Google (Gary approved OAuth,
    // 2026-11-08 ~02:32 PST).
    expect(category.info).toContain('pre-installed segment');
    expect(category.info).toContain('connect your Google Drive to Lucid');
    expect(category.info).toContain('stays when LuciferAI is off');
    expect(category.info).toContain('To connect, tap Connect and sign in with Google');
    // The segment itself renders in the panel, honestly not
    // connected, with an enabled Connect button — the segment's
    // action, for now (Gary, ~02:35 PST: just a Connect button).
    // No Gmail anywhere in the segment (separate future segment,
    // "Gmail Connect", gated on temp verification).
    const html = renderModules();
    expect(html).toContain('Google Drive');
    expect(html).toContain('Connect Google Drive');
    expect(html).toContain('Not connected');
    expect(html).toContain('No connections yet');
    expect(html).not.toContain('Gmail');
    // The Connect button itself is enabled (not disabled) — it is
    // the segment's action, for now.
    const connectButton = html.match(/<button[^>]*aria-label="Connect Google Drive"[^>]*>/);
    expect(connectButton).not.toBeNull();
    expect(connectButton![0]).not.toContain('disabled');
  });

  it('places Telegram between Google Drive and Starship, as a pre-installed connectable segment', () => {
    const category = segmentCategory('telegram')!;
    expect(category.title).toBe('Telegram segment');
    // The info page is the voice script: it names what the segment
    // does, that it stays when LuciferAI is off, and that connecting
    // is a BotFather bot token + tap Connect (Gary approved the bot
    // token mechanism, 2026-11-08 ~03:00 PST).
    expect(category.info).toContain('pre-installed segment');
    expect(category.info).toContain('connect your Telegram to Lucid');
    expect(category.info).toContain('stays when LuciferAI is off');
    expect(category.info).toContain(
      'To connect, create a bot in BotFather, paste the bot token here, and tap Connect',
    );
    // The verified-temp conversion path is in the info text: a
    // verified temp becomes a full user through Telegram, with no
    // Lucid retrieval step, and stays linked to the temp (Gary,
    // 2026-11-08 ~03:01–03:02 PST).
    expect(category.info).toContain(
      'Once a temp is verified, Telegram is the way that temp becomes a full user',
    );
    expect(category.info).toContain('no Lucid retrieval step needed');
    expect(category.info).toContain('the new user stays linked to the temp');
    // The segment itself renders in the panel, honestly not
    // connected, with a bot token input + an enabled Connect
    // button — the segment's action, for now. No Gmail anywhere
    // in the segment (Gmail is a separate future segment,
    // "Gmail Connect", gated on temp verification).
    const html = renderModules();
    expect(html).toContain('Telegram');
    expect(html).toContain('Connect Telegram');
    expect(html).toContain('Not connected');
    expect(html).toContain('No connections yet');
    expect(html).not.toContain('Gmail');
    // The token input is a password field — the token is a secret,
    // stored encrypted, never shown in plain text.
    expect(html).toContain('type="password"');
    // The Connect button itself is enabled (not disabled) — it is
    // the segment's action, for now.
    const connectButton = html.match(/<button[^>]*aria-label="Connect Telegram"[^>]*>/);
    expect(connectButton).not.toBeNull();
    expect(connectButton![0]).not.toContain('disabled');
  });

  it('does not render the Forge category until Persona Plex is installed', () => {
    // Default settings have no add-ons installed.
    const html = renderModules();
    expect(html).not.toContain('Forge-to-Persona Plex segment');
    // But the category still exists at the data level, with its
    // info page and voice, ready to render once installed.
    const forge = segmentCategory('forge-persona-plex')!;
    expect(forge.info).toContain('bridge between Forge and Persona Plex');
    expect(segmentVoiceSrc('forge-persona-plex')).toBe('./segments/forge-persona-plex.mp3');
  });

  it('keeps the no-starship-detected state inside the Starship category', () => {
    const html = renderModules();
    expect(html).toContain('No starship detected');
  });
});
