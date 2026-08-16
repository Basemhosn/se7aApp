/**
 * Server-side locale detection. Reads Accept-Language from the request
 * and returns "en" or "ar" — the two locales the app supports.
 * Defaults to "en" for anything else.
 */
export type ServerLocale = "en" | "ar";

export function localeFromRequest(request: Request): ServerLocale {
  const header = request.headers.get("accept-language") ?? "";
  const primary = header.split(",")[0]?.trim().toLowerCase() ?? "";
  if (primary.startsWith("ar")) return "ar";
  return "en";
}

/**
 * A short instruction to append to any AI system prompt so the model
 * responds in the caller's language. Keeps outputs consistent regardless
 * of what the user's message language happens to be.
 */
export function languageInstruction(locale: ServerLocale): string {
  if (locale === "ar") {
    return "Respond entirely in Modern Standard Arabic (فصحى) unless the user explicitly asks for another language. Dish names in the user's regional dialect are welcome. All numeric values remain in Western digits (123, not ١٢٣).";
  }
  return "Respond in English.";
}
