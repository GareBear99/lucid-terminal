/**
 * Homunculus knowledge records — the training data that lets a brain
 * answer basic questions about itself.
 *
 * Gary (2026-11-05): "when its working it should be able to answer
 * basic questions about its own lineage and knowledge of self and what
 * it can and cant answer right its basically just a bot with gaining
 * growth of intelligence." A Homunculus is a bot with a gaining growth
 * of intelligence: each promotion grows its lineage, and its knowledge
 * records grow with it.
 *
 * Mechanism: the v1 brain is the LLMBuilder exemplar adapter
 * (adapters/exemplar_adapter.py). It answers by TF-IDF cosine similarity
 * over the `prompt_tokens` of exemplar records built from SFT JSONL —
 * so a brain can only answer from records that exist. The Forge makes
 * sure the training records contain the self / lineage / capability
 * facts, by generating these records from the Homunculus itself and
 * staging them into the run's datasets dir at run start (see
 * forgeStore.startRun).
 *
 * Record shape — the trainer accepts this schema, with plain-string
 * input/target (it stringifies objects, so objects are never passed):
 *   {"id", "source": "forge", "capability", "input", "target", "tags"}
 * Capabilities used: self_knowledge, lineage, capabilities.
 *
 * Nothing here is invented: biography records exist ONLY when a
 * biography is set; capability records are built from the real corpus
 * summary (domains/tags actually present in the training data) plus the
 * FIXED honest limits of the tier. An unset biography produces NO
 * biography record, and the self record says so plainly.
 */

import type { Homunculus } from './homunculi';

export interface KnowledgeRecord {
  id: string;
  source: 'forge';
  capability: 'self_knowledge' | 'lineage' | 'capabilities';
  input: string;
  target: string;
  tags: string[];
}

/** Corpus facts the capability records are built from — real data only. */
export interface CorpusSummary {
  /** Domains/tags actually present in the Homunculus's training data. */
  domains: string[];
  /** Number of records in the training data. */
  recordCount: number;
}

function record(
  id: string,
  capability: KnowledgeRecord['capability'],
  input: string,
  target: string,
  tags: string[],
): KnowledgeRecord {
  return { id, source: 'forge', capability, input, target, tags };
}

function brainLine(h: Homunculus): string {
  if (h.modelPath) {
    return `My brain is the model at ${h.modelPath}.`;
  }
  return 'I have no brain installed yet — no model has been installed as my brain.';
}

function birthLine(h: Homunculus): string {
  if (h.lineage.length === 0) {
    return 'I am not yet born — no model has promoted yet.';
  }
  const first = h.lineage[0];
  return `I was born when my first model promoted — ${first.candidate}, on ${first.timestamp}.`;
}

/**
 * Self records: who the Homunculus is. The target states the name, the
 * colour, that it is a Homunculus, its brain model (or that none is
 * installed yet), and its birth. If no biography is written yet, the
 * target says so plainly — the brain answers that honestly instead of
 * inventing one.
 */
export function buildSelfRecords(h: Homunculus): KnowledgeRecord[] {
  const bioLine = h.biography
    ? 'My biography is written — ask me what kind of being I am.'
    : 'My biography has not been written yet.';
  const whoTarget =
    `I am ${h.name}. I am a Homunculus — a bot with a gaining growth of ` +
    `intelligence. My colour is ${h.color}. ${brainLine(h)} ${birthLine(h)} ${bioLine}`;
  const nameTarget =
    `My name is ${h.name}. I am a Homunculus, and my colour is ${h.color}.`;
  const whatTarget =
    `I am ${h.name}, a Homunculus. ${brainLine(h)} ${birthLine(h)}`;
  return [
    record(
      `forge-self-${h.id}-who`,
      'self_knowledge',
      'Who are you?',
      whoTarget,
      ['self', 'identity'],
    ),
    record(
      `forge-self-${h.id}-name`,
      'self_knowledge',
      'What is your name?',
      nameTarget,
      ['self', 'name'],
    ),
    record(
      `forge-self-${h.id}-what`,
      'self_knowledge',
      'What are you?',
      whatTarget,
      ['self', 'identity'],
    ),
  ];
}

/**
 * Biography records: the Homunculus's character, vibe, and persona, in
 * its own words as stored. ONLY when a biography is set — if null,
 * returns [] and never invents one.
 */
export function buildBiographyRecords(h: Homunculus): KnowledgeRecord[] {
  if (!h.biography) return [];
  const bio = h.biography;
  const full =
    `I am ${h.name}. ${bio.character} I come across as ${bio.vibe}. ` +
    `My persona: ${bio.persona}`;
  return [
    record(
      `forge-bio-${h.id}-being`,
      'self_knowledge',
      'What kind of being are you?',
      full,
      ['self', 'biography', 'character'],
    ),
    record(
      `forge-bio-${h.id}-character`,
      'self_knowledge',
      'What is your character?',
      bio.character,
      ['self', 'biography', 'character'],
    ),
    record(
      `forge-bio-${h.id}-vibe`,
      'self_knowledge',
      'How do you come across?',
      `I come across as ${bio.vibe}.`,
      ['self', 'biography', 'vibe'],
    ),
    record(
      `forge-bio-${h.id}-persona`,
      'self_knowledge',
      'What is your persona?',
      bio.persona,
      ['self', 'biography', 'persona'],
    ),
  ];
}

