/**
 * Security tab — Settings > Security (Gary, 2026-11-09 ~14:51–14:52 PST).
 *
 * "And we need a security tab in general" / "in settings" / "For
 * where you check all that stuff platform wide" — one place in
 * Settings where the whole platform's security state is checked:
 * the snapshot, the Living Golem, starship detection, the ping
 * key, SP, the free-tier allowances, and the permissions /
 * denials, plus the snapshot-update events as they happened in
 * the ring.
 *
 * LIGHTWEIGHT TRACKING SYSTEM (Gary, 2026-11-09 ~15:04 PST):
 * this tab is the CLIENT-SIDE HOME of the new lightweight
 * tracking system — it tracks absolutely everything, lightweight:
 * local ring ticks + settings reads, 0 neurons, 0 SP, no new
 * server call per event. Client side: snapshot state + update
 * stream (time + strain), permissions/denials, SP, allowances,
 * and WHERE + WHY each event happened (the "be like you"
 * diagnosis — when and why, not just what). If the code tracks
 * an event's cause, the tab shows it; if it does not, the event
 * is shown honestly without an invented cause.
 * Server side (admin pull): a separate section below pulls the
 * ping server's public root (GET /) when the tab opens and on
 * refresh — ONE call per pull, never per event, unmetered (no
 * SP, no neurons). It shows what the server actually exposes
 * (maintenance state, server caps) and marks what it does not
 * as not yet available — neurons/requests usage today (the
 * server counts it in its usage DO, but the DO has NO public
 * route), server CPU (not applicable — Cloudflare Workers is
 * serverless; the CPU being reduced is LOCAL), GPU (plan-only,
 * NOT built — "we're not ready"). Do NOT invent server data.
 *
 * HONESTY RULES (the same as the Permissions tab — "like you"):
 * - Nothing is shown as live unless it IS live. A value that
 *   comes from a probe is marked live; a value that is only a
 *   memory is marked as such; a value that does not exist yet
 *   is shown as not existing, never invented.
 * - The snapshot: no model is trained yet, so no snapshot is
 *   installed — the tab says so. The manifest is checked on
 *   pull (the Connection pass: GitHub IO manifest); there is no
 *   manifest to check against yet, so the canonical version
 *   reads "not checked yet", never a made-up version.
 * - Starship detection: the mechanism is open (Gary's call) —
 *   detectStarship() always answers "not detected" with its
 *   detail string. The tab shows that, never a faked detection.
 * - Living Golem: nobody owns one yet and detection is open —
 *   isSummonUnlocked() is always false. The tab shows locked
 *   with the rule, never an unlocked state.
 * - The ping key: only present / not set is shown. The key
 *   value is NEVER displayed, logged, or copied.
 * - Allowances: the free-tier caps (10,000 neurons/day,
 *   100,000 actions/day) are shown; usage is NOT tracked in
 *   Lucid yet, so no usage number is shown — a made-up usage
 *   would be a lie. The SP balance comes from the AI store's
 *   ping quota (live from the server, or base 100 when the
 *   server is unreachable); null means not checked yet.
 * - The 1000 SP/day for verified users is a TARGET —
 *   verification is not built yet, so nothing can return
 *   verified right now (see src/lib/sovereignPoints.ts).
 *
 * The tab does NOT probe anything itself: it reads the stores
 * (settings, AI store quota, permissions store, event log).
 * Probing lives in the Permissions tab; the Security tab shows
 * the same live probe result when one exists.
 */
