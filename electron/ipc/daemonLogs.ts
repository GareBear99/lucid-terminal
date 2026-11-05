/**
 * Map LuciferLogger watcher events to DaemonLogViewer entries.
 *
 * The watcher (core/lucifer_watcher.py) logs every event through
 * LuciferLogger into ~/LuciferAI/logs/lucifer_memory.json as
 * { time, event, target, message }. This module turns those rows into the
 * shape DaemonLogViewer renders. Pure — no Electron imports, so it is
 * unit-tested in tests/daemon.test.ts.
 */

export interface WatcherEvent {
  /** "YYYY-MM-DD HH:MM:SS" as written by LuciferLogger. */
  time: string;
  event: string;
  target: string;
  message: string;
}

export interface DaemonLogEntry {
  id: string;
  /** Epoch ms. */
  timestamp: number;
  type: 'file_change' | 'auto_fix' | 'error' | 'success';
  file: string;
  directory: string;
  action: string;
  status: 'success' | 'failed' | 'pending';
}

export type DaemonVerbosity = 'minimal' | 'normal' | 'verbose' | 'debug';

/** Events the watcher writes. Anything else in the memory file is not ours. */
export function isWatcherEvent(event: string): boolean {
  return event.startsWith('watcher_') || event.startsWith('watch_');
}

/** Failures and errors only — the minimal set. */
const MINIMAL_EVENTS = new Set(['watch_no_fix', 'watch_fix_fail']);

/** Normal adds lifecycle, suggestions, and successful fixes. */
const NORMAL_EVENTS = new Set([
  ...MINIMAL_EVENTS,
  'watcher_add',
  'watcher_remove',
  'watcher_mode_change',
  'watcher_commit_tracking',
  'watcher_start',
  'watcher_stop',
  'watch_suggest',
  'watch_fix_success',
  'watch_commit',
]);

/** Does this verbosity level include this event? Verbose/debug show all. */
export function verbosityIncludes(verbosity: DaemonVerbosity, event: string): boolean {
  if (verbosity === 'minimal') return MINIMAL_EVENTS.has(event);
  if (verbosity === 'normal') return NORMAL_EVENTS.has(event);
  return true;
}

function typeForEvent(event: string): DaemonLogEntry['type'] {
  if (event === 'watch_suggest' || event.startsWith('watch_fix_')) return 'auto_fix';
  if (event === 'watch_no_fix') return 'error';
  if (event === 'watch_check_success' || event === 'watch_commit') return 'success';
  return 'file_change';
}

function statusForEvent(event: string): DaemonLogEntry['status'] {
  if (
    event === 'watch_fix_success' ||
    event === 'watch_check_success' ||
    event === 'watch_commit' ||
    event === 'watcher_add' ||
    event === 'watcher_start'
  ) {
    return 'success';
  }
  if (event === 'watch_fix_fail' || event === 'watch_no_fix') return 'failed';
  return 'pending';
}

function splitTarget(target: string): { file: string; directory: string } {
  if (!target || target === '-') return { file: '-', directory: '' };
  const idx = Math.max(target.lastIndexOf('/'), target.lastIndexOf('\\'));
  if (idx === -1) return { file: target, directory: '' };
  return { file: target.slice(idx + 1) || target, directory: target.slice(0, idx) };
}

/** One event -> one log entry, or null when it is not a watcher event. */
export function mapWatcherEventToLog(event: WatcherEvent, index: number): DaemonLogEntry | null {
  if (!isWatcherEvent(event.event)) return null;
  const parsed = Date.parse(event.time.replace(' ', 'T'));
  const { file, directory } = splitTarget(event.target);
  return {
    id: `watcher-log-${index}`,
    timestamp: Number.isNaN(parsed) ? 0 : parsed,
    type: typeForEvent(event.event),
    file,
    directory,
    action: event.message || event.event,
    status: statusForEvent(event.event),
  };
}

/**
 * Filter + map a LuciferLogger memory dump to viewer entries.
 * Applies the log-retention window (days; <= 0 means no limit) and the
 * verbosity filter, then sorts oldest-first.
 */
export function mapWatcherEventsToLogs(
  events: WatcherEvent[],
  retentionDays: number,
  verbosity: DaemonVerbosity,
): DaemonLogEntry[] {
  const cutoff =
    retentionDays > 0 ? Date.now() - retentionDays * 24 * 60 * 60 * 1000 : 0;
  const out: DaemonLogEntry[] = [];
  events.forEach((event, index) => {
    if (!isWatcherEvent(event.event)) return;
    if (!verbosityIncludes(verbosity, event.event)) return;
    const entry = mapWatcherEventToLog(event, index);
    if (!entry) return;
    if (cutoff > 0 && entry.timestamp > 0 && entry.timestamp < cutoff) return;
    out.push(entry);
  });
  out.sort((a, b) => a.timestamp - b.timestamp);
  return out;
}
