/**
 * Packaging config tests.
 *
 * The packaged app's backend lives in <resources>/LUCID-BACKEND — NOT in
 * app.asar. electron/services/local_ai.ts spawns
 * <resources>/LUCID-BACKEND/core/stdio_agent.py and electron/ipc/daemon.ts
 * spawns <resources>/LUCID-BACKEND/core/lucifer_watcher.py, and python3
 * cannot spawn a script from inside an asar archive. So the backend is
 * shipped via package.json `build.extraResources` (copied unpacked into
 * resources/), NOT via `build.files` (which lands inside app.asar).
 *
 * Only the Python runtime the packaged app actually spawns is shipped —
 * core/ plus the modules core/ imports from outside itself (tools/,
 * luci/, the lazily-imported lucifer.py, and
 * games/soul_combat/demo_physics_combat.py). Deliberately EXCLUDED:
 *   - bin/ (132 MB llamafile split parts) — no runtime code reads them:
 *     the canonical llamafile path is <project>/.luciferai/bin/llamafile
 *     (LUCID-BACKEND/core/lucifer_paths.py) and the Electron side
 *     downloads its own llamafile to ~/.lucid/llamafiles/. The parts are
 *     only consumed by the lucifer.py CLI first-run assembler, which the
 *     packaged app never runs (it spawns core/stdio_agent.py and
 *     core/lucifer_watcher.py).
 *   - models/ (638 MB, incl. the 668 MB TinyLlama GGUF) — models download
 *     on demand via Install TinyLlama.
 *   - media/ (97 MB) — not referenced by either packaged entry point.
 * Total shipped backend is ~2.1 MB instead of 872 MB.
 *
 * These tests compute the EFFECTIVE shipped file list from package.json's
 * extraResources + minimatch filters over the real repo tree (the same
 * selection electron-builder performs), so a config regression that would
 * ship the 872 MB tree — or drop core/ — fails here instead of on the Mac.
 *
 * NOTE: package.json must stay valid plain JSON (no // comments) — this
 * file JSON.parses it, so a comment regression fails loudly here.
 *
 * Run with: npm test
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { minimatch } from 'minimatch';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface ExtraResource {
  from: string;
  to: string;
  filter?: string[];
}

function readPackageJson(): any {
  const raw = fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8');
  return JSON.parse(raw);
}

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

/** Walk a directory, returning repo-relative posix paths of all files. */
function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full));
    } else if (entry.isFile()) {
      out.push(toPosix(path.relative(repoRoot, full)));
    }
  }
  return out;
}

/**
 * The effective extraResources file list, as electron-builder would copy
 * it: for each entry, every file under `from` whose path relative to
 * `from` matches any filter pattern (no filter = everything), mapped to
 * its `to` destination. Returned as destination paths relative to the
 * resources/ directory.
 */
function effectiveExtraResources(build: any): string[] {
  const shipped: string[] = [];
  const entries: ExtraResource[] = build.extraResources ?? [];
  for (const entry of entries) {
    const fromAbs = path.join(repoRoot, entry.from);
    const stat = fs.statSync(fromAbs);
    const candidates: { srcRel: string; fromRel: string }[] = [];
    if (stat.isFile()) {
      candidates.push({ srcRel: toPosix(entry.from), fromRel: path.basename(entry.from) });
    } else {
      for (const srcRel of walkFiles(fromAbs)) {
        candidates.push({ srcRel, fromRel: toPosix(path.relative(fromAbs, path.join(repoRoot, srcRel))) });
      }
    }
    for (const { srcRel, fromRel } of candidates) {
      const included =
        !entry.filter || entry.filter.some((pattern) => minimatch(fromRel, pattern));
      if (included) {
        shipped.push(toPosix(path.join(entry.to, path.relative(entry.from, srcRel))));
      }
    }
  }
  return shipped;
}

