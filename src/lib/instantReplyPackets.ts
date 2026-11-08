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
 *
 * PACKET-FIRST ORDER (Gary, 2026-11-08 — the CPU-none rule, which
 * overrides the AI chat plan's local-inference default): the
 * instant-reply flow is packet -> ping -> OpenAI (key only,
 * server-side) -> honest error. The local route (llamafile cold-load,
 * a model running on the user's machine) is NEVER a fallback in this
 * flow — user-side CPU must be NONE. Generation CPU is allowed only
 * once, at pack time, server-side / offline. See
 * resolveInstantReplyFallbackAfterPingError(): the second fallback,
 * after the ping route itself errors. The Python packer
 * (`instant_reply/branches.py: fallback_after_ping_error`) mirrors
 * this exact rule.
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

export type InstantReplySecondFallback = 'openai' | 'none';

export interface InstantReplyFallbackAfterPingErrorInput {
  /** The ping error was a 429 (SP spent). */
  isRateLimited: boolean;
  /** An OpenAI API key is configured. */
  hasApiKey: boolean;
  /** Part of the ping reply already streamed to the user. */
  partialReplyStreamed: boolean;
}

/**
 * Second fallback after the ping route itself errors (Gary, 2026-11-08).
 * The ONLY second fallback in the instant-reply flow, deliberately narrow:
 *   - Rate-limited (SP spent, 429) -> 'none', always. The SP gate is
 *     terminal: falling through to OpenAI would spend Gary's paid API
 *     key to bypass a quota the user has exhausted. Never.
 *   - Part of the ping reply already streamed -> 'none'. Appending a
 *     second model's text after partial ping text would serve a
 *     Franken-reply made of two models.
 *   - Otherwise -> 'openai' iff an OpenAI key is configured, else
 *     'none' (honest error, no fake reply).
 * The local route is NOT a fallback here, ever: running a model on the
 * user's machine is user-side CPU, and Gary's rule is user-side CPU =
 * NONE. The local route stays a leg of the general cascade outside this
 * flow; inside this flow it is gated out. Mirrors
 * `instant_reply/branches.py: fallback_after_ping_error` exactly, and
 * `electron/ipc/ai.ts` calls this function — one rule, one definition.
 */
export function resolveInstantReplyFallbackAfterPingError(
  input: InstantReplyFallbackAfterPingErrorInput,
): InstantReplySecondFallback {
  if (input.isRateLimited) return 'none';
  if (input.partialReplyStreamed) return 'none';
  return input.hasApiKey ? 'openai' : 'none';
}
