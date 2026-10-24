/**
 * SE7A model picker — unified entrypoint for every LLM call in the app.
 *
 * Routing behavior:
 * - When AI_GATEWAY_API_KEY env is set (or when running on Vercel with
 *   OIDC-based gateway auth), model requests go through Vercel AI
 *   Gateway. That gives us:
 *     - unified billing + rate limits
 *     - automatic observability (which prompt took longest, cost most)
 *     - the ability to swap or fallback models at the dashboard level
 *       (no code redeploy)
 * - When the gateway key isn't present, we fall back to the direct
 *   Anthropic provider using @ai-sdk/anthropic + ANTHROPIC_API_KEY.
 *   This keeps local dev working without a gateway account.
 *
 * Caller stays identical in both modes: `model: pickModel("claude-...")`.
 */
import { anthropic } from "@ai-sdk/anthropic";
import { gateway } from "ai";
import type { LanguageModel } from "ai";

const SONNET = "claude-sonnet-4-6";

/**
 * Stable string identifiers for each scan kind's default model.
 * Persisted on scans.model so historical rows stay queryable when the
 * picker rotates.
 */
export const MODEL_IDS = {
  plate_default: SONNET,
  menu_default: SONNET,
  body_default: SONNET,
} as const;

/**
 * Return a bound LanguageModel ready to pass to generateObject / generateText.
 * Pass the raw provider model ID (e.g. "claude-sonnet-4-6"); the helper
 * decides whether to route through the gateway or hit Anthropic direct.
 *
 * All callers in app/api/** should use this instead of `anthropic(...)`
 * so adding a new provider is a one-file change rather than a repo-wide
 * find-and-replace.
 */
export function pickModel(id: string): LanguageModel {
  // Strict opt-in: only route through the gateway when AI_GATEWAY_API_KEY
  // is explicitly set. Previously this also triggered on process.env.VERCEL
  // (always "1" on Vercel runtime), which caused EVERY AI call to attempt
  // the gateway path before the gateway was enabled on the project — the
  // result was blanket 401s and ai_failed across every route. Explicit opt-
  // in means a staged rollout: enable in Vercel dashboard → set env var →
  // routes flip over, with the direct Anthropic path as a safe default.
  if (process.env.AI_GATEWAY_API_KEY) {
    return gateway(`anthropic/${id}`);
  }
  return anthropic(id);
}

/**
 * Pre-bound LanguageModel instances for the scan routes. Convenience
 * wrappers around pickModel so each route doesn't repeat the string ID.
 */
export const MODELS = {
  plate_default: pickModel(MODEL_IDS.plate_default),
  menu_default: pickModel(MODEL_IDS.menu_default),
  body_default: pickModel(MODEL_IDS.body_default),
};

/**
 * Prompt version per scan kind. Bump when a prompt changes meaningfully
 * so historical scans stay comparable.
 */
export const PROMPT_VERSION = {
  plate: "plate.v3_scale",
  menu: "menu.v3_portion",
  body: "body.v1",
} as const;

/**
 * The menu scanner hands the model the user's remaining daily budget as
 * a range. When no daily targets exist (profile not fully set), fall
 * back to a generous default so the call still ranks dishes coherently.
 */
export const MENU_FALLBACK_BUDGET = {
  kcal_low: 1500,
  kcal_high: 2500,
  protein_g_low: 80,
  protein_g_high: 150,
  carb_g_low: 150,
  carb_g_high: 300,
  fat_g_low: 50,
  fat_g_high: 90,
} as const;
