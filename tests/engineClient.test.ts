/**
 * The engine client tests (Kite mapping #2 — the client
 * split — 2026-11-14).
 *
 * Three layers of proof, matching the module's three layers:
 *   1. The transport, engine down — a query throws the
 *      typed `EngineStateError`, a notification never does,
 *      an unknown method throws `EngineRequestError`.
 *   2. The API over a fake transport — the never-throw
 *      contract (an engine failure is the empty result +
 *      one `did-fail-request` emission), and the symbol
 *      report composed from canned hover/definition/
 *      references.
 *   3. The real in-process transport, through the client —
 *      the REAL TS 6.0.3 language service (the same
 *      discipline as the tree-sitter and language-service
 *      tests: no stubs for the engine). The engine loads
 *      lazily from the real `typescript-lsp` package.
 *
 * Order matters in this file: the engine-down describe
 * runs FIRST, before any `ensureReady()` call, so the
 * engine really is down for it.
 *
 * Run with: npx vitest run tests/engineClient.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  EngineRequestError,
  EngineStateError,
  createEngineClient,
  createInProcessTransport,
  getEngineClient,
  resetEngineClientForTests,
  type EngineClient,
  type EngineMethod,
  type EngineMethodParams,
  type EngineMethodResult,
  type EngineState,
  type EngineTransport,
} from '../src/lib/engineClient';
import { updateFileTree } from '../src/lib/treeSitter';

const DIR = '/engine-client-test';

/** A transport whose every query fails (the engine is down). */
const throwingTransport: EngineTransport = {
  name: 'throwing',
  request: () => {
    throw new EngineStateError('The engine is down', {
      state: 'unreachable',
    });
  },
  checkHealth: async () => 'unreachable' as EngineState,
};

/** A transport answering canned facts (the engine is up). */
const cannedTransport: EngineTransport = {
  name: 'canned',
  request<M extends EngineMethod>(
    method: M,
    _params: EngineMethodParams[M],
  ): EngineMethodResult[M] {
    switch (method) {
      case 'initialize':
        return true as EngineMethodResult[M];
      case 'initialized':
      case 'textDocument/didOpen':
      case 'textDocument/didChange':
      case 'textDocument/didClose':
        return undefined as EngineMethodResult[M];
      case 'textDocument/hover':
        return {
          contents:
            '```typescript\nconst greet: (name: string) => string\n```\n\nGreets the user.',
          range: undefined,
        } as EngineMethodResult[M];
      case 'textDocument/definition':
        return [
          {
            uri: '/ws/a.ts',
            range: {
              start: { line: 0, character: 6 },
              end: { line: 0, character: 11 },
            },
          },
        ] as EngineMethodResult[M];
      case 'textDocument/references':
        return [
          {
            uri: '/ws/a.ts',
            range: {
              start: { line: 3, character: 15 },
              end: { line: 3, character: 20 },
            },
          },
        ] as EngineMethodResult[M];
      default:
        return null as EngineMethodResult[M];
    }
  },
  checkHealth: async () => 'ready' as EngineState,
};

