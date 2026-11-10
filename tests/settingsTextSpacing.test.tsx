/**
 * Settings text-spacing pinning tests (Gary, 2026-11-08).
 *
 * Gary's spec: description text line-height ~1.5, ~8px gap before status
 * notes, toggles on their own row with breathing room, applied
 * consistently across the Settings surfaces. This pass adds
 * `leading-[1.5]` to description / status-note text in SettingsPanel,
 * PermissionsTab, ModelInstaller, ModulesTab, SegmentsPanel,
 * SegmentCategorySection, and the five segment components, plus the two
 * 8px gaps (event-log card `space-y-1` -> `space-y-2`, model
 * size/status line `mt-1` -> `mt-2`). The Stripe connect moved to
 * Settings > Security (Gary, 2026-11-10 ~05:36 PST), so its spacing
 * is pinned through the Security tab, not a segment component.
 *
 * These tests render with react-dom/server's renderToStaticMarkup
 * (effects never run under SSR) and count `leading-[1.5]` occurrences
 * per tab, anchored to the exact description text, so a regression
 * that drops the spacing class fails loudly instead of silently
 * tightening the text again.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SettingsPanel from '../src/components/Settings/SettingsPanel';
import { PermissionsTab } from '../src/components/Settings/PermissionsTab';
import { ModulesTab } from '../src/components/Modules/ModulesTab';
import { SegmentsPanel } from '../src/components/Modules/SegmentsPanel';
import { AIChatSegment } from '../src/components/Modules/AIChatSegment';
import { GoogleDriveSegment } from '../src/components/Modules/GoogleDriveSegment';
import { TelegramSegment } from '../src/components/Modules/TelegramSegment';
import { ComputerControlSegment } from '../src/components/Modules/ComputerControlSegment';
import { ForgePersonaPlexSegment } from '../src/components/Modules/ForgePersonaPlexSegment';
import { SecurityTab } from '../src/components/Settings/SecurityTab';

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

const countLeading = (html: string) =>
  (html.match(/leading-\[1\.5\]/g) || []).length;

describe('Settings text spacing (1.5 leading on description text)', () => {
  it('appearance: theme intros breathe at 1.5', () => {
    const html = renderSettings('appearance');
    expect(html).toContain('Frosted glass throughout.');
    expect(html).toContain('Pure black throughout.');
    expect(countLeading(html)).toBeGreaterThanOrEqual(2);
  });

  it('terminal: scrollback + commands intros breathe at 1.5', () => {
    const html = renderSettings('terminal');
    expect(html).toContain('Number of lines to keep in history');
    expect(countLeading(html)).toBeGreaterThanOrEqual(3);
  });

  it('ai: API intro, temperature + ping notes breathe at 1.5', () => {
    const html = renderSettings('ai');
    expect(html).toContain('Your own key for the chat API');
    expect(html).toContain('Lower = more focused, Higher = more creative');
    // 4 edits in the AI tab (971, 1037, 1044, 1153); one branch (the
    // Gaze note) does not render under SSR defaults, so 3 is the floor.
    expect(countLeading(html)).toBeGreaterThanOrEqual(3);
  });

  it('customization: built-in note breathes at 1.5', () => {
    const html = renderSettings('customization');
    expect(countLeading(html)).toBeGreaterThanOrEqual(1);
  });

  it('plugins: pre-existing plugin-row leading survives, plus status notes at 1.5', () => {
    const html = renderSettings('plugins');
    expect(html).toContain('Toggled-on plugins show as buttons in the icon bar');
    expect(html).toContain('No custom plugins registered yet.');
    // 9 pre-existing plugin-row descriptions + LuciferAI status note
    // + toggled-on note + no-custom-plugins note.
    expect(countLeading(html)).toBeGreaterThanOrEqual(12);
  });

  it('devices: no-devices note breathes at 1.5', () => {
    const html = renderSettings('devices');
    expect(html).toContain('No USB or Android devices detected.');
    expect(countLeading(html)).toBeGreaterThanOrEqual(1);
  });

  it('daemon: daemon + watched-dirs notes breathe at 1.5', () => {
    const html = renderSettings('daemon');
    expect(html).toContain('No directories watched yet.');
    expect(countLeading(html)).toBeGreaterThanOrEqual(4);
  });

  it('general: dev-mode description breathes at 1.5', () => {
    const html = renderSettings('general');
    // SSR renders the dev-mode OFF branch (devMode defaults false);
    // the span carries leading-[1.5] on either branch.
    expect(html).toContain('Off — the prompt bar and the terminal are topology-synced');
    expect(countLeading(html)).toBeGreaterThanOrEqual(1);
  });

  it('models: core + tier descriptions breathe at 1.5, size/status gap is 8px', () => {
    const html = renderSettings('models');
    expect(html).toContain('Install essential models:');
    expect(countLeading(html)).toBeGreaterThanOrEqual(2);
    // Point 2: the model size/status line sits mt-2 (8px) below the tier
    // description, not mt-1.
    expect(html).toContain(
      'flex items-center gap-2 text-xs text-[var(--text-muted)] mt-2',
    );
  });

  it('modules: all 12 module descriptions + segment intros breathe at 1.5', () => {
    const html = renderSettings('modules');
    expect(html).toContain('Container for Segments');
    expect(html).toContain('An extension of the Modules plugin');
    expect(html).toContain('No starship detected.');
    expect(countLeading(html)).toBeGreaterThanOrEqual(15);
  });
});

describe('Permissions tab text spacing', () => {
  it('listen note, permission details + event log breathe at 1.5, event cards gap at 8px', () => {
    const html = renderToStaticMarkup(React.createElement(PermissionsTab));
    expect(html).toContain('Listen reads the exact words on this page, nothing added.');
    expect(html).toContain('No events yet.');
    expect(countLeading(html)).toBeGreaterThanOrEqual(9);
    // Point 2: the event-log card gaps description -> "Why:" by 8px.
    expect(html).toContain(
      'rounded-md border border-[var(--border)] p-3 space-y-2',
    );
  });
});

describe('Segment components text spacing', () => {
  // Floors are the SSR-rendered counts: conditional branches (the
  // watchdog-faults note, the no-persona note) do not render under
  // SSR defaults, but the source edits are all present.
  const segments: Array<[string, React.ComponentType, number]> = [
    ['AIChatSegment', AIChatSegment, 4],
    ['GoogleDriveSegment', GoogleDriveSegment, 4],
    ['TelegramSegment', TelegramSegment, 5],
    ['ComputerControlSegment', ComputerControlSegment, 5],
    ['ForgePersonaPlexSegment', ForgePersonaPlexSegment, 2],
  ];

  for (const [name, Component, minLeading] of segments) {
    it(`${name}: description + status-note text breathes at 1.5`, () => {
      const html = renderToStaticMarkup(React.createElement(Component));
      expect(countLeading(html)).toBeGreaterThanOrEqual(minLeading);
    });
  }

  it('ModulesTab + SegmentsPanel: category intro + segment descriptions breathe at 1.5', () => {
    const modulesHtml = renderToStaticMarkup(React.createElement(ModulesTab));
    expect(countLeading(modulesHtml)).toBeGreaterThanOrEqual(12);
    const segmentsHtml = renderToStaticMarkup(React.createElement(SegmentsPanel));
    expect(segmentsHtml).toContain('An extension of the Modules plugin');
    expect(segmentsHtml).toContain('No starship detected.');
    expect(countLeading(segmentsHtml)).toBeGreaterThanOrEqual(3);
  });

  it('SecurityTab (Stripe, moved from the Segments panel): description + status-note text breathes at 1.5', () => {
    // The Stripe connect moved to Settings > Security (Gary,
    // 2026-11-10 ~05:36 PST) — its description / status-note
    // spacing is pinned here, not in a segment component.
    const html = renderToStaticMarkup(React.createElement(SecurityTab));
    expect(html).toContain('Connects your Stripe to Lucid so Lucid can show the account');
    expect(html).toContain('Stripe is the wallet for receiving money');
    expect(html).toContain('No connections yet');
    expect(countLeading(html)).toBeGreaterThanOrEqual(5);
  });
});
