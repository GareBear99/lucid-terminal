/**
 * The TS 7 server-resolution + LSP→contract mapping tests
 * (Kite real transport — 2026-11-15).
 *
 * Pure functions, no server: the resolver against real and
 * fake `node_modules` trees, and every mapper against canned
 * server payloads (shapes taken from the live probes).
 *
 * Run with: npx vitest run tests/ts7ServerResolve.test.ts
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  mapCompletionList,
  mapDiagnostics,
  mapDocumentSymbols,
  mapHover,
  mapLocations,
  mapResolvedCompletionItem,
  mapSignatureHelp,
  markupToString,
  pathToUri,
  resolveTs7Server,
  ts7PlatformPackageName,
  uriToPath,
} from '../src/lib/ts7LspTransport';

describe('resolveTs7Server', () => {
  it('resolves the native binary from the real install', () => {
    const resolution = resolveTs7Server({ fromDir: process.cwd() });
    expect(resolution.kind).toBe('native');
    if (resolution.kind === 'native') {
      expect(resolution.binaryPath.endsWith('/lib/tsc')).toBe(true);
      expect(fs.existsSync(resolution.binaryPath)).toBe(true);
      expect(resolution.args).toEqual(['--lsp', '--stdio']);
    }
  });

  it('reports missing from an empty tree', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-ts7-empty-'));
    try {
      const resolution = resolveTs7Server({ fromDir: empty });
      expect(resolution.kind).toBe('missing');
      if (resolution.kind === 'missing') {
        expect(resolution.reason).toContain(ts7PlatformPackageName());
      }
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  it('honours LUCID_TS7_SERVER_PATH, and reports a missing override', () => {
    const real = resolveTs7Server({ fromDir: process.cwd() });
    expect(real.kind).toBe('native');
    const binary =
      real.kind === 'native' ? real.binaryPath : fail('no native binary');
    const viaEnv = resolveTs7Server({
      fromDir: process.cwd(),
      env: { ...process.env, LUCID_TS7_SERVER_PATH: binary },
    });
    expect(viaEnv.kind).toBe('native');
    if (viaEnv.kind === 'native') expect(viaEnv.binaryPath).toBe(binary);
    const missing = resolveTs7Server({
      fromDir: process.cwd(),
      env: { ...process.env, LUCID_TS7_SERVER_PATH: '/no/such/tsc' },
    });
    expect(missing.kind).toBe('missing');
  });

  it('falls back to the JS wrapper when the platform package is absent', () => {
    // A fake tree with typescript-7/bin/tsc but no platform
    // package: the resolver must find the wrapper.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lucid-ts7-fake-'));
    try {
      const ts7Dir = path.join(root, 'node_modules', 'typescript-7');
      fs.mkdirSync(path.join(ts7Dir, 'bin'), { recursive: true });
      fs.writeFileSync(path.join(ts7Dir, 'package.json'), '{"name":"typescript-7"}');
      fs.writeFileSync(path.join(ts7Dir, 'bin', 'tsc'), '#!/usr/bin/env node\n');
      const resolution = resolveTs7Server({ fromDir: root });
      expect(resolution.kind).toBe('wrapper');
      if (resolution.kind === 'wrapper') {
        expect(resolution.command).toBe(process.execPath);
        expect(resolution.args).toEqual([
          path.join(ts7Dir, 'bin', 'tsc'),
          '--lsp',
          '--stdio',
        ]);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('path/uri conversion', () => {
  it('round-trips a path with a space', () => {
    const p = '/tmp/some dir/app.ts';
    expect(uriToPath(pathToUri(p))).toBe(p);
    expect(pathToUri(p)).toBe('file:///tmp/some%20dir/app.ts');
  });
});

describe('markupToString', () => {
  it('passes strings through and reads MarkupContent values', () => {
    expect(markupToString('x')).toBe('x');
    expect(markupToString({ kind: 'markdown', value: 'y' })).toBe('y');
    expect(markupToString(undefined)).toBeUndefined();
    expect(markupToString(null)).toBeUndefined();
    expect(markupToString(42)).toBeUndefined();
  });
});

describe('mapHover', () => {
  it('passes markdown through, wraps plaintext in the fenced shape', () => {
    expect(
      mapHover({
        contents: { kind: 'markdown', value: '```typescript\nconst a: number\n```' },
      })?.contents,
    ).toBe('```typescript\nconst a: number\n```');
    expect(
      mapHover({ contents: { kind: 'plaintext', value: 'const a: number' } })
        ?.contents,
    ).toBe('```typescript\nconst a: number\n```');
    expect(mapHover({ contents: 'plain' })?.contents).toBe('plain');
    expect(mapHover(null)).toBeNull();
    expect(mapHover({})).toBeNull();
  });
});

describe('mapCompletionList', () => {
  it('maps a CompletionList, a bare array, and null', () => {
    const list = mapCompletionList({
      isIncomplete: false,
      items: [
        { label: 'charAt', kind: 2, sortText: '11' },
        { label: { label: 'toString', detail: 'd' }, kind: 2 },
        { label: 'no-kind' },
        { label: 42, kind: 2 },
      ],
    });
    expect(list?.items.map((i) => i.label)).toEqual([
      'charAt',
      'toString',
      'no-kind',
    ]);
    expect(list?.items[0]?.kind).toBe(2);
    expect(list?.items[2]?.kind).toBe(10);
    expect(mapCompletionList([{ label: 'a', kind: 6 }])?.items).toHaveLength(1);
    expect(mapCompletionList(null)).toBeNull();
    expect(mapCompletionList({})).toBeNull();
  });
});

describe('mapResolvedCompletionItem', () => {
  it('fills detail + docs + edits, and returns the item unchanged without a result', () => {
    const item = { label: 'charAt', kind: 2 as const };
    const resolved = mapResolvedCompletionItem(
      {
        label: 'charAt',
        kind: 2,
        detail: '(method) charAt(pos: number): string',
        documentation: { kind: 'markdown', value: 'Returns the character.' },
        additionalTextEdits: [
          {
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 0 },
            },
            newText: "import {} from 'x';\n",
          },
        ],
      },
      item,
    );
    expect(resolved?.detail).toBe('(method) charAt(pos: number): string');
    expect(resolved?.documentation).toContain('Returns the character');
    expect(resolved?.additionalTextEdits).toHaveLength(1);
    expect(mapResolvedCompletionItem(null, item)).toBe(item);
  });
});

describe('mapLocations', () => {
  it('maps Locations, DefinitionLinks, a single Location, and null', () => {
    expect(
      mapLocations([
        { uri: 'file:///a.ts', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } },
      ]),
    ).toHaveLength(1);
    expect(
      mapLocations([
        {
          targetUri: 'file:///a.ts',
          targetSelectionRange: { start: { line: 1, character: 2 }, end: { line: 1, character: 5 } },
          targetRange: { start: { line: 1, character: 0 }, end: { line: 3, character: 0 } },
        },
      ]),
    ).toEqual([
      {
        uri: 'file:///a.ts',
        range: { start: { line: 1, character: 2 }, end: { line: 1, character: 5 } },
      },
    ]);
    expect(
      mapLocations({
        uri: 'file:///a.ts',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      }),
    ).toHaveLength(1);
    expect(mapLocations(null)).toEqual([]);
  });
});

describe('mapDocumentSymbols', () => {
  it('maps flat SymbolInformation (the TS 7 form) and hierarchical DocumentSymbols', () => {
    const flat = mapDocumentSymbols([
      {
        name: 'greet',
        kind: 12,
        location: {
          uri: 'file:///a.ts',
          range: { start: { line: 0, character: 0 }, end: { line: 2, character: 1 } },
        },
      },
    ]);
    expect(flat).toHaveLength(1);
    expect(flat[0]?.name).toBe('greet');
    expect(flat[0]?.range).toEqual(flat[0]?.selectionRange);
    const tree = mapDocumentSymbols([
      {
        name: 'Cls',
        kind: 5,
        range: { start: { line: 0, character: 0 }, end: { line: 5, character: 1 } },
        selectionRange: { start: { line: 0, character: 6 }, end: { line: 0, character: 9 } },
        children: [
          {
            name: 'm',
            kind: 6,
            range: { start: { line: 1, character: 2 }, end: { line: 1, character: 10 } },
            selectionRange: { start: { line: 1, character: 2 }, end: { line: 1, character: 3 } },
          },
        ],
      },
    ]);
    expect(tree[0]?.children?.map((c) => c.name)).toEqual(['m']);
    expect(mapDocumentSymbols(null)).toEqual([]);
  });
});

describe('mapSignatureHelp', () => {
  it('maps signatures, normalises parameter labels, returns null when empty', () => {
    const help = mapSignatureHelp({
      signatures: [
        {
          label: 'add(a: number, b: number): number',
          documentation: { kind: 'plaintext', value: 'Adds two numbers.' },
          parameters: [{ label: 'a: number' }, { label: [15, 24] }],
        },
      ],
      activeSignature: 0,
      activeParameter: 1,
    });
    expect(help?.signatures[0]?.label).toBe('add(a: number, b: number): number');
    expect(help?.signatures[0]?.documentation).toBe('Adds two numbers.');
    expect(help?.signatures[0]?.parameters[0]?.label).toBe('a: number');
    expect(help?.signatures[0]?.parameters[1]?.label).toBe('b: number');
    expect(help?.activeParameter).toBe(1);
    expect(mapSignatureHelp({ signatures: [] })).toBeNull();
    expect(mapSignatureHelp(null)).toBeNull();
  });
});

describe('mapDiagnostics', () => {
  it('maps items, coerces string codes, defaults severity, forces source ts', () => {
    const out = mapDiagnostics([
      {
        range: { start: { line: 0, character: 13 }, end: { line: 0, character: 16 } },
        severity: 1,
        code: 2322,
        source: 'typescript',
        message: "Type 'string' is not assignable to type 'number'.",
      },
      {
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 1 } },
        code: '6133',
        message: 'unused',
      },
      { message: 'no range, dropped' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      range: { start: { line: 0, character: 13 }, end: { line: 0, character: 16 } },
      severity: 1,
      code: 2322,
      source: 'ts',
      message: "Type 'string' is not assignable to type 'number'.",
    });
    expect(out[1]?.code).toBe(6133);
    expect(out[1]?.severity).toBe(1);
    expect(mapDiagnostics(null)).toEqual([]);
  });
});

function fail(message: string): never {
  throw new Error(message);
}
