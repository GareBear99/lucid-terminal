import { settings, pingKeyStorage } from './secureStorage';
import type { PingQuota } from '../../src/types';

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
// Identity + quota: every request sends `x-lucid-user`, a per-install
// id generated once and stored in settings. The Worker gives each id
// 100 model requests/day (UTC day, reset 00:00 UTC) and answers 429
// with the reset time when it is spent. The client surfaces the quota
// from the response headers so the UI can show remaining requests,
// and turns a 429 into a PingRateLimitError with a human-readable
// message instead of a bare failure.

export const PING_SERVER_DEFAULT_ENDPOINT = 'http://127.0.0.1:8787';
const PING_MODEL = 'lucid-ping';

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

/** Thrown when the Worker's 100/day quota is spent. Carries the quota
 *  (limit / remaining / reset) so the caller can say when it resets. */
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

/** The per-install id the quota keys off. Generated once (a random
 *  UUID) and stored in settings; rotating it resets the quota — that
 *  is dummy-grade identity, documented in the Worker's README. */
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

/** "resets 00:00 UTC (in 5h 12m)" — the human half of a 429. */
export function formatResetTime(quota: PingQuota): string {
  const d = new Date(quota.reset * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const s = Math.max(0, quota.reset_in_seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const inWords = h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
  return `resets ${hh}:${mm} UTC (${inWords})`;
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

function pingHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-lucid-user': getOrCreateUserId(),
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
): Promise<string> {
  const endpoint = getPingServerEndpoint().replace(/\/$/, '');

  // Cancel any existing stream
  if (currentAbortController) {
    currentAbortController.abort();
  }
  currentAbortController = new AbortController();

  try {
    const response = await fetch(`${endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: pingHeaders(),
      body: JSON.stringify({
        model: PING_MODEL,
        messages: initialMessages,
        stream: true,
      }),
      signal: currentAbortController.signal,
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
          `Ping server daily limit reached (${quota.limit} requests/day). ` +
          `Quota ${formatResetTime(quota)}.`;
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

/** Health + echo + free quota lookup. /ping is not metered, so this
 *  never spends quota — the Settings "Test connection" button uses it
 *  to show remaining requests. */
export async function pingServerHealth(): Promise<PingHealth> {
  const endpoint = getPingServerEndpoint().replace(/\/$/, '');
  const response = await fetch(`${endpoint}/ping`, {
    method: 'POST',
    headers: pingHeaders(),
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
