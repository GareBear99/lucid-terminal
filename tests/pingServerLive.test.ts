import { describe, it, expect, vi } from 'vitest';

// LIVE test: the Lucid client against a real local ping server.
// The Worker runs in mock mode under local `wrangler dev` (the AI
// binding throws "needs to be run remotely" there), so the reply is
// the labelled mock echo — which still proves the full client path:
// HTTP POST + headers + SSE parse + quota headers, socket to socket.
//
// Run:
//   cd ARC-Neuron-LLMBuilder/cloudflare/ping-server
//   printf 'PING_SHARED_SECRET=ping-test-secret\n' > .dev.vars
//   npx wrangler dev --local --port 8787 &
//   cd ~/workspace/lucid-terminal
//   LUCID_PING_LIVE_URL=http://127.0.0.1:8787 LUCID_PING_KEY=ping-test-secret \
//     npx vitest run tests/pingServerLive.test.ts
//   rm ARC-Neuron-LLMBuilder/cloudflare/ping-server/.dev.vars
//
// Skipped unless LUCID_PING_LIVE_URL is set.

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, 'utf8'),
    decryptString: (buffer: Buffer) => buffer.toString('utf8'),
  },
}));

vi.mock('electron-store', () => ({
  default: class MemoryStore {
    private data: Record<string, unknown>;
    constructor(opts: { name: string; defaults?: Record<string, unknown> }) {
      this.data = { ...(opts.defaults ?? {}) };
    }
    get(key: string) {
      return this.data[key];
    }
    set(key: string, value: unknown) {
      this.data[key] = value;
    }
    has(key: string) {
      return key in this.data;
    }
    delete(key: string) {
      delete this.data[key];
    }
    clear() {
      this.data = {};
    }
    get store() {
      return { ...this.data };
    }
  },
}));

import { chatPing, pingServerHealth } from '../electron/services/pingServer';
import { settings, pingKeyStorage } from '../electron/services/secureStorage';

const LIVE_URL = process.env.LUCID_PING_LIVE_URL;
const LIVE_KEY = process.env.LUCID_PING_KEY || '';

describe.skipIf(!LIVE_URL)('ping server live (local wrangler dev)', () => {
  it('streams a real reply from the local Worker and reports quota', async () => {
    settings.set('pingServerEnabled', true);
    settings.set('pingServerEndpoint', LIVE_URL!);
    settings.set('pingServerUserId', `live-test-${process.pid}-${Date.now()}`);
    if (LIVE_KEY) pingKeyStorage.setPingKey(LIVE_KEY);

    const chunks: string[] = [];
    let endedQuota: unknown = null;
    const text = await chatPing(
      [{ role: 'user', content: 'Say the word PINGBACK and nothing else.' }],
      (c) => chunks.push(c),
      (q) => {
        endedQuota = q;
      },
    );

    // Local dev serves the labelled mock echo, which repeats the prompt
    // — so PINGBACK appears either way. The point is the real socket
    // round trip: chunks arrived in order and the reply completed.
    expect(chunks.length).toBeGreaterThan(0);
    expect(text).toContain('PINGBACK');
    expect(endedQuota).toMatchObject({ limit: 100 });
    expect((endedQuota as { remaining: number }).remaining).toBeLessThan(100);

    const health = await pingServerHealth();
    expect(health.ok).toBe(true);
    expect(health.quota).not.toBeNull();
    expect(health.quota!.limit).toBe(100);
  });
});
