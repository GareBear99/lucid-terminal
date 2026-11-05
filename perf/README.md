# Lucid splash — CPU fallback perf harness

Gary wants to KNOW what the splash costs when there is no GPU, not guess.
This VM has no GPU, so it is the fallback test bed.

## What it measures

The real `SplashScreen` component (same code the app ships), rendered in a
real Chromium renderer (the repo's Electron 28) under Xvfb with
`--disable-gpu` — i.e. SwiftShader software raster, pure CPU compositing.
A `requestAnimationFrame` sampler records every frame for the full ~3.2s
sequence and reports FPS, frame-time p50/p95/max, and dropped frames
(>33.4ms) / long frames (>50ms).

## Run it

```sh
node perf/measure-splash.mjs [--runs 3] [--skip-build] [--port 8931]
```

- `--runs N`: how many Electron runs (default 3; median is reported).
- `--skip-build`: reuse the existing `dist-perf/` build.
- `--port N`: the port the harness is served on (default 8931).

Output is per-run numbers plus an aggregate and a verdict:
- **SMOOTH** (median FPS ≥ 55, p95 ≤ 20ms): full smoke is fine on CPU.
- **ACCEPTABLE** (FPS ≥ 30, p95 ≤ 33.4ms): mostly smooth, some jank.
- **NOT SMOOTH**: implement the degraded CPU-fallback mode and re-measure.

## Files

- `perf/splash.html` — harness entry page (dev-only, not shipped).
- `perf/splash-harness.tsx` — renders only the SplashScreen + the rAF sampler.
- `perf/vite.perf.config.ts` — production build of just the harness into `dist-perf/`.
- `perf/electron-driver.cjs` — Electron main-process driver (loads the page, waits for the sampler, prints JSON).
- `perf/measure-splash.mjs` — orchestrator: build → serve → N Electron runs → aggregate.

## Notes

- The window must be VISIBLE (under Xvfb) — a hidden window throttles
  `requestAnimationFrame` and the numbers would be lies.
- Chromium flags (`--disable-gpu`, `--no-sandbox`) must come BEFORE the
  driver script path on the Electron command line.
- The harness measures the splash alone. In the real app the dashboard
  mounts underneath, so the real launch also pays dashboard init cost —
  the splash numbers here are the smoke effect's own cost.
- If a degraded mode is ever added to the splash, force it in the harness
  with `?mode=fallback` on the URL and re-measure the same way.
