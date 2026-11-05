/**
 * Model enable/disable — wired for real (2026-11-05).
 *
 * Hand-checkable case (defined BEFORE running, per verify_generated_code):
 * disable a model → the router stops routing to it (isModelEnabled is
 * false, getBestAvailableModel no longer picks it). Restart (a fresh
 * LucidCore.initialize against the same home dir, which re-seeds from
 * ~/.lucid/llm_state.json) → the disabled state persists. Re-enable →
 * routing resumes.
 *
 * Coverage:
 * 1. llm_state.json round-trip (save/load, missing file, corrupt file,
 *    wrong shape, non-string entries filtered).
 * 2. Router-level: disable/enable round-trip, backend-manager mirror,
 *    unknown-model and not-installed failures, persist-hook failure
 *    reverts the in-memory change, seeding from a persisted list
 *    (including stale names) survives refreshAvailableModels.
 * 3. LucidCore-level: full disable → restart → still disabled →
 *    re-enable round-trip through the real state file in a TEMP home
 *    dir (never the real ~/.lucid), plus corrupt-file startup.
 *
 * SAFETY NOTE (same rule as bypassRouter.test.ts): temp directories
 * are the ONLY things tests delete. rmTempDir refuses anything
 * outside os.tmpdir(). The repo root is never deleted — it is only
 * read (the TinyLlama GGUF under LUCID-BACKEND/models is what makes
 * `tinyllama` "installed" for the LucidCore-level tests).
 *
 * Run with: npm test
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BypassRouter } from '../electron/core/llm/bypassRouter';
import { ModelBackendManager } from '../electron/core/llm/modelBackend';
import { ModelTierRegistry } from '../electron/core/models/modelTiers';
import { TokenTracker } from '../electron/core/tracking/tokenTracker';
import {
  loadDisabledModels,
  saveDisabledModels,
} from '../electron/core/llm/modelEnabledState';
import LucidCore from '../electron/core/lucidCore';

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Best-effort recursive delete of a TEMP dir only. Never call on an app root. */
function rmTempDir(dir: string): void {
  const tmpRoot = path.resolve(os.tmpdir());
  if (!path.resolve(dir).startsWith(tmpRoot)) {
    throw new Error(`refusing to delete non-temp dir: ${dir}`);
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best-effort temp cleanup.
  }
}

function writeGguf(dir: string, name: string, size = 1024): string {
  const file = path.join(dir, name);
  const buf = Buffer.alloc(size);
  buf.write('GGUF', 0, 'ascii');
  fs.writeFileSync(file, buf);
  return file;
}

