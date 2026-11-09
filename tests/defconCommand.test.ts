// parseCommand: /defcon (Gary, 2026-11-09) — the DEFCON level
// command. Lucid-local, like /devmode: it reads and sets the
// `defconLevel` setting, so it parses with LuciferAI on OR off,
// in devmode or not. The levels take effect in NON-devmode.

import { describe, test, expect } from 'vitest';
import { parseCommand, getCommandDescription } from '../src/utils/commandRouter';

describe('parseCommand: /defcon', () => {
  test('/defcon with no argument reads the current level', () => {
    const parsed = parseCommand('/defcon');
    expect(parsed.type).toBe('defcon');
    expect(parsed.command).toBe('defcon');
    expect(parsed.args).toEqual([]);
    expect(parsed.isSlashCommand).toBe(true);
  });

  test('/defcon 2 sets level 2', () => {
    const parsed = parseCommand('/defcon 2');
    expect(parsed.type).toBe('defcon');
    expect(parsed.args).toEqual(['2']);
  });

  test('/defcon merge b picks the merge reading', () => {
    const parsed = parseCommand('/defcon merge b');
    expect(parsed.type).toBe('defcon');
    expect(parsed.args).toEqual(['merge', 'b']);
  });

  test('bare `defcon` is a shell word, never the command', () => {
    const parsed = parseCommand('defcon');
    expect(parsed.type).toBe('shell');
  });

  test('description names the DEFCON level', () => {
    expect(getCommandDescription('defcon')).toContain('DEFCON');
  });
});
