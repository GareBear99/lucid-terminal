// @vitest-environment jsdom
/**
 * Terminal commands vs LuciferAI (Gary, 2026-11-07 ~05:34 PST).
 *
 * Gary's report: "when lucifer AI disabled its commands shouldnt
 * be in the terminal setting panel".
 *
 * The bug: the Terminal tab in Settings rendered the full command
 * catalogue (searchCommandCatalogue over COMMAND_CATEGORIES) with
 * no filtering by LuciferAI state — while the terminal itself
 * refuses LuciferAI commands when the plugin is off (the `llm`
 * and `tokens` cases and the default branch in Terminal.tsx
 * refuse with refusalForDisabledCommand). The panel listed
 * commands the terminal would refuse.
 *
 * The fix: searchCommandCatalogue takes the LuciferAI state, and
 * the panel passes it. requiresLuciferAI (src/data/commands.ts)
 * is the rule: shell commands run in the PTY, FixNet phrases run
 * the local orchestrator, and `browser diagnose` reads the local
 * browser service — everything else in the catalogue is
 * LuciferAI's and is hidden while the plugin is off. The Help
 * modal needs no change: it is already unreachable while disabled
 * (App's openHelp guard + the disable effect that closes it +
 * the Sidebar/StatusBar gating).
 *
 * These tests fail on the old code (the full catalogue renders
 * regardless of the toggle) and pass after the fix.
 *
 * Run with: npx vitest run tests/terminalCommandsLuciferDisabled.test.tsx
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import SettingsPanel from '../src/components/Settings/SettingsPanel';
import {
  COMMAND_CATALOGUE,
  requiresLuciferAI,
  searchCommandCatalogue,
} from '../src/data/commands';
import { useSettingsStore } from '../src/stores/settingsStore';

function entry(name: string) {
  const found = COMMAND_CATALOGUE.find((e) => e.name === name);
  expect(found).toBeDefined();
  return found!;
}

/** The <code> syntax chips in the Commands section, in order. */
function codeTexts(container: HTMLElement): string[] {
  return [...container.querySelectorAll('code')].map(
    (el) => el.textContent ?? '',
  );
}

/** The category <h4> headings in the Commands section, in order. */
function categoryTitles(container: HTMLElement): string[] {
  return [...container.querySelectorAll('h4')].map(
    (el) => el.textContent ?? '',
  );
}

describe('requiresLuciferAI — the rule', () => {
  // REAL TERMINAL (Gary, 2026-11-07): Lucid commands are slash-only
  // and the local ones run without the plugin — `/fix` / `/fixnet`
  // run the local FixNet orchestrator, `/workflow` reads local
  // workflow state, `/history` reads Lucid's own conversation
  // history. Only the plugin commands need LuciferAI.
  test('plugin LuciferAI commands need the plugin', () => {
    for (const name of [
      'help',
      'plan',
      'llm',
      'build',
      'create',
      'tokens',
      'agent',
    ]) {
      expect(requiresLuciferAI(entry(name))).toBe(true);
    }
  });

  test('Lucid-local slash commands do NOT need the plugin', () => {
    for (const name of ['fix', 'fixnet', 'workflow', 'history']) {
      expect(requiresLuciferAI(entry(name))).toBe(false);
    }
  });

  test('Help-only plugin commands need the plugin', () => {
    for (const name of [
      'github link',
      'github upload',
      'env search',
      'install',
      'install tier',
      'backup models',
      'daemon',
      'run',
      'info',
      'memory',
      'mainmenu',
      'diabolical mode',
    ]) {
      expect(requiresLuciferAI(entry(name))).toBe(true);
    }
  });

  test('llm phrases need the plugin; workflow / history phrases do not', () => {
    for (const name of [
      'llm list',
      'llm status',
      'llm enable',
      'llm disable',
    ]) {
      expect(requiresLuciferAI(entry(name))).toBe(true);
    }
    for (const name of ['workflow status', 'clear history']) {
      expect(requiresLuciferAI(entry(name))).toBe(false);
    }
  });

  test('shell, FixNet, browser diagnose, workflow and history do not need the plugin', () => {
    for (const name of [
      'ls',
      'cd',
      'git',
      'npm',
      'clear',
      'fix',
      'fixnet',
      'fixnet stats',
      'fixnet search',
      'fixnet report',
      'fixnet apply',
      'fixnet delete',
      'fixnet sync',
      'browser diagnose',
      'workflow',
      'workflow status',
      'history',
      'clear history',
    ]) {
      expect(requiresLuciferAI(entry(name))).toBe(false);
    }
  });

  test('searchCommandCatalogue hides LuciferAI entries while disabled', () => {
    // 89 entries with the plugin on; 56 without it (43 shell +
    // 4 Lucid-local singles + 6 FixNet phrases + browser diagnose
    // + workflow status + history + clear history).
    expect(searchCommandCatalogue('').length).toBe(89);
    expect(searchCommandCatalogue('', true).length).toBe(89);
    expect(searchCommandCatalogue('', false).length).toBe(56);
    expect(searchCommandCatalogue('llm', false)).toEqual([]);
    expect(searchCommandCatalogue('llm', true).map((e) => e.name)).toContain(
      'llm list',
    );
    expect(
      searchCommandCatalogue('fixnet', false).map((e) => e.name),
    ).toEqual([
      'fixnet',
      'fixnet apply',
      'fixnet delete',
      'fixnet report',
      'fixnet search',
      'fixnet stats',
      'fixnet sync',
    ]);
  });
});

