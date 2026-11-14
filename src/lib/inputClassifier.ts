/**
 * The input classifier — the full Warp-like pipeline for the
 * composer's draft (2026-11-14).
 *
 * Pipeline order (the task's order, and the order in the
 * dissection doc §3):
 *   normalize → command-vs-agent classify (detectAgentPrompt,
 *   upgraded to auto-flip) → question guard → intent + file
 *   extraction (RULE PATH ONLY, no model) → pill context built
 *   → route (shell / driving intelligence / instant reply) →
 *   model only at the end, never in the classifier.
 *
 * The classifier itself never calls a model, never touches
 * the network, never spends SP. It runs as-you-type in
 * microseconds (pure string work) and never blocks the
 * composer. When unsure it does NOT flip — it shows the call
 * in the hint line and lets the user decide (Gary, ~03:30
 * PST: the classifier has to work properly for ANYTHING
 * typed, not just clean examples).
 *
 * The TERMINAL LOCK RULE (Gary, 2026-11-14 ~03:30 PST): any
 * flip TO terminal LOCKS terminal — the classifier stops
 * auto-flipping to agent until the user explicitly flips back
 * (pill or /agent). Terminal is the locked default; agent is
 * opt-in each time. The lock lives in sessionStore
 * (terminalLocked); this module only READS it.
 *
 * The driving intelligence IS the terminal (Gary, 2026-11-13
 * ~15:28 PST) — agent mode is the same tab flipped, the same
 * session, the same conversation. The classifier decides which
 * mode the text already means; it never creates a competing
 * intelligence. Always overridable: pill, /agent, Esc.
 *
 * Pure functions — no React, no stores — unit-testable. The
 * caller (Terminal.tsx) reads the stores and passes the
 * context in.
 */

import {
  detectAgentPrompt,
  type AgentPromptDetection,
  type DetectAgentPromptOptions,
} from './agentPromptDetect';
import {
  parseAgentInput,
  type AgentParseResult,
  type FileCandidate,
  type ParseIntent,
} from './inputParse';
import type { TabMode } from '../stores/sessionStore';

/** 250 ms after any mode set, autodetection stays quiet so
 *  it never fights a manual choice (Warp's
 *  AUTODETECTION_DISABLE_DURATION_MS). */
export const AUTODETECT_SUPPRESS_MS = 250;

/** The context the classifier needs. Everything the stores
 *  own is passed in — the classifier reads no store itself. */
export interface ClassifierContext extends DetectAgentPromptOptions {
  /** The tab's current mode. */
  mode: TabMode;
  /** True when terminal is locked for this tab (any flip to
   *  terminal locks it; only an explicit flip back unlocks). */
  locked: boolean;
  /** Wall-clock ms of the tab's last mode set (manual or
   *  auto). Undefined = never set. */
  lastManualModeSetAt?: number;
  /** Wall-clock ms now (injectable for tests; defaults to
   *  Date.now()). */
  now?: number;
  /** True while a guest session is veiled in — guests never
   *  see agent mode, so nothing auto-flips. */
  guestActive?: boolean;
}

/** The pill context — what the UI renders from a
 *  classification: the verdict, the route, the intent and
 *  file candidates when the draft is an agent prompt, and
 *  whether a flip is about to happen. */
export interface PillContext {
  mode: TabMode;
  verdict: AgentPromptDetection['verdict'];
  reason: string;
  source: AgentPromptDetection['source'];
  confidence: number;
  locked: boolean;
  shouldAutoFlip: boolean;
  flipTo: TabMode | null;
  /** Provisional as-you-type route. The final route
   *  (instant-reply / context-answer) is resolved at submit
   *  time by parseAgentInput. */
  route: 'shell' | 'agent';
  intent: ParseIntent | null;
  fileCandidates: FileCandidate[];
  needsConfirmation: boolean;
}

