// parseCommand: /split and /unsplit (sweep fix 2 follow-on,
// 2026-11-14) — the slash commands for the split panes. Lucid-
// local, like /devmode and /defcon: they touch layout only, so
// they parse with LuciferAI on or off, silenced or not, and in
// guest. /split splits the active tab (the same action as the
// toggle pill, the strip split button and ⌘D); /unsplit closes
// every pane except the focused one. Neither takes arguments.
// A slash line is a Lucid command, never an agent prompt
// (agentPromptDetect: a `/` line is 'slash-command') — so these
// never flip the tab to agent mode.
//
// Run with: npm test

import { describe, test, expect } from 'vitest';
import {
  parseCommand,
  getCommandDescription,
  getCommandExamples,
  SLASH_COMMAND_NAMES,
  findClosestCommand,
} from '../src/utils/commandRouter';
import { helpCategories } from '../src/data/helpData';

describe('parseCommand: /split', () => {
  test('/split parses as the split command, never an agent query', () => {
    const parsed = parseCommand('/split');
    expect(parsed.type).toBe('split');
    expect(parsed.command).toBe('split');
    expect(parsed.args).toEqual([]);
    expect(parsed.isSlashCommand).toBe(true);
  });

  test('/split horizontal carries the direction as its arg', () => {
    const parsed = parseCommand('/split horizontal');
    expect(parsed.type).toBe('split');
    expect(parsed.args).toEqual(['horizontal']);
  });

  test('bare `split` is a shell word, never the command', () => {
    const parsed = parseCommand('split');
    expect(parsed.type).toBe('shell');
  });

  test('description names the split', () => {
    expect(getCommandDescription('split')).toContain('Split');
  });
});

describe('parseCommand: /unsplit', () => {
  test('/unsplit parses as the unsplit command, never an agent query', () => {
    const parsed = parseCommand('/unsplit');
    expect(parsed.type).toBe('unsplit');
    expect(parsed.command).toBe('unsplit');
    expect(parsed.args).toEqual([]);
    expect(parsed.isSlashCommand).toBe(true);
  });

  test('bare `unsplit` is a shell word, never the command', () => {
    const parsed = parseCommand('unsplit');
    expect(parsed.type).toBe('shell');
  });

  test('description names the extra panes', () => {
    expect(getCommandDescription('unsplit')).toContain('panes');
  });
});

describe('slash completion surface', () => {
  test('both words are Tab-completable slash commands', () => {
    expect(SLASH_COMMAND_NAMES).toContain('split');
    expect(SLASH_COMMAND_NAMES).toContain('unsplit');
  });

  test('examples list both commands', () => {
    expect(getCommandExamples('/s')).toContain('/split');
    expect(getCommandExamples('/u')).toContain('/unsplit');
  });

  test('a typo suggests the command', () => {
    expect(findClosestCommand('/splt')).toBe('split');
  });
});

describe('help listing', () => {
  test('a Split Panes category lists both commands with their syntax', () => {
    const category = helpCategories.find((c) => c.id === 'split');
    expect(category).toBeDefined();
    expect(category!.title).toBe('Split Panes');
    const split = category!.commands.find((c) => c.name === 'split');
    expect(split).toBeDefined();
    expect(split!.syntax).toBe('/split');
    expect(split!.description).toContain('side-by-side');
    const unsplit = category!.commands.find((c) => c.name === 'unsplit');
    expect(unsplit).toBeDefined();
    expect(unsplit!.syntax).toBe('/unsplit');
    expect(unsplit!.description).toContain('one terminal');
  });
});
