/**
 * DEFCON levels for devmode (Gary, 2026-11-09).
 *
 * WHY THEY EXIST (Gary, 2026-11-09 ~04:21 PST — "understand why
 * the defcons were added for devmode"): like the army's DEFCONs,
 * they exist so the readiness state is instantly unambiguous —
 * one level tells a builder where devmode is in the build, what's
 * on, what's ready, no long explanation. Devmode is the war zone
 * (the active build/battle — raw, unfinished, everything fought
 * over); the levels are the build's advance through it. The
 * topology MIRRORS the army's DEFCON creation (Gary, ~03:37 PST):
 * 1 is the most intense (the war zone), levels run from there.
 *
 * THE LEVELS (Gary's numbering, his words):
 * - DEFCON 1 = NOW — the terminal as it is right now, the
 *   baseline level, the war zone.
 * - DEFCON 2 = terminal merged with splashback in devmode.
 * - DEFCON 3 = the prompter, when we get it all sorted out.
 *
 * WHAT THEY ARE NOT:
 * - Not automatic: nothing in the app moves itself between
 *   levels. A level changes only on Gary's explicit order (the
 *   `/defcon` command), and the change is recorded in the event
 *   log. There is no trigger wired anywhere.
 * - Not gating: a level is a readiness milestone, a statement of
 *   where the build stands — it locks nothing, enables nothing.
 *   (Whether levels should ever gate anything is still an open
 *   question for Gary; nothing here invents an answer.)
 *
 * WHERE THEY TAKE EFFECT (Gary, 2026-11-09 ~04:24 PST —
 * correcting the earlier "devmode-only" reading): the DEFCONs
 * take effect in NON-devmode — that is the point. Devmode is
 * where they were understood; non-devmode (the main Warp-style
 * terminal) is where they take effect. The level is visible on
 * the main terminal, not locked inside devmode. Non-devmode
 * itself stays exactly as it is (perfect, identical to Warp) —
 * the levels are the readiness state that takes effect on it,
 * they don't redesign it.
 *
 * DEFCON 2's merge has THREE readings (see the devmode
 * dissection, §11). Gary PICKED one (2026-11-09 ~04:27 PST):
 * (b) mist as the terminal's direct background, with maybe
 * some darkening blur for the text. The other two readings —
 * (a) terminal over mist (already true in devmode) and (c) one
 * surface — are NOT the pick. The reading is stored as
 * `defconMergeReading` (null until picked with
 * `/defcon merge a|b|c`).
 *
 * THE MERGE IS BUILT — INVERTED (Gary, 2026-11-09 ~04:29–04:30 PST
 * "build it directly in the terminal and see how it lands in
 * non dev mode"; ~05:15 PST "inverted to the back not the
 * terminal box"; ~05:21 PST "the darken blur and whiter text"):
 * reading (b), directly in the terminal — the opaque black lifts
 * off the terminal page and the DARKENING BLUR moves to the BACK
 * of the page (`bg-black/25 backdrop-blur-sm` on the terminal
 * page, edge to edge), so the mist is the back layer. The
 * terminal box is GONE at DEFCON 2: the surface wrap drops its
 * border, its 2px top edge and its background entirely
 * (`border-0 bg-transparent`) — no panel, no frame, the text
 * floats clear over the mist. The text goes WHITER at DEFCON 2
 * (the active theme's own `terminal.brightWhite` token, never a
 * hardcoded off-palette white — see `defconTerminalForeground`).
 * Calibration (live read 2026-11-09 ~05:50 PST): the first
 * build used bg-black/50, which halved an already-faint mist
 * (peak 0.17 opacity) into invisibility; /25 is the veil
 * that lets the mist read. It is level-gated: it takes effect
 * at DEFCON 2 and above (`defconMergeActive`), and it is
 * judged by how it lands in NON-devmode. At DEFCON 1 the
 * terminal is exactly as it stands. The prompt section (the
 * black bar in non-devmode) is NOT part of the merge — it
 * stays as it is.
 *
 * Pure functions + data, so the logic is unit-testable without
 * a browser or Electron — same pattern as permissions.ts /
 * eventLog.ts. The level itself is persisted as the
 * `defconLevel` settings key (default 1).
 */

/** A DEFCON level. Only 1–3 exist — Gary has defined no others. */
export type DefconLevel = 1 | 2 | 3;

/** Which reading of the DEFCON 2 merge Gary picked, if any. */
export type DefconMergeReading = 'a' | 'b' | 'c';

/** The level a fresh install starts at: DEFCON 1 = now. */
export const DEFCON_DEFAULT: DefconLevel = 1;

/** Every level that exists. */
export const DEFCON_LEVELS: readonly DefconLevel[] = [1, 2, 3];

/** The DEFCON 2 merge build has landed (Gary's pick, reading
 * (b), built directly in the terminal 2026-11-09 ~04:30 PST).
 * The criteria below take this as the merge's implemented
 * state — if the merge is ever removed, this goes false and
 * the level-2 criterion honestly shows OPEN again. */
