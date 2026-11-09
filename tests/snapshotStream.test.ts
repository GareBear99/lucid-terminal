/**
 * Snapshot update stream — time + strain tests (Gary, 2026-11-09
 * ~15:00 PST: "we need to track time and strain on ring
 * throughout that stream time during").
 *
 * The stream (mismatch detected → ping fallback → download →
 * hash verify → flip → packet hits again) is tracked WHOLE:
 * every phase tick carries its timestamp, so each phase's
 * duration and the whole stream's duration are measurable;
 * every phase samples the rings' load (depth vs cap,
 * refused counts, worst tick wait), so the strain is
 * measured throughout, not at one point.
 *
 * Covers: recording starts a stream, appends phases, dedupes
 * a duplicate phase, completes at packet-hits, starts fresh
 * for a new version or after a finished stream, fails on
 * failure; the summary computes per-phase durations, the
 * total, the peak depths, the refused-during deltas, and the
 * worst tick wait; no stream summarizes to null.
 *
 * Run with: npx vitest run tests/snapshotStream.test.ts
 */
import { describe, test, expect } from 'vitest';
import {
  failSnapshotStream,
  recordSnapshotStreamSample,
  recordSnapshotStreamTickWait,
  snapshotStreamPhaseLabel,
  summarizeSnapshotStream,
  type SnapshotStream,
  type SnapshotStreamSample,
} from '../src/lib/snapshotStream';

function sample(
  phase: SnapshotStreamSample['phase'],
  at: number,
  overrides?: Partial<SnapshotStreamSample>,
): SnapshotStreamSample {
  return {
    phase,
    at,
    eventRingDepth: 1,
    eventRingCapacity: 512,
    eventRingRefused: 0,
    aiChatTickRingDepth: 0,
    aiChatTickRingCapacity: 256,
    aiChatTickRingRefused: 0,
    ...overrides,
  };
}

const FULL_STREAM: SnapshotStreamSample[] = [
  sample('mismatch-detected', 1000, { eventRingDepth: 3, aiChatTickRingDepth: 2 }),
  sample('ping-fallback', 1200, { eventRingDepth: 5, aiChatTickRingDepth: 4 }),
  sample('downloading', 1500, { eventRingDepth: 4, aiChatTickRingDepth: 1 }),
  sample('hash-verified', 9000, { eventRingDepth: 2, aiChatTickRingDepth: 0 }),
  sample('flipped', 9100, { eventRingDepth: 6, aiChatTickRingDepth: 3 }),
  sample('packet-hits', 9150, { eventRingDepth: 2, aiChatTickRingDepth: 1 }),
];

function buildStream(samples: SnapshotStreamSample[], version = 'v2'): SnapshotStream {
  let stream: SnapshotStream | null = null;
  for (const s of samples) {
    stream = recordSnapshotStreamSample(stream, version, s);
  }
  if (stream === null) throw new Error('stream never started');
  return stream;
}

describe('recordSnapshotStreamSample', () => {
  test('starts a stream at the first phase, in progress', () => {
    const stream = recordSnapshotStreamSample(null, 'v2', sample('mismatch-detected', 1000));
    expect(stream.version).toBe('v2');
    expect(stream.status).toBe('in-progress');
    expect(stream.samples).toHaveLength(1);
    expect(stream.maxTickWaitMs).toBe(0);
  });

  test('appends phases in order', () => {
    const stream = buildStream(FULL_STREAM.slice(0, 3));
    expect(stream.samples.map((s) => s.phase)).toEqual([
      'mismatch-detected',
      'ping-fallback',
      'downloading',
    ]);
    expect(stream.status).toBe('in-progress');
  });

  test('a packet-hits sample completes the stream', () => {
    const stream = buildStream(FULL_STREAM);
    expect(stream.status).toBe('complete');
    expect(stream.samples).toHaveLength(6);
  });

  test('a duplicate phase tick is ignored, not recorded twice', () => {
    const stream = buildStream([
      sample('mismatch-detected', 1000),
      sample('mismatch-detected', 1100),
      sample('downloading', 1500),
    ]);
    expect(stream.samples).toHaveLength(2);
    expect(stream.samples[0].at).toBe(1000);
  });

  test('a new version starts a fresh stream', () => {
    const old = buildStream(FULL_STREAM, 'v2');
    const next = recordSnapshotStreamSample(old, 'v3', sample('mismatch-detected', 20000));
    expect(next.version).toBe('v3');
    expect(next.status).toBe('in-progress');
    expect(next.samples).toHaveLength(1);
  });

  test('a phase after a completed stream starts a fresh stream', () => {
    const done = buildStream(FULL_STREAM);
    expect(done.status).toBe('complete');
    const next = recordSnapshotStreamSample(done, 'v2', sample('mismatch-detected', 30000));
    expect(next.status).toBe('in-progress');
    expect(next.samples).toHaveLength(1);
  });
});

