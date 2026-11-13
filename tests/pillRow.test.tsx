/**
 * Pill row tests (heavy terminal work, 2026-11-13 — Warp's pills
 * sit directly under the prompt).
 *
 * The mode pill is a button (the current session kind + title);
 * the driving-agent pill is a label showing the base/default
 * driving model; the cwd pill copies the cwd; the branch +
 * counts pills render only when the cwd is a repo; the version
 * pill shows the app version.
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
  sessionKind?: 'terminal' | 'agent';
  sessionTitle?: string;
  cwd?: string;
  gitStatus?: GitStatus | null;
}) {
  return renderToStaticMarkup(
    React.createElement(PillRow, {
      sessionKind: props.sessionKind ?? 'terminal',
      sessionTitle: props.sessionTitle ?? 'Terminal 1',
      cwd: props.cwd,
      gitStatus: props.gitStatus,
      onModePill: noop,
    }),
  );
}

describe('PillRow', () => {
  it('shows the mode pill with the session kind + title', () => {
    const html = renderRow({ sessionKind: 'terminal', sessionTitle: 'Terminal 1' });
    expect(html).toContain('data-testid="mode-pill"');
    expect(html).toContain('Terminal');
    expect(html).toContain('Terminal 1');
  });

  it('shows Agent in the mode pill for an agent session', () => {
    const html = renderRow({ sessionKind: 'agent', sessionTitle: 'fix the build' });
    expect(html).toContain('data-testid="mode-pill"');
    expect(html).toContain('Agent');
    expect(html).toContain('fix the build');
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
