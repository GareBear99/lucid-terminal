/**
 * Perf harness for the Lucid boot splash — renders ONLY the real
 * SplashScreen component (same code the app ships) and samples its
 * animation with requestAnimationFrame for the whole sequence.
 *
 * Exposes the result on window for the Electron driver:
 *   window.__splashPerfDone: boolean — true once the sequence finished
 *   window.__splashPerf: {
 *     frames, durationMs, fps,
 *     frameMs: { p50, p95, max, mean },
 *     droppedFrames (delta > 33.4ms), longFrames (delta > 50ms),
 *     firstPaintMs, firstContentfulPaintMs
 *   }
 *
 * Dev-only harness: not imported by the app, not shipped. Run it with
 * perf/measure-splash.mjs (production build + Electron under Xvfb with
 * --disable-gpu, i.e. the CPU/software-rendering fallback path).
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { SplashScreen } from '../src/components/Splash/SplashScreen';

declare global {
  interface Window {
    __splashPerfDone?: boolean;
    __splashPerf?: Record<string, unknown>;
  }
}

const samples: number[] = [];
let finished = false;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function finish() {
  if (finished) return;
  finished = true;
  const deltas: number[] = [];
  for (let i = 1; i < samples.length; i++) deltas.push(samples[i] - samples[i - 1]);
  const sorted = [...deltas].sort((a, b) => a - b);
  const durationMs = samples.length > 1 ? samples[samples.length - 1] - samples[0] : 0;
  const paints = performance.getEntriesByType('paint');
  const firstPaint = paints.find((e) => e.name === 'first-paint');
  const firstContentfulPaint = paints.find((e) => e.name === 'first-contentful-paint');
  // Bucket dropped frames by splash phase (times relative to the first
  // sample) so we can tell startup hitches apart from steady smoke cost:
  // smoke-in 0-600ms, wordmark 600-1300ms, hold 1300-2200ms, fade 2200ms+.
  const t0 = samples[0] ?? 0;
  const buckets = { smokeIn: 0, wordmark: 0, hold: 0, fade: 0, droppedSmokeIn: 0, droppedWordmark: 0, droppedHold: 0, droppedFade: 0 };
  for (let i = 1; i < samples.length; i++) {
    const t = samples[i] - t0;
    const bucket = t < 600 ? 'smokeIn' : t < 1300 ? 'wordmark' : t < 2200 ? 'hold' : 'fade';
    const droppedKey = (`dropped${bucket[0].toUpperCase()}${bucket.slice(1)}`) as keyof typeof buckets;
    buckets[bucket as keyof typeof buckets]++;
    if (samples[i] - samples[i - 1] > 33.4) buckets[droppedKey]++;
  }
  window.__splashPerf = {
    frames: deltas.length,
    durationMs: Math.round(durationMs * 100) / 100,
    fps: durationMs > 0 ? Math.round((deltas.length / (durationMs / 1000)) * 100) / 100 : 0,
    frameMs: {
      mean: deltas.length > 0 ? Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 100) / 100 : 0,
      p50: Math.round(percentile(sorted, 50) * 100) / 100,
      p95: Math.round(percentile(sorted, 95) * 100) / 100,
      max: Math.round((sorted[sorted.length - 1] ?? 0) * 100) / 100,
    },
    droppedFrames: deltas.filter((d) => d > 33.4).length,
    longFrames: deltas.filter((d) => d > 50).length,
    buckets,
    firstPaintMs: firstPaint ? Math.round(firstPaint.startTime * 100) / 100 : null,
    firstContentfulPaintMs: firstContentfulPaint ? Math.round(firstContentfulPaint.startTime * 100) / 100 : null,
  };
  window.__splashPerfDone = true;
}

// Sample from before React mounts, so mount cost is included.
function tick(t: number) {
  samples.push(t);
  if (!finished) requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// Hard stop so the driver never hangs if onDone never fires.
window.setTimeout(finish, 8000);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SplashScreen onDone={finish} />
  </React.StrictMode>,
);