describe('failSnapshotStream', () => {
  test('marks an in-progress stream failed', () => {
    const stream = buildStream(FULL_STREAM.slice(0, 3));
    const failed = failSnapshotStream(stream);
    expect(failed?.status).toBe('failed');
    expect(failed?.samples).toHaveLength(3);
  });

  test('a completed stream is unchanged by a failure', () => {
    const done = buildStream(FULL_STREAM);
    expect(failSnapshotStream(done)).toBe(done);
  });

  test('null stays null', () => {
    expect(failSnapshotStream(null)).toBeNull();
  });
});

describe('recordSnapshotStreamTickWait', () => {
  test('keeps the worst wait seen', () => {
    const stream = buildStream(FULL_STREAM.slice(0, 2));
    const a = recordSnapshotStreamTickWait(stream, 12);
    expect(a?.maxTickWaitMs).toBe(12);
    const b = recordSnapshotStreamTickWait(a, 5);
    expect(b).toBe(a);
    const c = recordSnapshotStreamTickWait(b, 40);
    expect(c?.maxTickWaitMs).toBe(40);
  });
});

describe('summarizeSnapshotStream', () => {
  test('null with no stream', () => {
    expect(summarizeSnapshotStream(null)).toBeNull();
  });

  test('the full stream: per-phase durations, total, peaks, refused deltas', () => {
    const stream = buildStream([
      sample('mismatch-detected', 1000, { eventRingDepth: 3, aiChatTickRingDepth: 2, eventRingRefused: 0, aiChatTickRingRefused: 0 }),
      sample('ping-fallback', 1200, { eventRingDepth: 5, aiChatTickRingDepth: 4, eventRingRefused: 1, aiChatTickRingRefused: 0 }),
      sample('downloading', 1500, { eventRingDepth: 4, aiChatTickRingDepth: 1, eventRingRefused: 1, aiChatTickRingRefused: 2 }),
      sample('hash-verified', 9000, { eventRingDepth: 2, aiChatTickRingDepth: 0, eventRingRefused: 1, aiChatTickRingRefused: 2 }),
      sample('flipped', 9100, { eventRingDepth: 6, aiChatTickRingDepth: 3, eventRingRefused: 3, aiChatTickRingRefused: 2 }),
      sample('packet-hits', 9150, { eventRingDepth: 2, aiChatTickRingDepth: 1, eventRingRefused: 3, aiChatTickRingRefused: 2 }),
    ]);
    const summary = summarizeSnapshotStream(stream);
    expect(summary).not.toBeNull();
    expect(summary?.version).toBe('v2');
    expect(summary?.status).toBe('complete');
    expect(summary?.startedAt).toBe(1000);
    expect(summary?.endedAt).toBe(9150);
    // Whole stream: 8,150 ms from mismatch to packet hits again.
    expect(summary?.totalMs).toBe(8150);
    expect(summary?.phaseDurations).toEqual([
      { from: 'mismatch-detected', to: 'ping-fallback', ms: 200 },
      { from: 'ping-fallback', to: 'downloading', ms: 300 },
      { from: 'downloading', to: 'hash-verified', ms: 7500 },
      { from: 'hash-verified', to: 'flipped', ms: 100 },
      { from: 'flipped', to: 'packet-hits', ms: 50 },
    ]);
    // Peak depths across the whole stream, against the caps.
    expect(summary?.peakEventRingDepth).toBe(6);
    expect(summary?.peakAiChatTickRingDepth).toBe(4);
    // Refused during the stream: last − first.
    expect(summary?.eventRingRefusedDuring).toBe(3);
    expect(summary?.aiChatTickRingRefusedDuring).toBe(2);
    expect(summary?.maxTickWaitMs).toBe(0);
  });

  test('an in-progress stream has no end and its total is "so far"', () => {
    const stream = buildStream(FULL_STREAM.slice(0, 3));
    const summary = summarizeSnapshotStream(stream);
    expect(summary?.status).toBe('in-progress');
    expect(summary?.endedAt).toBeNull();
    expect(summary?.totalMs).toBe(500);
  });

  test('a single sample has no total and no phase durations', () => {
    const stream = buildStream(FULL_STREAM.slice(0, 1));
    const summary = summarizeSnapshotStream(stream);
    expect(summary?.totalMs).toBeNull();
    expect(summary?.phaseDurations).toEqual([]);
  });

  test('every phase has a label', () => {
    const phases = [
      'mismatch-detected',
      'ping-fallback',
      'downloading',
      'hash-verified',
      'flipped',
      'packet-hits',
    ] as const;
    for (const phase of phases) {
      expect(snapshotStreamPhaseLabel(phase).length).toBeGreaterThan(0);
    }
  });
});
