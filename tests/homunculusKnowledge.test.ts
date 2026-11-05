// @vitest-environment jsdom
/**
 * Homunculus knowledge records tests.
 *
 * The Forge generates the training records that let a brain answer
 * basic questions about itself: self, biography, lineage, capabilities.
 * Nothing is invented — biography records exist ONLY when a biography
 * is set, capability records come from the real corpus summary plus
 * the fixed honest limits of the tier, and the lineage record grows
 * with every promotion.
 */

import { describe, test, expect } from 'vitest';
import {
  appendLineageEntry,
  emptyHomunculus,
  type Homunculus,
  type HomunculusLineageEntry,
} from '../src/lib/homunculi';
import {
  buildBiographyRecords,
  buildCapabilityRecords,
  buildKnowledgeRecords,
  buildLineageRecords,
  buildSelfRecords,
  type CorpusSummary,
} from '../src/lib/homunculusKnowledge';

const CORPUS: CorpusSummary = { domains: ['violin', 'synth'], recordCount: 42 };

function withBiography(): Homunculus {
  const h = emptyHomunculus('lucifer', 'Lucifer', 'pink');
  return {
    ...h,
    biography: {
      character: 'Part siren, part magic succubus.',
      vibe: 'Sharp, warm, and playful.',
      persona: 'Direct and practical — I show the work.',
    },
  };
}

function lineageEntry(promotion: number, candidate: string): HomunculusLineageEntry {
  return {
    promotion,
    candidate,
    parentBase: 'arc_tiny',
    corpus: 'chatgpt-jsonl:lucifer-v1',
    gateDecision: 'promote',
    score: 0.7 + promotion * 0.01,
    scoreboardRef: `results/scoreboard.json#${candidate}`,
    receiptRef: null,
    timestamp: '2026-11-05T10:00:00.000Z',
  };
}

describe('buildSelfRecords', () => {
  test('states name, colour, Homunculus, brain, and birth', () => {
    const h = {
      ...emptyHomunculus('lucifer', 'Lucifer', 'pink'),
      modelPath: '/Users/gary/.lucid/models/lucifer.gguf',
    };
    const records = buildSelfRecords(h);
    const who = records.find((r) => r.input === 'Who are you?');
    expect(who).toBeTruthy();
    expect(who!.target).toContain('Lucifer');
    expect(who!.target).toContain('pink');
    expect(who!.target).toContain('Homunculus');
    expect(who!.target).toContain('lucifer.gguf');
    expect(who!.capability).toBe('self_knowledge');
    expect(records.find((r) => r.input === 'What is your name?')?.target).toContain('Lucifer');
    expect(records.find((r) => r.input === 'What are you?')?.target).toContain('Homunculus');
  });

  test('unborn Homunculus says it is not yet born and has no brain', () => {
    const h = emptyHomunculus('lucifer', 'Lucifer', 'purple');
    const who = buildSelfRecords(h).find((r) => r.input === 'Who are you?');
    expect(who!.target).toContain('not yet born');
    expect(who!.target).toContain('no brain installed yet');
  });

  test('unset biography: self record says it has not been written yet', () => {
    const h = emptyHomunculus('lucifer', 'Lucifer', 'purple');
    const who = buildSelfRecords(h).find((r) => r.input === 'Who are you?');
    expect(who!.target).toContain('biography has not been written yet');
  });
});

describe('buildBiographyRecords', () => {
  test('no biography set means NO biography records — never invented', () => {
    expect(buildBiographyRecords(emptyHomunculus('lucifer', 'Lucifer', 'pink'))).toEqual([]);
  });

  test('with a biography, the records carry its character, vibe, and persona', () => {
    const records = buildBiographyRecords(withBiography());
    expect(records.length).toBeGreaterThan(0);
    const joined = records.map((r) => r.target).join('\n');
    expect(joined).toContain('Part siren, part magic succubus.');
    expect(joined).toContain('Sharp, warm, and playful.');
    expect(joined).toContain('Direct and practical');
    expect(records.every((r) => r.capability === 'self_knowledge')).toBe(true);
  });
});

describe('buildLineageRecords', () => {
  test('empty lineage says plainly there is no training history yet', () => {
    const records = buildLineageRecords(emptyHomunculus('lucifer', 'Lucifer', 'pink'));
    const where = records.find((r) => r.input === 'Where did you come from?');
    expect(where!.target).toContain('no training history yet');
  });

  test('after a second promotion the record includes BOTH promotions', () => {
    let h = emptyHomunculus('lucifer', 'Lucifer', 'pink');
    h = appendLineageEntry(h, lineageEntry(1, 'lucifer-1'));
    h = appendLineageEntry(h, lineageEntry(2, 'lucifer-2'));
    const records = buildLineageRecords(h);
    const where = records.find((r) => r.input === 'Where did you come from?');
    expect(where!.target).toContain('lucifer-1');
    expect(where!.target).toContain('lucifer-2');
    expect(where!.target).toContain('Promotion 1');
    expect(where!.target).toContain('Promotion 2');
    expect(where!.capability).toBe('lineage');
  });
});

describe('buildCapabilityRecords', () => {
  test('states what it can answer from the corpus summary', () => {
    const h = emptyHomunculus('lucifer', 'Lucifer', 'pink');
    const can = buildCapabilityRecords(h, CORPUS).find(
      (r) => r.input === 'What can you answer?',
    );
    expect(can!.target).toContain('violin');
    expect(can!.target).toContain('synth');
    expect(can!.target).toContain('42 records');
    expect(can!.capability).toBe('capabilities');
  });

  test("states its limits honestly — toy text completion, not conversation", () => {
    const h = emptyHomunculus('lucifer', 'Lucifer', 'pink');
    const records = buildCapabilityRecords(h, CORPUS);
    const limits = records.find((r) => r.input === 'What are your limits?');
    expect(limits!.target).toContain('toy text completion');
    expect(limits!.target).toContain('not conversation');
    const cant = records.find((r) => r.input === "What can't you answer?");
    expect(cant!.target).toContain("wasn't trained on");
    expect(cant!.target).toContain('no real-time');
  });

  test('empty corpus summary claims no domains', () => {
    const h = emptyHomunculus('lucifer', 'Lucifer', 'pink');
    const can = buildCapabilityRecords(h, { domains: [], recordCount: 0 }).find(
      (r) => r.input === 'What can you answer?',
    );
    expect(can!.target).toContain('no training domains recorded yet');
    expect(can!.target).not.toContain('violin');
  });
});

describe('buildKnowledgeRecords', () => {
  test('one JSON object per line, all parseable, trainer schema', () => {
    const jsonl = buildKnowledgeRecords(withBiography(), CORPUS);
    const lines = jsonl.split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const rec = JSON.parse(line);
      expect(rec.source).toBe('forge');
      expect(typeof rec.id).toBe('string');
      expect(typeof rec.input).toBe('string');
      expect(typeof rec.target).toBe('string');
      expect(['self_knowledge', 'lineage', 'capabilities']).toContain(rec.capability);
      expect(Array.isArray(rec.tags)).toBe(true);
    }
  });

  test('unset biography contributes no biography record to the JSONL', () => {
    const jsonl = buildKnowledgeRecords(emptyHomunculus('lucifer', 'Lucifer', 'pink'), CORPUS);
    const lines = jsonl.split('\n').filter(Boolean).map((l) => JSON.parse(l));
    expect(lines.some((r) => r.input === 'What is your character?')).toBe(false);
    expect(lines.some((r) => r.target.includes('biography has not been written yet'))).toBe(true);
  });
});
