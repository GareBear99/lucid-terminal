/**
 * Sovereign Points (SP) — the info page (Gary, 2026-11-08 ~07:20 PST).
 *
 * "This needs to be in info page heavily well explained and voice
 * audio for it." The SP system, explained in full, on the Help
 * (info) page, with a voice that reads the exact words on the page.
 *
 * One canonical source. The info page renders these sections
 * verbatim, and the voice MP3 (public/help/sovereign-points-
 * explained.mp3) is synthesized from this exact text — the voice
 * reads the exact words on the page, no paraphrase, no extra words.
 * If the words change, the MP3 must be re-synthesized from the new
 * text. Same pattern as the permissions info page (permissions.ts).
 *
 * Numbers come from the code, not from memory: the starting balance,
 * the stage limits, and the refill rates are imported from
 * pingQuota.ts, which mirrors the ping server's bucket (bucket.js:
 * SP_INITIAL 100, Stage 1 +25 every 4h cap 200, Stage 2 +20 every
 * 12h cap 250, threshold 200, max cap 250 — verified against the
 * live server, GET / returns the same quota). If the server ever
 * changes those numbers, the text changes with it.
 *
 * Written to be spoken: plain language, no markdown, no URLs, no
 * abbreviations. Digits stay as digits — the page shows 200 SP and
 * the voice says "two hundred S P", which is the same words.
 */
import {
  SP_BASE_BALANCE,
  SP_STAGE1_LIMIT,
  SP_STAGE2_LIMIT,
  SP_STAGE1_PERIOD_SECONDS,
  SP_STAGE2_PERIOD_SECONDS,
} from './pingQuota';

/** The voice-message audio path for the SP info page. */
export const SP_INFO_VOICE_SRC = './help/sovereign-points-explained.mp3';

/** One section of the SP explanation: a heading and its paragraphs. */
export interface SpInfoSection {
  heading: string;
  paragraphs: string[];
}

/** Stage 1 refill: +25 SP every 4 hours, while the balance is under 200. */
export const SP_STAGE1_REFILL = 25;
/** Stage 2 refill: +20 SP every 12 hours, once the balance is 200 or more. */
export const SP_STAGE2_REFILL = 20;
/** Verified users get this many SP a day, regardless of the neuron limit. */
export const SP_VERIFIED_DAILY = 1000;

const stage1Hours = SP_STAGE1_PERIOD_SECONDS / 3600;
const stage2Hours = SP_STAGE2_PERIOD_SECONDS / 3600;

export const SP_INFO_SECTIONS: SpInfoSection[] = [
  {
    heading: 'What SP is',
    paragraphs: [
      `SP stands for Sovereign Points. SP is your budget for talking to the ping server. Every chat reply from the server costs 1 SP. Talking to a model running locally on your own machine costs 0 SP, and checking in with the server costs 0 SP and never blocks you.`,
    ],
  },
  {
    heading: `Starting at ${SP_BASE_BALANCE} SP`,
    paragraphs: [
      `You start at ${SP_BASE_BALANCE} SP. That is the starting balance for every new user, before any refill. From there your balance refills on a schedule, in two stages.`,
    ],
  },
  {
    heading: `Stage 1: under ${SP_STAGE1_LIMIT} SP`,
    paragraphs: [
      `While your balance is under ${SP_STAGE1_LIMIT} SP, it refills by ${SP_STAGE1_REFILL} SP every ${stage1Hours} hours, up to a cap of ${SP_STAGE1_LIMIT} SP. A new user climbs ${SP_BASE_BALANCE}, 125, 150, 175, then ${SP_STAGE1_LIMIT}, one refill every ${stage1Hours} hours.`,
    ],
  },
  {
    heading: `Stage 2: ${SP_STAGE1_LIMIT} SP and above`,
    paragraphs: [
      `Once your balance reaches ${SP_STAGE1_LIMIT} SP, refills switch to stage 2: ${SP_STAGE2_REFILL} SP every ${stage2Hours} hours, up to a cap of ${SP_STAGE2_LIMIT} SP. An idle user climbs ${SP_STAGE1_LIMIT}, 220, 240, ${SP_STAGE2_LIMIT}, one refill every ${stage2Hours} hours. No user can ever hold more than ${SP_STAGE2_LIMIT} SP.`,
    ],
  },
  {
    heading: `${SP_STAGE1_LIMIT} SP, the pivot point`,
    paragraphs: [
      `${SP_STAGE1_LIMIT} SP is the pivot point. It is the stage 1 cap and the stage 2 threshold at the same time. It is where the fast refills stop and the slow refills begin, and it is the natural resting point for an idle user. If your balance drops below ${SP_STAGE1_LIMIT} SP through use, refills go back to stage 1, plus ${SP_STAGE1_REFILL} SP every ${stage1Hours} hours, until it reaches ${SP_STAGE1_LIMIT} SP again.`,
    ],
  },
  {
    heading: `${SP_BASE_BALANCE} SP when there is no server`,
    paragraphs: [
      `${SP_BASE_BALANCE} SP is also the no-server case. If Lucid cannot reach the ping server, your SP falls back to base ${SP_BASE_BALANCE}. That is the known state, not an error and not unknown, and your real balance is restored when you reconnect.`,
    ],
  },
  {
    heading: `${SP_VERIFIED_DAILY} SP a day when you are verified`,
    paragraphs: [
      `Once you are verified, as a verified temp or as a full user, you get ${SP_VERIFIED_DAILY} SP a day, regardless of the neuron limit. Verification comes from the daily server check.`,
    ],
  },
  {
    heading: 'What your balance tells you',
    paragraphs: [
      `Your balance tells you where you stand. ${SP_BASE_BALANCE} SP means there is no server connection, or you are just starting out. ${SP_STAGE1_LIMIT} SP means your temp is active, the server is reachable, and you are unverified. If you were verified you would have ${SP_VERIFIED_DAILY} SP a day. If your temp was discarded you would have nothing, or the ${SP_BASE_BALANCE} SP fallback if you are offline.`,
    ],
  },
  {
    heading: 'Honest note: verification is not built yet',
    paragraphs: [
      `The temp verification system, the daily server check and the temp store, does not exist yet. It is design only, not built. So nothing can return verified right now, and the ${SP_VERIFIED_DAILY} SP a day for verified users is a target, not live. The stages, the caps, and the refills above are live on the ping server today.`,
    ],
  },
];

/**
 * The voice script: the exact words on the page, headings included,
 * in page order. The MP3 is synthesized from this string.
 */
export const SP_INFO_VOICE_SCRIPT = SP_INFO_SECTIONS.map(
  (section) => `${section.heading}. ${section.paragraphs.join(' ')}`,
).join(' ');
