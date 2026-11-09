/**
 * Permissions tab — Settings > Permissions (Gary, 2026-11-07
 * ~02:47 PST): "we need to track everything im allowing". Every
 * permission Lucid tracks, its live state, what depends on it,
 * and how to grant it. Gary just granted Screen Recording; other
 * users will not have it — so a permission that is not granted is
 * shown honestly, with what it blocks and how to grant it, never
 * assumed.
 *
 * The standard (Gary, 2026-11-07 ~02:48 PST — "like you"): the
 * state shown is the LIVE probe. A recorded grant is only ever
 * shown marked stale ("last known"), never as current. The tab
 * refreshes on open and has a Refresh button — re-probe after
 * granting something in System Settings.
 *
 * At the TOP of the tab sits the info explanatory page (Gary,
 * 2026-11-07 ~02:49 PST): "there needs to be and info
 * explanatory page and voice of the exact words on that page".
 * The page renders PERMISSIONS_INFO_TEXT verbatim, and the
 * speaker button plays public/settings/permissions-explanation.mp3
 * — synthesized from that exact string, so the voice reads the
 * exact words on the page, no paraphrase, no extra words. Never
 * auto-plays. If the words change, the MP3 must be re-synthesized
 * from the new string.
 */
import { useEffect, useRef, useState } from 'react';
import { Pause, RefreshCw, Shield, Volume2 } from 'lucide-react';
import {
  PERMISSIONS_INFO_TEXT,
  PERMISSIONS_INFO_VOICE_SRC,
  PERMISSION_DEFS,
  permissionStatusLabel,
  type PermissionId,
  type PermissionStatus,
} from '../../lib/permissions';
import {
  eventOutcomeLabel,
  eventPhaseLabel,
  eventTypeLabel,
  type EventOutcome,
} from '../../lib/eventLog';
import { useEventLogStore } from '../../stores/eventLogStore';
import { usePermissionsStore } from '../../stores/permissionsStore';

const STATUS_BADGE: Record<PermissionStatus, string> = {
  granted: 'bg-green-500/10 text-green-500',
  denied: 'bg-red-500/10 text-red-500',
  'not-determined': 'bg-yellow-500/10 text-yellow-500',
  restricted: 'bg-red-500/10 text-red-500',
  unknown: 'bg-yellow-500/10 text-yellow-500',
  'not-applicable': 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]',
};

/** Outcome badge colours for the event log — same palette as
 *  the permission badges above, so the log reads the same way:
 *  green = it worked / was granted, red = refused / failed,
 *  yellow = waiting / dismissed / unknown. */
const OUTCOME_BADGE: Record<EventOutcome, string> = {
  granted: 'bg-green-500/10 text-green-500',
  completed: 'bg-green-500/10 text-green-500',
  denied: 'bg-red-500/10 text-red-500',
  failed: 'bg-red-500/10 text-red-500',
  pending: 'bg-yellow-500/10 text-yellow-500',
  dismissed: 'bg-yellow-500/10 text-yellow-500',
  cancelled: 'bg-yellow-500/10 text-yellow-500',
  unknown: 'bg-yellow-500/10 text-yellow-500',
};

/** Play button for the info page's voice message — same pattern
 *  as AddonVoiceButton: lazy Audio, click to play, click again to
 *  pause, never auto-plays, renders safely under SSR. */
function PermissionsVoiceButton() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const toggle = () => {
    if (unavailable) return;
    if (!audioRef.current) {
      const audio = new Audio(PERMISSIONS_INFO_VOICE_SRC);
      audio.onended = () => setPlaying(false);
      audio.onerror = () => {
        setUnavailable(true);
        setPlaying(false);
      };
      audioRef.current = audio;
    }
    const audio = audioRef.current;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().catch(() => {
        setUnavailable(true);
        setPlaying(false);
      });
      setPlaying(true);
    }
  };

  if (unavailable) {
    return (
      <span className="text-xs text-[var(--text-muted)]">
        Voice message is not available.
      </span>
    );
  }

  return (
    <button
      type="button"
      data-permissions-voice="permissions-explanation"
      onClick={toggle}
      className="btn btn-secondary text-xs shrink-0"
      title="Listen: the exact words on this page"
      aria-label={playing ? 'Pause the permissions explanation' : 'Play the permissions explanation'}
    >
      {playing ? <Pause size={14} /> : <Volume2 size={14} />}
      <span className="ml-1">{playing ? 'Pause' : 'Listen'}</span>
    </button>
  );
}

