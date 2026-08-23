/**
 * SE7A model picker.
 *
 * Calls Anthropic directly via @ai-sdk/anthropic. The privacy policy
 * names Anthropic as the user-facing AI processor — if a non-Anthropic
 * fallback is ever added, /privacy must be updated first.
 */
import { anthropic } from "@ai-sdk/anthropic";

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
 * Bound LanguageModel instances for AI SDK calls.
 */
export const MODELS = {
  plate_default: anthropic(MODEL_IDS.plate_default),
  menu_default: anthropic(MODEL_IDS.menu_default),
  body_default: anthropic(MODEL_IDS.body_default),
};

/**
 * Prompt version per scan kind. Bump when a prompt changes meaningfully
 * so historical scans stay comparable.
 */
export const PROMPT_VERSION = {
  plate: "plate.v2_micros",
  menu: "menu.v1",
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
