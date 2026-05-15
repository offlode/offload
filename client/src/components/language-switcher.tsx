import { Globe } from "lucide-react";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher({ variant = "icon" }: { variant?: "icon" | "full" }) {
  const { language, setLanguage } = useI18n();

  const toggle = () => setLanguage(language === "en" ? "es" : "en");

  if (variant === "icon") {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={toggle}
        className="w-8 h-8 rounded-full text-xs font-bold"
        data-testid="button-language-toggle"
        aria-label={`Switch to ${language === "en" ? "Español" : "English"}`}
        title={`Switch to ${language === "en" ? "Español" : "English"}`}
      >
        {language === "en" ? "ES" : "EN"}
      </Button>
    );
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-2 py-2 text-sm font-medium hover:text-primary transition-colors"
      data-testid="button-language-switcher"
    >
      <Globe className="w-4 h-4" />
      {language === "en" ? "Español" : "English"}
    </button>
  );
}