describe('Terminal tab Commands section', () => {
  let prevLucidAPI: unknown;

  beforeEach(() => {
    const win = window as unknown as Record<string, unknown>;
    prevLucidAPI = win.lucidAPI;
    win.lucidAPI = {
      settings: {
        set: vi.fn(async () => undefined),
        getAll: vi.fn(async () => ({})),
        hasApiKey: vi.fn(async () => false),
        hasPingKey: vi.fn(async () => false),
        getStorageStatus: vi.fn(async () => ({ degraded: false, reason: null })),
      },
      ai: {
        pingServerHealth: vi.fn(async () => ({})),
      },
    };
  });

  afterEach(() => {
    const win = window as unknown as Record<string, unknown>;
    win.lucidAPI = prevLucidAPI;
    vi.restoreAllMocks();
  });

  function renderTerminalTab(luciferAiEnabled: boolean) {
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, luciferAiEnabled },
    }));
    return render(
      <SettingsPanel onClose={() => undefined} initialTab="terminal" />,
    );
  }

  test('disabled: no LuciferAI command appears, and the LuciferAI category is gone', () => {
    const { container } = renderTerminalTab(false);
    const codes = codeTexts(container);
    // Every plugin LuciferAI entry, by its slash syntax chip.
    // (The Lucid-local slash commands — /fix, /fixnet, /workflow,
    // /history and the FixNet phrases — DO show while disabled.)
    for (const syntax of [
      '/help',
      '/plan',
      '/llm',
      '/build <description>',
      '/create <description>',
      '/tokens',
      '/agent',
      '/llm list',
      '/llm status',
      '/llm enable',
      '/llm disable',
      '/github link',
      '/install <model>',
      '/daemon',
      '/diabolical mode',
    ]) {
      expect(codes).not.toContain(syntax);
    }
    // The categories that were only LuciferAI are gone entirely.
    // ('Workflow & System' stays: it now holds the Lucid-local
    // /workflow and /history commands, which run without the plugin.)
    const titles = categoryTitles(container);
    for (const title of [
      'LuciferAI',
      'Planning',
      'Model Management',
      'AI Code Generation',
      'GitHub Integration',
      'Environment Management',
      'Model Installation',
      'System Information',
      'Developer Tools',
      'Special Modes',
    ]) {
      expect(titles).not.toContain(title);
    }
    // What still runs without the plugin stays listed — shell,
    // Lucid-local slash commands, FixNet phrases, browser diagnose.
    expect(codes).toContain('ls [path]');
    expect(codes).toContain('git');
    expect(codes).toContain('/fix <file|error>');
    expect(codes).toContain('/fixnet');
    expect(codes).toContain('/fixnet stats');
    expect(codes).toContain('/browser diagnose');
    expect(codes).toContain('/workflow');
    expect(codes).toContain('/workflow status');
    expect(codes).toContain('/history');
    expect(codes).toContain('/history clear');
    expect(titles).toEqual([
      'Shell',
      'Direct Commands',
      'FixNet Commands',
      'Workflow & System',
      'Browser',
    ]);
  });

  test('disabled: the filter input still works over the remaining commands', () => {
    const { container } = renderTerminalTab(false);
    // The search box is there and the remaining entries are the
    // ones the catalogue search returns while disabled.
    const input = container.querySelector(
      'input[placeholder="Filter commands…"]',
    );
    expect(input).not.toBeNull();
    expect(searchCommandCatalogue('fixnet', false).length).toBe(7);
  });

  test('enabled: everything shows exactly as before', () => {
    const { container } = renderTerminalTab(true);
    const codes = codeTexts(container);
    expect(codes).toContain('/llm list');
    expect(codes).toContain('/build <description>');
    expect(codes).toContain('/fixnet');
    expect(codes).toContain('/tokens');
    expect(codes).toContain('/github link');
    expect(codes).toContain('/fixnet stats');
    expect(codes).toContain('/browser diagnose');
    const titles = categoryTitles(container);
    expect(titles).toContain('LuciferAI');
    expect(titles).toContain('Model Management');
    expect(titles).toContain('AI Code Generation');
    expect(titles).toContain('GitHub Integration');
    expect(titles).toContain('Workflow & System');
  });
});
