/**
 * Browser Phase B — the browser finger queue (Gary, 2026-11-07):
 * finger access one agent at a time, QUEUED, if eligible.
 *
 * Eligibility follows the phone-finger pattern already in the
 * codebase (`src/components/Modules/ComputerControlSegment.tsx`,
 * `computerControlLocked` in the settings): a finger starts
 * enabled, Gary locks it explicitly. While locked, no agent may
 * take the finger — requests are refused, not queued (a queue
 * that could never be granted would only strand agents).
 *
 * Pure and Electron-free so it is unit-testable: the session
 * (`electron/services/browserAgentSession.ts`) owns one instance
 * and drives it from the tool wrapper.
 */

export type BrowserFingerRequestResult =
  | { granted: true }
  | { granted: false; position: number; reason: 'queued' }
  | { granted: false; position: null; reason: 'locked' };

export class BrowserFingerQueue {
  private holder: string | null = null;
  private readonly waiters: string[] = [];
  private locked = false;

  constructor(locked = false) {
    this.locked = locked;
  }

  /** Who holds the finger right now, or null. */
  getHolder(): string | null {
    return this.holder;
  }

  /** Agent ids waiting for the finger, in grant order. */
  getQueue(): string[] {
    return [...this.waiters];
  }

  /** Is the finger locked (Gary locked it)? */
  isLocked(): boolean {
    return this.locked;
  }

  /**
   * Request the finger. The holder re-requesting is a no-op grant.
   * A locked finger refuses outright. Otherwise the first
   * requester is granted and later ones queue in order.
   */
  request(holderId: string): BrowserFingerRequestResult {
    if (this.holder === holderId) return { granted: true };
    if (this.locked) {
      return { granted: false, position: null, reason: 'locked' };
    }
    if (this.holder === null) {
      this.holder = holderId;
      return { granted: true };
    }
    const existing = this.waiters.indexOf(holderId);
    if (existing !== -1) {
      return { granted: false, position: existing + 1, reason: 'queued' };
    }
    this.waiters.push(holderId);
    return {
      granted: false,
      position: this.waiters.length,
      reason: 'queued',
    };
  }

  /**
   * Release the finger. Only the holder can release it; anyone
   * else is a no-op. The next waiter (if any) is granted in
   * order and its id is returned.
   */
  release(holderId: string): string | null {
    if (this.holder !== holderId) return null;
    this.holder = this.waiters.shift() ?? null;
    return this.holder;
  }

  /** Drop a waiter out of the queue (it gave up waiting). */
  cancel(holderId: string): void {
    const index = this.waiters.indexOf(holderId);
    if (index !== -1) this.waiters.splice(index, 1);
  }

  /**
   * Drop the holder WITHOUT granting the next waiter — Gary took
   * control, so nobody holds the finger, but the waiters stay
   * queued for when he hands it back.
   */
  suspendHolder(holderId: string): void {
    if (this.holder !== holderId) return;
    this.holder = null;
  }

  /** Lock the finger. The current holder keeps it until it
   * releases — a lock stops NEW grants, it never yanks a live
   * action mid-click. */
  lock(): void {
    this.locked = true;
  }

  unlock(): void {
    this.locked = false;
  }

  /** Drop the holder and clear the whole queue (Gary stopped the
   * agent — nobody keeps waiting on a stopped session). */
  clearAll(): void {
    this.holder = null;
    this.waiters.length = 0;
  }
}
