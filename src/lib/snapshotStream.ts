/**
 * Snapshot update stream — TIME + STRAIN on the ring throughout
 * the update stream (Gary, 2026-11-09 ~15:00 PST: "we need to
 * track time and strain on ring throughout that stream time
 * during").
 *
 * THE STREAM (user side): mismatch detected → ping fallback →
 * download → hash verify → flip → packet hits again. The
 * tracking covers the WHOLE stream, not a single point:
 * - TIME: every phase tick carries its timestamp (the ring
 *   event's `at`), so the duration of each phase and of the
 *   whole stream is measurable — from the first mismatch tick
 *   to the first packet hitting the new snapshot.
 * - STRAIN: at every phase, the ring's load is sampled from
 *   the rings' own reporting — no new metrics system, no
 *   invented numbers:
 *   - eventRing depth (`eventRing.length`, the in-flight count)
 *     against its cap 512, and the store's refused count
 *     (backpressure — a refused tick is counted, never dropped
 *     silently).
 *   - aiChatTickRing depth (`aiChatTickRing.length`) against
 *     its cap 256, and `aiChatTickRefusedCount()`.
 *   - tick latency: how long a tick waited in the event ring
 *     between enqueue and drain (the store measures it at drain
 *     time, from the event's `at` to now, and keeps the max
 *     seen during the stream).
 * The two rings are NOT merged: the strain sample only READS
 * the tick ring's depth/refused count — a tick never enters
 * the event log channel and a diagnostic event never enters
 * the tick ring (pinned by tests/aiChatTickChannel.test.ts).
 *
 * This module is pure: a stream is data (samples + status),
 * and these functions build/summarize it. The store
 * (src/stores/eventLogStore.ts) is the producer — it samples
 * the rings when it logs a snapshot stage and persists the
 * last stream, so the Security tab shows it even after a
 * reload. The tab is the home for it (Gary, 2026-11-09
 * ~15:04 PST — the Security tab is the client-side home of
 * the lightweight tracking system).
 *
 * A stream starts at the first mismatch-detected tick for a
 * version and completes at the first packet-hits tick for
 * that version. A failure marks it failed (the installed
 * snapshot stays current). A new version, or a phase tick
 * after a completed/failed stream, starts a fresh stream.
 * The alert stages (alert-shown / alert-dismissed) are NOT
 * stream phases — the alert is a notice, not a step of the
 * update — so they record no sample.
 */

/** One phase of the update stream, in stream order. */
export type SnapshotStreamPhase =
  | 'mismatch-detected'
  | 'ping-fallback'
  | 'downloading'
  | 'hash-verified'
  | 'flipped'
  | 'packet-hits';

/** Human label for a stream phase (ring + UI). */
export function snapshotStreamPhaseLabel(phase: SnapshotStreamPhase): string {
  switch (phase) {
    case 'mismatch-detected':
      return 'Mismatch detected';
    case 'ping-fallback':
      return 'Ping fallback';
    case 'downloading':
      return 'Download';
    case 'hash-verified':
      return 'Hash verify';
    case 'flipped':
      return 'Flip';
    case 'packet-hits':
      return 'Packet hits again';
  }
}

/** The ring's load at one phase — read from the rings' own
 *  reporting at the moment the phase tick was logged. The
 *  eventRing depth includes the phase tick itself (it was
 *  just enqueued; the microtask drain has not run yet). */
export interface SnapshotStreamSample {
  /** Which phase this sample is. */
  phase: SnapshotStreamPhase;
  /** Wall-clock time the phase tick was logged (Date.now()). */
  at: number;
  /** eventRing in-flight count at this phase (cap 512). */
  eventRingDepth: number;
  /** eventRing capacity (512). */
  eventRingCapacity: number;
  /** Event-log refused count at this phase (backpressure). */
  eventRingRefused: number;
  /** aiChatTickRing in-flight count at this phase (cap 256). */
  aiChatTickRingDepth: number;
  /** aiChatTickRing capacity (256). */
  aiChatTickRingCapacity: number;
  /** AI chat tick refused count at this phase (backpressure). */
  aiChatTickRingRefused: number;
}

export type SnapshotStreamStatus = 'in-progress' | 'complete' | 'failed';

/** One update stream: its samples in phase order + the worst
 *  tick wait seen while it ran. */
export interface SnapshotStream {
  /** The snapshot version being updated to. */
  version: string;
  /** in-progress until packet-hits (complete) or a failure. */
  status: SnapshotStreamStatus;
  /** One sample per phase, in stream order. */
  samples: SnapshotStreamSample[];
  /** Longest a tick waited in the event ring during this
   *  stream (enqueue → drain, ms). 0 until the first drain. */
  maxTickWaitMs: number;
}