export const DEFCON2_MERGE_IMPLEMENTED = true;

/** Whether the DEFCON 2 merge is in effect at a level: it
 * takes effect at DEFCON 2 and above. At DEFCON 1 the
 * terminal is exactly as it stands — the level is the switch,
 * nothing else flips the merge. */
export function defconMergeActive(level: DefconLevel): boolean {
  return level >= 2;
}

/** DEFCON 2 whiter text (Gary, 2026-11-09 ~05:21 PST — "the
 * darken blur and whiter text"). At DEFCON 2+ the terminal
 * foreground is the active theme's own `terminal.brightWhite`
 * token (the theme system's whitest text — '#ffffff' in every
 * theme); at DEFCON 1 it is exactly the base foreground, as it
 * stands. The whiter value must come from the theme — never a
 * hardcoded off-palette white. */
export function defconTerminalForeground(
  level: DefconLevel,
  brightWhite: string,
  baseForeground: string,
): string {
  return defconMergeActive(level) ? brightWhite : baseForeground;
}

/** True only for 1, 2, or 3 — anything else is not a level. */
export function isDefconLevel(value: unknown): value is DefconLevel {
  return value === 1 || value === 2 || value === 3;
}

/** Short name for a level, as shown in the devmode badge. */
export function defconName(level: DefconLevel): string {
  switch (level) {
    case 1:
      return 'DEFCON 1 — NOW';
    case 2:
      return 'DEFCON 2 — MERGED';
    case 3:
      return 'DEFCON 3 — PROMPTER';
  }
}

/** One line on what a level is, in Gary's own terms. */
export function defconTagline(level: DefconLevel): string {
  switch (level) {
    case 1:
      return 'The war zone — the terminal as it is right now.';
    case 2:
      return 'Terminal merged with splashback in devmode.';
    case 3:
      return 'The prompter, when we get it all sorted out.';
  }
}

/** One criterion for a level: what must be true for devmode to
 *  be at that level, and whether it is true right now. `met`
 *  is honest about what is NOT done yet — an unmet criterion
 *  is listed, never hidden. */
export interface DefconCriterion {
  text: string;
  met: boolean;
}

/**
 * The criteria for a level. `mergeReading` is Gary's picked
 * DEFCON 2 merge reading (null = not picked yet);
 * `mergeImplemented` is whether the merge build step has
 * landed (true since the reading-(b) merge was built
 * 2026-11-09 — pass DEFCON2_MERGE_IMPLEMENTED).
 * Level 1's criteria are the baseline itself, so they are met
 * by definition: DEFCON 1 IS the terminal as it stands.
 */
export function defconCriteria(
  level: DefconLevel,
  opts?: { mergeReading?: DefconMergeReading | null; mergeImplemented?: boolean },
): DefconCriterion[] {
  const mergeReading = opts?.mergeReading ?? null;
  const mergeImplemented = opts?.mergeImplemented ?? false;
  switch (level) {
    case 1:
      return [
        { text: 'Devmode as it stands — the war zone, the terminal as it is right now', met: true },
      ];
    case 2:
      return [
        { text: 'DEFCON 1 baseline in place', met: true },
        {
          text: 'Merge reading picked by Gary — (a) terminal over mist, (b) mist as direct background, or (c) one surface',
          met: mergeReading !== null,
        },
        { text: 'Merge implemented (separate build step, called by Gary)', met: mergeImplemented },
      ];
    case 3:
      return [
        { text: 'DEFCON 2 complete', met: false },
        { text: 'The prompter built', met: false },
        { text: 'Everything sorted out', met: false },
      ];
  }
}

/** The merge readings, as Gary will pick between them. Gary
 *  picked (b) (2026-11-09 ~04:27 PST): mist as the direct
 *  background, with maybe some darkening blur for the text. */
export function defconMergeReadingText(reading: DefconMergeReading): string {
  switch (reading) {
    case 'a':
      return '(a) terminal over mist — already true in devmode';
    case 'b':
      return '(b) mist as the terminal’s direct background, with maybe some darkening blur for the text';
    case 'c':
      return '(c) one surface — SplashMist moved into the terminal';
  }
}

/**
 * Full status text for a level — what `/defcon` prints: the
 * level, its tagline, and each criterion marked met or open.
 * Open criteria are shown as OPEN, never omitted.
 */
export function describeDefcon(
  level: DefconLevel,
  opts?: { mergeReading?: DefconMergeReading | null; mergeImplemented?: boolean },
): string {
  const lines: string[] = [defconName(level), defconTagline(level), '', 'Criteria:'];
  for (const c of defconCriteria(level, opts)) {
    lines.push(`  [${c.met ? 'x' : ' '}] ${c.text}`);
  }
  lines.push('', 'Levels gate nothing — they are readiness milestones, not locks.');
  return lines.join('\n');
}