/** One lineage entry rendered as a single line of the history summary. */
function lineageEntryLine(
  entry: Homunculus['lineage'][number],
  index: number,
): string {
  const score =
    entry.score === null ? 'no score recorded' : `score ${entry.score}`;
  return (
    `Promotion ${entry.promotion} (${index + 1} of the lineage): ` +
    `candidate ${entry.candidate}, trained from ${entry.parentBase} on ` +
    `corpus ${entry.corpus}, Gate decision ${entry.gateDecision}, ` +
    `${score}, ${entry.timestamp}.`
  );
}

/**
 * Lineage records: where the Homunculus came from. The target summarises
 * the WHOLE lineage list — every promotion — so after a second promotion
 * the regenerated record includes both promotions. Empty lineage says
 * plainly there is no training history yet.
 */
export function buildLineageRecords(h: Homunculus): KnowledgeRecord[] {
  if (h.lineage.length === 0) {
    return [
      record(
        `forge-lineage-${h.id}-none`,
        'lineage',
        'Where did you come from?',
        'I have no training history yet — no model has promoted.',
        ['lineage', 'history'],
      ),
      record(
        `forge-lineage-${h.id}-history-none`,
        'lineage',
        'What is your training history?',
        'I have no training history yet — no model has promoted.',
        ['lineage', 'history'],
      ),
    ];
  }
  const summary = h.lineage.map(lineageEntryLine).join(' ');
  const target =
    `My lineage: ${summary} Each promotion grew what I know — ` +
    `I am a bot with a gaining growth of intelligence.`;
  return [
    record(
      `forge-lineage-${h.id}-where`,
      'lineage',
      'Where did you come from?',
      target,
      ['lineage', 'history'],
    ),
    record(
      `forge-lineage-${h.id}-history`,
      'lineage',
      'What is your lineage?',
      target,
      ['lineage', 'history'],
    ),
    record(
      `forge-lineage-${h.id}-trained`,
      'lineage',
      'What trained you?',
      target,
      ['lineage', 'training'],
    ),
    record(
      `forge-lineage-${h.id}-history-full`,
      'lineage',
      'What is your training history?',
      target,
      ['lineage', 'history'],
    ),
  ];
}

/**
 * Capability records: what the Homunculus can and can't answer.
 * Built from (a) the real corpus summary — the domains/tags actually
 * present in its training data, never claimed — and (b) the FIXED honest
 * limits of the tier. Never claims a capability that is not in the records.
 */
export function buildCapabilityRecords(
  h: Homunculus,
  corpusSummary: CorpusSummary,
): KnowledgeRecord[] {
  const domains =
    corpusSummary.domains.length > 0
      ? corpusSummary.domains.join(', ')
      : 'no training domains recorded yet';
  const canTarget =
    `I can answer from my training records. My training data covers ` +
    `${domains} (${corpusSummary.recordCount} records), and I answer ` +
    `the questions my records cover — about myself, my lineage, and ` +
    `those domains — by matching your question to the closest record I ` +
    `was trained on.`;
  const cantTarget =
    `I can't answer what I wasn't trained on. I am a tiny model doing ` +
    `toy text completion, not conversation: I have no real-time ` +
    `knowledge, I can't browse or look things up, and I can't reason ` +
    `beyond my training records. If nothing I was trained on matches ` +
    `your question, I say so instead of making something up.`;
  const limitsTarget =
    `My limits: I am a tiny model doing toy text completion, not ` +
    `conversation. I have no real-time knowledge, no browsing, and no ` +
    `reasoning beyond my training records. What I can answer is what ` +
    `my training data covers: ${domains}.`;
  return [
    record(
      `forge-cap-${h.id}-can`,
      'capabilities',
      'What can you answer?',
      canTarget,
      ['capabilities', 'can'],
    ),
    record(
      `forge-cap-${h.id}-cant`,
      'capabilities',
      "What can't you answer?",
      cantTarget,
      ['capabilities', 'cannot', 'limits'],
    ),
    record(
      `forge-cap-${h.id}-limits`,
      'capabilities',
      'What are your limits?',
      limitsTarget,
      ['capabilities', 'limits'],
    ),
  ];
}

/**
 * All knowledge records for a Homunculus, as one JSONL string — one JSON
 * object per line. This is the `knowledgeRecordsJsonl` passed to
 * llmbuilder:startRun; the main process stages it into the vendored
 * tree's datasets dir at run start so the trainer builds the exemplar
 * records from it.
 */
export function buildKnowledgeRecords(
  h: Homunculus,
  corpusSummary: CorpusSummary,
): string {
  const records = [
    ...buildSelfRecords(h),
    ...buildBiographyRecords(h),
    ...buildLineageRecords(h),
    ...buildCapabilityRecords(h, corpusSummary),
  ];
  return records.map((r) => JSON.stringify(r)).join('\n');
}