export function PermissionsTab() {
  const snapshot = usePermissionsStore((s) => s.snapshot);
  const lastCheckedAt = usePermissionsStore((s) => s.lastCheckedAt);
  const checking = usePermissionsStore((s) => s.checking);
  const error = usePermissionsStore((s) => s.error);
  const refresh = usePermissionsStore((s) => s.refresh);
  const displayState = usePermissionsStore((s) => s.displayState);
  const events = useEventLogStore((s) => s.events);
  const refusedCount = useEventLogStore((s) => s.refusedCount);
  const clearEvents = useEventLogStore((s) => s.clear);
  const [requesting, setRequesting] = useState<PermissionId | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  // Probe on open — the tab always shows a fresh live state, not
  // a stale memory of one. Origin 'startup': the probe is an
  // initial event in the log (Gary, 2026-11-08 — track when + why).
  useEffect(() => {
    void refresh(false, 'startup');
    // Refresh once on open only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestPermission = async (id: PermissionId) => {
    const api = (window as unknown as { lucidAPI?: { permissions?: {
      request: (id: PermissionId) => Promise<boolean>;
    } } }).lucidAPI?.permissions;
    if (!api) {
      setRequestError('Permissions are not available in this view.');
      return;
    }
    setRequesting(id);
    setRequestError(null);
    try {
      const granted = await api.request(id);
      // Track + diagnose the prompt: WHEN it was asked and WHY
      // (the user clicked Request) and what the answer was.
      useEventLogStore.getState().logPermissionRequest(id, granted ? 'granted' : 'denied');
      // Re-probe after the prompt — the answer changed something.
      await refresh(true, 'after-request');
    } catch (e) {
      setRequestError(e instanceof Error ? e.message : 'Could not request the permission.');
    } finally {
      setRequesting(null);
    }
  };

  const openSettings = async (id: PermissionId) => {
    const api = (window as unknown as { lucidAPI?: { permissions?: {
      openSettings: (id: PermissionId) => Promise<boolean>;
    } } }).lucidAPI?.permissions;
    if (!api) return;
    await api.openSettings(id);
  };

  const infoParagraphs = PERMISSIONS_INFO_TEXT.split('\n\n');

  return (
    <div className="space-y-4">
      {/* The info explanatory page — FIRST, at the top of the tab
          (Gary, 2026-11-07 ~02:49 PST). The exact words, verbatim,
          with a voice that reads them word for word. */}
      <div className="rounded-md border border-[var(--border)] p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-[var(--text-muted)] shrink-0" />
          <h3 className="text-sm font-semibold flex-1">Permissions — what Lucid is allowed to do</h3>
          <PermissionsVoiceButton />
        </div>
        <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
          Listen reads the exact words on this page, nothing added.
        </p>
        {infoParagraphs.map((paragraph, i) => (
          <p key={i} className="text-sm leading-relaxed">
            {paragraph}
          </p>
        ))}
      </div>

      {/* Live state header. */}
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <span className="flex-1">
          {snapshot
            ? lastCheckedAt
              ? `Checked ${new Date(lastCheckedAt).toLocaleTimeString()} — live probe, not a memory.`
              : 'Checked — live probe, not a memory.'
            : checking
              ? 'Checking permissions…'
              : error ?? 'Permissions have not been checked yet.'}
        </span>
        <button
          type="button"
          onClick={() => void refresh(true, 'user-refresh')}
          disabled={checking}
          aria-label="Refresh permissions"
          className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <RefreshCw size={14} />
        </button>
        <span>Refresh</span>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {requestError && <p className="text-xs text-red-500">{requestError}</p>}

      {/* The tracked permissions. */}
      <div className="space-y-3">
        {PERMISSION_DEFS.map((def) => {
          const state = displayState(def.id);
          return (
            <div
              key={def.id}
              data-permission={def.id}
              className="rounded-md border border-[var(--border)] p-3 space-y-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold flex-1">{def.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[state.status]}`}
                >
                  {permissionStatusLabel(state.status)}
                  {state.source === 'recorded' ? ' (last known)' : ''}
                </span>
              </div>
              <p className="text-xs leading-[1.5] text-[var(--text-muted)]">{def.description}</p>
              {state.detail && (
                <p className="text-xs leading-[1.5] text-[var(--text-muted)]">{state.detail}</p>
              )}
              <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
                <span className="font-semibold text-[var(--text-secondary)]">Needs it: </span>
                {def.dependents.length > 0
                  ? def.dependents.join('; ')
                  : 'No feature uses this yet.'}
              </p>
              {state.status !== 'granted' && state.status !== 'not-applicable' && (
                <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
                  <span className="font-semibold text-[var(--text-secondary)]">To grant: </span>
                  {def.grantPath}
                </p>
              )}
              {state.status !== 'granted' && state.status !== 'not-applicable' && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void openSettings(def.id)}
                    className="btn btn-secondary text-xs"
                  >
                    Open System Settings
                  </button>
                  {def.requestable && (
                    <button
                      type="button"
                      onClick={() => void requestPermission(def.id)}
                      disabled={requesting === def.id}
                      className="btn btn-secondary text-xs disabled:opacity-50"
                    >
                      {requesting === def.id ? 'Asking…' : 'Request'}
                    </button>
                  )}
                </div>
              )}
              {state.checkedAt && (
                <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
                  {state.source === 'live' ? 'Checked ' : 'Last known from '}
                  {new Date(state.checkedAt).toLocaleString()}
                  {state.source === 'recorded' ? ' — refresh to re-check.' : ''}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Event log — WHEN every event happened and WHY
          (Gary, 2026-11-08 ~09:50 PST, scope ~10:27 PST: "Now
          all the initial and throughout allow tracking and
          why"). Startup events (the file-explorer walk behind
          the 3 macOS prompts, the startup permission probe)
          and everything after (prompts, probes, state changes,
          folder pickers, pages asking). A cause that could not
          be determined reads 'unknown' — never invented. The
          log survives a restart, so the startup events are
          still here to read after Lucid asks again. Uses only
          the existing theme vars — no theme change. */}
      <div className="space-y-3" data-event-log>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold flex-1">
            Event log — when Lucid asked, and why
          </h3>
          {events.length > 0 && (
            <button
              type="button"
              onClick={clearEvents}
              className="btn btn-secondary text-xs"
            >
              Clear log
            </button>
          )}
        </div>
        {/* Backpressure, made visible: the SPSC ring refuses
            events past its capacity instead of piling them up.
            A refusal is counted, never dropped silently — if
            this number is ever above zero, the log was full. */}
        {refusedCount > 0 && (
          <p className="text-xs text-yellow-500">
            {refusedCount} event{refusedCount === 1 ? '' : 's'} refused — the
            event channel was full. Nothing was dropped silently;
            the producer was told to back off.
          </p>
        )}
        {events.length === 0 ? (
          <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
            No events yet. Startup walks, permission probes and
            prompts, folder pickers, and pages asking for things
            are recorded here with when they happened and why.
          </p>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              data-event={event.type}
              data-event-phase={event.phase}
              className="rounded-md border border-[var(--border)] p-3 space-y-2"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold">
                  {eventTypeLabel(event.type)}
                </span>
                <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
                  {eventPhaseLabel(event.phase)}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${OUTCOME_BADGE[event.outcome]}`}
                >
                  {eventOutcomeLabel(event.outcome)}
                </span>
                <span className="text-xs text-[var(--text-muted)] flex-1 text-right">
                  {new Date(event.at).toLocaleString()}
                </span>
              </div>
              <p className="text-xs">{event.what}</p>
              <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
                <span className="font-semibold text-[var(--text-secondary)]">Why: </span>
                {event.why}
              </p>
              {event.detail && (
                <p className="text-xs leading-[1.5] text-[var(--text-muted)]">{event.detail}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
