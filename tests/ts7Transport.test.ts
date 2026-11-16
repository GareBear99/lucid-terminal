/**
 * The TypeScript 7 real-transport tests (Kite real transport —
 * 2026-11-15).
 *
 * The REAL `tsc --lsp --stdio` server (typescript-go 7.0.2),
 * through the async client — the same discipline as the
 * engineClient tests: no stubs for the engine. One shared
 * server per file (beforeAll/afterAll); the server-down
 * describes use their own clients.
 *
 * Run with: npx vitest run tests/ts7Transport.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  EngineRequestError,
  EngineStateError,
  type EngineMethod,
  type EngineMethodParams,
} from '../src/lib/engineClient';
import {
  createAsyncEngineClient,
  createTs7Transport,
  type AsyncEngineClient,
  type AsyncEngineTransport,
} from '../src/lib/ts7EngineClient';
import { resolveTs7Server } from '../src/lib/ts7LspTransport';
import { updateFileTree } from '../src/lib/treeSitter';

const APP = `export function greet(name: string): string {
  return 'hello ' + name;
}
export const answer = greet('world');
`;
const MEMBER = `const s = 'hello';\ns.\n`;
// `greet` in the call on line 4 (1-based): 'export const
// answer = ' is 22 chars, so the name spans columns
// 23–28 (1-based) — the probe sits inside it.
const CALL = { line: 3, character: 24 };

let tmpDir: string;
let appPath: string;
let memberPath: string;
let diagPath: string;
let client: AsyncEngineClient;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-ts7-test-'));
  fs.writeFileSync(
    path.join(tmpDir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'es2020',
          module: 'esnext',
          strict: true,
          noEmit: true,
        },
        include: ['*.ts'],
      },
      null,
      2,
    ),
  );
  appPath = path.join(tmpDir, 'app.ts');
  memberPath = path.join(tmpDir, 'member.ts');
  diagPath = path.join(tmpDir, 'diag.ts');
  fs.writeFileSync(appPath, APP);
  fs.writeFileSync(memberPath, MEMBER);
  fs.writeFileSync(diagPath, `export const bad: number = 'oops';\n`);
  const resolution = resolveTs7Server({ fromDir: process.cwd() });
  expect(resolution.kind).toBe('native');
  client = createAsyncEngineClient(
    createTs7Transport({ rootPath: tmpDir }),
  );
  expect(await client.ensureReady()).toBe(true);
  expect(client.isReady()).toBe(true);
  expect(client.transportName).toBe('typescript-7');
  expect(await client.checkHealth()).toBe('ready');
  expect(client.getState()).toBe('ready');
  expect(client.getEngineVersion()).toBe('7.0.2');
  await client.openDocument(appPath, APP);
  await client.openDocument(memberPath, MEMBER);
  await updateFileTree(appPath, APP);
}, 60000);

afterAll(async () => {
  await client.dispose();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}, 60000);

describe('the real TS 7 server, through the async client', () => {
  it('completions carry the real symbol (member + top-level)', async () => {
    const members = await client.getCompletions(memberPath, {
      line: 1,
      character: 2,
    });
    expect(members).not.toBeNull();
    expect(members?.items.map((i) => i.label)).toContain('charAt');
    // Top-level scope: completions at end-of-file include the
    // file's own declarations (this is also what
    // verifyIdentifier reads).
    const top = await client.getCompletions(appPath, {
      line: 4,
      character: 0,
    });
    expect(top).not.toBeNull();
    expect(top?.items.map((i) => i.label)).toContain('greet');
  }, 60000);

  it('resolve fills the detail + docs', async () => {
    const members = await client.getCompletions(memberPath, {
      line: 1,
      character: 2,
    });
    const item = members?.items.find((i) => i.label === 'charAt');
    expect(item?.resolveKey).toBeTruthy();
    const resolved = await client.resolveCompletion(memberPath, item!);
    expect(resolved?.detail).toContain('(method) charAt');
    expect(resolved?.documentation).toContain('Returns the character');
  }, 60000);

  it('hover returns the fenced signature + JSDoc shape', async () => {
    const hover = await client.getHover(appPath, CALL);
    expect(hover).not.toBeNull();
    expect(hover?.contents).toContain('greet');
    expect(hover?.contents.startsWith('```typescript')).toBe(true);
  }, 60000);

  it('signature help shows the call', async () => {
    const help = await client.getSignatureHelp(appPath, {
      line: 3,
      character: 28,
    });
    expect(help).not.toBeNull();
    expect(help?.signatures[0]?.label).toContain('greet(');
  }, 60000);

  it('didChange round-trips and the pull diagnostics follow it', async () => {
    const BAD = `export const bad: number = 'oops';\n`;
    const GOOD = `export const good: number = 1;\n`;
    await client.openDocument(diagPath, BAD);
    const dirty = await client.getDiagnostics(diagPath);
    expect(dirty.some((d) => d.code === 2322)).toBe(true);
    expect(dirty[0]?.source).toBe('ts');
    await client.changeDocument(diagPath, GOOD);
    expect(await client.getDiagnostics(diagPath)).toEqual([]);
    // And back: the change is really round-tripped, not stuck.
    await client.changeDocument(diagPath, BAD);
    expect(
      (await client.getDiagnostics(diagPath)).some((d) => d.code === 2322),
    ).toBe(true);
    await client.closeDocument(diagPath);
  }, 60000);

  it('checkEdit proves clean and dirty, and restores the original', async () => {
    expect(await client.getDiagnostics(appPath)).toEqual([]);
    const clean = await client.checkEdit(appPath, `${APP}export const b = 1;\n`);
    expect(clean.clean).toBe(true);
    const dirty = await client.checkEdit(appPath, 'const n: number = "hello";\n');
    expect(dirty.clean).toBe(false);
    expect(dirty.diagnostics.some((d) => d.code === 2322)).toBe(true);
    // The original is restored after the check.
    expect(await client.getDiagnostics(appPath)).toEqual([]);
    // checkEdit on a document that was never opened: open,
    // check, close — the document is not left open.
    const fresh = await client.checkEdit(
      path.join(tmpDir, 'fresh.ts'),
      'const n: number = "hello";\n',
    );
    expect(fresh.clean).toBe(false);
    expect(fresh.diagnostics.some((d) => d.code === 2322)).toBe(true);
  }, 60000);

  it('verify keeps the real name and drops the made-up one', async () => {
    expect(await client.verifyIdentifiers(appPath, ['greet', 'madeUpName'])).toEqual([
      'greet',
    ]);
    expect((await client.verifyIdentifier(appPath, 'greet'))?.kind).toBe(
      'Function',
    );
    expect(await client.verifyIdentifier(appPath, 'madeUpName')).toBeNull();
    // A keyword never verifies.
    expect(await client.verifyIdentifier(appPath, 'const')).toBeNull();
  }, 60000);

  it('the symbol report composes hover + definition + references', async () => {
    const report = await client.getSymbolReport(appPath, CALL, 'greet');
    expect(report?.identifier).toBe('greet');
    expect(report?.hover?.contents).toContain('greet');
    expect(report?.definition.length).toBeGreaterThan(0);
    expect(report?.definition[0]?.uri).toBe(appPath);
    expect(report?.definition[0]?.range.start.line).toBe(0);
    expect(report?.references.length).toBeGreaterThan(0);
  }, 60000);

  it('definition, references and document symbols agree', async () => {
    const defs = await client.getDefinition(appPath, CALL);
    expect(defs.length).toBeGreaterThan(0);
    expect(defs[0]?.uri).toBe(appPath);
    const refs = await client.getReferences(appPath, CALL);
    expect(refs.length).toBeGreaterThan(0);
    const symbols = await client.getDocumentSymbols(appPath);
    expect(symbols.map((s) => s.name)).toContain('greet');
  }, 60000);

  it('structure identifiers come from the live tree', () => {
    const names = client.getStructureIdentifiers(appPath, 4, 1);
    expect(names).toContain('greet');
  });

  it('patterns come from the shared index over the open files', () => {
    const files = [
      { path: path.join(tmpDir, 'p1.ts'), content: 'const repeatedLine = 1;\n' },
      { path: path.join(tmpDir, 'p2.ts'), content: 'const repeatedLine = 1;\n' },
    ];
    const patterns = client.getPatterns(files);
    expect(patterns.map((p) => p.text)).toContain('const repeatedLine = 1;');
    expect(
      client.getPatternCompletions(files, 'const repeatedLine', 5),
    ).toContain('const repeatedLine = 1;');
  });

  it('the server really publishes diagnostics (tsconfig)', async () => {
    // TS 7.0.2 publishes for the tsconfig, not for open .ts
    // files (see ts7LspTransport.ts) — the push path is
    // proven by the real publish. The publish fires once,
    // shortly after start, so check the cache first and only
    // subscribe-and-wait if it has not landed yet.
    const tsconfigPath = path.join(tmpDir, 'tsconfig.json');
    if (client.getPublishedDiagnostics(tsconfigPath) === undefined) {
      await new Promise<void>((resolve) => {
        const sub = client.onDidPublishDiagnostics((uri) => {
          if (uri.endsWith('tsconfig.json')) {
            sub.dispose();
            resolve();
          }
        });
        setTimeout(() => {
          sub.dispose();
          resolve();
        }, 15000);
      });
    }
    expect(client.getPublishedDiagnostics(tsconfigPath)).toEqual([]);
  }, 60000);
});

describe('the async client over a missing server', () => {
  let down: AsyncEngineClient;
  let downTransport: AsyncEngineTransport;

  beforeAll(async () => {
    downTransport = createTs7Transport({
      resolution: { kind: 'missing', reason: 'no server in this test' },
      rootPath: tmpDir,
    });
    down = createAsyncEngineClient(downTransport);
  });

  afterAll(async () => {
    await down.dispose();
  });

  it('checkHealth reports uninstalled and every call degrades to the empty result', async () => {
    expect(await down.checkHealth()).toBe('uninstalled');
    expect(down.getState()).toBe('uninstalled');
    expect(down.isReady()).toBe(false);
    expect(down.getEngineVersion()).toBeNull();
    expect(await down.getHover('/ws/a.ts', { line: 0, character: 0 })).toBeNull();
    expect(
      await down.getCompletions('/ws/a.ts', { line: 0, character: 0 }),
    ).toBeNull();
    expect(await down.getDiagnostics('/ws/a.ts')).toEqual([]);
    expect(
      await down.getDefinition('/ws/a.ts', { line: 0, character: 0 }),
    ).toEqual([]);
    expect(
      await down.getSymbolReport('/ws/a.ts', { line: 0, character: 0 }, 'greet'),
    ).toBeNull();
    // verifyIdentifiers degrades to pass-through when the
    // engine is down — no transport call, no emission.
    expect(await down.verifyIdentifiers('/ws/a.ts', ['greet'])).toEqual([
      'greet',
    ]);
    expect(
      await down.checkEdit('/ws/a.ts', 'const a = 1;\n'),
    ).toEqual({ clean: true, diagnostics: [] });
  }, 60000);

  it('a failure is one did-fail-request emission, and the brain-alive clock records it', async () => {
    const seen: Error[] = [];
    const sub = down.onDidFailRequest((error) => seen.push(error));
    expect(await down.getHover('/ws/a.ts', { line: 0, character: 0 })).toBeNull();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(EngineStateError);
    expect(down.getLastSuccessAt()).toBeNull();
    expect(down.getLastError()?.message).toContain('not ready');
    sub.dispose();
    await down.getHover('/ws/a.ts', { line: 0, character: 0 });
    expect(seen).toHaveLength(1);
  }, 60000);

  it('a document notification never throws, even with no server', async () => {
    await expect(
      down.openDocument('/ws/down.ts', 'const a = 1;\n'),
    ).resolves.toBeUndefined();
    await expect(
      down.changeDocument('/ws/down.ts', 'const a = 2;\n'),
    ).resolves.toBeUndefined();
    await expect(down.closeDocument('/ws/down.ts')).resolves.toBeUndefined();
  }, 60000);

  it('an unknown method throws the typed request error', async () => {
    await expect(
      downTransport.request(
        'kite/status' as EngineMethod,
        {} as EngineMethodParams[EngineMethod],
      ),
    ).rejects.toThrow(EngineRequestError);
    try {
      await downTransport.request(
        'kite/status' as EngineMethod,
        {} as EngineMethodParams[EngineMethod],
      );
    } catch (error) {
      expect((error as EngineRequestError).code).toBe('unknown_method');
    }
  }, 60000);
});

describe('pre-start documents and crash recovery', () => {
  it('a document opened before the engine is up is held and answered once it starts', async () => {
    const early = createAsyncEngineClient(
      createTs7Transport({ rootPath: tmpDir }),
    );
    try {
      await early.openDocument(appPath, APP);
      expect(early.isReady()).toBe(false);
      expect(await early.ensureReady()).toBe(true);
      const hover = await early.getHover(appPath, CALL);
      expect(hover?.contents).toContain('greet');
    } finally {
      await early.dispose();
    }
  }, 60000);

  it('a killed server restarts transparently and re-sends its open documents', async () => {
    const { Ts7LspClient, mapHover, pathToUri } = await import(
      '../src/lib/ts7LspTransport'
    );
    const raw = new Ts7LspClient({ rootPath: tmpDir });
    try {
      expect(await raw.start()).toBe(true);
      raw.openDocument(appPath, APP);
      const hover1 = mapHover(
        await raw.request('textDocument/hover', {
          textDocument: { uri: pathToUri(appPath) },
          position: CALL,
        }),
      );
      expect(hover1?.contents).toContain('greet');
      raw.terminateForTests();
      expect(raw.isReady()).toBe(false);
      // The next request restarts the server — and the
      // restart re-sends the open document, so the same
      // hover still answers instead of going silent.
      const hover2 = mapHover(
        await raw.request('textDocument/hover', {
          textDocument: { uri: pathToUri(appPath) },
          position: CALL,
        }),
      );
      expect(raw.isReady()).toBe(true);
      expect(hover2?.contents).toContain('greet');
    } finally {
      await raw.dispose().catch(() => undefined);
    }
  }, 60000);
});

describe('brain-alive activity (Atom steal #16, async)', () => {
  it('a successful operation records the last success', async () => {
    const before = Date.now();
    await client.getHover(appPath, CALL);
    const successAt = client.getLastSuccessAt();
    expect(successAt).not.toBeNull();
    expect(successAt as number).toBeGreaterThanOrEqual(before);
    expect(successAt as number).toBeLessThanOrEqual(Date.now());
  }, 60000);
});
