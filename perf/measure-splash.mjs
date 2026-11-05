#!/usr/bin/env node
/**
 * Measure the Lucid boot splash on the CPU/software-rendering fallback
 * path — the case Gary wants measured, not guessed.
 *
 * What it does:
 *   1. Production-builds the perf harness (perf/splash.html + the real
 *      SplashScreen component) into dist-perf/.
 *   2. Serves dist-perf over HTTP.
 *   3. Runs the Electron driver N times under Xvfb with --disable-gpu
 *      (SwiftShader software raster — no GPU, pure CPU compositing),
 *      each run loading the harness in a visible 1400x900 window and
 *      sampling requestAnimationFrame for the full ~3.2s sequence.
 *   4. Prints per-run numbers (FPS, frame-time p50/p95/max, dropped and
 *      long frames) plus the aggregate across runs, and a verdict.
 *
 * Usage:
 *   node perf/measure-splash.mjs [--runs 3] [--skip-build] [--port 8931]
 *
 * The VM has no GPU, so this IS the fallback bed. On Gary's Mac the GPU
 * path will be at least this good; if the numbers here are bad, the
 * splash needs the CPU-fallback degradation (see perf/README.md).
 */
import { spawn, execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const perfDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(perfDir, '..');
const distPerf = path.join(repoRoot, 'dist-perf');

const args = process.argv.slice(2);
const runs = parseInt(args[args.indexOf('--runs') + 1] ?? '3', 10) || 3;
const skipBuild = args.includes('--skip-build');
const port = parseInt(args[args.indexOf('--port') + 1] ?? '8931', 10) || 8931;

function run(cmd, cmdArgs, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, cmdArgs, { cwd: repoRoot, timeout: 180000, ...opts }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${cmd} ${cmdArgs.join(' ')} failed: ${stderr || err.message}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);
  });
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

async function serve() {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      const filePath = path.join(distPerf, urlPath === '/' ? 'splash.html' : urlPath);
      if (!filePath.startsWith(distPerf)) throw new Error('bad path');
      await stat(filePath);
      res.writeHead(200, { 'content-type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
      createReadStream(filePath).pipe(res);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return server;
}

async function findHarnessUrl() {
  // Vite preserves the input's path under the repo root, so the built
  // page is either dist-perf/splash.html or dist-perf/perf/splash.html.
  for (const candidate of ['splash.html', 'perf/splash.html']) {
    try {
      await stat(path.join(distPerf, candidate));
      return `http://127.0.0.1:${port}/${candidate}`;
    } catch {
      // try the next candidate
    }
  }
  throw new Error('built harness page not found under dist-perf/');
}

function runElectron(url) {
  return new Promise((resolve, reject) => {
    const electron = path.join(repoRoot, 'node_modules', '.bin', 'electron');
    const child = spawn(
      'xvfb-run',
      [
        '-a',
        electron,
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--force-device-scale-factor=1',
        path.join(perfDir, 'electron-driver.cjs'),
        url,
      ],
      { cwd: repoRoot, timeout: 90000 },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      const jsonLine = stdout
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.startsWith('{'));
      if (!jsonLine) {
        reject(new Error(`electron run failed (exit ${code}): ${stderr.slice(-500)}`));
        return;
      }
      try {
        resolve(JSON.parse(jsonLine));
      } catch (e) {
        reject(new Error(`could not parse electron output: ${e.message}\n${stdout.slice(-500)}`));
      }
    });
  });
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function main() {
  console.log('Lucid splash — CPU fallback measurement (SwiftShader, --disable-gpu)');
  console.log(`Runs: ${runs} | window 1400x900 | harness: perf/splash.html\n`);

  if (!skipBuild) {
    console.log('Building harness (production)...');
    await run('npx', ['vite', 'build', '-c', 'perf/vite.perf.config.ts'], { stdio: 'ignore' });
    console.log('Build done.\n');
  }

  const server = await serve();
  const url = await findHarnessUrl();
  console.log(`Serving ${url}\n`);

  const results = [];
  try {
    for (let i = 0; i < runs; i++) {
      console.log(`Run ${i + 1}/${runs}...`);
      const result = await runElectron(url);
      results.push(result);
      const f = result.frameMs;
      const b = result.buckets ?? {};
      console.log(
        `  fps=${result.fps} frames=${result.frames} duration=${result.durationMs}ms ` +
          `p50=${f.p50}ms p95=${f.p95}ms max=${f.max}ms dropped(>33.4ms)=${result.droppedFrames} long(>50ms)=${result.longFrames}`,
      );
      console.log(
        `  dropped by phase: smoke-in ${b.droppedSmokeIn ?? '?'} / wordmark ${b.droppedWordmark ?? '?'} / hold ${b.droppedHold ?? '?'} / fade ${b.droppedFade ?? '?'}` +
          `  (frames: ${b.smokeIn ?? '?'}/${b.wordmark ?? '?'}/${b.hold ?? '?'}/${b.fade ?? '?'})`,
      );
    }
  } finally {
    server.close();
  }

  const fps = results.map((r) => r.fps);
  const p95 = results.map((r) => r.frameMs.p95);
  const p50 = results.map((r) => r.frameMs.p50);
  const max = results.map((r) => r.frameMs.max);
  const dropped = results.map((r) => r.droppedFrames);
  const totalFrames = results.reduce((a, r) => a + r.frames, 0);
  const totalDropped = dropped.reduce((a, b) => a + b, 0);

  console.log('\n=== Aggregate (median across runs) ===');
  console.log(`FPS:            median ${median(fps)}  (min ${Math.min(...fps)}, max ${Math.max(...fps)})`);
  console.log(`Frame p50:      ${median(p50)} ms`);
  console.log(`Frame p95:      ${median(p95)} ms  (worst run ${Math.max(...p95)} ms)`);
  console.log(`Frame max:      ${median(max)} ms  (worst run ${Math.max(...max)} ms)`);
  console.log(`Dropped frames: ${totalDropped}/${totalFrames} (${((totalDropped / totalFrames) * 100).toFixed(1)}% of frames > 33.4ms)`);
  console.log(`Chromium:       ${results[0]?.meta?.chrome ?? 'unknown'} | Electron ${results[0]?.meta?.electron ?? 'unknown'} | gpuDisabled=${results[0]?.meta?.gpuDisabled}`);

  const medFps = median(fps);
  const medP95 = median(p95);
  console.log('\n=== Verdict (CPU fallback) ===');
  if (medFps >= 55 && medP95 <= 20) {
    console.log('SMOOTH: the full smoke effect holds ~60fps on pure CPU raster. No fallback degradation needed.');
  } else if (medFps >= 30 && medP95 <= 33.4) {
    console.log('ACCEPTABLE: mostly smooth on CPU, with some jank. Watchable, but the fallback mode would polish it.');
  } else {
    console.log('NOT SMOOTH: the full smoke effect janks on CPU fallback. Implement the degraded mode (fewer/smaller puffs, static mist) and re-measure with ?mode=fallback.');
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
