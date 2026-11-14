// parseCommand: /file /open /new (sweep fix 2 follow-on,
// 2026-11-14 — Gary: "just the basic ones — /file opens the
// file page, etc"). Lucid-local, like /split: they touch the
// Files tab and the editor only, so they parse with LuciferAI on
// or off, silenced or not, and in guest. /file opens the Files
// page (the Editor view); /open opens a file in the editor;
// /new creates an empty file and opens it.
// /delete was in the first draft and DROPPED by Gary (~14:17
// PST) — it parses as an unknown slash word now, never a
// command, and this file pins that. /rename was dropped the
// same way (~14:20 PST) — same pin below. The Files tab's
// inline rename is untouched: this is only about the slash
// words. A slash line is a Lucid command, never an agent prompt
// (agentPromptDetect: a `/` line is 'slash-command') — so these
// never flip the tab to agent mode. Paths resolve against the
// Files tab's root (fileStore.currentDir); the dispatch lives
// in Terminal.tsx and is covered by
// tests/fileCommandsDispatch.test.tsx.
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
import {
  COMMAND_CATALOGUE,
  requiresLuciferAI,
} from '../src/data/commands';

describe('parseCommand: /file', () => {
  test('/file parses as the file command, never an agent query', () => {
    const parsed = parseCommand('/file');
    expect(parsed.type).toBe('file');
    expect(parsed.command).toBe('file');
    expect(parsed.args).toEqual([]);
    expect(parsed.isSlashCommand).toBe(true);
  });

  test('bare `file` is a shell word, never the command', () => {
    const parsed = parseCommand('file');
    expect(parsed.type).toBe('shell');
  });

  test('description names the Files page', () => {
    expect(getCommandDescription('file')).toContain('Files');
  });
});

describe('parseCommand: /open', () => {
  test('/open parses with its file argument', () => {
    const parsed = parseCommand('/open notes.txt');
    expect(parsed.type).toBe('open');
    expect(parsed.command).toBe('open');
    expect(parsed.args).toEqual(['notes.txt']);
    expect(parsed.isSlashCommand).toBe(true);
  });

  test('/open with an absolute path keeps it whole', () => {
    const parsed = parseCommand('/open /tmp/notes.txt');
    expect(parsed.type).toBe('open');
    expect(parsed.args).toEqual(['/tmp/notes.txt']);
  });

  test('bare `open` is a shell word, never the command', () => {
    const parsed = parseCommand('open notes.txt');
    expect(parsed.type).toBe('shell');
  });

  test('description names the editor', () => {
    expect(getCommandDescription('open')).toContain('editor');
  });
});

describe('parseCommand: /new', () => {
  test('/new parses with its file argument', () => {
    const parsed = parseCommand('/new notes.txt');
    expect(parsed.type).toBe('new');
    expect(parsed.command).toBe('new');
    expect(parsed.args).toEqual(['notes.txt']);
    expect(parsed.isSlashCommand).toBe(true);
  });

  test('bare `new` is a shell word, never the command', () => {
    const parsed = parseCommand('new notes.txt');
    expect(parsed.type).toBe('shell');
  });

  test('description names the creation', () => {
    expect(getCommandDescription('new')).toContain('Creat');
  });
});

describe('/delete and /rename are dropped', () => {
  test('/delete parses as an unknown slash word, never a command', () => {
    const parsed = parseCommand('/delete notes.txt');
    expect(parsed.type).not.toBe('delete');
    expect(parsed.isSlashCommand).toBe(true);
  });

  test('/rename parses as an unknown slash word, never a command', () => {
    const parsed = parseCommand('/rename notes.txt todo.txt');
    expect(parsed.type).not.toBe('rename');
    expect(parsed.isSlashCommand).toBe(true);
  });

  test('no delete or rename slash word in the completion surface or the help', () => {
    expect(SLASH_COMMAND_NAMES).not.toContain('delete');
    expect(SLASH_COMMAND_NAMES).not.toContain('rename');
    expect(getCommandExamples('/d')).not.toContain('/delete <file>');
    expect(getCommandExamples('/r')).not.toContain('/rename <old> <new>');
    const files = helpCategories.find((c) => c.id === 'files');
    expect(files).toBeDefined();
    const names = files!.commands.map((c) => c.name);
    expect(names).not.toContain('delete');
    expect(names).not.toContain('rename');
  });
});

describe('slash completion surface', () => {
  test('all three words are Tab-completable slash commands', () => {
    for (const name of ['file', 'open', 'new']) {
      expect(SLASH_COMMAND_NAMES).toContain(name);
    }
  });

  test('examples list all three commands', () => {
    expect(getCommandExamples('/f')).toContain('/file');
    expect(getCommandExamples('/o')).toContain('/open <file>');
    expect(getCommandExamples('/n')).toContain('/new <file>');
  });

  test('a typo suggests the command', () => {
    // '/opem' is distance 2 from 'open' (drop the slash, fix the
    // last letter) — inside the 1–2 suggestion window, and
    // closer than any other command. A transposition like
    // '/opne' is distance 3 and suggests nothing, the same as
    // any far miss.
    expect(findClosestCommand('/opem')).toBe('open');
    expect(findClosestCommand('/opne')).toBeNull();
  });
});

describe('help listing', () => {
  test('a Files category lists all three commands with their syntax', () => {
    const category = helpCategories.find((c) => c.id === 'files');
    expect(category).toBeDefined();
    expect(category!.title).toBe('Files');
    const byName = new Map(category!.commands.map((c) => [c.name, c]));
    expect(byName.get('file')?.syntax).toBe('/file');
    expect(byName.get('file')?.description).toContain('Files page');
    expect(byName.get('open')?.syntax).toBe('/open <file>');
    expect(byName.get('open')?.description).toContain('editor');
    expect(byName.get('new')?.syntax).toBe('/new <file>');
    expect(byName.get('new')?.description).toContain('empty file');
  });
});

describe('LuciferAI gate', () => {
  test('all three run without the plugin — the Settings panel lists them while disabled', () => {
    for (const name of ['file', 'open', 'new']) {
      const entry = COMMAND_CATALOGUE.find((e) => e.name === name);
      expect(entry).toBeDefined();
      expect(requiresLuciferAI(entry!)).toBe(false);
    }
  });
});
