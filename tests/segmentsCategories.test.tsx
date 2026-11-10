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
  it('has nine categories, in panel order, each with a title and info text', () => {
    expect(SEGMENT_CATEGORIES.map((c) => c.id)).toEqual([
      'about',
      'computer-control',
      'mouse',
      'ai-chat',
      'google-drive',
      'telegram',
      'stripe',
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

  it('renders the About, Computer control, Mouse, AI Chat, Google Drive, Telegram, Stripe and Starship category headings in the Modules tab', () => {
    const html = renderModules();
    expect(html).toContain('About segments');
    expect(html).toContain('Computer control');
    expect(html).toContain('Mouse');
    expect(html).toContain('AI Chat segment');
    expect(html).toContain('Google Drive segment');
    expect(html).toContain('Telegram segment');
    expect(html).toContain('Stripe segment');
    expect(html).toContain('Starship segments');
  });

  it('renders each visible category info page verbatim, with a voice button', () => {
    const html = renderModules();
    for (const id of ['about', 'computer-control', 'mouse', 'ai-chat', 'google-drive', 'telegram', 'stripe', 'starship'] as const) {
      const category = segmentCategory(id)!;
      expect(html).toContain(category.info);
      expect(html).toContain(`data-segment-voice="${id}"`);
      expect(html).toContain(`Play ${category.title} explanation`);
    }
  });

  it('places Mouse right after Computer control — every pointer Lucid has, mice and finger pointers alike', () => {
    const mouse = segmentCategory('mouse')!;
    expect(mouse.title).toBe('Mouse');
    // The info page is the voice script: it names the mice AND the
    // finger pointers (Gary, 2026-11-09 ~15:11 PST — all the mouses
    // and finger pointers like the Android ones go in there).
    expect(mouse.info).toContain('pre-installed segment');
    expect(mouse.info).toContain('mice and finger pointers alike');
    expect(mouse.info).toContain('locked inside the browser area, never outside it');
    expect(mouse.info).toContain('one finger at a time');
    expect(mouse.info).toContain('no pointer ever moves on its own');
    expect(mouse.info).toContain('When it is locked, it does not move at all');
    // The segment renders in the panel: the three pointer types the
    // code actually has, each with its live state, and the gaps
    // stated as not built — never faked.
    const html = renderModules();
    expect(html).toContain('Mouse');
    expect(html).toContain('Mac mouse');
    expect(html).toContain('Browser mouse');
    expect(html).toContain('Android finger');
    expect(html).toContain('No actions yet');
    expect(html).toContain('Not built yet');
    expect(html).toContain('Multi-touch');
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
    // Not a substring check: the class list carries the Tailwind
    // `disabled:opacity-50` variant (styling for the disabled state),
    // which contains "disabled" as a substring even though the button
    // is enabled. Assert on the real `disabled` attribute instead.
    expect(connectButton![0]).not.toMatch(/\sdisabled(?:\s|=|>)/);
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
    // Same as the Google Drive button above: assert on the real
    // `disabled` attribute, not the "disabled" substring — the class
    // list may carry the Tailwind `disabled:` variant.
    expect(connectButton![0]).not.toMatch(/\sdisabled(?:\s|=|>)/);
  });

  it('places Stripe between Telegram and Starship, as a pre-installed connectable segment', () => {
    const category = segmentCategory('stripe')!;
    expect(category.title).toBe('Stripe segment');
    // The info page is the voice script: it names what the segment
    // does, that it stays when LuciferAI is off, and that connecting
    // is a restricted key from the Stripe Dashboard + tap Connect
    // (Gary ordered the segment, 2026-11-08 ~04:05 PST). No digits,
    // no abbreviations, no URLs — the speakable rule holds for
    // this text too.
    expect(category.info).toContain('pre-installed segment');
    expect(category.info).toContain('connect your Stripe to Lucid');
    expect(category.info).toContain('show your Stripe account and whether it can take payments');
    expect(category.info).toContain('stays when LuciferAI is off');
    expect(category.info).toContain(
      'To connect, create a restricted key in the Stripe Dashboard, paste the key here, and tap Connect',
    );
    expect(category.info).toContain('A restricted key is best');
    // The segment itself renders in the panel, honestly not
    // connected, with a key input + an enabled Connect button —
    // the segment's action, for now. Payment links and taking
    // payments are the next step, not this one — the panel says
    // so, and nothing here fakes them.
    const html = renderModules();
    expect(html).toContain('Stripe');
    expect(html).toContain('Connect Stripe');
    expect(html).toContain('Not connected');
    expect(html).toContain('No connections yet');
    expect(html).toContain('Receiving money');
    expect(html).toContain('Creating payment links and taking payments is the next step');
    // The key input is a password field — the key is a secret,
    // stored encrypted, never shown in plain text.
    expect(html).toContain('type="password"');
    // The Connect button itself is enabled (not disabled) — it is
    // the segment's action, for now.
    const connectButton = html.match(/<button[^>]*aria-label="Connect Stripe"[^>]*>/);
    expect(connectButton).not.toBeNull();
    // Same as the Google Drive button above: assert on the real
    // `disabled` attribute, not the "disabled" substring — the class
    // list may carry the Tailwind `disabled:` variant.
    expect(connectButton![0]).not.toMatch(/\sdisabled(?:\s|=|>)/);
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
