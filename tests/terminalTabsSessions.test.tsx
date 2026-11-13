// @vitest-environment jsdom
/**
 * Terminal tabs — agent sessions in the stack (heavy terminal
 * work, 2026-11-13 — Warp's sessions stack in a visible list;
 * Lucid's strip showed terminal tabs only).
 *
 * The view renders agent sessions after the tabs, newest last,
 * with the Sparkles mark and the stack number (⌘N) so the
 * ⌘1–⌘9 switch keys are discoverable. The container's window
 * listener switches the stack by number — from anywhere except
 * a text field that is not a composer.
 *
 * The view part renders with renderToStaticMarkup (the
 * terminalTabs.test.ts pattern); the ⌘N listener is driven
 * through the real container with @testing-library/react.
 *
 * Run with: npm test
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { render, fireEvent, screen } from '@testing-library/react';
import { TerminalTabsView } from '../src/components/Terminal/TerminalTabs';
import TerminalTabs from '../src/components/Terminal/TerminalTabs';
import { useTerminalStore } from '../src/stores/terminalStore';
import { useSessionStore } from '../src/stores/sessionStore';
import type { TerminalSession } from '../src/stores/sessionStore';

const TABS = [
  { id: 't1', title: 'Terminal 1', cwd: '/tmp', isActive: true },
  { id: 't2', title: 'Terminal 2', cwd: '/tmp', isActive: false },
];

const SESSIONS: TerminalSession[] = [
  { id: 'agent-1', kind: 'agent', title: 'fix the build', createdAt: 1, cwd: '/tmp' },
  { id: 'agent-2', kind: 'agent', title: 'explain this error', createdAt: 2, cwd: '/tmp' },
];

const noop = () => undefined;

function renderView(props: {
  tabs?: typeof TABS;
  sessions?: TerminalSession[];
  activeSessionId?: string | null;
}) {
  return renderToStaticMarkup(
    React.createElement(TerminalTabsView, {
      tabs: props.tabs ?? TABS,
      activeTabId: 't1',
      notifications: [],
      notificationsOpen: false,
      onCreateTab: noop,
      onCloseTab: noop,
      onRenameTab: noop,
      onSelectTab: noop,
      onToggleNotifications: noop,
      onDismissNotification: noop,
      onClearAllNotifications: noop,
      sessions: props.sessions ?? SESSIONS,
      activeSessionId: props.activeSessionId ?? null,
      onSelectSession: noop,
      onCloseSession: noop,
    }),
  );
}

describe('TerminalTabs — agent sessions in the strip', () => {
  it('renders agent sessions after the tabs, with titles and stack numbers', () => {
    const html = renderView({});
    expect(html).toContain('data-testid="session-tab-agent-1"');
    expect(html).toContain('data-testid="session-tab-agent-2"');
    expect(html).toContain('fix the build');
    expect(html).toContain('explain this error');
    // Stack order is tabs then agent sessions: 2 tabs, so the
    // first agent session is ⌘3 and the second is ⌘4.
    expect(html).toContain('⌘3');
    expect(html).toContain('⌘4');
    expect(html.indexOf('Terminal 2')).toBeLessThan(html.indexOf('session-tab-agent-1'));
    expect(html.indexOf('session-tab-agent-1')).toBeLessThan(html.indexOf('session-tab-agent-2'));
  });

  it('renders no session rows when there are no agent sessions — the plain strip unchanged', () => {
    const html = renderView({ sessions: [] });
    expect(html).not.toContain('session-tab-');
    expect(html).toContain('Terminal 1');
    expect(html).toContain('title="New Terminal"');
  });

  it('marks the active agent session with the active tab styling', () => {
    const html = renderView({ activeSessionId: 'agent-2' });
    const rowIdx = html.indexOf('data-testid="session-tab-agent-2"');
    expect(rowIdx).toBeGreaterThan(-1);
    expect(html.slice(rowIdx, rowIdx + 400)).toContain('tab-active');
    const row1Idx = html.indexOf('data-testid="session-tab-agent-1"');
    expect(html.slice(row1Idx, row1Idx + 400)).not.toContain('tab-active');
  });

  it('each agent row has a close button labelled with its title', () => {
    const html = renderView({});
    expect(html).toContain('aria-label="Close fix the build"');
    expect(html).toContain('aria-label="Close explain this error"');
  });
});

describe('TerminalTabs — ⌘1–⌘9 stack switching', () => {
  beforeEach(() => {
    useTerminalStore.setState({
      tabs: [
        { id: 't1', title: 'Terminal 1', cwd: '/tmp' },
        { id: 't2', title: 'Terminal 2', cwd: '/tmp' },
      ],
      activeTabId: 't1',
    });
    useSessionStore.setState({
      agentSessions: SESSIONS,
      activeSessionId: null,
      agentBlocksBySession: {},
    });
  });

  afterEach(() => {
    useTerminalStore.setState({ tabs: [], activeTabId: null });
    useSessionStore.setState({ agentSessions: [], activeSessionId: null, agentBlocksBySession: {} });
  });

  it('⌘3 switches to the first agent session, ⌘1 switches back to the first tab', () => {
    render(React.createElement(TerminalTabs, {}));
    expect(useSessionStore.getState().activeSessionId).toBeNull();

    fireEvent.keyDown(document.body, { key: '3', metaKey: true });
    expect(useSessionStore.getState().activeSessionId).toBe('agent-1');

    fireEvent.keyDown(document.body, { key: '1', metaKey: true });
    expect(useSessionStore.getState().activeSessionId).toBeNull();
    expect(useTerminalStore.getState().activeTabId).toBe('t1');
  });

  it('⌘4 switches to the second agent session', () => {
    render(React.createElement(TerminalTabs, {}));
    fireEvent.keyDown(document.body, { key: '4', metaKey: true });
    expect(useSessionStore.getState().activeSessionId).toBe('agent-2');
  });

  it('does nothing for a stack number past the end of the stack', () => {
    render(React.createElement(TerminalTabs, {}));
    fireEvent.keyDown(document.body, { key: '9', metaKey: true });
    expect(useSessionStore.getState().activeSessionId).toBeNull();
    expect(useTerminalStore.getState().activeTabId).toBe('t1');
  });

  it('does nothing when focus is in a text field that is not a composer', () => {
    render(React.createElement(TerminalTabs, {}));
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: '3', metaKey: true });
    expect(useSessionStore.getState().activeSessionId).toBeNull();
    input.remove();
  });

  it('does nothing without the ⌘/Ctrl modifier', () => {
    render(React.createElement(TerminalTabs, {}));
    fireEvent.keyDown(document.body, { key: '3' });
    expect(useSessionStore.getState().activeSessionId).toBeNull();
  });

  it('clicking a terminal tab while an agent session is active leaves the agent session', () => {
    // Regression: the tab click used plain setActiveTab, so the
    // strip showed Terminal 1 while the feed, header, pill row,
    // and hint line stayed on the agent session (found live
    // 2026-11-13 ~05:00 PST, terminal-wave deploy).
    useTerminalStore.setState({ activeTabId: 't2' });
    useSessionStore.setState({ activeSessionId: 'agent-1' });
    render(React.createElement(TerminalTabs, {}));
    expect(useSessionStore.getState().activeSessionId).toBe('agent-1');
    fireEvent.click(screen.getByText('Terminal 1'));
    expect(useSessionStore.getState().activeSessionId).toBeNull();
    expect(useTerminalStore.getState().activeTabId).toBe('t1');
  });
});