describe('the in-process transport, engine down', () => {
  it('a query throws the typed state error while the engine is not ready', () => {
    const transport = createInProcessTransport();
    expect(() =>
      transport.request('textDocument/hover', {
        path: `${DIR}/down.ts`,
        position: { line: 0, character: 0 },
      }),
    ).toThrow(EngineStateError);
    try {
      transport.request('textDocument/hover', {
        path: `${DIR}/down.ts`,
        position: { line: 0, character: 0 },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(EngineStateError);
      expect((error as EngineStateError).state).toBe('not-running');
    }
  });

  it('a document notification never throws, even before the engine is up', () => {
    const transport = createInProcessTransport();
    expect(() =>
      transport.request('textDocument/didOpen', {
        path: `${DIR}/down.ts`,
        content: 'const a = 1;\n',
      }),
    ).not.toThrow();
    // The document is held for the engine — opening it
    // again, and closing it, are also notifications.
    expect(() =>
      transport.request('textDocument/didChange', {
        path: `${DIR}/down.ts`,
        content: 'const a = 2;\n',
      }),
    ).not.toThrow();
    expect(() =>
      transport.request('textDocument/didClose', { path: `${DIR}/down.ts` }),
    ).not.toThrow();
  });

  it('an unknown method throws the typed request error', () => {
    const transport = createInProcessTransport();
    expect(() =>
      transport.request(
        'kite/status' as EngineMethod,
        {} as EngineMethodParams[EngineMethod],
      ),
    ).toThrow(EngineRequestError);
    try {
      transport.request(
        'kite/status' as EngineMethod,
        {} as EngineMethodParams[EngineMethod],
      );
    } catch (error) {
      expect((error as EngineRequestError).code).toBe('unknown_method');
    }
  });
});

describe('the API over a failing transport', () => {
  it('never throws: every failure is the empty result + one did-fail-request emission', () => {
    const client = createEngineClient(throwingTransport);
    const seen: Error[] = [];
    const sub = client.onDidFailRequest((error) => seen.push(error));
    expect(client.isReady()).toBe(false);
    expect(
      client.getHover('/ws/a.ts', { line: 0, character: 0 }),
    ).toBeNull();
    expect(
      client.getCompletions('/ws/a.ts', { line: 0, character: 0 }),
    ).toBeNull();
    expect(client.getDiagnostics('/ws/a.ts')).toEqual([]);
    expect(client.getDefinition('/ws/a.ts', { line: 0, character: 0 })).toEqual([]);
    // verifyIdentifiers degrades to pass-through when the
    // engine is down (the ghost degrades to tree-sitter,
    // it never goes silent) — no transport call, no emission.
    expect(client.verifyIdentifiers('/ws/a.ts', ['greet'])).toEqual(['greet']);
    expect(
      client.getSymbolReport('/ws/a.ts', { line: 0, character: 0 }, 'greet'),
    ).toBeNull();
    // One emission per failed operation — isReady is a
    // silent probe, and the symbol report short-circuits
    // on it, so neither emits.
    expect(seen).toHaveLength(4);
    expect(seen[0]).toBeInstanceOf(EngineStateError);
    sub.dispose();
    client.getHover('/ws/a.ts', { line: 0, character: 0 });
    expect(seen).toHaveLength(4);
  });

  it('checkHealth reports the transport state and checkEdit stays clean-shaped', async () => {
    const client = createEngineClient(throwingTransport);
    expect(await client.checkHealth()).toBe('unreachable');
    expect(client.getState()).toBe('unreachable');
    expect(client.checkEdit('/ws/a.ts', 'const a = 1;\n')).toEqual({
      clean: true,
      diagnostics: [],
    });
  });
});

describe('the API over a canned transport', () => {
  it('composes the symbol report from hover + definition + references', () => {
    const client = createEngineClient(cannedTransport);
    expect(client.transportName).toBe('canned');
    expect(client.isReady()).toBe(true);
    const report = client.getSymbolReport(
      '/ws/a.ts',
      { line: 3, character: 17 },
      'greet',
    );
    expect(report?.identifier).toBe('greet');
    expect(report?.hover?.contents).toContain('Greets the user.');
    expect(report?.definition).toHaveLength(1);
    expect(report?.definition[0]?.uri).toBe('/ws/a.ts');
    expect(report?.references).toHaveLength(1);
  });

  it('returns null when there is no hover for the position', () => {
    const client = createEngineClient({
      ...cannedTransport,
      request: ((method: EngineMethod) => {
        if (method === 'initialize') return true;
        return null;
      }) as EngineTransport['request'],
    });
    expect(
      client.getSymbolReport('/ws/a.ts', { line: 0, character: 0 }, 'greet'),
    ).toBeNull();
  });
});

describe('the real engine, through the client', () => {
  const APP_PATH = `${DIR}/app.ts`;
  const APP = `export function greet(name: string): string {
  return 'hello ' + name;
}
export const answer = greet('world');
`;
  // `greet` in the call on line 4 (1-based): 'export const
  // answer = ' is 22 chars, so the name spans columns
  // 23–28 (1-based) — the probe sits inside it.
  const CALL = { line: 3, character: 24 };
  let client: EngineClient;

  beforeAll(async () => {
    client = getEngineClient();
    expect(await client.ensureReady()).toBe(true);
    expect(client.isReady()).toBe(true);
    expect(client.transportName).toBe('in-process');
    expect(await client.checkHealth()).toBe('ready');
    expect(client.getState()).toBe('ready');
    expect(client.getEngineVersion()).toBe('6.0.3');
    client.openDocument(APP_PATH, APP);
    await updateFileTree(APP_PATH, APP);
  });

  afterAll(() => {
    client.closeDocument(APP_PATH);
    client.closeDocument(`${DIR}/down.ts`);
  });

  it('completions carry the real symbol', () => {
    // Inside the `greet` name in the call (columns 23–28
    // 1-based) — the service offers the in-scope entries.
    const list = client.getCompletions(APP_PATH, { line: 3, character: 25 });
    expect(list).not.toBeNull();
    expect(list?.items.map((i) => i.label)).toContain('greet');
  });

  it('hover returns the fenced signature + JSDoc shape', () => {
    const hover = client.getHover(APP_PATH, CALL);
    expect(hover).not.toBeNull();
    expect(hover?.contents).toContain('greet');
    expect(hover?.contents.startsWith('```typescript')).toBe(true);
  });

  it('signature help shows the call', () => {
    const help = client.getSignatureHelp(APP_PATH, { line: 3, character: 28 });
    expect(help).not.toBeNull();
    expect(help?.signatures[0]?.label).toContain('greet(');
  });

  it('diagnostics are clean, and checkEdit proves it both ways', () => {
    expect(client.getDiagnostics(APP_PATH)).toEqual([]);
    const clean = client.checkEdit(APP_PATH, `${APP}export const b = 1;\n`);
    expect(clean.clean).toBe(true);
    const dirty = client.checkEdit(APP_PATH, 'const n: number = "hello";\n');
    expect(dirty.clean).toBe(false);
    expect(dirty.diagnostics.some((d) => d.code === 2322)).toBe(true);
    // The original is restored after the check.
    expect(client.getDiagnostics(APP_PATH)).toEqual([]);
  });

  it('verify keeps the real name and drops the made-up one', () => {
    expect(client.verifyIdentifiers(APP_PATH, ['greet', 'madeUpName'])).toEqual([
      'greet',
    ]);
    expect(client.verifyIdentifier(APP_PATH, 'greet')?.kind).toBe('function');
    expect(client.verifyIdentifier(APP_PATH, 'madeUpName')).toBeNull();
  });

  it('the symbol report composes hover + definition + references', () => {
    const report = client.getSymbolReport(APP_PATH, CALL, 'greet');
    expect(report?.identifier).toBe('greet');
    expect(report?.hover?.contents).toContain('greet');
    expect(report?.definition.length).toBeGreaterThan(0);
    expect(report?.definition[0]?.uri).toBe(APP_PATH);
    expect(report?.definition[0]?.range.start.line).toBe(0);
    expect(report?.references.length).toBeGreaterThan(0);
  });

  it('definition, references and document symbols agree', () => {
    const defs = client.getDefinition(APP_PATH, CALL);
    expect(defs.length).toBeGreaterThan(0);
    expect(defs[0]?.uri).toBe(APP_PATH);
    const refs = client.getReferences(APP_PATH, CALL);
    expect(refs.length).toBeGreaterThan(0);
    const symbols = client.getDocumentSymbols(APP_PATH);
    expect(symbols.map((s) => s.name)).toContain('greet');
  });

  it('structure identifiers come from the live tree', () => {
    const names = client.getStructureIdentifiers(APP_PATH, 4, 1);
    expect(names).toContain('greet');
  });

  it('patterns come from the shared index over the open files', () => {
    const files = [
      { path: `${DIR}/p1.ts`, content: 'const repeatedLine = 1;\n' },
      { path: `${DIR}/p2.ts`, content: 'const repeatedLine = 1;\n' },
    ];
    const patterns = client.getPatterns(files);
    expect(patterns.map((p) => p.text)).toContain('const repeatedLine = 1;');
    expect(
      client.getPatternCompletions(files, 'const repeatedLine', 5),
    ).toContain('const repeatedLine = 1;');
  });

  it('the singleton is shared until reset', () => {
    expect(getEngineClient()).toBe(client);
    resetEngineClientForTests();
    expect(getEngineClient()).not.toBe(client);
  });
});

describe('brain-alive activity', () => {
  it('a successful operation records the last success; a failure records the last error', () => {
    const client = createEngineClient(cannedTransport);
    expect(client.getLastSuccessAt()).toBeNull();
    expect(client.getLastError()).toBeNull();
    const before = Date.now();
    client.getHover('/ws/a.ts', { line: 0, character: 0 });
    const successAt = client.getLastSuccessAt();
    expect(successAt).not.toBeNull();
    expect(successAt as number).toBeGreaterThanOrEqual(before);
    expect(successAt as number).toBeLessThanOrEqual(Date.now());
    expect(client.getLastError()).toBeNull();
  });

  it('a failed operation records the error and leaves the last success alone', () => {
    const good = createEngineClient(cannedTransport);
    good.getHover('/ws/a.ts', { line: 0, character: 0 });
    const successAt = good.getLastSuccessAt();

    const failing = createEngineClient(throwingTransport);
    expect(failing.getHover('/ws/a.ts', { line: 0, character: 0 })).toBeNull();
    expect(failing.getLastSuccessAt()).toBeNull();
    expect(failing.getLastError()?.message).toBe('The engine is down');
    expect(failing.getLastError()?.at).toBeGreaterThanOrEqual(Date.now() - 1000);
    // A success on one client does not leak into another.
    expect(good.getLastSuccessAt()).toBe(successAt);
  });

  it('a successful health check records activity; a failed one records the error', async () => {
    const good = createEngineClient({
      ...cannedTransport,
      checkHealth: async () => 'ready' as EngineState,
    });
    expect(await good.checkHealth()).toBe('ready');
    expect(good.getLastSuccessAt()).not.toBeNull();

    const failing = createEngineClient({
      ...throwingTransport,
      checkHealth: async () => {
        throw new Error('probe failed');
      },
    });
    expect(await failing.checkHealth()).toBe('unreachable');
    expect(failing.getLastSuccessAt()).toBeNull();
    expect(failing.getLastError()?.message).toBe('probe failed');
  });
});
