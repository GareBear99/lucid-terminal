/**
 * Code-blocks section in Customization — placeholder only (Gary,
 * 2026-11-13 ~15:30 PST): "I dont wanna add the code blocks yet just
 * get the section ready coming soon in customization". Settled scope
 * (~15:22 PST): ONE section in Customization, not a theme.
 *
 * The section is header + description + "Coming soon" badge only. NO
 * coloring is applied anywhere yet — no Monaco theme change, no chat
 * highlighting, no highlight.js. O1 (strings pink vs green), O2
 * (Monaco bg), O3 (highlighter choice) are still Gary's calls at
 * apply time, so this test pins that the section carries NO controls
 * that could change a color.
 *
 * Rendered with react-dom/server's renderToStaticMarkup (effects never
 * run under SSR), like the other settings-tab tests.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SettingsPanel from '../src/components/Settings/SettingsPanel';

type SettingsTab =
  | 'appearance'
  | 'terminal'
  | 'ai'
  | 'customization'
  | 'models'
  | 'daemon'
  | 'general'
  | 'plugins'
  | 'devices'
  | 'forge'
  | 'modules'
  | 'permissions';

const renderSettings = (initialTab: SettingsTab) =>
  renderToStaticMarkup(
    React.createElement(SettingsPanel, {
      onClose: () => undefined,
      initialTab,
    }),
  );

describe('Customization: Code blocks section (coming soon)', () => {
  it('customization shows the Code blocks section with a Coming soon badge', () => {
    const html = renderSettings('customization');
    expect(html).toContain('Code blocks');
    expect(html).toContain('Coming soon');
    expect(html).toContain(
      'Code blocks in the editor and chat will take the ChatGPT purple and pink here.',
    );
    expect(html).toContain('no colors are applied anywhere yet');
  });

  it('the section carries no controls — nothing can change a color yet', () => {
    const html = renderSettings('customization');
    // The Code blocks section is the last section in the
    // Customization tab, so everything after its heading is the
    // section itself: badge + description, no inputs/selects/buttons.
    const afterHeading = html.slice(html.indexOf('Code blocks'));
    expect(afterHeading).not.toContain('<input');
    expect(afterHeading).not.toContain('<select');
    expect(afterHeading).not.toContain('<button');
  });

  it('the section lives in Customization only, not in other tabs', () => {
    expect(renderSettings('appearance')).not.toContain('Code blocks');
    expect(renderSettings('terminal')).not.toContain('Code blocks');
    expect(renderSettings('ai')).not.toContain('Code blocks');
  });
});
