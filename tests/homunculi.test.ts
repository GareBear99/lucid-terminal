// @vitest-environment jsdom
/**
 * Homunculi lib tests — the Forge data model and pure helpers.
 *
 * Covers: scoreboard parsing, gate-decision labels, stage status
 * labels (a 'scaffold' stage trained NOTHING and must never render as
 * green/success), empty Homunculus creation, and lineage append
 * (lineage grows, never overwritten).
 */

import { describe, test, expect } from 'vitest';
import {
  appendLineageEntry,
  emptyHomunculus,
  gateDecisionLabel,
  parseScoreboard,
  stageStatusLabel,
  stageStatusTone,
  type HomunculusLineageEntry,
} from '../src/lib/homunculi';

function lineageEntry(
  promotion: number,
  candidate: string,
): HomunculusLineageEntry {
  return {
    promotion,
    candidate,
    parentBase: 'arc_tiny',
    corpus: 'chatgpt-jsonl:lucifer-v1',
    gateDecision: 'promote',
    score: 0.72,
    scoreboardRef: `results/scoreboard.json#${candidate}`,
    receiptRef: null,
    timestamp: '2026-11-05T10:00:00.000Z',
  };
}

describe('parseScoreboard', () => {
  test('parses a list of rows', () => {
    const rows = parseScoreboard([
      {
        candidate: 'lucifer-1',
        score: 0.72,
        decision: 'promote',
        artifacts: ['a.gguf'],
      },
      { candidate: 'lucifer-2', score: 0.4, decision: 'archive_only' },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      candidate: 'lucifer-1',
      score: 0.72,
      decision: 'promote',
      artifacts: ['a.gguf'],
    });
    expect(rows[1].decision).toBe('archive_only');
    expect(rows[1].artifacts).toEqual([]);
  });

  test('parses an object wrapping the list', () => {
    expect(parseScoreboard({ candidates: [{ candidate: 'x-1' }] })).toHaveLength(1);
    expect(parseScoreboard({ rows: [{ candidate: 'x-1' }] })).toHaveLength(1);
  });

  test('unparseable input yields no rows, never a crash', () => {
    expect(parseScoreboard(null)).toEqual([]);
    expect(parseScoreboard(undefined)).toEqual([]);
    expect(parseScoreboard('not json')).toEqual([]);
    expect(parseScoreboard({})).toEqual([]);
    expect(parseScoreboard([{ nope: true }])).toEqual([]);
  });

  test('unknown decisions fall back to reject, not promote', () => {
    const rows = parseScoreboard([{ candidate: 'x-1', decision: 'mystery' }]);
    expect(rows[0].decision).toBe('reject');
  });
});

describe('gateDecisionLabel', () => {
  test('each decision has distinct display text', () => {
    expect(gateDecisionLabel('promote')).toContain('Promote');
    expect(gateDecisionLabel('archive_only')).toContain('Archive only');
    expect(gateDecisionLabel('reject')).toContain('Reject');
  });
});

describe('stage status — scaffold is never green', () => {
  test("scaffold renders as 'scaffold — trained nothing'", () => {
    expect(stageStatusLabel('scaffold')).toBe('Scaffold — trained nothing');
  });

  test("scaffold tone is warning, never success", () => {
    expect(stageStatusTone('scaffold')).toBe('warning');
    expect(stageStatusTone('scaffold')).not.toBe('success');
  });

  test('completed is the only success tone', () => {
    expect(stageStatusTone('completed')).toBe('success');
    expect(stageStatusTone('running')).toBe('running');
    expect(stageStatusTone('failed')).toBe('failed');
    expect(stageStatusTone('cancelled')).toBe('idle');
  });
});

describe('emptyHomunculus', () => {
  test('a new Homunculus is untrained, unborn, with no biography and no brain', () => {
    const h = emptyHomunculus('lucifer', 'Lucifer', 'pink');
    expect(h.id).toBe('lucifer');
    expect(h.name).toBe('Lucifer');
    expect(h.color).toBe('pink');
    expect(h.biography).toBeNull();
    expect(h.modelPath).toBeNull();
    expect(h.status).toBe('untrained');
    expect(h.incumbentScore).toBeNull();
    expect(h.lineage).toEqual([]);
    expect(typeof h.createdAt).toBe('string');
  });
});

describe('appendLineageEntry', () => {
  test('lineage grows — entries are appended, never overwritten', () => {
    const h = emptyHomunculus('lucifer', 'Lucifer', 'purple');
    const first = appendLineageEntry(h, lineageEntry(1, 'lucifer-1'));
    expect(first.lineage).toHaveLength(1);
    // The original is untouched — append returns a new Homunculus.
    expect(h.lineage).toHaveLength(0);
    const second = appendLineageEntry(first, lineageEntry(2, 'lucifer-2'));
    expect(second.lineage).toHaveLength(2);
    expect(second.lineage[0].candidate).toBe('lucifer-1');
    expect(second.lineage[1].candidate).toBe('lucifer-2');
    expect(first.lineage).toHaveLength(1);
  });
});
