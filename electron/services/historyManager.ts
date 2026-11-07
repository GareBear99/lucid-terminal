import { app } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { ChatMessage } from './openai';

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  /** Next ritual tick to assign in this chat (see ChatMessage in the
   *  renderer types). Persisted in sessions.json with the session. */
  nextTick?: number;
  /**
   * The session's causal placement — its position in the creation
   * sequence (Gary, 2026-11-07): the LuciferAI tabs (the chats) hide
   * behind the one blood drop tab, ordered by causal ritual placement
   * (ticks), not by time. Assigned once at creation, never
   * re-numbered; a reply never moves the session. Timestamps are
   * display only. (Renderer type in src/types/index.ts carries the
   * same field; the two must stay in sync.)
   */
  causalOrder?: number;
}

const DATA_FILE = 'sessions.json';

class HistoryManager {
  private filePath: string;
  private sessions: ChatSession[] = [];
  private isInitialized = false;

  constructor() {
    this.filePath = path.join(app.getPath('userData'), DATA_FILE);
  }

  private async init() {
    if (this.isInitialized) return;

    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      this.sessions = JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is invalid, start with empty sessions
      this.sessions = [];
    }

    this.isInitialized = true;
  }

  private async save() {
    try {
      await fs.writeFile(this.filePath, JSON.stringify(this.sessions, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save chat sessions:', error);
    }
  }

  public async getSessions(): Promise<ChatSession[]> {
    await this.init();
    // Causal ritual placement, not last-activity time (Gary,
    // 2026-11-07): newest-created first by creation sequence, so a
    // reply never re-orders the list. Sessions that somehow lack a
    // number (legacy, not yet loaded since numbering began) sort
    // after the numbered ones, newest-created first among
    // themselves — the two keys never mix units.
    return this.sessions.sort((a, b) => {
      const ao = a.causalOrder ?? -1;
      const bo = b.causalOrder ?? -1;
      if (ao !== bo) return bo - ao;
      return b.createdAt - a.createdAt;
    });
  }

  public async getSession(id: string): Promise<ChatSession | undefined> {
    await this.init();
    return this.sessions.find(s => s.id === id);
  }

  public async saveSession(session: ChatSession): Promise<void> {
    await this.init();
    
    const index = this.sessions.findIndex(s => s.id === session.id);
    if (index !== -1) {
      this.sessions[index] = { ...session, updatedAt: Date.now() };
    } else {
      this.sessions.push({ ...session, updatedAt: Date.now() });
    }

    await this.save();
  }

  public async deleteSession(id: string): Promise<void> {
    await this.init();
    this.sessions = this.sessions.filter(s => s.id !== id);
    await this.save();
  }

  public async clearSessions(): Promise<void> {
    this.sessions = [];
    await this.save();
  }
}

export const historyManager = new HistoryManager();
