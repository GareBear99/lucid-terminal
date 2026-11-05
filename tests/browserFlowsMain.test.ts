/**
 * Browser flows (Area 7) runner + IPC tests.
 *
 * Part 1 tests the runner service directly with fake actions
 * (no Electron): the happy path, the supervision gates (approve /
 * reject / take over), step failures, and verify checks.
 *
 * Part 2 tests the IPC handlers in `electron/ipc/browser.ts`
 * with a mocked Electron (same pattern as
 * tests/browserMiniMain.test.ts): flow-start / approve / reject /
 * stop, and the AI bridge `runFlow` target the AI tool calls.
 *
 * Run with: npm test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBrowserFlowRunner } from '../electron/services/browserFlows';
import type {
  FlowApprovalRequest,
  FlowProgressEvent,
} from '../src/lib/browserFlows';
import type { FlowDefinition } from '../src/lib/browserFlows';

// ---- Part 1: the runner service with fake deps ----

const makeDeps = () => {
  const calls: string[] = [];
  const actions = {
    readText: vi.fn(async () => ({
      ok: true as const,
      text: { title: 'T', url: 'https://example.com/', text: 'Hello world' },
    })),
    fill: vi.fn(async () => {
      calls.push('fill');
      return { ok: true as const };
    }),
    click: vi.fn(async () => {
      calls.push('click');
      return { ok: true as const };
    }),
    waitForSelector: vi.fn(async () => {
      calls.push('wait');
      return { ok: true as const };
    }),
    screenshot: vi.fn(async () => ({
      ok: true as const,
      dataUrl: 'data:image/png;base64,xxx',
    })),
    getState: vi.fn(async () => ({
      ok: true as const,
      state: {
        url: 'https://example.com/',
        title: 'T',
        loading: false,
        forms: [],
      },
    })),
  };
  const navigate = vi.fn(async () => {
    calls.push('navigate');
    return { ok: true as const };
  });
  const progress: FlowProgressEvent[] = [];
  const approvals: FlowApprovalRequest[] = [];
  const runner = createBrowserFlowRunner({
    actions: actions as never,
    navigate: navigate as never,
    getWebContents: () => ({}) as never,
    onProgress: (event) => {
      progress.push(event);
    },
    onApprovalNeeded: (request) => {
      approvals.push(request);
    },
  });
  return { runner, actions, navigate, calls, progress, approvals };
};

const terminal = (progress: FlowProgressEvent[]) =>
  progress.find(
    (e) =>
      e.status === 'done' ||
      e.status === 'failed' ||
      e.status === 'rejected' ||
      e.status === 'stopped',
  );

const waitForTerminal = async (progress: FlowProgressEvent[]) => {
  await vi.waitFor(() => {
    if (!terminal(progress)) throw new Error('not terminal yet');
  });
};

const simpleFlow: FlowDefinition = {
  name: 'Search flow',
  steps: [
    { kind: 'navigate', url: 'https://example.com/' },
    { kind: 'wait', selector: '#q' },
    { kind: 'fill', selector: '#q', value: 'hello' },
    { kind: 'click', selector: '#go' },
    { kind: 'verify', expectedText: 'Hello' },
  ],
};

describe('flow runner', () => {
  it('runs every step in order and ends done', async () => {
    const { runner, calls, progress } = makeDeps();
    const started = runner.startFlow(simpleFlow, 'tab-1');
    expect(started.ok).toBe(true);
    await waitForTerminal(progress);
    expect(calls).toEqual(['navigate', 'wait', 'fill', 'click']);
    expect(terminal(progress)?.status).toBe('done');
    expect(terminal(progress)?.stepIndex).toBe(5);
  });

  it('rejects an invalid definition without running anything', async () => {
    const { runner, calls, progress } = makeDeps();
    const started = runner.startFlow(
      { name: 'Bad', steps: [{ kind: 'navigate', url: 'notaurl' }] },
      'tab-1',
    );
    expect(started.ok).toBe(false);
    expect(started.error).toBe('invalid-definition');
    expect(calls).toEqual([]);
    expect(progress).toEqual([]);
  });

  it('a failing step fails the flow and stops the rest', async () => {
    const { runner, actions, calls, progress } = makeDeps();
    actions.click.mockResolvedValueOnce({ ok: false, error: 'not-found' });
    runner.startFlow(simpleFlow, 'tab-1');
    await waitForTerminal(progress);
    expect(calls).toEqual(['navigate', 'wait', 'fill']);
    expect(terminal(progress)?.status).toBe('failed');
    expect(terminal(progress)?.error).toBe('not-found');
  });

  it('a verify whose text is missing fails the flow', async () => {
    const { runner, progress } = makeDeps();
    runner.startFlow(
      {
        name: 'Verify',
        steps: [{ kind: 'verify', expectedText: 'not on the page' }],
      },
      'tab-1',
    );
    await waitForTerminal(progress);
    expect(terminal(progress)?.status).toBe('failed');
    expect(terminal(progress)?.error).toBe('verify-failed');
  });

  it('a verify by selector passes when the element is present', async () => {
    const { runner, progress } = makeDeps();
    runner.startFlow(
      { name: 'Verify', steps: [{ kind: 'verify', selector: '#ok' }] },
      'tab-1',
    );
    await waitForTerminal(progress);
    expect(terminal(progress)?.status).toBe('done');
  });
});

describe('supervision gates', () => {
  const gatedFlow: FlowDefinition = {
    name: 'Buy flow',
    steps: [
      { kind: 'navigate', url: 'https://shop.example/item' },
      { kind: 'click', selector: '#buy-now' },
      // The fake page says "Hello world", so this verify passes.
      { kind: 'verify', expectedText: 'Hello' },
    ],
  };

  it('pauses on the gated step and resumes on approve', async () => {
    const { runner, actions, calls, progress, approvals } = makeDeps();
    const started = runner.startFlow(gatedFlow, 'tab-1');
    expect(started.ok).toBe(true);
    await vi.waitFor(() => {
      if (approvals.length === 0) throw new Error('no approval yet');
    });
    // The navigate ran; the buy click has NOT.
    expect(calls).toEqual(['navigate']);
    expect(actions.click).not.toHaveBeenCalled();
    expect(approvals[0].description).toBe('2. Click #buy-now');
    expect(
      progress.some((e) => e.status === 'waiting-approval'),
    ).toBe(true);
    expect(runner.approveStep(started.flowId ?? '')).toEqual({ ok: true });
    await waitForTerminal(progress);
    expect(calls).toEqual(['navigate', 'click']);
    expect(terminal(progress)?.status).toBe('done');
  });

  it('rejecting the gated step ends the flow without clicking', async () => {
    const { runner, actions, progress, approvals } = makeDeps();
    const started = runner.startFlow(gatedFlow, 'tab-1');
    await vi.waitFor(() => {
      if (approvals.length === 0) throw new Error('no approval yet');
    });
    expect(runner.rejectStep(started.flowId ?? '')).toEqual({ ok: true });
    await waitForTerminal(progress);
    expect(actions.click).not.toHaveBeenCalled();
    expect(terminal(progress)?.status).toBe('rejected');
  });

  it('stopping while waiting (take over) ends the flow as stopped', async () => {
    const { runner, actions, progress, approvals } = makeDeps();
    const started = runner.startFlow(gatedFlow, 'tab-1');
    await vi.waitFor(() => {
      if (approvals.length === 0) throw new Error('no approval yet');
    });
    expect(runner.stopFlow(started.flowId ?? '')).toEqual({ ok: true });
    await waitForTerminal(progress);
    expect(actions.click).not.toHaveBeenCalled();
    expect(terminal(progress)?.status).toBe('stopped');
  });

  it('approve/reject/stop on an unknown flow, or when not waiting, fail cleanly', async () => {
    const { runner } = makeDeps();
    expect(runner.approveStep('nope')).toEqual({
      ok: false,
      error: 'no-such-flow',
    });
    expect(runner.rejectStep('nope')).toEqual({
      ok: false,
      error: 'no-such-flow',
    });
    expect(runner.stopFlow('nope')).toEqual({
      ok: false,
      error: 'no-such-flow',
    });
    const started = runner.startFlow(simpleFlow, 'tab-1');
    expect(started.ok).toBe(true);
    // No gated step in this flow, so nothing is waiting.
    expect(runner.approveStep(started.flowId ?? '')).toEqual({
      ok: false,
      error: 'not-waiting',
    });
  });
});

// ---- Part 2: IPC handlers with a mocked Electron ----

type Handlers = Record<string, (...args: unknown[]) => unknown>;

interface IpcState {
  currentUrl: string;
  scripts: string[];
  views: Array<{ wc: Record<string, unknown>; view: unknown }>;
}

(globalThis as unknown as { __flowState: unknown }).__flowState ??= {
  currentUrl: '',
  scripts: [],
  views: [],
};

const ipcState = () =>
  (globalThis as unknown as { __flowState: IpcState }).__flowState;

vi.mock('electron', () => {
  const state = ipcState();
  state.views = [];
  class BrowserView {
    webContents: Record<string, unknown>;
    constructor(_opts: unknown) {
      const handlers: Record<string, (...args: unknown[]) => void> = {};
      const wc: Record<string, unknown> = {
        destroyed: false,
        on: (event: string, handler: (...args: unknown[]) => void) => {
          handlers[event] = handler;
        },
        setWindowOpenHandler: () => undefined,
        loadURL: () => Promise.resolve(),
        getURL: () => state.currentUrl,
        getTitle: () => 'Test Page',
        isLoading: () => false,
        canGoBack: () => false,
        canGoForward: () => false,
        destroy: () => {
          wc.destroyed = true;
        },
        executeJavaScript: (script: string) => {
          state.scripts.push(script);
          if (script.includes('__findPassword')) {
            if (script.includes('__setFieldValue')) {
              return Promise.resolve(true);
            }
            return Promise.resolve({
              hasPassword: false,
              username: '',
              password: '',
            });
          }
          if (script.includes('innerText')) {
            return Promise.resolve({
              title: 'Test Page',
              url: state.currentUrl,
              text: 'Hello world.',
            });
          }
          if (script.includes('document.forms')) {
            return Promise.resolve({
              url: state.currentUrl,
              title: 'Test Page',
              loading: false,
              forms: [],
            });
          }
          if (script.includes('!!document.querySelector')) {
            return Promise.resolve(true);
          }
          return Promise.resolve({ ok: true });
        },
        capturePage: () =>
          Promise.resolve({ toPNG: () => Buffer.from('fake-png-bytes') }),
        findInPage: () => 42,
        stopFindInPage: () => undefined,
        setZoomFactor: () => undefined,
        getZoomFactor: () => 1,
        copy: () => undefined,
        inspectElement: () => undefined,
        goBack: () => undefined,
        goForward: () => undefined,
        reload: () => undefined,
        __handlers: handlers,
      };
      this.webContents = wc;
      state.views.push({ wc, view: this });
    }
    setBounds() {}
    getBounds() {
      return { x: 0, y: 0, width: 100, height: 100 };
    }
  }
  return {
    BrowserView,
    BrowserWindow: class {},
    IpcMain: class {},
    app: { getPath: () => '/tmp/lucid-test-user-data' },
    session: {
      fromPartition: () => ({
        setPermissionRequestHandler: () => undefined,
        on: () => undefined,
      }),
    },
    clipboard: { writeText: () => undefined },
    Menu: { buildFromTemplate: () => ({ popup: () => undefined }) },
    shell: {
      openExternal: () => undefined,
      showItemInFolder: () => undefined,
    },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s: string) => Buffer.from(`enc:${s}`),
      decryptString: (b: Buffer) => b.toString().replace(/^enc:/, ''),
    },
  };
});

vi.mock('electron-store', () => ({
  default: class {
    private data = new Map<string, unknown>();
    constructor(_opts?: unknown) {}
    get(key: string) {
      return this.data.get(key);
    }
    set(key: string, value: unknown) {
      this.data.set(key, value);
    }
    has(key: string) {
      return this.data.has(key);
    }
    delete(key: string) {
      this.data.delete(key);
    }
    get store() {
      return Object.fromEntries(this.data);
    }
  },
}));

const makeFakeWindow = () => {
  const sent: Array<{ channel: string; args: unknown[] }> = [];
  let attached: unknown = null;
  return {
    sent,
    isDestroyed: () => false,
    getBrowserView: () => attached,
    setBrowserView: (view: unknown) => {
      attached = view;
    },
    webContents: {
      send: (channel: string, ...args: unknown[]) => {
        sent.push({ channel, args });
      },
    },
  };
};

const setup = async () => {
  const { setupBrowserHandlers } = await import('../electron/ipc/browser');
  const handlers: Handlers = {};
  const mockIpcMain = {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler;
    }),
  } as unknown as import('electron').IpcMain;
  const mainWin = makeFakeWindow();
  setupBrowserHandlers(
    mockIpcMain,
    () => mainWin as unknown as import('electron').BrowserWindow,
    {},
  );
  return { handlers, mainWin };
};

const call = (handlers: Handlers, channel: string, ...args: unknown[]) =>
  (handlers[channel] as (...a: unknown[]) => unknown)(undefined, ...args);

const flowEvents = (mainWin: ReturnType<typeof makeFakeWindow>) =>
  mainWin.sent
    .filter((s) => s.channel === 'browser:flow-progress')
    .map((s) => s.args[0] as FlowProgressEvent);

const waitForFlowStatus = async (
  mainWin: ReturnType<typeof makeFakeWindow>,
  status: string,
) => {
  await vi.waitFor(() => {
    if (!flowEvents(mainWin).some((e) => e.status === status)) {
      throw new Error(`no ${status} event yet`);
    }
  });
};

beforeEach(() => {
  const state = ipcState();
  state.currentUrl = '';
  state.scripts = [];
  state.views = [];
});

describe('flow IPC handlers', () => {
  it('starts a flow on a tab and reports progress to the panel', async () => {
    const { handlers, mainWin } = await setup();
    ipcState().currentUrl = 'https://example.com/';
    call(handlers, 'browser:create', 'tab-1', 'https://example.com/');
    const started = (await call(
      handlers,
      'browser:flow-start',
      simpleFlow,
      'tab-1',
    )) as { ok: boolean; flowId?: string };
    expect(started.ok).toBe(true);
    expect(typeof started.flowId).toBe('string');
    await waitForFlowStatus(mainWin, 'done');
    const events = flowEvents(mainWin);
    expect(events[events.length - 1].status).toBe('done');
    // The page scripts ran: a wait (selector present) and a verify read.
    expect(
      ipcState().scripts.some((s) => s.includes('!!document.querySelector')),
    ).toBe(true);
    expect(ipcState().scripts.some((s) => s.includes('innerText'))).toBe(true);
  });

  it('an invalid definition is rejected; an unknown tab is no-such-tab', async () => {
    const { handlers } = await setup();
    call(handlers, 'browser:create', 'tab-1', 'https://example.com/');
    expect(
      await call(handlers, 'browser:flow-start', { name: 'Bad', steps: [] }, 'tab-1'),
    ).toEqual({ ok: false, error: 'invalid-definition', errors: ['A flow needs at least one step.'] });
    expect(
      await call(handlers, 'browser:flow-start', simpleFlow, 'ghost'),
    ).toEqual({ ok: false, error: 'no-such-tab' });
  });

  it('a gated flow pauses for approval and resumes on approve', async () => {
    const { handlers, mainWin } = await setup();
    ipcState().currentUrl = 'https://shop.example/item';
    call(handlers, 'browser:create', 'tab-1', 'https://shop.example/item');
    const started = (await call(handlers, 'browser:flow-start', {
      name: 'Buy flow',
      steps: [
        { kind: 'navigate', url: 'https://shop.example/item' },
        { kind: 'click', selector: '#buy-now' },
      ],
    }, 'tab-1')) as { ok: boolean; flowId?: string };
    expect(started.ok).toBe(true);
    await waitForFlowStatus(mainWin, 'waiting-approval');
    // The approval request reaches the panel.
    const approvals = mainWin.sent.filter(
      (s) => s.channel === 'browser:flow-approval-needed',
    );
    expect(approvals).toHaveLength(1);
    expect(
      (approvals[0].args[0] as FlowApprovalRequest).description,
    ).toBe('2. Click #buy-now');
    // The click script has NOT run yet.
    expect(
      ipcState().scripts.some((s) => s.includes('el.click()')),
    ).toBe(false);
    expect(
      await call(handlers, 'browser:flow-approve', started.flowId),
    ).toEqual({ ok: true });
    await waitForFlowStatus(mainWin, 'done');
    expect(
      ipcState().scripts.some((s) => s.includes('el.click()')),
    ).toBe(true);
  });

  it('rejecting a gated step ends the flow without running it', async () => {
    const { handlers, mainWin } = await setup();
    ipcState().currentUrl = 'https://shop.example/item';
    call(handlers, 'browser:create', 'tab-1', 'https://shop.example/item');
    const started = (await call(handlers, 'browser:flow-start', {
      name: 'Buy flow',
      steps: [{ kind: 'click', selector: '#buy-now' }],
    }, 'tab-1')) as { ok: boolean; flowId?: string };
    await waitForFlowStatus(mainWin, 'waiting-approval');
    expect(
      await call(handlers, 'browser:flow-reject', started.flowId),
    ).toEqual({ ok: true });
    await waitForFlowStatus(mainWin, 'rejected');
    expect(
      ipcState().scripts.some((s) => s.includes('el.click()')),
    ).toBe(false);
  });
});

describe('AI bridge runFlow', () => {
  it('starts a flow on the active tab and returns a started summary', async () => {
    const { handlers, mainWin } = await setup();
    const { getBrowserToolTarget } = await import(
      '../electron/services/browserToolBridge'
    );
    ipcState().currentUrl = 'https://example.com/';
    call(handlers, 'browser:create', 'tab-1', 'https://example.com/');
    call(handlers, 'browser:activate', 'tab-1', {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    const target = getBrowserToolTarget();
    expect(target).not.toBeNull();
    const result = await target!.runFlow(simpleFlow);
    expect(result).toContain('Flow started: Search flow');
    expect(result).toContain('pause for Gary');
    await waitForFlowStatus(mainWin, 'done');
  });

  it('an invalid definition is a clean error, not a throw', async () => {
    const { handlers } = await setup();
    const { getBrowserToolTarget } = await import(
      '../electron/services/browserToolBridge'
    );
    call(handlers, 'browser:create', 'tab-1', 'https://example.com/');
    call(handlers, 'browser:activate', 'tab-1', {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    const target = getBrowserToolTarget();
    const result = await target!.runFlow({
      name: 'Bad',
      steps: [],
    });
    expect(result).toContain('Could not start the flow: invalid-definition');
  });

  it('no active tab is a clean message', async () => {
    const { handlers } = await setup();
    const { getBrowserToolTarget } = await import(
      '../electron/services/browserToolBridge'
    );
    call(handlers, 'browser:create', 'tab-1', 'https://example.com/');
    // No activate: no active tab.
    const target = getBrowserToolTarget();
    const result = await target!.runFlow(simpleFlow);
    expect(result).toBe('No browser tab is open.');
  });
});
