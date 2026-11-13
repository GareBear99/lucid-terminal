/**
 * Shared tab-detach + remount payload types (Gary, 2026-11-09 —
 * drag a terminal tab outside the main window and it becomes its
 * own terminal-only screen; drag a tab near another window's tab
 * hotbar and it remounts into the detected one).
 *
 * Pure types, zero imports at runtime: the main process
 * (electron/ipc/terminalDetach.ts) and the renderers (preload,
 * tabDrag, MiniTerminal/MiniFiles) all import these. The PTY id
 * is the tab id (`terminal-N`); the owner registry in main is
 * the single source of truth for where a tab lives.
 */
import type { TerminalTab } from './index';
import type { OpenFile } from '../stores/fileStore';

/** A terminal tab as it crosses windows: id, title, cwd, prompt state. */
export interface DetachedTab {
  id: string;
  title: string;
  cwd: string;
  hasPrompted?: boolean;
}

export function toDetachedTab(tab: TerminalTab): DetachedTab {
  return { id: tab.id, title: tab.title, cwd: tab.cwd, hasPrompted: tab.hasPrompted };
}

/** A file as it crosses windows: path, name, content, dirty state. */
export interface DetachedFile {
  path: string;
  name: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
}

export function toDetachedFile(file: OpenFile): DetachedFile {
  return {
    path: file.path,
    name: file.name,
    content: file.content,
    originalContent: file.originalContent,
    isDirty: file.isDirty,
  };
}

/** One tab's slot inside a strip, viewport coords (from getBoundingClientRect). */
export interface BarTabSlot {
  id: string;
  /** Viewport x of the tab's left edge. */
  x: number;
  /** Viewport width of the tab. */
  width: number;
}

/** A window's tab-bar rect report (viewport coords; main adds the
 *  window's live bounds origin to get screen coords). */
export interface BarRectReport {
  /** Viewport rect of the bar element. */
  rect: { x: number; y: number; width: number; height: number };
  /** One slot per terminal tab in strip order. */
  tabs: BarTabSlot[];
}

/** Volley feedback: the single winning bar + where the tab lands. */
export interface DragDetectPayload {
  tabId: string;
  /** Insertion index in the winning bar (0..tabs.length). */
  insertionIndex: number;
}

/** Result of a detach / pop-in invoke: ok, or refused with a reason.
 *  A refused move never loses the tab — it stays where it was (§9). */
export interface DetachResult {
  ok: boolean;
  error?: string;
}
