/**
 * Model tiers — Gary's authoritative list: six tiers, 0–5, Tier 0 first.
 *
 * This resolves the disagreement in the docs and code, which variously
 * claimed 5, 6, or 8 tiers and numbered them differently (the Settings
 * Model Installer groups models by size and calls TinyLlama "Tier 0";
 * the model registry in electron/core/models/modelTiers.ts does the
 * same). Here, Tier 0 means NO model at all — the offline tier — and
 * the local models start at Tier 1. Do not renumber this list without
 * Gary's say-so.
 *
 * Shared by the startup disclaimer's "?" overlay and the HelpModal's
 * Model Tiers section so the two can never drift apart. One short line
 * per tier: what it is and what it is for.
 */
export interface ModelTierInfo {
  tier: number;
  name: string;
  /** One short line: what the tier is and what it is for. */
  line: string;
}

export const MODEL_TIERS: ModelTierInfo[] = [
  {
    tier: 0,
    name: 'No LLM',
    line: 'No model needed — offline lookup, keyword search, consensus and sync run without one.',
  },
  {
    tier: 1,
    name: 'Small local models',
    line: 'TinyLlama and Phi-2 — fast, light local models. TinyLlama (1.1B, ~700 MB) is the bundled model this install offers.',
  },
  {
    tier: 2,
    name: 'Mid local models',
    line: 'Gemma2 and Mistral — stronger everyday quality. Install from Settings › Models; not bundled.',
  },
  {
    tier: 3,
    name: 'Large coder',
    line: 'DeepSeek-Coder 33B — heavy coding and reasoning. Install from Settings › Models; not bundled.',
  },
  {
    tier: 4,
    name: 'Largest local',
    line: 'Llama 3.1 70B — maximum local capability. Install from Settings › Models; needs big RAM and disk.',
  },
  {
    tier: 5,
    name: 'API',
    line: 'An external API key (e.g. OpenAI/ChatGPT) instead of a local model. Set a key in Settings.',
  },
];
