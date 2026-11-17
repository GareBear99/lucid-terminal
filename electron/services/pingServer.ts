import { settings, pingKeyStorage } from './secureStorage';
import { resolvePingUserId } from '../../src/lib/pingUserId';
import type { PingQuota, PingServerStatus } from '../../src/types';

// Lucid ping server client — the remote-model test path.
//
// Posts chat messages to the Cloudflare ping server Worker
// (ARC-Neuron-LLMBuilder/cloudflare/ping-server) and streams the SSE
// reply into the chat, exactly like the OpenAI path does
// (electron/services/openai.ts). Kept small and separate from the
// local-model path: no tools, no system prompt injection, no local
// backend involvement. The Worker is OpenAI-compatible, so the wire
// shape is the same — `data: {choices:[{delta:{content}}]}` chunks
// ending in `data: [DONE]`.
//
// Identity + quota: every request sends `x-lucid-user`, the ACTIVE
// profile's id (src/lib/pingUserId.ts). The Worker gives each id
// its own SP bucket — 100 SP to start, 1 SP per chat request,
// refilling +25 SP per 4h under 200 (cap 250), verified profiles
// +1,000 SP/day — and answers 429 with the next refill time when
// the bucket is empty. Guest sends its own profile id, so Guest
// gets its own 100-SP bucket and never sees another profile's
// verified balance (2026-11-17: Guest was showing Genesis's
// 1196 SP because the client sent one per-install id for every
// profile). The per-install id survives only as the fallback
// when no profile id is in context. The client surfaces the SP
// balance from the response headers so the UI can show it,
// and turns a 429 into a PingRateLimitError with a human-readable
// message instead of a bare failure.

export const PING_SERVER_DEFAULT_ENDPOINT = 'http://127.0.0.1:8787';
/**
 * The cloud ping server — the default Gary actually uses. The
 * shipped endpoint constant above is the local-dev worker; the
 * cloud URL is the one the Settings default should point at, and
 * the one auto-provisioning (ensureDefaultPingKey, below) applies
 * to. Kept as its own constant so the two are never confused.
 */
export const PING_SERVER_CLOUD_ENDPOINT =
  'https://lucid-ping-server.admension.workers.dev';
/** POST /register on the cloud server — the per-install key
 *  provisioning endpoint (see ensureDefaultPingKey). */
export const PING_SERVER_REGISTER_PATH = '/register';
/**
 * The default ping model — Llama 3.2 1B, the worker's default.
 * The client sends the chat's chosen model as body.model (see
 * chatPing); when no model is chosen (Auto) it sends this default.
 * The worker only honors a model on its PING_MODELS allowlist and
 * falls back to this same default for anything else, so the
 * dropdown (src/lib/chatModels.ts) must stay in sync with the
 * worker's allowlist. Every model costs 1 SP per reply.
 */
export const PING_DEFAULT_MODEL = '@cf/meta/llama-3.2-1b-instruct';
const PING_MODEL = PING_DEFAULT_MODEL;

export interface PingHealth {
  ok: boolean;
  service?: string;
  version?: string;
  model?: string;
  mode?: string;
  ts?: string;
  quota: PingQuota | null;
  echo?: unknown;
}

/** Thrown when the Worker's SP balance is spent (0 SP left). Carries the
 *  balance (limit / remaining / reset) so the caller can say when it refills. */
export class PingRateLimitError extends Error {
  quota: PingQuota;
  constructor(message: string, quota: PingQuota) {
    super(message);
    this.name = 'PingRateLimitError';
    this.quota = quota;
  }
}

let currentAbortController: AbortController | null = null;
let lastQuota: PingQuota | null = null;

/** Last quota the Worker reported (headers on a chat response, or the
 *  /ping body). Null until the client has talked to the server once. */
export function getLastQuota(): PingQuota | null {
  return lastQuota;
}

export function getPingServerEndpoint(): string {
  return settings.get<string>('pingServerEndpoint') || PING_SERVER_DEFAULT_ENDPOINT;
}

export function isPingServerEnabled(): boolean {
  return (
    settings.get<boolean>('pingServerEnabled') === true &&
    getPingServerEndpoint().trim().length > 0
  );
}

/** The per-install id the quota keys off when no profile id is
 *  in context. Generated once (a random UUID) and stored in
 *  settings; rotating it resets the quota — that is dummy-grade
 *  identity, documented in the Worker's README. It is the
 *  FALLBACK, not the identity: pingHeaders() prefers the active
 *  profile's id (resolvePingUserId). */
