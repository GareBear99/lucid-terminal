/**
 * Commands catalogue — the list Settings shows, and the router
 * round-trips it is built from.
 *
 * Invariants (the catalogue must never drift from what the terminal
 * actually routes or Help documents): every entry has real text;
 * names are unique; every router command (shell, LuciferAI,
 * multi-word) is in the catalogue; every Help-documented command
 * except the non-command categories ('tiers', 'natural') is in it;
 * the categories partition the catalogue exactly once.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import {
  COMMAND_CATALOGUE,
  COMMAND_CATEGORIES,
  searchCommandCatalogue,
} from '../src/data/commands';
import {
  SHELL_COMMANDS,
  LUCIFERAI_COMMANDS,
  MULTI_WORD_COMMANDS,
  parseCommand,
} from '../src/utils/commandRouter';
import { helpCategories } from '../src/data/helpData';

describe('commands catalogue invariants', () => {
  it('every entry has non-empty name, syntax, description and category', () => {
    expect(COMMAND_CATALOGUE.length).toBeGreaterThan(0);
    for (const entry of COMMAND_CATALOGUE) {
      expect(entry.name.trim().length).toBeGreaterThan(0);
      expect(entry.syntax.trim().length).toBeGreaterThan(0);
      expect(entry.description.trim().length).toBeGreaterThan(0);
      expect(entry.category.trim().length).toBeGreaterThan(0);
      expect(['shell', 'luciferai', 'multi-word', 'lucid']).toContain(entry.kind);
      expect(['router', 'help']).toContain(entry.source);
    }
  });

  it('names are unique', () => {
    const names = COMMAND_CATALOGUE.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('covers every shell command the router knows', () => {
    const names = new Set(COMMAND_CATALOGUE.map((e) => e.name));
    for (const command of SHELL_COMMANDS) {
      expect(names.has(command)).toBe(true);
    }
  });

  it('covers every LuciferAI command the router knows', () => {
    const names = new Set(COMMAND_CATALOGUE.map((e) => e.name));
    for (const command of LUCIFERAI_COMMANDS) {
      expect(names.has(command)).toBe(true);
    }
  });

  it('covers every multi-word phrase the router matches', () => {
    const names = new Set(COMMAND_CATALOGUE.map((e) => e.name));
    for (const { phrase } of MULTI_WORD_COMMANDS) {
      expect(names.has(phrase)).toBe(true);
    }
  });

  it('covers every Help-documented command except tiers and natural', () => {
    const names = new Set(COMMAND_CATALOGUE.map((e) => e.name));
    const excluded = new Set(['tiers', 'natural']);
    for (const category of helpCategories) {
      if (excluded.has(category.id)) continue;
      for (const command of category.commands) {
        expect(names.has(command.name)).toBe(true);
      }
    }
  });

  it('categories partition the catalogue exactly once', () => {
    const inCategories = COMMAND_CATEGORIES.flatMap((c) => c.entries);
    expect(inCategories.length).toBe(COMMAND_CATALOGUE.length);
    expect(new Set(inCategories.map((e) => e.name)).size).toBe(COMMAND_CATALOGUE.length);
    for (const entry of COMMAND_CATALOGUE) {
      expect(inCategories).toContain(entry);
    }
  });

  it('search filters by name, syntax or description; empty query returns all', () => {
    expect(searchCommandCatalogue('')).toHaveLength(COMMAND_CATALOGUE.length);
    const fixnet = searchCommandCatalogue('fixnet');
    expect(fixnet.length).toBeGreaterThan(0);
    expect(fixnet.every((e) => `${e.name} ${e.syntax} ${e.description}`.toLowerCase().includes('fixnet'))).toBe(true);
    expect(searchCommandCatalogue('zzz-no-such-command')).toEqual([]);
  });
});

describe('parseCommand round-trips the catalogue commands', () => {
  it("routes 'fixnet stats' as the full phrase, not the first word", () => {
    const parsed = parseCommand('fixnet stats');
    expect(parsed.type).toBe('fixnet');
    expect(parsed.command).toBe('fixnet stats');
  });

  it("routes 'llm list' as the full phrase", () => {
    const parsed = parseCommand('llm list');
    expect(parsed.type).toBe('llm');
    expect(parsed.command).toBe('llm list');
  });

  it("routes 'ls -la' as a shell command", () => {
    const parsed = parseCommand('ls -la');
    expect(parsed.type).toBe('shell');
    expect(parsed.command).toBe('ls');
    expect(parsed.args).toEqual(['-la']);
  });

  it("routes '/help' as a slash help command", () => {
    const parsed = parseCommand('/help');
    expect(parsed.type).toBe('help');
    expect(parsed.isSlashCommand).toBe(true);
  });

  it("routes 'clear history' to the history type (not shell-clear)", () => {
    const parsed = parseCommand('clear history');
    expect(parsed.type).toBe('history');
    expect(parsed.command).toBe('history');
    expect(parsed.args).toEqual(['clear']);
  });

  it("routes 'workflow status' to the workflow type", () => {
    const parsed = parseCommand('workflow status');
    expect(parsed.type).toBe('workflow');
    expect(parsed.command).toBe('workflow');
    expect(parsed.args).toEqual(['status']);
  });

  it("routes 'browser diagnose' as a browser command", () => {
    const parsed = parseCommand('browser diagnose');
    expect(parsed.type).toBe('browser');
    expect(parsed.command).toBe('browser diagnose');
  });

  it("routes 'lucifer what is the time' to the agent (the plugin path)", () => {
    const parsed = parseCommand('lucifer what is the time');
    expect(parsed.type).toBe('agent');
  });
});
