// FixNet Pages pull — the main-process half of the client sync.
//
// The FixNet repo's GitHub Pages site publishes the daily data
// (temp verification status, the yield, the deposit data) once a
// day after the 12am grab. This service pulls it. It is the ONLY
// network the sync does, and it is PULL-ONLY: every request is a
// GET to the public Pages site, no auth, no key, no body, and
// nothing is ever sent up. The sync never carries fixes up —
// fixes ride the 12am grab through the ping server, a different
// path entirely (activateTemp / the grab).
//
// The renderer calls this through the `fixnet:sync` IPC channel
// (electron/ipc/fixnet.ts) and applies what comes back via
// applyDailyVerificationIssuance (src/lib/dailyVerification.ts)
// and the verified SP grant (src/lib/verifiedSpGrant.ts).
//
// What is fetched, in order:
//   1. daily/status.json — the cumulative status table: the latest
//      outcome per temp, all days, in tick order. The client reads
//      its own temp's status here.
//   2. daily/latest.json — a pointer to the latest day's file.
//   3. daily/<date>.json — the day's record: the yield + the
//      deposit entries (each verified temp: 1,000 SP/day +
//      snapshot access).
// A missing daily file (no grab has published yet) is not an
// error: the status still applies, the yield is just empty.
// A fetch that fails throws — the caller logs and retries on
// the next sync, never a made-up status.

/** The FixNet repo's GitHub Pages site (the daily channel). */
export const FIXNET_PAGES_BASE_URL =
  'https://garebear99.github.io/LuciferAI_FixNet';

/** One temp's verification status, as published. */
export interface FixNetTempStatus {
  tick: number;
  id: string;
  outcome: 'verified' | 'pending' | 'not_verified' | 'expired';
  day: string | null;
  reason: string | null;
  /**
   * The rotation temp the grab created for this temp (FixNet
   * temp rotation, Gary 2026-11-17): the temp the client
   * rotates onto after this one verifies. Null when the grab
   * created no rotation for it (yet).
   */
  next_temp?: { id: string; tick: number } | null;
}

/** One deposit entry: a temp verified today, and what it is owed. */
export interface FixNetDepositEntry {
  id: string;
  tick: number;
  sp: number;
  snapshot_access: boolean;
}

/** The day's published record (docs/daily/<date>.json). */
export interface FixNetDaily {
  date: string;
  counts: {
    verified: number;
    pending: number;
    not_verified: number;
    expired: number;
    checked: number;
  };
  yield: {
    verified_today: number;
    verified_total: number;
    corpus_entries_today: number | null;
    corpus_total_entries: number | null;
  };
  deposit: {
    sp_per_verified: number;
    overflow_queued: boolean;
    entries: FixNetDepositEntry[];
  };
}

/** What a sync returns to the renderer. */
export interface FixNetSyncResult {
  /** The cumulative status table (latest outcome per temp). */
  status: FixNetTempStatus[];
  /** The latest published day, or null when nothing is published yet. */
  day: string | null;
  /** The day's yield + deposit, or null when no daily file exists yet. */
  daily: FixNetDaily | null;
  /** When the pull happened (ISO timestamp). */
  pulledAt: string;
}

const STATUS_OUTCOMES = ['verified', 'pending', 'not_verified', 'expired'] as const;

function isTempStatus(value: unknown): value is FixNetTempStatus {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.tick === 'number' &&
    Number.isFinite(v.tick) &&
    v.tick >= 0 &&
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    typeof v.outcome === 'string' &&
    (STATUS_OUTCOMES as readonly string[]).includes(v.outcome) &&
    (v.day === null || v.day === undefined || typeof v.day === 'string') &&
    (v.reason === null || v.reason === undefined || typeof v.reason === 'string')
  );
}