export function getOrCreateUserId(): string {
  let id = settings.get<string>('pingServerUserId');
  if (!id) {
    const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
    id =
      randomUUID?.() ??
      `lucid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    settings.set('pingServerUserId', id);
  }
  return id;
}

/**
 * Auto-provision a ping key for the DEFAULT (cloud) ping server
 * (Fix 2, 2026-11-17 — Gary: "if its default i shouldnt have
 * to input it").
 *
 * Why this shape: the server authenticates every ping/chat/temp
 * call with `x-lucid-ping-key === PING_SHARED_SECRET`, and there
 * is no provisioning endpoint on the server yet — so a client
 * cannot mint a key by itself, and hardcoding the shared secret
 * in the shipped app would publish it (anyone could extract it
 * from the asar and spam the server / claim SP). The safe design
 * is server-side provisioning: the client asks the server for a
 * per-install key on first contact, the server mints one and
 * accepts it alongside the shared secret, and the client stores
 * it in secure storage exactly like a manually entered key.
 *
 * What this does, on the first ping-server call of the process
 * when the endpoint is the cloud default and no key is stored:
 * POST {endpoint}/register with { userId: <install id> } and
 * expect { ok: true, key: <per-install key> }. On success the
 * key is stored via pingKeyStorage (the same encrypted store
 * Gary's pasted key lives in) and the call proceeds with it.
 * On ANY failure — no endpoint yet (404 today), a network
 * error, a bad body, a missing key — it returns false, stores
 * nothing, and the call proceeds without a key (manual entry
 * remains the path, exactly as today). It never throws, never
 * logs the key, and never retries within the process: one
 * attempt per process, so a missing endpoint costs one 404
 * per launch and nothing more.
 *
 * SERVER SIDE STILL OWED (see the deploy handoff): POST
 * /register must exist on the worker — mint a per-install key,
 * store it, accept it in authorized() alongside the shared
 * secret, and rate-limit registration. Until that endpoint
 * ships, this is a no-op that degrades to manual entry; the
 * client half is done and the behaviour is honest about it.
 *
 * `fetchFn` is injectable so tests can answer the register
 * call without touching the network and without a real key.
 */
let registerAttemptedThisProcess = false;

export function isCloudDefaultEndpoint(endpoint?: string): boolean {
  const current = (endpoint ?? getPingServerEndpoint()).replace(/\/$/, '');
  return current === PING_SERVER_CLOUD_ENDPOINT;
}

export async function ensureDefaultPingKey(
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<boolean> {
  if (registerAttemptedThisProcess) return pingKeyStorage.hasPingKey();
  registerAttemptedThisProcess = true;
  if (!isCloudDefaultEndpoint()) return false;
  if (pingKeyStorage.hasPingKey()) return true;
  let response: Response;
  try {
    response = await fetchFn(
      `${PING_SERVER_CLOUD_ENDPOINT}${PING_SERVER_REGISTER_PATH}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: getOrCreateUserId() }),
      },
    );
  } catch {
    return false;
  }
  if (!response.ok) return false;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return false;
  }
  if (
    typeof body !== 'object' ||
    body === null ||
    (body as Record<string, unknown>).ok !== true ||
    typeof (body as Record<string, unknown>).key !== 'string' ||
    ((body as Record<string, unknown>).key as string).trim() === ''
  ) {
    return false;
  }
  pingKeyStorage.setPingKey((body as Record<string, unknown>).key as string);
  return true;
}

