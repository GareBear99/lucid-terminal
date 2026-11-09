// DEFCON levels (Gary, 2026-11-09) — pure module tests.
//
// The WHY (Gary, 2026-11-09 ~04:21 PST): like the army's DEFCONs,
// they exist so the readiness state is instantly unambiguous —
// one level tells a builder where devmode is in the build, what's
// on, what's ready, no long explanation. Devmode is the war zone;
// the levels are the build's advance through it. The topology
// mirrors the army's DEFCON creation: 1 is the most intense.
// CORRECTION (Gary, 2026-11-09 ~04:24 PST): the DEFCONs take
// effect in NON-devmode — devmode is where they were understood,
// non-devmode is where they take effect.

import { describe, test, expect } from 'vitest';
import {
  DEFCON_DEFAULT,
  DEFCON_LEVELS,
  DEFCON2_MERGE_IMPLEMENTED,
  DEFCON3_PROMPTER_IMPLEMENTED,
  defconCriteria,
  defconMergeActive,
  defconMergeReadingText,
  defconName,
  defconPrompterActive,
  defconTagline,
  defconTerminalForeground,
  describeDefcon,
  isDefconLevel,
} from '../src/lib/defcon';

describe('DEFCON levels (Gary, 2026-11-09)', () => {
  test('the levels are exactly 1, 2, 3 — nothing else exists', () => {
    expect(DEFCON_LEVELS).toEqual([1, 2, 3]);
    expect(DEFCON_DEFAULT).toBe(1);
    expect(isDefconLevel(1)).toBe(true);
    expect(isDefconLevel(2)).toBe(true);
    expect(isDefconLevel(3)).toBe(true);
    expect(isDefconLevel(0)).toBe(false);
    expect(isDefconLevel(4)).toBe(false);
    expect(isDefconLevel('1')).toBe(false);
    expect(isDefconLevel(null)).toBe(false);
    expect(isDefconLevel(undefined)).toBe(false);
  });

  test('names and taglines are Gary’s own words', () => {
    expect(defconName(1)).toBe('DEFCON 1 — NOW');
    expect(defconName(2)).toBe('DEFCON 2 — MERGED');
    expect(defconName(3)).toBe('DEFCON 3 — PROMPTER');
    expect(defconTagline(1)).toContain('war zone');
    expect(defconTagline(2)).toContain('merged with splashback');
    expect(defconTagline(3)).toContain('prompter');
  });

  test('DEFCON 1 criteria are the baseline itself — met by definition', () => {
    const criteria = defconCriteria(1);
    expect(criteria.length).toBe(1);
    expect(criteria.every((c) => c.met)).toBe(true);
  });

  test('DEFCON 2 criteria are honest about what is NOT done yet', () => {
    // Nothing picked, nothing built: only the baseline is met.
    const unpicked = defconCriteria(2);
    expect(unpicked.map((c) => c.met)).toEqual([true, false, false]);
    expect(unpicked[1].text).toContain('Merge reading picked');
    expect(unpicked[2].text).toContain('Merge implemented');

    // Picking a reading meets that criterion — and only that one.
    // Picking does NOT perform the merge.
    const picked = defconCriteria(2, { mergeReading: 'b' });
    expect(picked.map((c) => c.met)).toEqual([true, true, false]);

    // The merge landing meets the last one.
    const merged = defconCriteria(2, { mergeReading: 'b', mergeImplemented: true });
    expect(merged.every((c) => c.met)).toBe(true);
  });

  test('DEFCON 3 criteria are COMPUTED from real state (Phase 4, Gary 2026-11-09)', () => {
    // "DEFCON 2 complete" = current level >= 2 (the level only
    // ever changes on Gary's explicit order, after the DEFCON 2
    // live proof); "The prompter built" = the prompter ships in
    // this build; "Everything sorted out" = current level >= 3
    // (Gary orders /defcon 3 himself, after live verification).
    // At level 2 the first two are met and the third is open —
    // real [x]/[ ], not "Still open:" for everything.
    const atLevel2 = defconCriteria(3, { currentLevel: 2, prompterImplemented: DEFCON3_PROMPTER_IMPLEMENTED });
    expect(atLevel2.length).toBe(3);
    expect(atLevel2.map((c) => c.met)).toEqual([true, true, false]);
    expect(atLevel2[0].text).toContain('DEFCON 2 complete');
    expect(atLevel2[1].text).toContain('prompter built');
    expect(atLevel2[2].text).toContain('Everything sorted out');

    // At level 3 all three are met.
    const atLevel3 = defconCriteria(3, { currentLevel: 3, prompterImplemented: DEFCON3_PROMPTER_IMPLEMENTED });
    expect(atLevel3.every((c) => c.met)).toBe(true);

    // At level 1 only the prompter-built criterion is met —
    // DEFCON 2 is not complete and nothing is sorted out.
    const atLevel1 = defconCriteria(3, { currentLevel: 1, prompterImplemented: DEFCON3_PROMPTER_IMPLEMENTED });
    expect(atLevel1.map((c) => c.met)).toEqual([false, true, false]);
  });

  test('DEFCON 3 criteria stay honest if the prompter is ever removed', () => {
    // The implemented flag defaults to false — the criterion is
    // met only when the caller says the build ships it, so a
    // future removal honestly shows OPEN again.
    const notBuilt = defconCriteria(3, { currentLevel: 3 });
    expect(notBuilt.map((c) => c.met)).toEqual([true, false, true]);
    expect(notBuilt[1].text).toContain('prompter built');
  });

  test('describeDefcon(3) at level 2 shows [x] [x] [ ] — the brief’s exact reading', () => {
    const text = describeDefcon(3, { currentLevel: 2, prompterImplemented: DEFCON3_PROMPTER_IMPLEMENTED });
    expect(text).toContain('DEFCON 3 — PROMPTER');
    expect(text).toContain('[x] DEFCON 2 complete');
    expect(text).toContain('[x] The prompter built');
    expect(text).toContain('[ ] Everything sorted out');
    expect(text).toContain('Levels gate nothing');
  });

  test('the prompter build has landed — the shipped build carries it', () => {
    // The shipped build carries the linked composer + blocks,
    // so with the flag on every level-3 criterion is met at
    // level 3 — the level is genuinely reached, not declared.
    expect(DEFCON3_PROMPTER_IMPLEMENTED).toBe(true);
    expect(defconPrompterActive(1)).toBe(false);
    expect(defconPrompterActive(2)).toBe(false);
    expect(defconPrompterActive(3)).toBe(true);
    const text = describeDefcon(3, { currentLevel: 3, prompterImplemented: DEFCON3_PROMPTER_IMPLEMENTED });
    expect(text).toContain('[x] The prompter built');
    expect(text).toContain('[x] Everything sorted out');
  });

  test('merge readings are the three from the dissection', () => {
    expect(defconMergeReadingText('a')).toContain('terminal over mist');
    expect(defconMergeReadingText('b')).toContain('direct background');
    expect(defconMergeReadingText('c')).toContain('one surface');
  });

  test('describeDefcon shows open criteria as OPEN, never omits them', () => {
    const text = describeDefcon(2);
    expect(text).toContain('DEFCON 2 — MERGED');
    expect(text).toContain('[ ] Merge reading picked');
    expect(text).toContain('[ ] Merge implemented');
    expect(text).toContain('[x] DEFCON 1 baseline');
    expect(text).toContain('Levels gate nothing');
  });

  test('the merge is the level switch: DEFCON 1 is exactly as it stands, DEFCON 2+ merges', () => {
    // The merge takes effect at DEFCON 2 and above, never at 1.
    expect(defconMergeActive(1)).toBe(false);
    expect(defconMergeActive(2)).toBe(true);
    expect(defconMergeActive(3)).toBe(true);
  });

  test('DEFCON 2 whiter text (Gary, 2026-11-09 ~05:21 PST): theme brightWhite at 2+, base at 1', () => {
    // The whiter value comes from the theme's own brightWhite
    // token — never a hardcoded off-palette white.
    expect(defconTerminalForeground(1, '#ffffff', '#e6edf3')).toBe('#e6edf3');
    expect(defconTerminalForeground(2, '#ffffff', '#e6edf3')).toBe('#ffffff');
    expect(defconTerminalForeground(3, '#ffffff', '#e6edf3')).toBe('#ffffff');
    // A theme whose brightWhite differs still wins at 2+ — the
    // token, not a literal, is the source of the whiter text.
    expect(defconTerminalForeground(2, '#fafafa', '#e6edf3')).toBe('#fafafa');
  });

  test('the DEFCON 2 merge build has landed — reading (b), directly in the terminal', () => {
    // The shipped build carries the merge, so with Gary's pick
    // recorded every level-2 criterion is met — the level is
    // genuinely reached, not just declared.
    expect(DEFCON2_MERGE_IMPLEMENTED).toBe(true);
    const criteria = defconCriteria(2, { mergeReading: 'b', mergeImplemented: DEFCON2_MERGE_IMPLEMENTED });
    expect(criteria.every((c) => c.met)).toBe(true);
    const text = describeDefcon(2, { mergeReading: 'b', mergeImplemented: DEFCON2_MERGE_IMPLEMENTED });
    expect(text).toContain('[x] Merge implemented');
  });
});
