/**
 * Per-chat model choices for the AI chat — THE single place the
 * dropdown list comes from.
 *
 * Gary's design (2026-11-06): each chat has a model choice dropdown
 * at the top for the next prompted reply, and each chat remembers
 * its model. The dropdown lists ONLY the ping server models — Auto
 * plus every model the ping server can serve. There are NO local
 * models in the dropdown (Gary: "there are NO local models, that is
 * a pipe dream") and NO GPTs (they do not run on SP — they use an
 * OpenAI API key). Every model in the dropdown runs on the SP
 * system: 1 SP per reply, metered by the existing SP bucket.
 *
 * Gary's decision (2026-11-06): ONLY Llama 3.2 1B is selectable
 * and on the server. Neurons (10,000/day, Cloudflare free tier)
 * are the only quota that matters for scaling, and the 1B is the
 * only model we can support for the user numbers we want (200-1000
 * users) within that budget — the bigger models (70B, 120B, etc.)
 * burn too many neurons to support that scale. So the list is one
 * model: the default. The worker's PING_MODELS allowlist (worker
 * v0.4.0, ~/workspace/ARC-Neuron-LLMBuilder/cloudflare/
 * ping-server/worker.js) holds the same single model — the worker
 * only honors a body.model on its allowlist; anything else falls
 * back to the default (Llama 3.2 1B). This list MUST match the
 * worker's allowlist.
 *
 * The list is data-driven: PING_SERVER_MODELS is the table. The
 * dropdown value for a ping model is the Workers AI model id itself
 * (e.g. '@cf/meta/llama-3.2-1b-instruct') — the client sends it as
 * body.model (pingServer.ts chatPing) and the worker serves it.
 *
 * Ping stays GLOBAL: choosing a ping model only means "this chat's
 * next reply goes to the ping server with this model" — which only
 * works while the global Settings toggle `pingServerEnabled` is on.
 * Ping off = only Auto is listed (Auto is the cascade — it can
 * still fall back to a local model or OpenAI behind the scenes, but
 * neither is listed as a pickable model).
 */

export type ChatModelSource = 'ping' | 'local' | 'openai';

/** One entry in the per-chat model dropdown. */
export interface ChatModelOption {
  /** The value stored on the chat (`ChatSession.model`). For ping
   *  models this is the Workers AI model id the client sends as
   *  body.model. */
  value: string;
  /** Which route answers when this model is chosen. Absent for
   *  Auto: no route is chosen, the cascade decides per reply. */
  source?: ChatModelSource;
  /** What the dropdown shows. */
  label: string;
}

/** The ping server's default model — what Auto uses and what the
 *  worker serves when no model (or an unknown one) is sent. */
export const PING_DEFAULT_MODEL = '@cf/meta/llama-3.2-1b-instruct';

/**
 * Every ping server model, in display order: the default first,
 * then the rest alphabetically by label. The `id` is the Workers AI
 * model id — it MUST be on the worker's PING_MODELS allowlist.
 * Adding a model = one entry here + the same id in the worker's
 * allowlist. Do not invent ids — only Workers AI text-generation
 * models the worker can serve.
 *
 * Gary's decision (2026-11-06): ONLY Llama 3.2 1B. The bigger
 * models were removed — neurons (10,000/day) are the only quota
 * that matters for scaling, and 1B is the only model we can
 * support at the user numbers we want within that budget.
 */
export const PING_SERVER_MODELS: readonly { id: string; label: string }[] = [
  { id: '@cf/meta/llama-3.2-1b-instruct', label: 'Llama 3.2 1B' },
];

/** The "no explicit model" choice: the reply takes today's fixed
 *  cascade (ping → local → OpenAI), re-decided per reply. This is
 *  the default for a new chat that inherits no model. */
export const AUTO_CHAT_MODEL_VALUE = '';
export const AUTO_CHAT_MODEL: ChatModelOption = {
  value: AUTO_CHAT_MODEL_VALUE,
  label: 'Auto (best available)',
};

/** A ping model as a dropdown option. */
export function pingModelOption(model: { id: string; label: string }): ChatModelOption {
  return { value: model.id, source: 'ping', label: model.label };
}

export interface ChatModelAvailability {
  /** The global ping-server toggle is on. */
  pingEnabled: boolean;
}

/**
 * The dropdown list, in display order: Auto first, then the ping
 * server models (default first, then alphabetical by label) when
 * ping is enabled. Ping off = Auto only. No locals, no GPTs — the
 * dropdown is ping models only, and every one runs on SP.
 */
export function getChatModelOptions(
  availability: ChatModelAvailability,
): ChatModelOption[] {
  const options: ChatModelOption[] = [AUTO_CHAT_MODEL];

  if (availability.pingEnabled) {
    for (const model of PING_SERVER_MODELS) {
      options.push(pingModelOption(model));
    }
  }

  return options;
}
