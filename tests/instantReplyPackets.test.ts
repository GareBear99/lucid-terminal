// @vitest-environment node
/**
 * instantReplyPackets + instantReplyConnection — branch-pass and the
 * Connection pass (Gary, 2026-11-08).
 *
 * These tests pin the two decision tables so the Lucid renderer and
 * the ARC-Neuron-LLMBuilder packer (`instant_reply/branches.py`,
 * `instant_reply/connection.py`) can never disagree:
 *  - deliver only on packet + hash ok + branch ok, verbatim;
 *  - no packet -> ping, never invent;
 *  - corrupt -> discard, never serve bad bytes;
 *  - wrong branch -> ping;
 *  - the Connection pass is called only for snapshot-needed or a
 *    token check, otherwise not called — local stays local.
 *
 * Pure functions, no I/O. Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import {
  decideInstantReplyDelivery,
  resolveInstantReplyFallbackAfterPingError,
} from '../src/lib/instantReplyPackets';
import {
  shouldCallConnection,
  whatConnectionCarries,
} from '../src/lib/instantReplyConnection';

const REPLY = "Lucid's AI chat answers from the snapshot when it matches.";

describe('decideInstantReplyDelivery — branch-pass', () => {
  it('delivers the verified packet verbatim', () => {
    const out = decideInstantReplyDelivery({
      packetPresent: true,
      hashVerified: true,
      branchMatches: true,
      replyText: REPLY,
      packetId: 'abc',
    });
    expect(out.decision).toBe('deliver');
    expect(out.replyText).toBe(REPLY);
  });

  it('no packet -> ping, never invents a reply', () => {
    const out = decideInstantReplyDelivery({
      packetPresent: false,
      hashVerified: false,
      branchMatches: false,
      replyText: null,
    });
    expect(out.decision).toBe('fallback_ping');
    expect(out.replyText).toBeNull();
  });

  it('corrupt packet -> discard, never serves bad bytes', () => {
    const out = decideInstantReplyDelivery({
      packetPresent: true,
      hashVerified: false,
      branchMatches: true,
      replyText: REPLY,
    });
    expect(out.decision).toBe('discard');
    expect(out.replyText).toBeNull();
  });

  it('wrong branch -> ping', () => {
    const out = decideInstantReplyDelivery({
      packetPresent: true,
      hashVerified: true,
      branchMatches: false,
      replyText: REPLY,
    });
    expect(out.decision).toBe('fallback_ping');
    expect(out.replyText).toBeNull();
  });
});

describe('resolveInstantReplyFallbackAfterPingError — second fallback (Gary, 2026-11-08)', () => {
  it('clean ping error with a key falls back to OpenAI (server-side, no user CPU)', () => {
    expect(
      resolveInstantReplyFallbackAfterPingError({
        isRateLimited: false,
        hasApiKey: true,
        partialReplyStreamed: false,
      }),
    ).toBe('openai');
  });

  it('clean ping error without a key is an honest error, not a fake reply', () => {
    expect(
      resolveInstantReplyFallbackAfterPingError({
        isRateLimited: false,
        hasApiKey: false,
        partialReplyStreamed: false,
      }),
    ).toBe('none');
  });

  it('rate limit is terminal even with a key — the SP gate is never bypassed', () => {
    expect(
      resolveInstantReplyFallbackAfterPingError({
        isRateLimited: true,
        hasApiKey: true,
        partialReplyStreamed: false,
      }),
    ).toBe('none');
  });

  it('partial ping reply already streamed is terminal even with a key — no Franken-reply', () => {
    expect(
      resolveInstantReplyFallbackAfterPingError({
        isRateLimited: false,
        hasApiKey: true,
        partialReplyStreamed: true,
      }),
    ).toBe('none');
  });
});

describe('shouldCallConnection — the pass', () => {
  it('snapshot needed beats a token check', () => {
    expect(
      shouldCallConnection({
        snapshotPresent: false,
        snapshotHashMatches: false,
        snapshotCorrupt: false,
        tokenCheckNeeded: true,
      }),
    ).toBe('snapshot_needed');
    expect(
      shouldCallConnection({
        snapshotPresent: true,
        snapshotHashMatches: true,
        snapshotCorrupt: true,
        tokenCheckNeeded: false,
      }),
    ).toBe('snapshot_needed');
  });

  it('token check only when the snapshot is fine', () => {
    expect(
      shouldCallConnection({
        snapshotPresent: true,
        snapshotHashMatches: true,
        snapshotCorrupt: false,
        tokenCheckNeeded: true,
      }),
    ).toBe('tokens_current');
    expect(whatConnectionCarries('tokens_current')).toEqual([
      'token check (SP balance via ping)',
    ]);
  });

  it('not called when local is fine — local stays local', () => {
    expect(
      shouldCallConnection({
        snapshotPresent: true,
        snapshotHashMatches: true,
        snapshotCorrupt: false,
        tokenCheckNeeded: false,
      }),
    ).toBe('not_called');
    expect(whatConnectionCarries('not_called')).toEqual([]);
    expect(whatConnectionCarries('snapshot_needed')).toEqual([
      'manifest (version + SHA-256 + download URL)',
      'snapshot download (GGUF bytes)',
    ]);
  });
});
