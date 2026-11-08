/**
 * instantReplyPackets — the Lucid delivery-decision client for
 * pre-generated replies (Gary, 2026-11-08).
 *
 * This is the THIN side. It decides, it does not pack, verify bytes,
 * or generate anything. Packing lives in ARC-Neuron-LLMBuilder
 * (`instant_reply/`); the bytes live in the ARC Apache v5 store.
 * No new IPC, no UI, no prompt changes — the b82010d prompt (blood
 * drop + gold arrow + `~` + bubble) is untouched.
 *
 * CORRECTION: the ARC items here (SeedCatalog ring, ARC Apache,
 * StreamMemory, OmniBinary, Arc-RAR) are ARC ecosystem modules /
 * links, NOT Lucid segments. Lucid segments are a closed list
 * (src/lib/segmentCategories.ts). This module only mirrors the
 * branch-pass decision table from `instant_reply/branches.py` —
 * same order, same outcomes — so the renderer and the packer can
 * never disagree about what a tick's packet does.
 *
 * Decision order (deliberate):
 *   1. No packet -> FALLBACK_PING. Never invent a reply.
 *   2. Packet but hash failed -> DISCARD + ping. Never serve bad bytes.
 *   3. Packet but wrong branch -> FALLBACK_PING. Another branch's
 *      reply is not this branch's answer.
 *   4. Packet + hash ok + branch ok -> DELIVER the reply verbatim,
 *      zero CPU at reply time.
 */

export type InstantReplyDecision = 'deliver' | 'fallback_ping' | 'discard';

export interface InstantReplyOutcome {
  decision: InstantReplyDecision;
  /** The reply text, only when decision is 'deliver'. */
  replyText: string | null;
  reason: string;
  packetId: string | null;
}

export interface InstantReplyDeliveryInput {
  packetPresent: boolean;
  hashVerified: boolean;
  branchMatches: boolean;
  replyText: string | null;
  packetId?: string | null;
}

export function decideInstantReplyDelivery(
  input: InstantReplyDeliveryInput,
): InstantReplyOutcome {
  const packetId = input.packetId ?? null;
  if (!input.packetPresent) {
    return {
      decision: 'fallback_ping',
      replyText: null,
      reason: 'no packet for this tick — fall back to ping (1 SP)',
      packetId,
    };
  }
  if (!input.hashVerified) {
    return {
      decision: 'discard',
      replyText: null,
      reason:
        'hash verification failed — packet discarded, fall back to ping (1 SP)',
      packetId,
    };
  }
  if (!input.branchMatches) {
    return {
      decision: 'fallback_ping',
      replyText: null,
      reason: 'packet belongs to another branch — fall back to ping (1 SP)',
      packetId,
    };
  }
  return {
    decision: 'deliver',
    replyText: input.replyText,
    reason:
      'packet verified, branch matches — deliver verbatim, zero CPU at reply time',
    packetId,
  };
}
