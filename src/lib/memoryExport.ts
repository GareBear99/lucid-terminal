/**
 * Memory export — the Memory tab's per-profile download
 * (Gary, 2026-11-13: "memory downloadable"; 2026-11-14:
 * the Memory tab, real stores only).
 *
 * What goes in — the profile's durable memory, read from the
 * stores that actually hold it:
 * - command history: this profile's list (commandHistoryStore,
 *   per-profile record, max 500) — only when the store has
 *   this profile loaded; another profile's list is never
 *   exported from here.
 * - plans: this profile's plans (planStore, per-profile
 *   record, max 100) — same loaded-profile guard.
 * - chats: the AI chat sessions (aiStore, sessions.json).
 *   Chats are NOT per-profile in this build — sessions.json
 *   is one app-wide file — so the export says so in
 *   `chatsNote` instead of pretending otherwise.
 * - terminal commands: the terminal feed's command blocks
 *   (historyStore, kind 'command' or legacy kind-less blocks,
 *   which read as commands). Agent blocks are NOT in here.
 *
 * What NEVER goes in — the LLMBuilder memory (Gary,
 * 2026-11-13: "LLMBuilder memory just cleared (no
 * download)"): the agent-prompt / agent-response blocks are
 * the driving intelligence's working memory. They can only
 * be cleared (Memory tab → Clear agent memory), never
 * downloaded, and they are excluded from this export even
 * though they live in the same feed as the command blocks.
 * The rings are transport, not memory — no ring state is
 * exported either.
 *
 * Pure builder over the stores' current state (read via
 * getState) — no IPC, no localStorage reads here. The tab
 * owns the download (Blob + a.click, the Settings export
 * pattern).
 */
import { useAIStore } from '../stores/aiStore';
import {
  useCommandHistoryStore,
} from '../stores/commandHistoryStore';
import { usePlanStore, type Plan } from '../stores/planStore';
import { useHistoryStore } from '../stores/historyStore';
import type { ChatSession, TerminalBlock } from '../types';

/** One tab's exported command blocks. */
export interface ExportedTerminalTab {
  tabId: string;
  blocks: TerminalBlock[];
}

export interface MemoryExport {
  version: 1;
  exportedAt: string;
  profileId: string;
  profileName: string;
  /** This profile's commands, oldest → newest. */
  commandHistory: string[];
  /** This profile's plans. */
  plans: Plan[];
  /** The AI chat sessions. App-wide (sessions.json), NOT
   *  per-profile — see chatsNote. */
  chats: ChatSession[];
  chatsNote: string;
  /** The terminal feed's command blocks only, per tab.
   *  Agent blocks are excluded — see the module header. */
  terminalCommands: ExportedTerminalTab[];
}

/** Is this feed block a plain terminal command (exportable)?
 *  Legacy blocks carry no kind and read as commands; agent
 *  blocks (prompt / response / review) and notices are not
 *  terminal commands. */
export function isExportableTerminalBlock(block: TerminalBlock): boolean {
  return block.kind === undefined || block.kind === 'command';
}

/**
 * Build the profile's memory export from the stores' current
 * state. Never throws — a store that has not loaded this
 * profile yet contributes an empty list, never another
 * profile's data.
 */
export function buildMemoryExport(
  profileId: string,
  profileName: string,
): MemoryExport {
  const historyState = useCommandHistoryStore.getState();
  const planState = usePlanStore.getState();
  const aiState = useAIStore.getState();
  const feedState = useHistoryStore.getState();

  const commandHistory =
    historyState.loaded && historyState.profileId === profileId
      ? [...historyState.entries]
      : [];
  const plans =
    planState.loaded && planState.profileId === profileId
      ? [...planState.plans]
      : [];

  const terminalCommands: ExportedTerminalTab[] = [];
  for (const [tabId, blocks] of Object.entries(feedState.blocksByTab)) {
    const commands = blocks.filter(isExportableTerminalBlock);
    if (commands.length > 0) terminalCommands.push({ tabId, blocks: commands });
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    profileId,
    profileName,
    commandHistory,
    plans,
    chats: [...aiState.sessions],
    chatsNote:
      'Chats are stored in sessions.json (app-wide) — they are not scoped to one profile in this build.',
    terminalCommands,
  };
}

/** Download filename for the export (date-stamped, no time). */
export function memoryExportFilename(profileId: string, now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  const safeId = profileId.replace(/[^A-Za-z0-9_-]/g, '_') || 'profile';
  return `lucid-memory-${safeId}-${date}.json`;
}
