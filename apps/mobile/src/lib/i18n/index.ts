import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { I18nManager, Platform } from "react-native";
import en from "./locales/en.json";
import ar from "./locales/ar.json";

const STORAGE_KEY = "se7a_locale";
const SUPPORTED = ["en", "ar"] as const;
export type Locale = (typeof SUPPORTED)[number];

/** Runs synchronously so the app renders in the right language on cold start. */
function initialLocale(): Locale {
  // Device default is checked after storage; we can't await AsyncStorage in
  // the initial sync init, so start with device and hot-swap once storage
  // resolves.
  const device = Localization.getLocales()[0]?.languageCode ?? "en";
  return (SUPPORTED as readonly string[]).includes(device)
    ? (device as Locale)
    : "en";
}

i18n
  .use(initReactI18next)
  .init({
    lng: initialLocale(),
    fallbackLng: "en",
    supportedLngs: SUPPORTED as unknown as string[],
    resources: {
      en: { translation: en },
      ar: { translation: ar },
    },
    interpolation: { escapeValue: false },
    returnObjects: true,
    // Keep keys as fallback text if a key is missing — makes untranslated
    // screens still functional (falls back to the English JSON).
    returnEmptyString: false,
  });

/**
 * Called on app boot after AsyncStorage resolves. If the user has set an
 * explicit locale preference, apply it; otherwise stick with the device
 * default we already set synchronously.
 */
export async function hydrateLocaleFromStorage(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED.includes(stored as Locale)) {
      await setLocale(stored as Locale, { persist: false });
    } else {
      // First launch: mirror device RTL state to match the auto-detected lang.
      applyRTLFor(i18n.language as Locale);
    }
  } catch {
    /* empty */
  }
}

/**
 * Change the current UI language. When RTL-ness flips, iOS needs an app
 * restart before layouts fully update — we can't force that from JS. Callers
 * should show a "Restart the app to see the change" hint after this fires.
 *
 * Returns `true` if a restart is required (RTL flipped), `false` if not.
 */
export async function setLocale(
  locale: Locale,
  opts: { persist?: boolean } = { persist: true }
): Promise<boolean> {
  const wasRTL = I18nManager.isRTL;
  await i18n.changeLanguage(locale);
  if (opts.persist !== false) {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, locale);
    } catch {
      /* empty */
    }
  }
  const needsRTL = locale === "ar";
  I18nManager.allowRTL(needsRTL);
  I18nManager.forceRTL(needsRTL);
  return Platform.OS !== "web" && wasRTL !== needsRTL;
}

function applyRTLFor(locale: Locale) {
  const needsRTL = locale === "ar";
  I18nManager.allowRTL(needsRTL);
  I18nManager.forceRTL(needsRTL);
}

export default i18n;