/**
 * Record one phase sample into a stream. Pure: returns the
 * new stream, never mutates the input.
 * - No stream, a finished stream, or a different version →
 *   start a fresh stream for this version.
 * - A phase already recorded in an in-progress stream is a
 *   duplicate tick — ignored, not recorded twice.
 * - A packet-hits sample completes the stream.
 */
export function recordSnapshotStreamSample(
  stream: SnapshotStream | null,
  version: string,
  sample: SnapshotStreamSample,
): SnapshotStream {
  if (
    stream === null ||
    stream.status !== 'in-progress' ||
    stream.version !== version
  ) {
    return {
      version,
      status: sample.phase === 'packet-hits' ? 'complete' : 'in-progress',
      samples: [sample],
      maxTickWaitMs: 0,
    };
  }
  if (stream.samples.some((s) => s.phase === sample.phase)) return stream;
  return {
    ...stream,
    status: sample.phase === 'packet-hits' ? 'complete' : 'in-progress',
    samples: [...stream.samples, sample],
  };
}

/** Mark an in-progress stream failed. A finished stream is
 *  returned unchanged — a failure after completion is a new
 *  stream's failure, not this one's. */
export function failSnapshotStream(stream: SnapshotStream | null): SnapshotStream | null {
  if (stream === null || stream.status !== 'in-progress') return stream;
  return { ...stream, status: 'failed' };
}

/** Fold one drain's worst tick wait into the stream. Pure. */
export function recordSnapshotStreamTickWait(
  stream: SnapshotStream | null,
  waitMs: number,
): SnapshotStream | null {
  if (stream === null) return null;
  if (waitMs <= stream.maxTickWaitMs) return stream;
  return { ...stream, maxTickWaitMs: waitMs };
}

/** One phase-to-phase duration, for the UI. */
export interface SnapshotStreamPhaseDuration {
  from: SnapshotStreamPhase;
  to: SnapshotStreamPhase;
  /** ms between the two phase ticks. */
  ms: number;
}

/** The stream, summarized for the Security tab. Null when
 *  there is no stream to summarize. */
export interface SnapshotStreamSummary {
  version: string;
  status: SnapshotStreamStatus;
  /** When the stream started (first sample). */
  startedAt: number;
  /** When the stream ended (last sample), or null while it
   *  is still running. */
  endedAt: number | null;
  /** ms from the first sample to the last — the whole stream
   *  so far (complete when packet-hits landed). Null with
   *  fewer than two samples. */
  totalMs: number | null;
  /** Per-phase durations, in stream order. */
  phaseDurations: SnapshotStreamPhaseDuration[];
  /** Deepest the event ring got during the stream (of 512). */
  peakEventRingDepth: number;
  /** Deepest the AI chat tick ring got during the stream
   *  (of 256). */
  peakAiChatTickRingDepth: number;
  /** Event-ring ticks refused by backpressure during the
   *  stream (last refused − first refused). */
  eventRingRefusedDuring: number;
  /** AI chat ticks refused by backpressure during the stream. */
  aiChatTickRingRefusedDuring: number;
  /** Longest a tick waited in the event ring during the stream. */
  maxTickWaitMs: number;
}

/** Summarize a stream for display. Pure. */
export function summarizeSnapshotStream(
  stream: SnapshotStream | null,
): SnapshotStreamSummary | null {
  if (stream === null || stream.samples.length === 0) return null;
  const samples = stream.samples;
  const phaseDurations: SnapshotStreamPhaseDuration[] = [];
  for (let i = 1; i < samples.length; i++) {
    phaseDurations.push({
      from: samples[i - 1].phase,
      to: samples[i].phase,
      ms: samples[i].at - samples[i - 1].at,
    });
  }
  const first = samples[0];
  const last = samples[samples.length - 1];
  return {
    version: stream.version,
    status: stream.status,
    startedAt: first.at,
    endedAt: stream.status === 'in-progress' ? null : last.at,
    totalMs: samples.length > 1 ? last.at - first.at : null,
    phaseDurations,
    peakEventRingDepth: Math.max(...samples.map((s) => s.eventRingDepth)),
    peakAiChatTickRingDepth: Math.max(...samples.map((s) => s.aiChatTickRingDepth)),
    eventRingRefusedDuring: last.eventRingRefused - first.eventRingRefused,
    aiChatTickRingRefusedDuring:
      last.aiChatTickRingRefused - first.aiChatTickRingRefused,
    maxTickWaitMs: stream.maxTickWaitMs,
  };
}
