/**
 * Pill row tests (heavy terminal work, 2026-11-13 — Warp's pills
 * sit directly under the prompt).
 *
 * The mode pill is a button (just the mode name + an up-down
 * arrow — Gary, 2026-11-13 ~07:32 PST: the pill should just
 * say terminal or agent with up and down arrow; later, a side
 * arrow can be configurable, not built yet); the driving-agent
 * pill is a label showing the base/default driving model; the
 * cwd pill copies the cwd; the branch + counts pills render
 * only when the cwd is a repo; the version pill shows the app
 * version.
 *
 * Rendered with renderToStaticMarkup (no jsdom in this file) —
 * click behaviour is covered by the Terminal integration test
 * (tests/terminalSessions.test.tsx), which drives the real
 * onModePill handler.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PillRow } from '../src/components/Terminal/PillRow';
import { APP_VERSION } from '../src/lib/appVersion';
import { DRIVING_AGENT_BASE_MODEL } from '../src/stores/sessionStore';
import type { DrivingAgentPickerOption } from '../src/lib/drivingAgents';
import type { GitStatus } from '../src/types';

const noop = () => undefined;

const GIT: GitStatus = {
  branch: 'feature/x',
  ahead: 2,
  behind: 1,
  changedFiles: 5,
  addedLines: 20,
  deletedLines: 3,
};

function renderRow(props: {
  mode?: 'terminal' | 'agent';
  cwd?: string;
  gitStatus?: GitStatus | null;
  modePillDisabled?: boolean;
  drivingAgentOptions?: DrivingAgentPickerOption[];
  drivingAgentValue?: string;
  drivingAgentPickerDisabled?: boolean;
  splitVisible?: boolean;
  onToggleSplit?: () => void;
}) {
  return renderToStaticMarkup(
    React.createElement(PillRow, {
      mode: props.mode ?? 'terminal',
      cwd: props.cwd,
      gitStatus: props.gitStatus,
      onModePill: noop,
      modePillDisabled: props.modePillDisabled,
      drivingAgentOptions: props.drivingAgentOptions,
      drivingAgentValue: props.drivingAgentValue,
      drivingAgentPickerDisabled: props.drivingAgentPickerDisabled,
      splitVisible: props.splitVisible,
      onToggleSplit: props.onToggleSplit,
    }),
  );
}

describe('PillRow', () => {
  it('shows the mode pill with just the mode name + an up-down arrow', () => {
    const html = renderRow({ mode: 'terminal' });
    expect(html).toContain('data-testid="mode-pill"');
    expect(html).toContain('Terminal ↕');
    expect(html).not.toContain('Terminal 1');
  });

  it('shows Agent in the mode pill for agent mode', () => {
    const html = renderRow({ mode: 'agent' });
    expect(html).toContain('data-testid="mode-pill"');
    expect(html).toContain('Agent ↕');
    expect(html).not.toContain('fix the build');
  });

  it('disables the mode pill in a guest build — greyed, not clickable, says why', () => {
    const html = renderRow({ modePillDisabled: true });
    expect(html).toContain('data-testid="mode-pill"');
    expect(html).toContain('Terminal ↕');
    expect(html).toContain('disabled');
    expect(html).toContain('cursor-not-allowed');
    expect(html).toContain('opacity-50');
    expect(html).toContain('Agent needs a profile — guests use the terminal');
    expect(html).not.toContain('hover:bg-white/10');
  });

  it('leaves the mode pill enabled outside guest — no disabled attribute', () => {
    const html = renderRow({ modePillDisabled: false });
    expect(html).toContain('data-testid="mode-pill"');
    expect(html).not.toContain('disabled');
    expect(html).toContain('Switch to agent mode');
  });

  it('shows the driving-agent pill with the base/default model — a label, not a button', () => {
    const html = renderRow({});
    expect(html).toContain('data-testid="driving-agent-pill"');
    expect(html).toContain(DRIVING_AGENT_BASE_MODEL);
    expect(html).not.toMatch(/<button[^>]*data-testid="driving-agent-pill"/);
  });

  it('becomes a select once a driving-agent tab is added — the base + the tab, with its state', () => {
    const html = renderRow({
      drivingAgentOptions: [
        { value: '', label: 'LLMBuilder (base)', title: 'The local base.' },
        { value: 't-ship', label: 'Ship — Starship (not detected)', title: 'No starship detected.' },
      ],
    });
    expect(html).toContain('data-testid="driving-agent-pill"');
    expect(html).toMatch(/<select[^>]*data-testid="driving-agent-pill"/);
    expect(html).toContain('LLMBuilder (base)');
    expect(html).toContain('Ship — Starship (not detected)');
    expect(html).not.toMatch(/<button[^>]*data-testid="driving-agent-pill"/);
  });

  it('stays a label in guest even with tabs added — guests have no driving intelligence to pick', () => {
    const html = renderRow({
      drivingAgentOptions: [
        { value: '', label: 'LLMBuilder (base)', title: 'The local base.' },
        { value: 't-ship', label: 'Ship — Starship (not detected)', title: 'No starship detected.' },
      ],
      drivingAgentPickerDisabled: true,
    });
    expect(html).toContain('data-testid="driving-agent-pill"');
    expect(html).toContain(DRIVING_AGENT_BASE_MODEL);
    expect(html).not.toContain('<select');
  });

  it('shows the version pill with the app version', () => {
    const html = renderRow({});
    expect(html).toContain('data-testid="version-pill"');
    expect(html).toContain(`v${APP_VERSION}`);
  });

  it('shows the cwd pill when a cwd is given', () => {
    const html = renderRow({ cwd: '/Users/gary/lucid-terminal' });
    expect(html).toContain('data-testid="cwd-pill"');
    expect(html).toContain('/Users/gary/lucid-terminal');
  });

  it('shows no cwd pill without a cwd', () => {
    const html = renderRow({});
    expect(html).not.toContain('cwd-pill');
  });

  it('shows the branch + counts pills when the cwd is a repo', () => {
    const html = renderRow({ cwd: '/tmp', gitStatus: GIT });
    expect(html).toContain('data-testid="git-branch-pill"');
    expect(html).toContain('feature/x ↑2 ↓1');
    expect(html).toContain('data-testid="git-counts-pill"');
    expect(html).toContain('5 • +20 -3');
  });

  it('shows no git pills when the cwd is not a repo (null) or not looked up yet (undefined)', () => {
    expect(renderRow({ cwd: '/tmp', gitStatus: null })).not.toContain('git-branch-pill');
    expect(renderRow({ cwd: '/tmp' })).not.toContain('git-branch-pill');
    expect(renderRow({ cwd: '/tmp', gitStatus: null })).not.toContain('git-counts-pill');
  });

  it('shows no split pill without a toggle handler (detached windows)', () => {
    expect(renderRow({})).not.toContain('split-toggle-pill');
    expect(renderRow({ splitVisible: true })).not.toContain('split-toggle-pill');
  });

  it('shows the split pill as "Split", plain, when single-pane', () => {
    const html = renderRow({ onToggleSplit: noop, splitVisible: false });
    expect(html).toContain('data-testid="split-toggle-pill"');
    expect(html).toMatch(/<button[^>]*data-testid="split-toggle-pill"/);
    expect(html).toContain('>Split<');
    expect(html).not.toContain('>Unsplit<');
    expect(html).toContain('Split terminal (⌘D)');
    expect(html).toContain('aria-label="Split panes"');
    expect(html).not.toContain('rgba(88,166,255,0.85)');
  });

  it('shows the split pill as "Unsplit" + active styling while a split is visible', () => {
    const html = renderRow({ onToggleSplit: noop, splitVisible: true });
    expect(html).toContain('data-testid="split-toggle-pill"');
    expect(html).toContain('>Unsplit<');
    expect(html).not.toContain('>Split<');
    expect(html).toContain('Unsplit — undo the last split');
    expect(html).toContain('aria-label="Unsplit panes"');
    // The active styling echoes the split group's blue underline
    // in the tab strip (TerminalTabs.tsx): the focused pane's
    // full-strength blue.
    expect(html).toContain('border-[rgba(88,166,255,0.85)]');
    expect(html).toContain('bg-white/10');
    expect(html).toContain('text-[var(--text-primary)]');
  });
});
