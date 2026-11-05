/**
 * Persisted model enable/disable state — ~/.lucid/llm_state.json.
 *
 * The ONE persisted form of "is this model enabled". File shape:
 *
 *   { "version": 1, "disabledModels": ["mistral", ...] }
 *
 * Only disabled models are stored; every other registered model
 * defaults to enabled. The router (BypassRouter) owns the live flag
 * in memory, the backend manager mirrors it, and LucidCore writes
 * this file whenever the flag changes (via the router's
 * onEnabledChange hook) and seeds the router from it at startup —
 * so a disable survives a restart instead of reverting to "all
 * enabled", which is what happened before this module existed (the
 * old setModelEnabled was an empty stub and the router's
 * _saveModelState only logged that persistence "is managed by backend
 * manager" — it was not, anywhere).
 *
 * Both functions are defensive about a missing or corrupt file: a
 * missing file means "nothing disabled yet" and a corrupt file warns
 * and means the same, so a bad state file can never kill startup.
 * saveDisabledModels DOES throw on a write failure — the caller
 * (BypassRouter.enable/disableModel) treats that as a failed toggle
 * and reverts the in-memory change, so success is never claimed for
 * a change that did not persist.
 */

import * as fs from 'fs';
import * as path from 'path';

export const LLM_STATE_FILENAME = 'llm_state.json';
export const LLM_STATE_VERSION = 1;

export function getLlmStatePath(lucidDir: string): string {
  return path.join(lucidDir, LLM_STATE_FILENAME);
}

/**
 * Read the disabled-model list. Never throws: missing file → [],
 * unreadable/corrupt file → [] (with a warning, so the damage is
 * visible instead of silently treated as "all enabled").
 */
export function loadDisabledModels(lucidDir: string): string[] {
  const statePath = getLlmStatePath(lucidDir);
  let raw: string;
  try {
    raw = fs.readFileSync(statePath, 'utf-8');
  } catch {
    // Missing file is the normal first-run state, not an error.
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return [];
    const disabled = (parsed as { disabledModels?: unknown }).disabledModels;
    if (!Array.isArray(disabled)) return [];
    return disabled.filter((m): m is string => typeof m === 'string');
  } catch (error: any) {
    console.warn(
      `[llm_state] Could not parse ${statePath} — treating all models as enabled: ${
        error?.message ?? String(error)
      }`
    );
    return [];
  }
}

/**
 * Write the disabled-model list, atomically: temp file in the same
 * directory, then rename, so a crash mid-write never leaves a
 * half-written state file behind. Throws on failure (the caller
 * reports the toggle as failed).
 */
export function saveDisabledModels(
  lucidDir: string,
  disabledModels: string[]
): void {
  fs.mkdirSync(lucidDir, { recursive: true });
  const statePath = getLlmStatePath(lucidDir);
  const payload =
    JSON.stringify(
      {
        version: LLM_STATE_VERSION,
        disabledModels: [...disabledModels].sort(),
      },
      null,
      2
    ) + '\n';
  const tmpPath = `${statePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, payload, 'utf-8');
  try {
    fs.renameSync(tmpPath, statePath);
  } catch (error) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // Best-effort temp cleanup; the rename error is what matters.
    }
    throw error;
  }
}
