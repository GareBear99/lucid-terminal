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
}) {
  return renderToStaticMarkup(
    React.createElement(PillRow, {
      mode: props.mode ?? 'terminal',
      cwd: props.cwd,
      gitStatus: props.gitStatus,
      onModePill: noop,
      modePillDisabled: props.modePillDisabled,
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
});
