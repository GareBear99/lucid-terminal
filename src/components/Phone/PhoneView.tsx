/**
 * PhoneView — the in-app phone stream (Phase 0 spike).
 *
 * One VideoDecoder (hardware path requested) draws the scrcpy
 * H.264 access units main forwards over `android:frame` onto a
 * canvas. No polling: frames are pushed, so the view keeps working
 * when the panel is on another tab. Pointer input goes back over
 * the control socket as 32-byte touch messages — no `adb shell
 * input` spawn per tap.
 *
 * Honest surfaces, not assumed ones:
 * - the STALE badge shows the real age of the last decoded frame
 *   (never presents an old frame as live);
 * - the metrics line shows the measured fps, median tap send time,
 *   and the reported decode path (hardware / software / unknown).
 *   If the decode silently fell back to software, that shows here
 *   as `software` — that is a bug to fix, not a fallback.
 * - before the first frame, the view says WAITING, not LIVE.
 *
 * The external phone-control server is untouched: this view is the
 * internal (add-on) entry only.
 */

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  accessUnitIsKey,
  buildVideoDecoderConfig,
  decodePathFromMediaCapabilities,
  frameAgeLabel,
  isFrameStale,
  H264_CODEC,
  TOUCH_ACTION_DOWN,
  TOUCH_ACTION_MOVE,
  TOUCH_ACTION_UP,
  type DecodePath,
  type StreamMetricsSnapshot,
} from '../../phone/streaming';
import { usePhoneStore } from '../../stores/phoneStore';

export interface PhoneViewProps {
  serial: string;
  onClose: () => void;
}

const DEFAULT_VIDEO_WIDTH = 720;
const DEFAULT_VIDEO_HEIGHT = 1280;