function normalizeTempStatus(value: unknown): FixNetTempStatus | null {
  if (!isTempStatus(value)) return null;
  const v = value as Record<string, unknown>;
  // The rotation temp (FixNet temp rotation, Gary 2026-11-17):
  // passed through only when it is a well-formed {id, tick} —
  // a non-empty id and a non-negative integer tick — otherwise
  // null, never trusted. A bad next_temp never invalidates the
  // entry itself.
  let nextTemp: { id: string; tick: number } | null = null;
  const rawNext = v.next_temp as Record<string, unknown> | null | undefined;
  if (rawNext && typeof rawNext === 'object') {
    if (
      typeof rawNext.id === 'string' &&
      rawNext.id.length > 0 &&
      typeof rawNext.tick === 'number' &&
      Number.isInteger(rawNext.tick) &&
      rawNext.tick >= 0
    ) {
      nextTemp = { id: rawNext.id, tick: rawNext.tick };
    }
  }
  return {
    tick: v.tick as number,
    id: v.id as string,
    outcome: v.outcome as FixNetTempStatus['outcome'],
    day: typeof v.day === 'string' ? v.day : null,
    reason: typeof v.reason === 'string' ? v.reason : null,
    next_temp: nextTemp,
  };
}

function isFixNetDaily(value: unknown): value is FixNetDaily {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.date !== 'string' || !v.date) return false;
  if (!v.counts || typeof v.counts !== 'object') return false;
  if (!v.yield || typeof v.yield !== 'object') return false;
  if (!v.deposit || typeof v.deposit !== 'object') return false;
  const deposit = v.deposit as Record<string, unknown>;
  if (!Array.isArray(deposit.entries)) return false;
  return deposit.entries.every(
    (e) =>
      !!e &&
      typeof e === 'object' &&
      typeof (e as Record<string, unknown>).id === 'string' &&
      typeof (e as Record<string, unknown>).sp === 'number',
  );
}

async function fetchJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`FixNet Pages pull failed (${response.status}): ${url}`);
  }
  return (await response.json()) as unknown;
}

/**
 * Pull the daily data from GitHub Pages. `baseUrl` is the Pages
 * site root (default FIXNET_PAGES_BASE_URL); `fetchImpl` is the
 * fetch to use (global fetch in production, a stub in tests).
 * Throws on any fetch failure or malformed payload — the caller
 * retries next sync. Never posts, never uploads: every request
 * this function makes is a GET.
 */
export async function pullFixNetDaily(
  baseUrl: string = FIXNET_PAGES_BASE_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<FixNetSyncResult> {
  const root = baseUrl.replace(/\/$/, '');
  const pulledAt = new Date().toISOString();

  const statusDoc = (await fetchJson(
    `${root}/daily/status.json`,
    fetchImpl,
  )) as Record<string, unknown> | null;
  if (!statusDoc || !Array.isArray(statusDoc.status)) {
    throw new Error('FixNet Pages status.json is malformed: no status array');
  }
  const status: FixNetTempStatus[] = [];
  for (const entry of statusDoc.status as unknown[]) {
    const normalized = normalizeTempStatus(entry);
    if (normalized) status.push(normalized);
  }

  // The daily file: latest.json points at the day, then the day's
  // record. A missing daily file is fine (no grab has published
  // yet) — the status still applies and the daily is null.
  let day: string | null = null;
  let daily: FixNetDaily | null = null;
  try {
    const latest = (await fetchJson(`${root}/daily/latest.json`, fetchImpl)) as Record<
      string,
      unknown
    >;
    if (typeof latest.date === 'string' && latest.date) {
      day = latest.date;
      const dailyDoc = await fetchJson(`${root}/daily/${day}.json`, fetchImpl);
      if (isFixNetDaily(dailyDoc)) {
        daily = dailyDoc;
      }
    }
  } catch {
    // No daily file yet (or it failed to parse): the status
    // above is still good. The next sync retries the daily.
    day = null;
    daily = null;
  }

  return { status, day, daily, pulledAt };
}