/** Backend dir layout the router scans: <appRoot>/LUCID-BACKEND/models */
function makeBackendModelsDir(appRoot: string): string {
  const dir = path.join(appRoot, 'LUCID-BACKEND', 'models');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function makeBackend(): ModelBackendManager {
  const backend = new ModelBackendManager();
  backend.register('tinyllama', {
    name: 'tinyllama',
    tier: 0,
    provider: 'llamafile',
    endpoint: 'http://localhost:8080',
  });
  backend.register('mistral', {
    name: 'mistral',
    tier: 2,
    provider: 'llamafile',
    endpoint: 'http://localhost:8082',
  });
  return backend;
}

describe('llm_state.json (modelEnabledState)', () => {
  test('save/load round-trips the disabled list, sorted', () => {
    const lucidDir = makeTempDir('lucid-state-');
    try {
      expect(loadDisabledModels(lucidDir)).toEqual([]);
      saveDisabledModels(lucidDir, ['mistral', 'tinyllama']);
      expect(loadDisabledModels(lucidDir)).toEqual(['mistral', 'tinyllama']);
      // Sorted on disk regardless of input order.
      const raw = JSON.parse(
        fs.readFileSync(path.join(lucidDir, 'llm_state.json'), 'utf-8')
      );
      expect(raw.version).toBe(1);
      expect(raw.disabledModels).toEqual(['mistral', 'tinyllama']);
      saveDisabledModels(lucidDir, []);
      expect(loadDisabledModels(lucidDir)).toEqual([]);
    } finally {
      rmTempDir(lucidDir);
    }
  });

  test('missing file, corrupt file, and wrong shape all mean "none disabled" — never throw', () => {
    const lucidDir = makeTempDir('lucid-state-bad-');
    try {
      expect(loadDisabledModels(lucidDir)).toEqual([]);
      fs.writeFileSync(
        path.join(lucidDir, 'llm_state.json'),
        '{not json'
      );
      expect(loadDisabledModels(lucidDir)).toEqual([]);
      fs.writeFileSync(
        path.join(lucidDir, 'llm_state.json'),
        JSON.stringify({ disabledModels: 'mistral' })
      );
      expect(loadDisabledModels(lucidDir)).toEqual([]);
      fs.writeFileSync(
        path.join(lucidDir, 'llm_state.json'),
        JSON.stringify({ disabledModels: ['mistral', 42, null] })
      );
      expect(loadDisabledModels(lucidDir)).toEqual(['mistral']);
    } finally {
      rmTempDir(lucidDir);
    }
  });
});

describe('BypassRouter — canonical enable system', () => {
  interface Fixture {
    router: BypassRouter;
    backend: ModelBackendManager;
    trackingDir: string;
    appRoot: string;
    persisted: string[][];
  }

  function makeFixture(opts?: {
    onEnabledChange?: (disabled: string[]) => void;
  }): Fixture {
    const appRoot = makeTempDir('lucid-enabled-app-');
    const modelsDir = makeBackendModelsDir(appRoot);
    writeGguf(modelsDir, 'mistral-7b-instruct-v0.3.Q4_K_M.gguf');
    const backend = makeBackend();
    const trackingDir = makeTempDir('lucid-enabled-tracker-');
    const tracker = new TokenTracker(trackingDir);
    const persisted: string[][] = [];
    const router = new BypassRouter(new ModelTierRegistry(), tracker, backend, {
      appRoot,
      onEnabledChange:
        opts?.onEnabledChange ??
        ((disabled) => {
          persisted.push([...disabled]);
        }),
    });
    // The file is validated by the refresh; the server is "up" so the
    // routing decision reaches the model instead of "not running".
    backend.setModelRunning('mistral', true);
    return { router, backend, trackingDir, appRoot, persisted };
  }

  function cleanup(fixture: Fixture): void {
    rmTempDir(fixture.trackingDir);
    rmTempDir(fixture.appRoot);
  }

  test('disable stops routing, enable resumes it, backend mirrors both', () => {
    const fixture = makeFixture();
    try {
      expect(fixture.router.isModelEnabled('mistral')).toBe(true);
      expect(fixture.router.getBestAvailableModel()).toBe('mistral');

      const disabled = fixture.router.disableModel('mistral');
      expect(disabled.success).toBe(true);
      expect(fixture.router.isModelEnabled('mistral')).toBe(false);
      expect(fixture.backend.getModel('mistral')?.enabled).toBe(false);
      expect(fixture.router.getBestAvailableModel()).toBeNull();
      expect(fixture.router.getDisabledModels()).toEqual(['mistral']);
      expect(fixture.persisted).toEqual([['mistral']]);

      const enabled = fixture.router.enableModel('mistral');
      expect(enabled.success).toBe(true);
      expect(fixture.router.isModelEnabled('mistral')).toBe(true);
      expect(fixture.backend.getModel('mistral')?.enabled).toBe(true);
      expect(fixture.router.getBestAvailableModel()).toBe('mistral');
      expect(fixture.router.getDisabledModels()).toEqual([]);
      expect(fixture.persisted).toEqual([['mistral'], []]);
    } finally {
      cleanup(fixture);
    }
  });

  test('setModelEnabled is the single entry point for both directions', () => {
    const fixture = makeFixture();
    try {
      expect(
        fixture.router.setModelEnabled('mistral', false).success
      ).toBe(true);
      expect(fixture.router.isModelEnabled('mistral')).toBe(false);
      expect(
        fixture.router.setModelEnabled('mistral', true).success
      ).toBe(true);
      expect(fixture.router.isModelEnabled('mistral')).toBe(true);
    } finally {
      cleanup(fixture);
    }
  });

  test('unknown model fails honestly and changes nothing', () => {
    const fixture = makeFixture();
    try {
      const callsBefore = fixture.persisted.length;
      const result = fixture.router.disableModel('no-such-model');
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Unknown model/);
      expect(fixture.persisted.length).toBe(callsBefore);
      expect(fixture.router.isModelEnabled('mistral')).toBe(true);
      expect(fixture.router.getBestAvailableModel()).toBe('mistral');
    } finally {
      cleanup(fixture);
    }
  });

  test('enable fails honestly when no model file is on disk', () => {
    const fixture = makeFixture();
    try {
      // tinyllama is registered but has no file in this temp app root.
      const result = fixture.router.enableModel('tinyllama');
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/not installed/);
      // Disable does NOT require a file: a model disabled before
      // install stays disabled when it arrives.
      expect(fixture.router.disableModel('tinyllama').success).toBe(true);
      expect(fixture.router.isModelEnabled('tinyllama')).toBe(false);
    } finally {
      cleanup(fixture);
    }
  });

  test('a persist failure reverts the in-memory change — no fake success', () => {
    const fixture = makeFixture({
      onEnabledChange: () => {
        throw new Error('disk full (simulated)');
      },
    });
    try {
      const result = fixture.router.disableModel('mistral');
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Could not persist/);
      // Reverted: router AND backend mirror still say enabled.
      expect(fixture.router.isModelEnabled('mistral')).toBe(true);
      expect(fixture.backend.getModel('mistral')?.enabled).toBe(true);
      expect(fixture.router.getBestAvailableModel()).toBe('mistral');
    } finally {
      cleanup(fixture);
    }
  });

  test('seeding from a persisted list survives a refresh; stale names are ignored', () => {
    const fixture = makeFixture();
    try {
      fixture.router.applyPersistedDisabledModels([
        'mistral',
        'stale-model-that-was-never-registered',
      ]);
      expect(fixture.router.isModelEnabled('mistral')).toBe(false);
      expect(fixture.backend.getModel('mistral')?.enabled).toBe(false);
      expect(fixture.router.getBestAvailableModel()).toBeNull();
      // A disk re-scan must not resurrect a disabled model.
      fixture.router.refreshAvailableModels();
      expect(fixture.router.isModelEnabled('mistral')).toBe(false);
      expect(fixture.router.getBestAvailableModel()).toBeNull();
      // Seeding does not itself persist (it IS the persisted state).
      expect(fixture.persisted).toEqual([]);
      // And the round-trip still works after seeding.
      expect(fixture.router.enableModel('mistral').success).toBe(true);
      expect(fixture.router.getBestAvailableModel()).toBe('mistral');
    } finally {
      cleanup(fixture);
    }
  });
});

