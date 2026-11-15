/**
 * ARC Server add-on fetch tests (Gary, 2026-11-14 ~14:53
 * PST: ARC Server is an installable add-on, fetched at
 * install time from its repo, never bundled in Lucid).
 *
 * The rules under test:
 * - The HEAD SHA comes from the GitHub API; the tarball
 *   comes from codeload for that exact SHA (a SHA never
 *   moves; a branch name does).
 * - Download to a STAGING file/dir, never straight into
 *   the installed location. The installed directory appears
 *   by one atomic rename, only after the shape verifies
 *   (Makefile + src/arc-server.c + README.md — there is no
 *   published hash to verify against, and the code says so).
 * - A failed fetch / bad shape deletes the staging files
 *   and leaves an installed version untouched.
 * - An already-installed copy of the same SHA is a no-op
 *   success (no re-download).
 * - Uninstall removes every fetched copy.
 *
 * The fetch runs against a local HTTP server (the service
 * takes apiBase + codeloadBase test seams; production uses
 * the real GitHub hosts). Each test uses a fresh temp dir
 * as the home dir, so nothing touches ~/.lucid/addons.
 *
 * Run with: npx vitest run tests/arcServerDownload.test.ts
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ARC_SERVER_SHAPE_FILES,
  arcServerStatus,
  extractArcServerTarball,
  fetchArcServerHeadSha,
  installArcServer,
  resolveArcServerDir,
  uninstallArcServer,
  verifyArcServerShape,
} from '../electron/services/arcServerDownload';

const SHA = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
const BAD_SHA = 'f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5';

let tmpRoot: string;
let goodTarball: string;
let badTarball: string;

function makeFixture(topDir: string, good: boolean): string {
  const dir = path.join(tmpRoot, topDir);
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'Makefile'), 'all:\n\techo build\n');
  if (good) {
    fs.writeFileSync(path.join(dir, 'src', 'arc-server.c'), 'int main(void){return 0;}\n');
  }
  fs.writeFileSync(path.join(dir, 'README.md'), '# ARC Server\n');
  return dir;
}

function tarballFor(fixtureDir: string, topName: string): string {
  const out = path.join(tmpRoot, `${topName}.tar.gz`);
  execFileSync('tar', ['-czf', out, '-C', path.dirname(fixtureDir), topName]);
  return out;
}

interface TestServer {
  baseUrl: string;
  hits: { api: number; tarball: number };
  close: () => Promise<void>;
}

function startServer(opts: {
  sha: string;
  tarball: string;
  apiStatus?: number;
}): Promise<TestServer> {
  const hits = { api: 0, tarball: 0 };
  const server = http.createServer((req, res) => {
    if (req.url === '/repos/GareBear99/ARC-Server/commits/main') {
      hits.api += 1;
      if (opts.apiStatus && opts.apiStatus !== 200) {
        res.writeHead(opts.apiStatus);
        res.end('error');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sha: opts.sha }));
      return;
    }
    if (req.url === `/GareBear99/ARC-Server/tar.gz/${opts.sha}`) {
      hits.tarball += 1;
      res.writeHead(200, { 'Content-Type': 'application/gzip' });
      fs.createReadStream(opts.tarball).pipe(res);
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({
        baseUrl: `http://127.0.0.1:${addr.port}`,
        hits,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-server-addon-'));
  const goodDir = makeFixture(`ARC-Server-${SHA}`, true);
  goodTarball = tarballFor(goodDir, `ARC-Server-${SHA}`);
  const badDir = makeFixture(`ARC-Server-${BAD_SHA}`, false);
  badTarball = tarballFor(badDir, `ARC-Server-${BAD_SHA}`);
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function freshHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'arc-server-home-'));
}

describe('resolveArcServerDir', () => {
  it('lives under ~/.lucid/addons/arc-server', () => {
    expect(resolveArcServerDir('/Users/gary')).toBe(
      '/Users/gary/.lucid/addons/arc-server',
    );
  });
});

describe('verifyArcServerShape', () => {
  it('passes a directory with Makefile + src/arc-server.c + README.md', () => {
    expect(
      verifyArcServerShape(path.join(tmpRoot, `ARC-Server-${SHA}`)),
    ).toBe(true);
  });

  it('fails a directory missing src/arc-server.c', () => {
    expect(
      verifyArcServerShape(path.join(tmpRoot, `ARC-Server-${BAD_SHA}`)),
    ).toBe(false);
  });

  it('fails a missing directory', () => {
    expect(verifyArcServerShape(path.join(tmpRoot, 'nope'))).toBe(false);
  });

  it('the shape list is exactly the three files', () => {
    expect(ARC_SERVER_SHAPE_FILES).toEqual([
      'Makefile',
      'src/arc-server.c',
      'README.md',
    ]);
  });
});

describe('fetchArcServerHeadSha', () => {
  test('returns the SHA from the API', async () => {
    const server = await startServer({ sha: SHA, tarball: goodTarball });
    try {
      await expect(fetchArcServerHeadSha(server.baseUrl)).resolves.toBe(SHA);
    } finally {
      await server.close();
    }
  });

  test('throws when the API answers non-200', async () => {
    const server = await startServer({
      sha: SHA,
      tarball: goodTarball,
      apiStatus: 500,
    });
    try {
      await expect(fetchArcServerHeadSha(server.baseUrl)).rejects.toThrow();
    } finally {
      await server.close();
    }
  });
});

describe('extractArcServerTarball', () => {
  test('strips the top-level dir — Makefile lands at the destination root', async () => {
    const dest = path.join(tmpRoot, 'extracted');
    await extractArcServerTarball(goodTarball, dest);
    expect(fs.existsSync(path.join(dest, 'Makefile'))).toBe(true);
    expect(fs.existsSync(path.join(dest, 'src', 'arc-server.c'))).toBe(true);
    expect(fs.existsSync(path.join(dest, `ARC-Server-${SHA}`))).toBe(false);
  });
});

describe('installArcServer', () => {
  test('fetches, extracts, verifies, and lands in a versioned directory', async () => {
    const server = await startServer({ sha: SHA, tarball: goodTarball });
    const home = freshHome();
    try {
      const result = await installArcServer({
        apiBase: server.baseUrl,
        codeloadBase: server.baseUrl,
        homeDir: home,
      });
      expect(result.ok).toBe(true);
      expect(result.version).toBe(SHA);
      expect(result.path).toBe(
        path.join(resolveArcServerDir(home), SHA),
      );
      expect(verifyArcServerShape(result.path!)).toBe(true);
      expect(server.hits.tarball).toBe(1);
      // No staging files left behind.
      expect(
        fs.readdirSync(resolveArcServerDir(home)),
      ).toEqual([SHA]);
    } finally {
      await server.close();
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test('an already-installed copy of the same SHA is a no-op (no re-download)', async () => {
    const server = await startServer({ sha: SHA, tarball: goodTarball });
    const home = freshHome();
    try {
      const first = await installArcServer({
        apiBase: server.baseUrl,
        codeloadBase: server.baseUrl,
        homeDir: home,
      });
      expect(first.ok).toBe(true);
      const second = await installArcServer({
        apiBase: server.baseUrl,
        codeloadBase: server.baseUrl,
        homeDir: home,
      });
      expect(second.ok).toBe(true);
      expect(second.version).toBe(SHA);
      expect(server.hits.tarball).toBe(1);
    } finally {
      await server.close();
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test('a bad-shape tarball fails and installs nothing', async () => {
    const server = await startServer({ sha: BAD_SHA, tarball: badTarball });
    const home = freshHome();
    try {
      const result = await installArcServer({
        apiBase: server.baseUrl,
        codeloadBase: server.baseUrl,
        homeDir: home,
      });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/missing expected files/);
      expect(fs.existsSync(path.join(resolveArcServerDir(home), BAD_SHA))).toBe(
        false,
      );
      // No staging files left behind either.
      expect(fs.readdirSync(resolveArcServerDir(home))).toEqual([]);
    } finally {
      await server.close();
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test('an API failure fails and installs nothing', async () => {
    const server = await startServer({
      sha: SHA,
      tarball: goodTarball,
      apiStatus: 500,
    });
    const home = freshHome();
    try {
      const result = await installArcServer({
        apiBase: server.baseUrl,
        codeloadBase: server.baseUrl,
        homeDir: home,
      });
      expect(result.ok).toBe(false);
      expect(fs.existsSync(resolveArcServerDir(home))).toBe(false);
    } finally {
      await server.close();
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});

describe('uninstallArcServer + arcServerStatus', () => {
  test('status is not-installed before install, installed after, not-installed after uninstall', async () => {
    const server = await startServer({ sha: SHA, tarball: goodTarball });
    const home = freshHome();
    try {
      expect(arcServerStatus(home).installed).toBe(false);
      const installed = await installArcServer({
        apiBase: server.baseUrl,
        codeloadBase: server.baseUrl,
        homeDir: home,
      });
      expect(installed.ok).toBe(true);
      const after = arcServerStatus(home);
      expect(after.installed).toBe(true);
      expect(after.version).toBe(SHA);
      expect(after.path).toBe(path.join(resolveArcServerDir(home), SHA));
      const removed = await uninstallArcServer(home);
      expect(removed.ok).toBe(true);
      expect(arcServerStatus(home).installed).toBe(false);
      expect(fs.existsSync(resolveArcServerDir(home))).toBe(false);
    } finally {
      await server.close();
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test('uninstall on nothing installed still succeeds', async () => {
    const home = freshHome();
    try {
      await expect(uninstallArcServer(home)).resolves.toEqual({ ok: true });
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
