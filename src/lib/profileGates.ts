/**
 * Profile verified gates (Gary, 2026-11-12 ~10:48 PST): each profile
 * tracks its verified gates + status temp / unverified / verified /
 * user.
 *
 * A gate is a verification a profile can complete. The registry is
 * the allowlist: only a gate named here can be marked verified on a
 * profile (markGateVerified in the profile store rejects anything
 * else), so a status can never be faked by a typo'd id.
 *
 * Gates that exist today:
 * - telegram: the Telegram verification that turns a temp into a
 *   user (SecurityTab: "a temp becomes a full user through Telegram
 *   once verified"). The account system is NOT built, so there is no
 *   UI path that marks it yet — the gate is named here so the
 *   Profiles screen can show it as "not yet available" and the
 *   verification flow has a seam to call when it lands. Do NOT
 *   invent a Telegram flow to fill this in.
 *
 * `available` is whether a user can complete the gate in the app
 * right now. The Profiles screen only offers available gates; the
 * store action itself is the seam a future verification flow calls.
 */

export interface ProfileGate {
  /** Stable id, stored on the profile's verifiedGates list. */
  id: string;
  /** Short label shown on the Profiles screen. */
  label: string;
  /** One line: what completing this gate means. */
  description: string;
  /** Whether a user can complete this gate in the app right now. */
  available: boolean;
}

export const PROFILE_GATES: ProfileGate[] = [
  {
    id: 'telegram',
    label: 'Telegram verification',
    description:
      'Verifies the profile through Telegram — a temp becomes a user. The account system is not built yet.',
    available: false,
  },
  {
    id: 'daily-check',
    label: 'Daily verification',
    description:
      'Verifies the profile through the daily server check — a temp becomes verified when the grab confirms its referral chain inside the year. Carried down through the FixNet connection.',
    available: false,
  },
];

/** Find a gate by id, or null when no such gate is registered. */
export function findProfileGate(gateId: string): ProfileGate | null {
  return PROFILE_GATES.find((g) => g.id === gateId) ?? null;
}
