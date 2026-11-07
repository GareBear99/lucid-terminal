/**
 * Per-chat model list tests — `src/lib/chatModels.ts`, the single
 * place the AI chat model dropdown list comes from.
 *
 * The rule under test (Gary, 2026-11-06): the dropdown lists ONLY
 * the ping server models — Auto plus every model the ping server
 * can serve. There are NO local models in the dropdown ("there are
 * NO local models, that is a pipe dream") and NO GPTs (they do not
 * run on SP). Every model in the dropdown runs on the SP system:
 * 1 SP per reply.
 *
 * The model list MUST match the ping server worker's PING_MODELS
 * allowlist (worker v0.4.0) — the worker only honors a body.model
 * on its allowlist and falls back to the default (Llama 3.2 1B)
 * for anything else. The expected set below IS the worker's
 * allowlist, copied verbatim; if the worker's allowlist changes,
 * this test must change with it (and vice versa).
 *
 * Gary's decision (2026-11-06): ONLY Llama 3.2 1B is selectable
 * and on the server — neurons (10,000/day) are the only quota that
 * matters for scaling, and 1B is the only model we can support at
 * the user numbers we want within that budget. The other 33 models
 * were removed from the worker and from here.
 *
 * Run with: npm test
 */
import { describe, it, expect } from 'vitest';
import {
  getChatModelOptions,
  PING_SERVER_MODELS,
  PING_DEFAULT_MODEL,
  AUTO_CHAT_MODEL_VALUE,
} from '../src/lib/chatModels';

/** The worker's PING_MODELS allowlist (v0.4.0), verbatim — the
 *  client dropdown must serve exactly these models. */
const WORKER_ALLOWLIST: readonly string[] = [
  '@cf/meta/llama-3.2-1b-instruct',
];

describe('PING_SERVER_MODELS', () => {
  it('is exactly the worker allowlist — 1 model, no more, no less', () => {
    const ids = PING_SERVER_MODELS.map((m) => m.id);
    expect(ids).toHaveLength(1);
    expect([...ids].sort()).toEqual([...WORKER_ALLOWLIST].sort());
  });

  it('has no duplicate ids and every entry has a label', () => {
    const ids = PING_SERVER_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const model of PING_SERVER_MODELS) {
      expect(model.label.length).toBeGreaterThan(0);
    }
  });

  it('leads with the default model (Llama 3.2 1B)', () => {
    expect(PING_SERVER_MODELS[0].id).toBe(PING_DEFAULT_MODEL);
    expect(PING_SERVER_MODELS[0].label).toBe('Llama 3.2 1B');
  });
});

describe('getChatModelOptions', () => {
  it('lists only Auto when ping is off', () => {
    const options = getChatModelOptions({ pingEnabled: false });
    expect(options).toEqual([{ value: AUTO_CHAT_MODEL_VALUE, label: 'Auto (best available)' }]);
  });

  it('lists Auto then every ping model when ping is on', () => {
    const options = getChatModelOptions({ pingEnabled: true });
    expect(options[0].value).toBe(AUTO_CHAT_MODEL_VALUE);
    expect(options).toHaveLength(1 + PING_SERVER_MODELS.length);
    // The ping models, in display order (default first).
    expect(options.slice(1).map((o) => o.value)).toEqual(
      PING_SERVER_MODELS.map((m) => m.id),
    );
  });

  it('marks every ping model as source ping', () => {
    const options = getChatModelOptions({ pingEnabled: true });
    expect(options.slice(1).every((o) => o.source === 'ping')).toBe(true);
  });

  it('has no locals and no GPTs in the dropdown', () => {
    const options = getChatModelOptions({ pingEnabled: true });
    const values = options.map((o) => o.value);
    // No local canonical keys (tinyllama, llama3.2, mistral-7b…).
    expect(values).not.toContain('tinyllama');
    expect(values).not.toContain('llama3.2');
    expect(values).not.toContain('mistral-7b');
    // No OpenAI API names.
    expect(values).not.toContain('gpt-4');
    expect(values).not.toContain('gpt-4-turbo');
    expect(values).not.toContain('gpt-3.5-turbo');
    // No dummy ping id — the value IS the Workers AI model id.
    expect(values).not.toContain('lucid-ping');
  });

  it('sends the Workers AI model id as the value (body.model)', () => {
    const options = getChatModelOptions({ pingEnabled: true });
    const llama = options.find((o) => o.label === 'Llama 3.2 1B');
    expect(llama?.value).toBe('@cf/meta/llama-3.2-1b-instruct');
  });
});