import { useCallback, useEffect, useState } from 'react';
import { Lock, RefreshCw } from 'lucide-react';
import {
  ACTIONS_PER_DAY_CAP,
  NEURONS_PER_DAY_CAP,
} from '../../lib/snapshotUpdate';
import {
  snapshotStreamPhaseLabel,
  summarizeSnapshotStream,
} from '../../lib/snapshotStream';
import { AI_CHAT_TICK_RING_CAPACITY } from '../../lib/aiChatTicks';
import { detectStarship } from '../../lib/starshipDetection';
import { isSummonUnlocked, LILLY_SUMMON } from '../../lib/summons';
import {
  PERMISSION_DEFS,
  permissionStatusLabel,
} from '../../lib/permissions';
import {
  EVENT_RING_CAPACITY,
  eventOutcomeLabel,
  eventPhaseLabel,
  eventTypeLabel,
  type EventOutcome,
} from '../../lib/eventLog';
import { SP_VERIFIED_DAILY } from '../../lib/sovereignPoints';
import type { PingServerStatus } from '../../types';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAIStore } from '../../stores/aiStore';
import { useEventLogStore } from '../../stores/eventLogStore';
import { usePermissionsStore } from '../../stores/permissionsStore';

/** Outcome badge colours — same palette as PermissionsTab, so
 *  the security events read the same way: green = it worked,
 *  red = refused / failed, yellow = waiting / dismissed. */
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

/** Security-relevant event types shown in this tab's log: the
 *  snapshot update steps, permission prompts / state changes,
 *  and asks with no attributable trigger. Other event types
 *  (startup walks, directory reads, folder pickers) stay in
 *  the Permissions tab's full log. */
const SECURITY_EVENT_TYPES = new Set([
  'snapshot.update-detected',
  'snapshot.ping-fallback',
  'snapshot.download-started',
  'snapshot.hash-verified',
  'snapshot.flipped',
  'snapshot.packet-hits',
  'snapshot.alert-shown',
  'snapshot.alert-dismissed',
  'snapshot.update-failed',
  'permission.prompt',
  'permission.state-change',
  'unexpected-ask',
]);

/** "212 ms" / "3.4 s" — stream phase durations, speakable. */
function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/** A group heading inside the tab — the client-side tracking
 *  group and the server-side (admin) group. */
function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-bold text-[var(--text-primary)] pt-2">{children}</h2>
  );
}

/** Short hash for display — the hash is a public integrity
 *  value, not a secret, but the full 64 hex chars are noise
 *  in a settings row. */
function shortHash(hash: string): string {
  return hash.length > 16 ? `${hash.slice(0, 16)}…` : hash;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-[var(--border)] p-3 space-y-2">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
      <span className="font-semibold text-[var(--text-secondary)]">{label}: </span>
      {children}
    </p>
  );
}