describe('packaging: package.json is valid and shippable', () => {
  test('package.json parses as plain JSON (no comments allowed)', () => {
    const raw = fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(raw).not.toMatch(/^\s*\/\//m);
  });

  test('mac target is an explicit dmg (arm64 + x64) with a .icns icon', () => {
    const build = readPackageJson().build;
    expect(build.mac).toBeDefined();
    expect(build.mac.target).toEqual([{ target: 'dmg', arch: ['arm64', 'x64'] }]);
    expect(build.mac.icon).toMatch(/\.icns$/);
    expect(fs.existsSync(path.join(repoRoot, build.mac.icon))).toBe(true);
  });

  test('win nsis target is unchanged', () => {
    const build = readPackageJson().build;
    expect(build.win.target).toEqual([{ target: 'nsis', arch: ['x64'] }]);
    expect(build.win.icon).toBe('resources/icon.ico');
  });

  test('window icon files exist and the .icns is a real icns container', () => {
    const icns = path.join(repoRoot, 'resources', 'icon.icns');
    const ico = path.join(repoRoot, 'resources', 'icon.ico');
    expect(fs.existsSync(icns)).toBe(true);
    expect(fs.existsSync(ico)).toBe(true);
    expect(fs.readFileSync(icns).subarray(0, 4).toString('latin1')).toBe('icns');
    expect(fs.readFileSync(ico).subarray(0, 4).toString('hex')).toBe('00000100');
  });
});

describe('packaging: backend extraResources file list', () => {
  const build = readPackageJson().build;
  const shipped = effectiveExtraResources(build);

  test('packaged backend entry points are shipped', () => {
    expect(shipped).toContain('LUCID-BACKEND/core/stdio_agent.py');
    expect(shipped).toContain('LUCID-BACKEND/core/lucifer_watcher.py');
  });

  test('core/ runtime data and the modules core/ imports are shipped', () => {
    expect(shipped).toContain('LUCID-BACKEND/core/consensus_admins.json');
    expect(shipped).toContain('LUCID-BACKEND/tools/file_tools.py');
    expect(shipped).toContain('LUCID-BACKEND/tools/command_tools.py');
    expect(shipped).toContain('LUCID-BACKEND/luci/package_manager.py');
    expect(shipped).toContain('LUCID-BACKEND/lucifer.py');
    expect(shipped).toContain('LUCID-BACKEND/games/soul_combat/demo_physics_combat.py');
  });

  test('no models/, media/ or bin/ files are shipped', () => {
    const banned = shipped.filter(
      (f) =>
        f.startsWith('LUCID-BACKEND/models/') ||
        f.startsWith('LUCID-BACKEND/media/') ||
        f.startsWith('LUCID-BACKEND/bin/'),
    );
    expect(banned).toEqual([]);
  });

  test('no GGUF model, llamafile part, or __pycache__ bytecode is shipped', () => {
    const banned = shipped.filter(
      (f) => f.endsWith('.gguf') || f.includes('llamafile.part.') || f.includes('__pycache__'),
    );
    expect(banned).toEqual([]);
  });

  test('no extraResources or files entry references models/, media/ or bin/', () => {
    const configText = JSON.stringify(build);
    for (const dir of ['models/', 'media/', 'bin/']) {
      expect(configText).not.toContain(`LUCID-BACKEND/${dir}`);
    }
  });

  test('shipped backend stays small (core + deps, not the 872 MB tree)', () => {
    let totalBytes = 0;
    for (const dest of shipped) {
      const entry = (build.extraResources as ExtraResource[]).find((e) =>
        dest.startsWith(e.to),
      );
      if (!entry) continue;
      const src = path.join(repoRoot, entry.from, path.relative(entry.to, dest));
      totalBytes += fs.statSync(src).size;
    }
    // ~2.1 MB today (core .py/.json + tools/luci/lucifer.py/icons). 20 MB of
    // headroom still catches a bin/ (132 MB) or models/ (638 MB) slip.
    expect(totalBytes).toBeLessThan(20 * 1024 * 1024);
  });
});

describe('packaging: reproducible installs', () => {
  test('package-lock.json is tracked, not gitignored', () => {
    const gitignore = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf-8');
    const ignored = gitignore
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    expect(ignored).not.toContain('package-lock.json');
    expect(fs.existsSync(path.join(repoRoot, 'package-lock.json'))).toBe(true);
  });

  test('CI installs with npm ci, not npm install', () => {
    const workflow = fs.readFileSync(
      path.join(repoRoot, '.github', 'workflows', 'test.yml'),
      'utf-8',
    );
    expect(workflow).toContain('npm ci ');
    expect(workflow).not.toContain('npm install');
  });
});
