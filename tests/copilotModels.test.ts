/**
 * Copilot models — the brains a copilot in the AI chat's copilot
 * tab can pick from (Gary, 2026-11-13: a dropdown to pick which
 * copilot; add as many as desired in the AI settings input).
 *
 * The LLMBuilder brain is always configured (no key, no network).
 * GitHub Copilot is configured only when Gary's key is saved in
 * Settings > AI — without it the tab shows the copilot as
 * unconfigured, never an error. An unknown model (a stale
 * persisted value) is unconfigured, never silently another model.
 *
 * Run with: npx vitest run tests/copilotModels.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  COPILOT_MODELS,
  copilotModelLabel,
  copilotUnconfiguredReason,
  isCopilotConfigured,
  newCopilotId,
} from '../src/lib/copilotModels';
import type { CopilotConfig } from '../src/types';

const LOCAL: CopilotConfig = { id: 'c1', name: 'Local', model: 'local-planner' };
const COPILOT: CopilotConfig = { id: 'c2', name: 'Copilot', model: 'github-copilot' };

describe('copilotModels — the copilot picker catalogue', () => {
  it('lists the LLMBuilder brain and GitHub Copilot, with a hint each', () => {
    expect(COPILOT_MODELS.map((m) => m.id)).toEqual(['local-planner', 'github-copilot']);
    for (const model of COPILOT_MODELS) {
      expect(model.label.length).toBeGreaterThan(0);
      expect(model.hint.length).toBeGreaterThan(0);
    }
    expect(copilotModelLabel('local-planner')).toBe('LLMBuilder brain');
    expect(copilotModelLabel('github-copilot')).toBe('GitHub Copilot');
  });

  it('the LLMBuilder brain is configured with or without a key', () => {
    expect(isCopilotConfigured(LOCAL, false)).toBe(true);
    expect(isCopilotConfigured(LOCAL, true)).toBe(true);
    expect(copilotUnconfiguredReason(LOCAL, false)).toBeNull();
  });

  it('GitHub Copilot is unconfigured without the key, configured with it', () => {
    expect(isCopilotConfigured(COPILOT, false)).toBe(false);
    expect(isCopilotConfigured(COPILOT, true)).toBe(true);
    expect(copilotUnconfiguredReason(COPILOT, false)).toMatch(/Not configured/);
    expect(copilotUnconfiguredReason(COPILOT, false)).toMatch(/Settings > AI/);
    expect(copilotUnconfiguredReason(COPILOT, true)).toBeNull();
  });

  it('a keyed Copilot with no model listed yet is unconfigured — the tab lists models', () => {
    expect(isCopilotConfigured(COPILOT, true, false)).toBe(false);
    expect(copilotUnconfiguredReason(COPILOT, true, false)).toMatch(/models not listed/i);
    expect(isCopilotConfigured(COPILOT, true, true)).toBe(true);
    expect(copilotUnconfiguredReason(COPILOT, true, true)).toBeNull();
  });

  it('an unknown model is unconfigured, never silently another model', () => {
    const stale = { id: 'c3', name: 'Stale', model: 'frontier-x' } as unknown as CopilotConfig;
    expect(isCopilotConfigured(stale, true)).toBe(false);
    expect(copilotUnconfiguredReason(stale, true)).toMatch(/not available/);
  });

  it('new copilot ids are unique and stable-shaped', () => {
    const a = newCopilotId();
    const b = newCopilotId();
    expect(a).not.toBe(b);
    expect(a.startsWith('copilot-')).toBe(true);
  });
});