export function SecurityTab() {
  const settings = useSettingsStore((s) => s.settings);
  const hasPingKey = useSettingsStore((s) => s.hasPingKey);
  const updateSetting = useSettingsStore((s) => s.updateSetting);
  const pingQuota = useAIStore((s) => s.pingQuota);
  const pingQuotaSource = useAIStore((s) => s.pingQuotaSource);
  const events = useEventLogStore((s) => s.events);
  const refusedCount = useEventLogStore((s) => s.refusedCount);
  const snapshotStream = useEventLogStore((s) => s.snapshotStream);
  const permissionSnapshot = usePermissionsStore((s) => s.snapshot);
  const permissionDisplayState = usePermissionsStore((s) => s.displayState);

  const installedVersion = settings.installedSnapshotVersion ?? null;
  const installedHash = settings.installedSnapshotHash ?? null;
  const dismissedVersions = settings.snapshotAlertDismissedVersions ?? [];
  const starship = detectStarship();
  const lillyUnlocked = isSummonUnlocked(LILLY_SUMMON);
  const securityEvents = events.filter((e) => SECURITY_EVENT_TYPES.has(e.type));
  const streamSummary = summarizeSnapshotStream(snapshotStream);

  // Server-side (admin) pull — the ping server's public root
  // (GET /). ONE call when the tab opens and one per Refresh
  // press, never per event; unmetered (no SP, no neurons).
  // The pull is best-effort: when the server cannot be
  // reached (or this view has no pull), the section says so
  // instead of showing a made-up status.
  const [serverStatus, setServerStatus] = useState<PingServerStatus | null>(null);
  const [serverStatusAt, setServerStatusAt] = useState<number | null>(null);
  const [serverStatusError, setServerStatusError] = useState<string | null>(null);
  const [serverStatusLoading, setServerStatusLoading] = useState(false);
  const refreshServerStatus = useCallback(() => {
    const pull =
      (window as unknown as { lucidAPI?: { ai?: { pingServerStatus?: () => Promise<PingServerStatus> } } })
        .lucidAPI?.ai?.pingServerStatus;
    if (typeof pull !== 'function') {
      setServerStatusError('Server pull is not available in this view.');
      return;
    }
    setServerStatusLoading(true);
    setServerStatusError(null);
    pull()
      .then((status) => {
        setServerStatus(status);
        setServerStatusAt(Date.now());
      })
      .catch((err: unknown) => {
        setServerStatusError(
          err instanceof Error ? err.message : 'Server pull failed.',
        );
      })
      .finally(() => setServerStatusLoading(false));
  }, []);
  useEffect(() => {
    refreshServerStatus();
  }, [refreshServerStatus]);

  const clearDismissed = () => {
    void updateSetting('snapshotAlertDismissedVersions', []);
  };

  return (
    <div className="space-y-4" data-testid="security-tab">
      <div className="rounded-md border border-[var(--border)] p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Lock size={16} className="text-[var(--text-muted)] shrink-0" />
          <h3 className="text-sm font-semibold flex-1">
            Security — the whole platform, in one place
          </h3>
        </div>
        <p className="text-sm leading-relaxed">
          The client-side home of the lightweight tracking system:
          the snapshot, the last update stream&rsquo;s time and
          strain on the ring, the Living Golem, starship
          detection, the ping key, SP, the allowances, and the
          permissions and denials — checked here, platform wide,
          with when and why for each event. The server side
          (admin pull) is below. Nothing here is assumed: a value
          that is not checked yet says so, and a value that does
          not exist yet says so.
        </p>
      </div>

      <GroupHeading>Tracking — client side (lightweight)</GroupHeading>
      <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
        Local only: ring ticks + settings reads, 0 neurons, 0 SP,
        no server call per event.
      </p>

      {/* Snapshot — the installed brain + the update alert state. */}
      <Section title="Snapshot">
        {installedVersion === null ? (
          <>
            <Row label="Installed">No snapshot installed — no model trained yet.</Row>
            <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
              The snapshot is the trained model (one GGUF + its
              SHA-256 hash). Training has not finished yet, so
              there is nothing installed to check.
            </p>
          </>
        ) : (
          <>
            <Row label="Installed version">{installedVersion}</Row>
            <Row label="Installed hash">
              {installedHash === null ? 'Not recorded' : shortHash(installedHash)}
            </Row>
            <Row label="Verified">Hash verified before install.</Row>
          </>
        )}
        <Row label="Canonical (manifest)">
          Not checked yet — the manifest is checked on pull (GitHub
          IO). There is no manifest published yet.
        </Row>
        <Row label="Update alerts">
          {dismissedVersions.length === 0
            ? 'On — a new snapshot alerts once per version.'
            : `${dismissedVersions.length} version${dismissedVersions.length === 1 ? '' : 's'} dismissed (${dismissedVersions.join(', ')}). New versions still alert.`}
        </Row>
        {dismissedVersions.length > 0 && (
          <button
            type="button"
            onClick={clearDismissed}
            data-testid="security-show-snapshot-alerts-again"
            className="btn btn-secondary text-xs"
          >
            Show snapshot alerts again
          </button>
        )}
      </Section>

      {/* Last snapshot update — time + strain on the ring
          throughout the whole stream (Gary, 2026-11-09 ~15:00
          PST). One sample per phase, from the rings' own
          reporting — no new metrics system, no invented
          numbers. */}
      <Section title="Last snapshot update — time + strain">
        {streamSummary === null ? (
          <Row label="Stream">
            No snapshot update stream yet — no snapshot exists to
            update, so nothing has streamed through the ring.
          </Row>
        ) : (
          <>
            <Row label="Version">{streamSummary.version}</Row>
            <Row label="Status">
              {streamSummary.status === 'complete'
                ? 'Complete — the first packet hit the new snapshot.'
                : streamSummary.status === 'failed'
                  ? 'Failed — the installed snapshot stayed current.'
                  : 'In progress — the update stream is still running.'}
            </Row>
            <Row label="Started">
              {new Date(streamSummary.startedAt).toLocaleString()}
            </Row>
            <Row label="Total">
              {streamSummary.totalMs === null
                ? 'Not measurable yet — fewer than two phases recorded.'
                : `${formatMs(streamSummary.totalMs)}${streamSummary.status === 'in-progress' ? ' so far' : ''}`}
            </Row>
            {streamSummary.phaseDurations.length > 0 && (
              <div className="space-y-1">
                {streamSummary.phaseDurations.map((d) => (
                  <p
                    key={`${d.from}-${d.to}`}
                    className="text-xs leading-[1.5] text-[var(--text-muted)]"
                  >
                    <span className="font-semibold text-[var(--text-secondary)]">
                      {snapshotStreamPhaseLabel(d.from)} → {snapshotStreamPhaseLabel(d.to)}:{' '}
                    </span>
                    {formatMs(d.ms)}
                  </p>
                ))}
              </div>
            )}
            <Row label="Event ring">
              Deepest {streamSummary.peakEventRingDepth} of {EVENT_RING_CAPACITY} in
              flight during the stream
              {streamSummary.eventRingRefusedDuring > 0
                ? ` — ${streamSummary.eventRingRefusedDuring} tick${streamSummary.eventRingRefusedDuring === 1 ? '' : 's'} refused by backpressure (counted, never dropped silently).`
                : ' — nothing refused.'}
            </Row>
            <Row label="AI chat tick ring">
              Deepest {streamSummary.peakAiChatTickRingDepth} of{' '}
              {AI_CHAT_TICK_RING_CAPACITY} in flight during the stream
              {streamSummary.aiChatTickRingRefusedDuring > 0
                ? ` — ${streamSummary.aiChatTickRingRefusedDuring} tick${streamSummary.aiChatTickRingRefusedDuring === 1 ? '' : 's'} refused by backpressure.`
                : ' — nothing refused.'}
            </Row>
            <Row label="Longest tick wait">
              {formatMs(streamSummary.maxTickWaitMs)} in the event ring
              (enqueue → drain).
            </Row>
          </>
        )}
      </Section>

      {/* Living Golem — the summon unlock. */}
      <Section title="Living Golem">
        <Row label="Status">
          {lillyUnlocked
            ? 'Unlocked on this account.'
            : 'Locked — no Living Golem on this account.'}
        </Row>
        <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
          The first summon unlocks the first time with a Living
          Golem ($5 a month or $1 every 72 hours of use). Nobody
          owns one yet, and Living Golem detection is not built —
          that mechanism is Gary&rsquo;s call.
        </p>
      </Section>

      {/* Starship detection — the hook, honestly not detected. */}
      <Section title="Starship">
        <Row label="Detected">{starship.detected ? 'Yes' : 'No'}</Row>
        <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
          {starship.detail}
        </p>
      </Section>

      {/* Ping key — present / not set only, never the value. */}
      <Section title="Ping key">
        <Row label="Key">{hasPingKey ? 'Set' : 'Not set'}</Row>
        <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
          The shared secret for the Cloudflare ping server. The
          value is never shown here. Gary keeps his copy in the
          projects folder.
        </p>
      </Section>

      {/* SP balance — live from the server, or the base-100
          known state when the server is unreachable. */}
      <Section title="SP balance">
        {pingQuota === null ? (
          <Row label="Balance">Not checked yet.</Row>
        ) : (
          <>
            <Row label="Balance">
              {pingQuota.remaining} SP of {pingQuota.limit} SP
              {pingQuotaSource === 'base'
                ? ' — base 100, no server connection (known state, not an error).'
                : ''}
            </Row>
            <Row label="Verified target">
              {SP_VERIFIED_DAILY} SP a day once verified — a target.
              Verification is not built yet, so nothing can return
              verified right now.
            </Row>
          </>
        )}
        <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
          Local replies cost 0 SP. A reply from the ping server
          costs 1 SP. The snapshot keeps most replies local.
        </p>
      </Section>

      {/* Allowances — the free-tier caps. Usage is not tracked
          in Lucid yet, so no usage number is shown here. */}
      <Section title="Allowances — free tier only">
        <Row label="Neurons">
          Cap {NEURONS_PER_DAY_CAP.toLocaleString()} per day
          (Cloudflare Workers AI, free tier) — usage not tracked
          in Lucid yet.
        </Row>
        <Row label="Actions">
          Cap {ACTIONS_PER_DAY_CAP.toLocaleString()} per day
          (Cloudflare Workers, free tier) — usage not tracked in
          Lucid yet.
        </Row>
        <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
          Ring ticks are local — 0 neurons, 0 SP. The manifest
          check is a single Connection call. The snapshot download
          is R2 free egress. Nothing here spends against a paid
          plan, because there is none.
        </p>
      </Section>

      {/* Permissions + denials — the live probe result when one
          exists, honestly unknown when it does not. */}
      <Section title="Permissions and denials">
        {permissionSnapshot === null && (
          <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
            Not checked yet — open the Permissions tab to probe.
            The live probe is the truth; a recorded grant is only
            ever a memory.
          </p>
        )}
        <div className="space-y-2">
          {PERMISSION_DEFS.map((def) => {
            const state = permissionDisplayState(def.id);
            return (
              <div
                key={def.id}
                data-permission={def.id}
                className="flex items-center gap-2"
              >
                <span className="text-xs font-semibold flex-1">{def.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    state.status === 'granted'
                      ? 'bg-green-500/10 text-green-500'
                      : state.status === 'denied'
                        ? 'bg-red-500/10 text-red-500'
                        : 'bg-yellow-500/10 text-yellow-500'
                  }`}
                >
                  {permissionStatusLabel(state.status)}
                  {state.source === 'recorded' ? ' (last known)' : ''}
                </span>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Security events — the snapshot + permission steps as
          they happened in the ring, in causal order. */}
      <div className="space-y-3" data-security-events>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold flex-1">
            Security events — when it happened, and why
          </h3>
          <RefreshCw size={14} className="text-[var(--text-muted)]" />
        </div>
        {refusedCount > 0 && (
          <p className="text-xs text-yellow-500">
            {refusedCount} event{refusedCount === 1 ? '' : 's'} refused — the
            event channel was full. Nothing was dropped silently;
            the producer was told to back off.
          </p>
        )}
        {securityEvents.length === 0 ? (
          <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
            No security events yet. Snapshot detections, downloads,
            hash verifications, swaps, alerts, permission prompts
            and denials are recorded here with when they happened
            and why.
          </p>
        ) : (
          securityEvents.map((event) => (
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

      <GroupHeading>Tracking — server side (admin pull)</GroupHeading>
      <p className="text-xs leading-[1.5] text-[var(--text-muted)]">
        Pulled from the ping server&rsquo;s public root (GET /) —
        one call when this tab opens, one per Refresh, never per
        event. Unmetered: no SP, no neurons. Only Gary (admin)
        needs this; it is the server&rsquo;s side of the tracking,
        not the client&rsquo;s.
      </p>

      {/* Server side — what the server actually exposes, and
          what it does not (Gary, 2026-11-09 ~15:04 PST). */}
      <Section title="Server — ping server (admin)">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refreshServerStatus}
            disabled={serverStatusLoading}
            data-testid="security-refresh-server-status"
            className="btn btn-secondary text-xs"
          >
            {serverStatusLoading ? 'Pulling…' : 'Refresh server status'}
          </button>
          {serverStatusAt !== null && (
            <span
              data-testid="security-server-pulled-at"
              className="text-xs text-[var(--text-muted)]"
            >
              Pulled {new Date(serverStatusAt).toLocaleString()}
            </span>
          )}
        </div>
        {serverStatusError !== null && (
          <p className="text-xs leading-[1.5] text-yellow-500">
            Server status not available — {serverStatusError}
          </p>
        )}
        {serverStatus !== null && (
          <>
            <Row label="Service">
              {serverStatus.service ?? 'ping server'}
              {serverStatus.version ? ` (${serverStatus.version})` : ''}
              {serverStatus.model ? ` — model ${serverStatus.model}` : ''}
              {serverStatus.mode ? ` — ${serverStatus.mode}` : ''}
            </Row>
            <Row label="Maintenance">
              {serverStatus.maintenance === null || serverStatus.maintenance === undefined
                ? 'Up — not in maintenance.'
                : `In maintenance — ${serverStatus.maintenance.reason ?? 'no reason given'}${serverStatus.maintenance.back_in_seconds !== undefined ? `, back in ${formatMs(serverStatus.maintenance.back_in_seconds * 1000)}` : ''}.`}
            </Row>
            {serverStatus.server_caps !== undefined && (
              <Row label="Server caps">
                {serverStatus.server_caps.neurons_per_day !== undefined
                  ? `${serverStatus.server_caps.neurons_per_day.toLocaleString()} neurons/day`
                  : 'neurons cap unknown'}
                {serverStatus.server_caps.requests_per_day !== undefined
                  ? `, ${serverStatus.server_caps.requests_per_day.toLocaleString()} requests/day`
                  : ''}
                {serverStatus.server_caps.maintenance_hours !== undefined
                  ? `, ${serverStatus.server_caps.maintenance_hours}h maintenance when a cap is hit`
                  : ''}
                .
              </Row>
            )}
            <Row label="Where + why (server)">
              {serverStatus.maintenance !== null && serverStatus.maintenance !== undefined
                ? `The maintenance view is the server's where + why: ${serverStatus.maintenance.reason ?? 'no reason given'}${serverStatus.maintenance.detail ? ` — ${serverStatus.maintenance.detail}` : ''}.`
                : 'No server events right now — the server records usage per day, not per event. Per-event where + why lives in the client-side ring above.'}
            </Row>
          </>
        )}
        <Row label="Neurons today">
          Not yet available — the server counts today&rsquo;s
          neurons in its usage store, but that store has no
          public route (the Worker is its only caller), so this
          client cannot pull it. An admin route on the Worker is
          future work — a server change, not a client one. The
          cap is {NEURONS_PER_DAY_CAP.toLocaleString()}/day.
        </Row>
        <Row label="Requests today">
          Not yet available — same store, same reason. The cap is{' '}
          {ACTIONS_PER_DAY_CAP.toLocaleString()}/day.
        </Row>
        <Row label="CPU (server)">
          Not applicable — the ping server is serverless
          (Cloudflare Workers), so there is no server CPU to
          track. The CPU being reduced is LOCAL, by the snapshot
          answering locally.
        </Row>
        <Row label="GPU">
          Not yet available — the GPU pool is plan-only, NOT
          built (&ldquo;we&rsquo;re not ready&rdquo;). GPU tracking
          (when it is on, for which designated job, how long)
          waits on the pool.
        </Row>
      </Section>
    </div>
  );
}
