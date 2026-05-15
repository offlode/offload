import { useState, useCallback, useMemo } from "react";
import { I18nContext, getSavedLanguage, saveLanguage, t as translate, type Language, type TranslationKey } from "@/i18n";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getSavedLanguage);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    saveLanguage(lang);
  }, []);

  const tFn = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => translate(key, language, params),
    [language],
  );

  const value = useMemo(() => ({ language, setLanguage, t: tFn }), [language, setLanguage, tFn]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
