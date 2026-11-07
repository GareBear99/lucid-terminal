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
  it('has four categories, in panel order, each with a title and info text', () => {
    expect(SEGMENT_CATEGORIES.map((c) => c.id)).toEqual([
      'about',
      'computer-control',
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

  it('renders the About, Computer control and Starship category headings in the Modules tab', () => {
    const html = renderModules();
    expect(html).toContain('About segments');
    expect(html).toContain('Computer control');
    expect(html).toContain('Starship segments');
  });

  it('renders each visible category info page verbatim, with a voice button', () => {
    const html = renderModules();
    for (const id of ['about', 'computer-control', 'starship'] as const) {
      const category = segmentCategory(id)!;
      expect(html).toContain(category.info);
      expect(html).toContain(`data-segment-voice="${id}"`);
      expect(html).toContain(`Play ${category.title} explanation`);
    }
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
