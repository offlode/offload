import { createContext, useContext } from "react";
import en, { type TranslationKey } from "./en";
import es from "./es";

export type Language = "en" | "es";

const translations: Record<Language, Record<string, string>> = { en, es };

const STORAGE_KEY = "offload_language";

export function getSavedLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "es") return saved;
  } catch {}
  // Auto-detect from browser
  if (navigator.language.startsWith("es")) return "es";
  return "en";
}

export function saveLanguage(lang: Language) {
  try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
}

export function t(key: TranslationKey, lang: Language, params?: Record<string, string | number>): string {
  let value = translations[lang]?.[key] || translations.en[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(`{${k}}`, String(v));
    }
  }
  return value;
}

export interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export const I18nContext = createContext<I18nContextValue>({
  language: "en",
  setLanguage: () => {},
  t: (key) => en[key] || key,
});

export function useI18n() {
  return useContext(I18nContext);
}

export type { TranslationKey };
