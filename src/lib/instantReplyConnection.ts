/**
 * instantReplyConnection — the Connection module, Lucid side (Gary, 2026-11-08).
 *
 * The Connection is the pass, and the ONLY pass:
 *   "the only pass is the github io cloudflare reciever and transmitter
 *    when called for snapshot or current for mainline tokens"
 *
 *   * GitHub IO holds the manifest / record: version, SHA-256 hash,
 *     download URL, what changed. The GGUF bytes themselves live in R2
 *     (free egress) — the manifest points at them.
 *   * Cloudflare is the receiver / transmitter: the ping-server Worker
 *     receives a request and transmits the answer.
 *
 * It is called ONLY when the snapshot is needed (missing / stale hash /
 * corrupt) or a current-token check is needed (SP balance via ping).
 * Otherwise it is NOT called — local stays local. It never generates,
 * never polls in the background, and costs no CPU at reply time.
 *
 * CORRECTION: this is the bridge TO the AI Chat segment, not a segment
 * itself. Lucid segments are a closed list (src/lib/segmentCategories.ts:
 * about, computer-control, ai-chat, google-drive, telegram, stripe,
 * starship, forge-persona-plex). The ARC items (SeedCatalog ring, ARC
 * Apache, StreamMemory, OmniBinary, Arc-RAR) are ARC ecosystem modules /
 * links, NOT segments. Starship modules would only show up AS segments
 * when a starship is detected, which hasn't happened.
 *
 * What is NOT decided (do not invent it): the Connections mechanism
 * itself — what a Connection is, whether the snapshot IS one, how the
 * starship appears in the AI chat dropdown. This module is the pass as
 * Gary described it. If Gary meant a different connection (Drive /
 * Telegram / Stripe segment), that is a different module, not this one.
 *
 * Pure functions only — no I/O, no fetch, no state. The caller does the
 * manifest check and the ping call; this module only decides whether
 * the pass is called at all, and what it carries.
 */

export type ConnectionCallReason =
  | 'snapshot_needed'
  | 'tokens_current'
  | 'not_called';

export interface ConnectionCallInput {
  snapshotPresent: boolean;
  snapshotHashMatches: boolean;
  snapshotCorrupt: boolean;
  tokenCheckNeeded: boolean;
}

export function shouldCallConnection(
  input: ConnectionCallInput,
): ConnectionCallReason {
  if (
    !input.snapshotPresent ||
    !input.snapshotHashMatches ||
    input.snapshotCorrupt
  ) {
    return 'snapshot_needed';
  }
  if (input.tokenCheckNeeded) {
    return 'tokens_current';
  }
  return 'not_called';
}

export function whatConnectionCarries(reason: ConnectionCallReason): string[] {
  if (reason === 'snapshot_needed') {
    return [
      'manifest (version + SHA-256 + download URL)',
      'snapshot download (GGUF bytes)',
    ];
  }
  if (reason === 'tokens_current') {
    return ['token check (SP balance via ping)'];
  }
  return [];
}