export function StaleBadge({ frameAgeMs }: { frameAgeMs: number | null }) {
  if (frameAgeMs === null) {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
        WAITING FOR FRAME
      </span>
    );
  }
  const stale = isFrameStale(frameAgeMs);
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-semibold ${
        stale
          ? 'bg-red-900 text-red-200'
          : 'bg-green-900 text-green-200'
      }`}
    >
      {frameAgeLabel(frameAgeMs)}
    </span>
  );
}

function PhoneView({ serial, onClose }: PhoneViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const decoderRef = useRef<VideoDecoder | null>(null);
  const lastFrameAtRef = useRef<number | null>(null);
  const videoSizeRef = useRef({ width: DEFAULT_VIDEO_WIDTH, height: DEFAULT_VIDEO_HEIGHT });
  const activePointerRef = useRef<number | null>(null);

  const [status, setStatus] = useState('starting');
  const [error, setError] = useState<string | null>(null);
  const [frameAgeMs, setFrameAgeMs] = useState<number | null>(null);
  const [decodePath, setDecodePath] = useState<DecodePath>('unknown');
  const [videoSize, setVideoSize] = useState({ width: DEFAULT_VIDEO_WIDTH, height: DEFAULT_VIDEO_HEIGHT });
  const metrics = usePhoneStore((s) => s.metrics);
  const setMetrics = usePhoneStore((s) => s.setMetrics);

  useEffect(() => {
    const android = window.lucidAPI?.android;
    if (!android) {
      setError('Phone streaming IPC is not available in this build');
      setStatus('error');
      return;
    }
    if (typeof VideoDecoder === 'undefined') {
      setError('VideoDecoder is not available in this build — the stream cannot decode');
      setStatus('error');
      return;
    }
    let cancelled = false;
    const decoder = new VideoDecoder({
      output: (frame) => {
        const canvas = canvasRef.current;
        if (canvas) {
          if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
            canvas.width = frame.displayWidth;
            canvas.height = frame.displayHeight;
          }
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(frame, 0, 0, canvas.width, canvas.height);
        }
        videoSizeRef.current = {
          width: frame.displayWidth,
          height: frame.displayHeight,
        };
        setVideoSize(videoSizeRef.current);
        lastFrameAtRef.current = Date.now();
        frame.close();
      },
      error: (e) => {
        if (!cancelled) setError(`Video decode failed: ${e.message}`);
      },
    });
    decoderRef.current = decoder;
    decoder.configure(buildVideoDecoderConfig());

    const unsubscribeFrame = android.onFrame((frameSerial, chunk) => {
      if (frameSerial !== serial || cancelled) return;
      try {
        decoder.decode(
          new EncodedVideoChunk({
            type: accessUnitIsKey(chunk) ? 'key' : 'delta',
            timestamp: Math.round(performance.now() * 1000),
            data: chunk,
          }),
        );
      } catch (e) {
        setError(`Could not feed a video chunk to the decoder: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
    const unsubscribeState = android.onDeviceState((stateSerial, state, stateError) => {
      if (stateSerial !== serial || cancelled) return;
      setStatus(state);
      if (state === 'error' && stateError) setError(stateError);
    });

    // Report the real decode path: mediaCapabilities says whether
    // this H.264 decode runs on dedicated hardware. Main records
    // it in the stream metrics; the metrics line shows it.
    void (async () => {
      try {
        const info = await navigator.mediaCapabilities.decodingInfo({
          type: 'media-source',
          video: {
            contentType: `video/mp4; codecs="${H264_CODEC}"`,
            width: videoSizeRef.current.width,
            height: videoSizeRef.current.height,
            bitrate: 2_000_000,
            framerate: 30,
          },
        });
        const path = decodePathFromMediaCapabilities(info);
        if (!cancelled) {
          setDecodePath(path);
          void android.reportDecodePath(serial, path);
        }
      } catch {
        if (!cancelled) setDecodePath('unknown');
      }
    })();

    void android.startStream(serial).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error ?? 'Stream failed to start');
        setStatus('error');
      }
    });

    const staleTimer = window.setInterval(() => {
      if (cancelled) return;
      setFrameAgeMs(
        lastFrameAtRef.current === null ? null : Date.now() - lastFrameAtRef.current,
      );
    }, 500);
    const metricsTimer = window.setInterval(() => {
      if (cancelled) return;
      void android.getMetrics(serial).then((snapshot: StreamMetricsSnapshot | null) => {
        if (!cancelled && snapshot) setMetrics(snapshot);
      });
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(staleTimer);
      window.clearInterval(metricsTimer);
      unsubscribeFrame();
      unsubscribeState();
      void android.stopStream(serial).catch(() => undefined);
      try {
        decoder.close();
      } catch {
        // Already closed — the view is going away either way.
      }
      decoderRef.current = null;
    };
  }, [serial, setMetrics]);

  const sendTouch = (e: React.PointerEvent<HTMLCanvasElement>, action: number) => {
    const android = window.lucidAPI?.android;
    const canvas = canvasRef.current;
    if (!android || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = videoSizeRef.current.width / Math.max(1, rect.width);
    const scaleY = videoSizeRef.current.height / Math.max(1, rect.height);
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    void android
      .touch(serial, {
        action,
        pointerId: BigInt(1),
        x,
        y,
        width: videoSizeRef.current.width,
        height: videoSizeRef.current.height,
        pressure: action === TOUCH_ACTION_UP ? 0 : 1,
        actionButton: 0,
        buttons: action === TOUCH_ACTION_UP ? 0 : 1,
      })
      .catch(() => undefined);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointerRef.current = e.pointerId;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    sendTouch(e, TOUCH_ACTION_DOWN);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== e.pointerId) return;
    sendTouch(e, TOUCH_ACTION_MOVE);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== e.pointerId) return;
    activePointerRef.current = null;
    sendTouch(e, TOUCH_ACTION_UP);
  };

  return (
    <div className="flex flex-col h-full bg-black">
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--border)] shrink-0 bg-[var(--bg-primary)]">
        <span className="text-xs font-semibold text-[var(--text-primary)]">
          Android — Installed · {serial}
        </span>
        <span className="text-xs text-[var(--text-muted)]">{status}</span>
        <StaleBadge frameAgeMs={frameAgeMs} />
        <span className="text-xs text-[var(--text-muted)]">
          {metrics
            ? `${metrics.fps} fps · tap ${metrics.medianTapMs ?? '—'} ms · ${decodePath} decode · ${metrics.frames} frames`
            : 'no metrics yet'}
        </span>
        <button
          onClick={onClose}
          className="ml-auto p-1 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          title="Close phone stream"
        >
          <X size={14} />
        </button>
      </div>
      {error ? (
        <div className="px-3 py-2 text-xs text-red-300 bg-red-950">{error}</div>
      ) : null}
      <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
        <canvas
          ref={canvasRef}
          width={videoSize.width}
          height={videoSize.height}
          className="max-w-full max-h-full"
          style={{ touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      </div>
    </div>
  );
}

export default PhoneView;
