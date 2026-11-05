import { describe, it, expect } from 'vitest';
import {
  isWatcherEvent,
  mapWatcherEventToLog,
  mapWatcherEventsToLogs,
  verbosityIncludes,
  WatcherEvent,
} from '../electron/ipc/daemonLogs';

function event(overrides: Partial<WatcherEvent>): WatcherEvent {
  return {
    time: '2026-11-04 15:00:00',
    event: 'watcher_start',
    target: '-',
    message: 'Started watch mode on 1 paths',
    ...overrides,
  };
}

describe('isWatcherEvent', () => {
  it('accepts watcher_ and watch_ events', () => {
    expect(isWatcherEvent('watcher_start')).toBe(true);
    expect(isWatcherEvent('watch_suggest')).toBe(true);
    expect(isWatcherEvent('watch_fix_success')).toBe(true);
  });

  it('rejects non-watcher memory events', () => {
    expect(isWatcherEvent('run_success')).toBe(false);
    expect(isWatcherEvent('test')).toBe(false);
    expect(isWatcherEvent('')).toBe(false);
  });
});

describe('mapWatcherEventToLog', () => {
  it('maps a suggest event to an auto_fix entry with pending status', () => {
    const entry = mapWatcherEventToLog(
      event({ event: 'watch_suggest', target: '/tmp/x/broken.py', message: 'Suggested local fix: import os' }),
      0,
    );
    expect(entry).not.toBeNull();
    expect(entry!.type).toBe('auto_fix');
    expect(entry!.status).toBe('pending');
    expect(entry!.file).toBe('broken.py');
    expect(entry!.directory).toBe('/tmp/x');
    expect(entry!.timestamp).toBe(Date.parse('2026-11-04T15:00:00'));
  });

  it('maps a failed fix to an error entry with failed status', () => {
    const entry = mapWatcherEventToLog(
      event({ event: 'watch_fix_fail', target: '/tmp/x/broken.py', message: 'Fix attempt failed' }),
      1,
    );
    expect(entry!.type).toBe('auto_fix');
    expect(entry!.status).toBe('failed');
  });

  it('maps no-fix to an error entry', () => {
    const entry = mapWatcherEventToLog(
      event({ event: 'watch_no_fix', target: '/tmp/x/broken.py', message: 'NameError: ...' }),
      2,
    );
    expect(entry!.type).toBe('error');
    expect(entry!.status).toBe('failed');
  });

  it('maps a successful check to a success entry', () => {
    const entry = mapWatcherEventToLog(
      event({ event: 'watch_check_success', target: '/tmp/x/good.py', message: 'File runs successfully' }),
      3,
    );
    expect(entry!.type).toBe('success');
    expect(entry!.status).toBe('success');
  });

  it('returns null for non-watcher events', () => {
    expect(mapWatcherEventToLog(event({ event: 'run_success' }), 4)).toBeNull();
  });

  it('handles a bare target without a path', () => {
    const entry = mapWatcherEventToLog(event({ event: 'watcher_start', target: '-' }), 5);
    expect(entry!.file).toBe('-');
    expect(entry!.directory).toBe('');
  });
});

describe('verbosityIncludes', () => {
  it('minimal shows only failures', () => {
    expect(verbosityIncludes('minimal', 'watch_no_fix')).toBe(true);
    expect(verbosityIncludes('minimal', 'watch_fix_fail')).toBe(true);
    expect(verbosityIncludes('minimal', 'watch_suggest')).toBe(false);
    expect(verbosityIncludes('minimal', 'watcher_start')).toBe(false);
    expect(verbosityIncludes('minimal', 'watch_check_success')).toBe(false);
  });

  it('normal adds lifecycle, suggestions, and successful fixes', () => {
    expect(verbosityIncludes('normal', 'watch_suggest')).toBe(true);
    expect(verbosityIncludes('normal', 'watcher_start')).toBe(true);
    expect(verbosityIncludes('normal', 'watch_fix_success')).toBe(true);
    expect(verbosityIncludes('normal', 'watch_check_success')).toBe(false);
  });

  it('verbose and debug show everything', () => {
    expect(verbosityIncludes('verbose', 'watch_check_success')).toBe(true);
    expect(verbosityIncludes('debug', 'watch_check_success')).toBe(true);
  });
});

describe('watch_commit events (commit tracking)', () => {
  it('is a watcher event and shows at normal verbosity', () => {
    expect(isWatcherEvent('watch_commit')).toBe(true);
    expect(verbosityIncludes('normal', 'watch_commit')).toBe(true);
    expect(verbosityIncludes('minimal', 'watch_commit')).toBe(false);
  });

  it('maps to a success entry with the repo directory and the commit message', () => {
    const entry = mapWatcherEventToLog(
      event({ event: 'watch_commit', target: '/home/gary/FreeEQ8', message: 'Commit abc1234 Fix shelf' }),
      0,
    );
    expect(entry).not.toBeNull();
    expect(entry!.type).toBe('success');
    expect(entry!.status).toBe('success');
    expect(entry!.file).toBe('FreeEQ8');
    expect(entry!.directory).toBe('/home/gary');
    expect(entry!.action).toBe('Commit abc1234 Fix shelf');
  });

  it('includes commit events in the mapped log list', () => {
    const entries = mapWatcherEventsToLogs(
      [
        event({ event: 'watch_commit', target: '/home/gary/FreeEQ8', message: 'Commit abc1234 Fix shelf' }),
        event({ event: 'watch_check_success', target: '/tmp/a.py' }),
      ],
      30,
      'normal',
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toContain('abc1234');
  });
});

describe('mapWatcherEventsToLogs', () => {
  it('drops non-watcher events and sorts oldest-first', () => {
    const entries = mapWatcherEventsToLogs(
      [
        event({ time: '2026-11-04 15:02:00', event: 'watch_suggest', target: '/tmp/b.py' }),
        event({ time: '2026-11-04 15:01:00', event: 'run_success', target: '/tmp/a.py' }),
        event({ time: '2026-11-04 15:00:00', event: 'watcher_start', target: '-' }),
      ],
      30,
      'verbose',
    );
    expect(entries.map((e) => e.file)).toEqual(['-', 'b.py']);
    expect(entries[0].timestamp).toBeLessThan(entries[1].timestamp);
  });

  it('applies the retention window', () => {
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    const oldTime = old.toISOString().slice(0, 19).replace('T', ' ');
    const entries = mapWatcherEventsToLogs(
      [
        event({ time: oldTime, event: 'watcher_start', target: '-' }),
        event({ event: 'watcher_start', target: '-' }),
      ],
      30,
      'verbose',
    );
    expect(entries).toHaveLength(1);
  });

  it('applies the verbosity filter', () => {
    const entries = mapWatcherEventsToLogs(
      [
        event({ event: 'watch_check_success', target: '/tmp/a.py' }),
        event({ event: 'watch_no_fix', target: '/tmp/b.py' }),
      ],
      30,
      'minimal',
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].file).toBe('b.py');
  });
});
