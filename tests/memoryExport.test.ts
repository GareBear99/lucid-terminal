/**
 * Memory export tests (Memory tab, 2026-11-14).
 *
 * The export is the profile's durable memory only:
 * command history + plans (this profile, loaded-profile
 * guarded) + chats (app-wide sessions.json, labeled as
 * such) + terminal command blocks. The LLMBuilder memory
 * (agent blocks) is NEVER in the export — it can only be
 * cleared — and another profile's data is never exported
 * from here.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildMemoryExport,
  memoryExportFilename,
  isExportableTerminalBlock,
} from '../src/lib/memoryExport';
import { useCommandHistoryStore } from '../src/stores/commandHistoryStore';
import { usePlanStore, type Plan } from '../src/stores/planStore';
import { useAIStore } from '../src/stores/aiStore';
import { useHistoryStore } from '../src/stores/historyStore';
import type { TerminalBlock, ChatSession } from '../src/types';

const NOW = 1763078400000;

function block(
  id: string,
  kind: TerminalBlock['kind'],
  command = 'ls',
): TerminalBlock {
  return {
    id,
    command,
    output: 'out',
    timestamp: NOW,
    isComplete: true,
    cwd: '/home/gary',
    kind,
  };
}

const PLAN: Plan = {
  id: 'plan-1',
  title: 'Ship the pill',
  description: 'Deploy the split toggle pill',
  created: new Date(NOW).toISOString(),
  steps: [
    { id: 's1', title: 'Build', done: true },
    { id: 's2', title: 'Deploy', done: false },
  ],
};

const CHAT: ChatSession = {
  id: 'chat-1',
  title: 'First chat',
  messages: [
    { id: 'm1', role: 'user', content: 'hi', timestamp: NOW },
    { id: 'm2', role: 'assistant', content: 'hello', timestamp: NOW + 1 },
  ],
  createdAt: NOW,
  updatedAt: NOW,
};

describe('buildMemoryExport', () => {
  beforeEach(() => {
    useCommandHistoryStore.setState({
      entries: ['ls -la', 'git status'],
      profileId: 'default',
      loaded: true,
    });
    usePlanStore.setState({ plans: [PLAN], profileId: 'default', loaded: true });
    useAIStore.setState({ sessions: [CHAT] });
    useHistoryStore.setState({
      blocksByTab: {
        'terminal-1': [
          block('b1', 'command', 'ls'),
          block('b2', 'agent-prompt', 'split the terminal'),
          block('b3', 'agent-response', ''),
          block('b4', undefined, 'pwd'),
          block('b5', 'notice', ''),
        ],
      },
    });
  });

  it('exports the profile’s command history, plans, and chats', () => {
    const out = buildMemoryExport('default', 'Default');
    expect(out.version).toBe(1);
    expect(out.profileId).toBe('default');
    expect(out.profileName).toBe('Default');
    expect(out.commandHistory).toEqual(['ls -la', 'git status']);
    expect(out.plans).toEqual([PLAN]);
    expect(out.chats).toEqual([CHAT]);
    expect(out.chatsNote).toMatch(/not scoped to one profile/);
  });

  it('exports terminal command blocks but NEVER agent blocks', () => {
    const out = buildMemoryExport('default', 'Default');
    expect(out.terminalCommands).toHaveLength(1);
    expect(out.terminalCommands[0].tabId).toBe('terminal-1');
    const ids = out.terminalCommands[0].blocks.map((b) => b.id);
    expect(ids).toEqual(['b1', 'b4']);
    const all = JSON.stringify(out);
    expect(all).not.toContain('split the terminal');
    expect(all).not.toContain('agent-prompt');
    expect(all).not.toContain('agent-response');
  });

  it('never exports another profile’s command history or plans', () => {
    useCommandHistoryStore.setState({ profileId: 'other', loaded: true });
    usePlanStore.setState({ profileId: 'other', loaded: true });
    const out = buildMemoryExport('default', 'Default');
    expect(out.commandHistory).toEqual([]);
    expect(out.plans).toEqual([]);
  });

  it('an unloaded store contributes an empty list, not a guess', () => {
    useCommandHistoryStore.setState({ loaded: false, entries: ['ls'] });
    const out = buildMemoryExport('default', 'Default');
    expect(out.commandHistory).toEqual([]);
  });
});

describe('isExportableTerminalBlock', () => {
  it('command and legacy kind-less blocks export; agent and notice blocks do not', () => {
    expect(isExportableTerminalBlock(block('a', 'command'))).toBe(true);
    expect(isExportableTerminalBlock(block('b', undefined))).toBe(true);
    expect(isExportableTerminalBlock(block('c', 'agent-prompt'))).toBe(false);
    expect(isExportableTerminalBlock(block('d', 'agent-response'))).toBe(false);
    expect(isExportableTerminalBlock(block('e', 'notice'))).toBe(false);
    expect(isExportableTerminalBlock(block('f', 'agent-review'))).toBe(false);
  });
});

describe('memoryExportFilename', () => {
  it('is date-stamped and safe for the filesystem', () => {
    expect(memoryExportFilename('default', new Date('2026-11-14T10:00:00Z'))).toBe(
      'lucid-memory-default-2026-11-14.json',
    );
    expect(memoryExportFilename('weird id/x', new Date('2026-11-14T10:00:00Z'))).toBe(
      'lucid-memory-weird_id_x-2026-11-14.json',
    );
  });
});