describe('LucidCore — disable survives a restart via llm_state.json', () => {
  // The repo checkout has the real TinyLlama GGUF under
  // LUCID-BACKEND/models, so `tinyllama` is installed for the router
  // (the router scans the cwd backend dir). Skip instead of failing
  // when it is absent — the router-level tests above cover the
  // round-trip without it.
  const tinyllamaPath = path.join(
    process.cwd(),
    'LUCID-BACKEND',
    'models',
    'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf'
  );

  test.skipIf(!fs.existsSync(tinyllamaPath))(
    'disable → restart → still disabled → re-enable → routing resumes',
    async () => {
      const tempHome = makeTempDir('lucid-enabled-home-');
      try {
        const lucidDir = path.join(tempHome, '.lucid');
        // A llamafile executable must exist or initialize() tries to
        // curl-download one (slow, network). A placeholder file is
        // enough: _ensureLlamafileExecutable only checks existence.
        fs.mkdirSync(path.join(lucidDir, 'llamafiles'), { recursive: true });
        fs.writeFileSync(
          path.join(lucidDir, 'llamafiles', 'llamafile'),
          'placeholder — never executed in this test'
        );

        const core = await LucidCore.initialize({
          userHomeDir: tempHome,
          workingDirectory: process.cwd(),
        });
        expect(core.isModelEnabled('tinyllama')).toBe(true);
        const listed = core
          .getModelList()
          .find((m) => m.name === 'tinyllama');
        expect(listed).toBeDefined();
        expect(listed!.enabled).toBe(true);
        expect(listed!.installed).toBe(true);

        // Disable: the hand-checkable case.
        const disabled = core.setModelEnabled('tinyllama', false);
        expect(disabled.success).toBe(true);
        expect(core.isModelEnabled('tinyllama')).toBe(false);
        expect(
          core.getModelList().find((m) => m.name === 'tinyllama')!.enabled
        ).toBe(false);
        const statePath = path.join(lucidDir, 'llm_state.json');
        expect(fs.existsSync(statePath)).toBe(true);
        expect(loadDisabledModels(lucidDir)).toEqual(['tinyllama']);

        // Restart: a fresh core against the SAME home dir re-seeds
        // from the file — the disabled state must persist.
        const restarted = await LucidCore.initialize({
          userHomeDir: tempHome,
          workingDirectory: process.cwd(),
        });
        expect(restarted.isModelEnabled('tinyllama')).toBe(false);
        expect(
          restarted
            .getModelList()
            .find((m) => m.name === 'tinyllama')!.enabled
        ).toBe(false);

        // Re-enable: routing resumes and the file is cleared.
        const enabled = restarted.setModelEnabled('tinyllama', true);
        expect(enabled.success).toBe(true);
        expect(restarted.isModelEnabled('tinyllama')).toBe(true);
        expect(loadDisabledModels(lucidDir)).toEqual([]);
      } finally {
        rmTempDir(tempHome);
      }
    },
    30000
  );

  test.skipIf(!fs.existsSync(tinyllamaPath))(
    'unknown model and not-installed enable fail honestly; corrupt state file never kills startup',
    async () => {
      const tempHome = makeTempDir('lucid-enabled-home2-');
      try {
        const lucidDir = path.join(tempHome, '.lucid');
        fs.mkdirSync(path.join(lucidDir, 'llamafiles'), { recursive: true });
        fs.writeFileSync(
          path.join(lucidDir, 'llamafiles', 'llamafile'),
          'placeholder — never executed in this test'
        );

        const core = await LucidCore.initialize({
          userHomeDir: tempHome,
          workingDirectory: process.cwd(),
        });

        const unknown = core.setModelEnabled('no-such-model', false);
        expect(unknown.success).toBe(false);
        expect(unknown.message).toMatch(/Unknown model/);
        expect(loadDisabledModels(lucidDir)).not.toContain('no-such-model');

        // mistral is registered but has no model file in this checkout.
        const notInstalled = core.setModelEnabled('mistral', true);
        expect(notInstalled.success).toBe(false);
        expect(notInstalled.message).toMatch(/not installed/);

        // Corrupt the state file, then restart: startup must not throw
        // and the model must come back enabled (corrupt = none disabled).
        fs.writeFileSync(
          path.join(lucidDir, 'llm_state.json'),
          '{corrupt'
        );
        const restarted = await LucidCore.initialize({
          userHomeDir: tempHome,
          workingDirectory: process.cwd(),
        });
        expect(restarted.isModelEnabled('tinyllama')).toBe(true);
      } finally {
        rmTempDir(tempHome);
      }
    },
    30000
  );
});