/** "Resets 09:31 UTC (in 3h 12m)" — the next SP refill time, the human half of a 429. */
export function formatResetTime(quota: PingQuota): string {
  const d = new Date(quota.reset * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const s = Math.max(0, quota.reset_in_seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const inWords = h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
  return `Resets ${hh}:${mm} UTC (${inWords})`;
}

function quotaFromHeaders(res: Response): PingQuota | null {
  const limit = res.headers.get('x-ratelimit-limit');
  const remaining = res.headers.get('x-ratelimit-remaining');
  const reset = res.headers.get('x-ratelimit-reset');
  if (limit === null || remaining === null || reset === null) return null;
  const quota: PingQuota = {
    limit: Number(limit),
    remaining: Number(remaining),
    reset: Number(reset),
    reset_in_seconds: Math.max(0, Number(reset) - Math.floor(Date.now() / 1000)),
  };
  lastQuota = quota;
  return quota;
}

// One streamed line from the chat completions endpoint: the API sends
// Server-Sent Events ("data: {...}" lines, ending with "data:
// [DONE]"); a bare JSON line is accepted too. Returns the delta, or
// null for [DONE] and blank lines. Same wire shape as openai.ts's
// streamDelta, duplicated so this module stays dependency-free.
function streamDelta(line: string): { content?: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let payload = trimmed;
  if (payload.startsWith('data:')) {
    payload = payload.slice('data:'.length).trim();
    if (payload === '[DONE]') return null;
  }
  const chunk = JSON.parse(payload);
  // OpenAI shape first: { choices: [{ delta: { content } }] }.
  const delta = chunk.choices?.[0]?.delta;
  if (delta?.content) return delta;
  // Raw Workers AI shape: the live path once streamed
  // { response: "...", p: "...", usage: {...} } with no `choices`
  // at all. Accept it so a raw stream still renders instead of
  // silently producing an empty reply. The worker now transforms
  // live chunks into the OpenAI shape; until that fix lands this
  // is the path for raw chunks, and after it lands a safety net.
  if (typeof chunk.response === 'string' && chunk.response) {
    return { content: chunk.response };
  }
  return delta ?? null;
}

/**
 * Headers for a ping-server call. `x-lucid-user` is the ACTIVE
 * profile's id when one is passed (per-profile SP buckets —
 * Fix 1), falling back to the per-install id when no profile
 * is in context. The key header is sent only when a key is
 * stored (manually entered, or auto-provisioned for the cloud
 * default by ensureDefaultPingKey).
 */
function pingHeaders(profileId?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-lucid-user': resolvePingUserId(profileId, getOrCreateUserId()),
  };
  const key = pingKeyStorage.getPingKey();
  if (key) headers['x-lucid-ping-key'] = key;
  return headers;
}

export async function chatPing(
  initialMessages: { role: string; content: string }[],
  onStream?: (chunk: string) => void,
  onEnd?: (quota: PingQuota | null) => void,
  onError?: (error: string) => void,
  model?: string,
  profileId?: string | null,
): Promise<string> {
  // The model the dropdown chose (a Workers AI id) — sent as
  // body.model so the worker serves it. Absent (Auto) = the
  // default; the worker falls back to the same default for any
  // model not on its allowlist, so a stale pick still answers.
  const resolvedModel = model || PING_MODEL;
  const endpoint = getPingServerEndpoint().replace(/\/$/, '');

  // Cancel any existing stream
  if (currentAbortController) {
    currentAbortController.abort();
  }
  const controller = new AbortController();
  currentAbortController = controller;

  // Default cloud server, no key stored yet: try the
  // per-install provisioning once (Fix 2). A failure is
  // silent — the call proceeds without a key, as today.
  // The controller is created FIRST (and held in a local so
  // cancelPingStream nulling the module variable cannot
  // break the check below): a cancel issued while
  // provisioning is in flight still aborts this stream, and
  // the aborted check returns '' without calling fetch.
  // (Creating it after the await lost the cancel — the
  // controller did not exist yet when cancelPingStream ran.)
  await ensureDefaultPingKey();
  if (controller.signal.aborted) {
    if (currentAbortController === controller) currentAbortController = null;
    return '';
  }

  try {
    const response = await fetch(`${endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: pingHeaders(profileId),
      body: JSON.stringify({
        model: resolvedModel,
        messages: initialMessages,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      let detail = errText;
      let quota: PingQuota | null = quotaFromHeaders(response);
      try {
        const parsed = JSON.parse(errText);
        detail = parsed.error?.message || parsed.error || errText;
        if (typeof parsed.limit === 'number' && typeof parsed.remaining === 'number') {
          quota = {
            limit: parsed.limit,
            remaining: parsed.remaining,
            reset: parsed.reset,
            reset_in_seconds: parsed.reset_in_seconds,
          };
          lastQuota = quota;
        }
      } catch {
        // Not JSON — report the raw body.
      }
      if (response.status === 429 && quota) {
        const message =
          `Ping server out of SP (${quota.remaining}/${quota.limit} left). ` +
          `${formatResetTime(quota)}.`;
        onError?.(message);
        throw new PingRateLimitError(message, quota);
      }
      const message = `Ping server error (${response.status}): ${detail}`;
      onError?.(message);
      throw new Error(message);
    }

    quotaFromHeaders(response);
    if (!response.body) throw new Error('No response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let finalResponse = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const delta = streamDelta(line);
          if (delta?.content) {
            finalResponse += delta.content;
            onStream?.(delta.content);
          }
        } catch (e) {
          console.error('Error parsing JSON chunk:', e);
        }
      }
    }

    if (buffer.trim()) {
      try {
        const delta = streamDelta(buffer);
        if (delta?.content) {
          finalResponse += delta.content;
          onStream?.(delta.content);
        }
      } catch (e) {
        console.error('Error parsing final JSON chunk:', e);
      }
    }

    onEnd?.(lastQuota);
    return finalResponse;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return '';
      }
      // A failure the branches above already reported through onError
      // (429 / HTTP error) must not be reported twice.
      if (!(error instanceof PingRateLimitError) && !error.message.startsWith('Ping server error')) {
        onError?.(error.message);
      }
      throw error;
    }
    throw error;
  } finally {
    currentAbortController = null;
  }
}

export function cancelPingStream(): void {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
}

/** The server's answer to POST /temp/activate: the activation tick
 *  it assigned (the client never assigns one), the pending
 *  verification state, the window end, and whether this id was
 *  already activated (resumed path — re-activation returns the
 *  ORIGINAL tick). 0 neurons, 0 SP. */
export interface TempActivation {
  activationTick: number;
  verificationState: string;
  windowEnd: string;
  resumed: boolean;
}

/** Register a temp profile with the ping server for the daily grab
 *  (POST /temp/activate, shared-secret auth via pingHeaders()).
 *  The body carries the profile id from createProfile — never an
 *  invented id — and referralId null until the referral capture
 *  lands (Q6, its own slice). On a 500, retry once: the server's
 *  resumed path repairs a /put-without-/enqueue. A second failure
 *  throws — the CALLER logs and continues, never failing profile
 *  creation because activation failed. Never called for guests. */
export async function activateTemp(
  profileId: string,
  referralId?: string | null,
): Promise<TempActivation> {
  const endpoint = getPingServerEndpoint().replace(/\/$/, '');
  // The temp's own profile id is the x-lucid-user identity for
  // this call (Fix 1) — the server binds the temp record's
  // owner to it, and the grab marks that owner's bucket
  // verified. A per-install id here would orphan the grant.
  await ensureDefaultPingKey();
  const post = () =>
    fetch(`${endpoint}/temp/activate`, {
      method: 'POST',
      headers: pingHeaders(profileId),
      body: JSON.stringify({ id: profileId, referralId: referralId ?? null }),
    });
  let response = await post();
  if (!response.ok && response.status === 500) {
    // The record may have been created but not queued — the retry
    // takes the server's resumed path and returns the original tick.
    response = await post();
  }
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Temp activation failed (${response.status}): ${errText}`);
  }
  return (await response.json()) as TempActivation;
}

/** Health + echo + free quota lookup. /ping is not metered, so this
 *  never spends quota — the Settings "Test connection" button uses it
 *  to show remaining requests. */
export async function pingServerHealth(
  profileId?: string | null,
): Promise<PingHealth> {
  const endpoint = getPingServerEndpoint().replace(/\/$/, '');
  await ensureDefaultPingKey();
  const response = await fetch(`${endpoint}/ping`, {
    method: 'POST',
    headers: pingHeaders(profileId),
    body: JSON.stringify({ message: 'ping' }),
  });
  if (!response.ok) {
    const errText = await response.text();
    let detail = errText;
    try {
      const parsed = JSON.parse(errText);
      detail = parsed.error?.message || parsed.error || errText;
    } catch {
      // Not JSON — report the raw body.
    }
    throw new Error(`Ping server error (${response.status}): ${detail}`);
  }
  const body = (await response.json()) as PingHealth;
  if (body.quota) lastQuota = body.quota;
  return body;
}

/** Admin pull: GET / on the ping server — the public root the
 *  Worker publishes (Gary, 2026-11-09 ~15:04 PST: the
 *  server-side tracking for admin pulls). A plain GET, not
 *  metered: it spends no SP and no neurons, and it carries no
 *  key (the root is public info). The Security tab pulls it
 *  when it opens and on refresh — one call per pull, never
 *  per event. Throws when the server cannot be reached — the
 *  caller shows "not available", never a made-up status.
 *  What it does NOT return: today's neuron/request usage.
 *  That lives in the Worker's usage DO, which has no public
 *  route — the tab says so instead of inventing it. */
export async function pingServerStatus(): Promise<PingServerStatus> {
  const endpoint = getPingServerEndpoint().replace(/\/$/, '');
  const response = await fetch(`${endpoint}/`, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Ping server error (${response.status})`);
  }
  const body = (await response.json()) as PingServerStatus;
  return body;
}
