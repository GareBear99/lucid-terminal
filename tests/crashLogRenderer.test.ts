// @vitest-environment jsdom
// Renderer crash-hook tests (Gary, 2026-11-16: "should make
// an advanced crash log").
//
// Covers: the renderer payload builder (an Error keeps its
// message + stack; a string becomes the message; the
// file:line:col rides on the message); the validator; and
// the hooks themselves — window error and unhandledrejection
// events send a report to main over the bridge, install-once,
// and never throw when the bridge is missing. The hooks are
// best-effort: a failed send never breaks the app.
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  __resetRendererCrashHooksForTest,
  buildRendererErrorReport,
  getRendererCrashContext,
  installRendererCrashHooks,
  setCrashLogContext,
  validateRendererErrorReport,
} from '../src/lib/crashLog';

describe('renderer crash report builder', () => {
  beforeEach(() => {
    setCrashLogContext({ profile: 'Default', view: 'terminal' });
  });

  test('an Error keeps its message and stack', () => {
    const err = new Error('boom');
    const report = buildRendererErrorReport({
      kind: 'renderer-error',
      error: err,
    });
    expect(report.kind).toBe('renderer-error');
    expect(report.message).toBe('boom');
    expect(report.stack).toContain('Error: boom');
    // The profile + view come from the module context, and
    // the URL from the renderer location.
    expect(report.profile).toBe('Default');
    expect(report.view).toBe('terminal');
    expect(typeof report.url).toBe('string');
  });

  test('a string thrown becomes the message, with no stack', () => {
    const report = buildRendererErrorReport({
      kind: 'renderer-unhandled-rejection',
      error: 'a plain string rejection',
    });
    expect(report.message).toBe('a plain string rejection');
    expect(report.stack).toBeNull();
  });

  test('file:line:col rides on the message', () => {
    const report = buildRendererErrorReport({
      kind: 'renderer-error',
      error: new Error('script error'),
      filename: 'app.js',
      lineno: 12,
      colno: 34,
    });
    expect(report.message).toBe('script error (app.js:12:34)');
  });

  test('a bare message with no thrown value still builds', () => {
    const report = buildRendererErrorReport({
      kind: 'renderer-error',
      message: 'script error',
    });
    expect(report.message).toBe('script error');
  });

  test('the validator accepts a valid report and rejects the rest', () => {
    expect(
      validateRendererErrorReport({ kind: 'renderer-error', message: 'x' }),
    ).toBe(true);
    expect(
      validateRendererErrorReport({ kind: 'renderer-unhandled-rejection', message: 'x' }),
    ).toBe(true);
    expect(validateRendererErrorReport({ kind: 'main-uncaught-exception', message: 'x' })).toBe(false);
    expect(validateRendererErrorReport({ kind: 'renderer-error', message: '' })).toBe(false);
    expect(validateRendererErrorReport({ kind: 'renderer-error' })).toBe(false);
    expect(validateRendererErrorReport(null)).toBe(false);
  });
});

describe('renderer crash hooks', () => {
  let reports: unknown[];
  let contextUpdates: unknown[];

  beforeEach(() => {
    reports = [];
    contextUpdates = [];
    __resetRendererCrashHooksForTest();
    (window as unknown as { lucidAPI: unknown }).lucidAPI = {
      crashLog: {
        reportRendererError: (report: unknown) => {
          reports.push(report);
          return Promise.resolve({ ok: true });
        },
        setContext: (update: unknown) => {
          contextUpdates.push(update);
          return Promise.resolve();
        },
      },
    };
  });

  afterEach(() => {
    __resetRendererCrashHooksForTest();
    delete (window as unknown as { lucidAPI?: unknown }).lucidAPI;
  });

  test('installing twice installs once — one error event, one report', () => {
    installRendererCrashHooks();
    installRendererCrashHooks();
    window.dispatchEvent(
      new ErrorEvent('error', { message: 'boom', error: new Error('boom') }),
    );
    expect(reports).toHaveLength(1);
  });

  test('a window error sends a renderer-error report to main', () => {
    installRendererCrashHooks();
    setCrashLogContext({ profile: 'Default', view: 'terminal' });
    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'Uncaught TypeError: x is not a function',
        filename: 'bundle.js',
        lineno: 100,
        colno: 5,
        error: new Error('x is not a function'),
      }),
    );
    expect(reports).toHaveLength(1);
    const report = reports[0] as {
      kind: string;
      message: string;
      stack?: string | null;
      profile?: string;
      view?: string;
    };
    expect(report.kind).toBe('renderer-error');
    // The Error object wins over the event message — its
    // message is the short one, with the location appended.
    expect(report.message).toBe('x is not a function (bundle.js:100:5)');
    expect(report.stack).toContain('Error: x is not a function');
    expect(report.profile).toBe('Default');
    expect(report.view).toBe('terminal');
  });

  test('unhandledrejection sends a renderer-unhandled-rejection report', () => {
    installRendererCrashHooks();
    const reason = new Error('promise failed');
    // The promise itself is handled (the .catch) so the test
    // runner sees no real unhandled rejection — the hook is
    // exercised by the manually dispatched event.
    const promise = Promise.reject(reason);
    promise.catch(() => undefined);
    window.dispatchEvent(
      new PromiseRejectionEvent('unhandledrejection', {
        promise,
        reason,
      }),
    );
    expect(reports).toHaveLength(1);
    const report = reports[0] as { kind: string; message: string };
    expect(report.kind).toBe('renderer-unhandled-rejection');
    expect(report.message).toBe('promise failed');
  });

  test('setCrashLogContext stores locally and tells main', () => {
    installRendererCrashHooks();
    setCrashLogContext({ profile: 'Gary', view: 'settings' });
    expect(getRendererCrashContext()).toEqual({ profile: 'Gary', view: 'settings' });
    expect(contextUpdates).toContainEqual({ profile: 'Gary', view: 'settings' });
  });

  test('with no bridge the hooks install as a no-op and never throw', () => {
    delete (window as unknown as { lucidAPI?: unknown }).lucidAPI;
    installRendererCrashHooks();
    expect(() => {
      window.dispatchEvent(
        new ErrorEvent('error', { message: 'boom', error: new Error('boom') }),
      );
    }).not.toThrow();
    expect(reports).toHaveLength(0);
  });
});
