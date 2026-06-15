/**
 * SE7A AI Gateway model picker.
 *
 * All vision calls route through the Vercel AI Gateway. A plain
 * "provider/model" string is enough — AI SDK v6 uses Gateway by default
 * when no explicit provider is configured.
 *
 * Privacy policy commits us to Anthropic Claude as the user-facing AI
 * processor — keep Claude as the default. If you add a non-Anthropic
 * fallback, update /privacy first (see project memory).
 */
export const MODELS = {
  plate_default: "anthropic/claude-sonnet-4-6" as const,
  menu_default: "anthropic/claude-sonnet-4-6" as const,
  body_default: "anthropic/claude-sonnet-4-6" as const,
};

export type ModelId = (typeof MODELS)[keyof typeof MODELS];

/**
 * Tracks the prompt version per scan kind. Bump this when the prompt
 * changes meaningfully, so historical scans stay comparable.
 */
export const PROMPT_VERSION = {
  plate: "plate.v1",
  menu: "menu.v1",
  body: "body.v1",
} as const;

/**
 * The menu scanner hands the model the user's remaining daily budget as a
 * range. When no daily targets exist (profile not fully set), fall back to
 * a generous default so the call still ranks dishes coherently.
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