export interface ClassificationResult {
  /** The verdict on the text itself. */
  verdict: AgentPromptDetection['verdict'];
  /** True only when the verdict is 'agent'. */
  isPrompt: boolean;
  reason: string;
  source: AgentPromptDetection['source'];
  confidence: number;
  /** Whether the tab's mode should flip now, and to what.
   *  False for every unsure verdict, every locked terminal,
   *  every guest, and inside the 250 ms suppression window. */
  shouldAutoFlip: boolean;
  flipTo: TabMode | null;
  /** The full detection (for diagnostics / the hint line). */
  detection: AgentPromptDetection;
  /** The parse, when the verdict is 'agent' (intent + file
   *  candidates for the pill). Null for shell / unsure. */
  parse: AgentParseResult | null;
  pillContext: PillContext;
}

/** The auto-flip gate, as a pure function of the verdict and
 *  the context. A flip happens only when: the verdict is a
 *  firm 'agent' (in terminal mode) or a firm 'shell' (in
 *  agent mode — the flip back, which locks); terminal is not
 *  locked; the user is not a guest; and 250 ms have passed
 *  since the last mode set. A prefix one-off ("h" → hello)
 *  never flips TO agent — it only KEEPS agent mode (Warp's
 *  prefix rule exists to avoid flipping while typing, not to
 *  start a flip). */
export function shouldAutoFlip(
  verdict: AgentPromptDetection['verdict'],
  source: AgentPromptDetection['source'],
  ctx: Pick<ClassifierContext, 'mode' | 'locked' | 'lastManualModeSetAt' | 'now' | 'guestActive'>,
): { flip: boolean; to: TabMode | null } {
  if (ctx.guestActive) return { flip: false, to: null };
  const now = ctx.now ?? Date.now();
  if (
    ctx.lastManualModeSetAt !== undefined &&
    now - ctx.lastManualModeSetAt < AUTODETECT_SUPPRESS_MS
  ) {
    return { flip: false, to: null };
  }
  if (ctx.mode === 'terminal') {
    if (verdict !== 'agent') return { flip: false, to: null };
    if (ctx.locked) return { flip: false, to: null };
    if (source === 'nl-one-off-prefix') return { flip: false, to: null };
    return { flip: true, to: 'agent' };
  }
  // Agent mode: a firm shell verdict flips back to terminal
  // — and the flip locks terminal (the store does that).
  if (verdict !== 'shell') return { flip: false, to: null };
  return { flip: true, to: 'terminal' };
}

/** Classify a composer draft: normalize → detect → question
 *  guard → parse → pill context → route. Normalize runs
 *  inside the detector (typo-fix for the scoring view,
 *  politeness-strip for the question guard) and inside the
 *  intent parser (politeness-strip + synonym-normalize);
 *  the submitted text is always the original draft.
 *  The intent parse runs only when the verdict is 'agent' —
 *  a shell command just runs. */
export function classifyInput(
  draft: string,
  ctx: ClassifierContext,
): ClassificationResult {
  const detection = detectAgentPrompt(draft, {
    denylist: ctx.denylist,
    commandHistory: ctx.commandHistory,
    agentPromptHistory: ctx.agentPromptHistory,
    lastBlockKind: ctx.lastBlockKind,
  });
  const { flip, to } = shouldAutoFlip(detection.verdict, detection.source, ctx);

  const parse =
    detection.verdict === 'agent'
      ? parseAgentInput(draft)
      : null;

  const pillContext: PillContext = {
    mode: ctx.mode,
    verdict: detection.verdict,
    reason: detection.reason,
    source: detection.source,
    confidence: detection.confidence,
    locked: ctx.locked,
    shouldAutoFlip: flip,
    flipTo: to,
    route: detection.verdict === 'agent' ? 'agent' : 'shell',
    intent: parse?.intent ?? null,
    fileCandidates: parse?.fileCandidates ?? [],
    needsConfirmation: parse?.needsConfirmation ?? false,
  };

  return {
    verdict: detection.verdict,
    isPrompt: detection.verdict === 'agent',
    reason: detection.reason,
    source: detection.source,
    confidence: detection.confidence,
    shouldAutoFlip: flip,
    flipTo: to,
    detection,
    parse,
    pillContext,
  };
}
