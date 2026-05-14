import { Sparkles, Shirt, Settings2 } from "lucide-react";

interface StepWashStyleProps {
  value: string;
  onChange: (value: string) => void;
}

interface WashOption {
  value: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}

const WASH_OPTIONS: WashOption[] = [
  {
    value: "wash_fold",
    icon: <Shirt className="w-7 h-7" />,
    title: "Standard Wash",
    description: "Wash & fold with care. Pick your bags and we'll handle the rest.",
  },
  {
    value: "wash_fold_signature",
    icon: <Sparkles className="w-7 h-7" />,
    title: "Signature Wash",
    description: "Premium service with type-by-type separation. +$5/bag.",
  },
  {
    value: "wash_fold_custom",
    icon: <Settings2 className="w-7 h-7" />,
    title: "Your Custom Wash",
    description: "Your saved preferences applied to every order.",
  },
];

export function StepWashStyle({ value, onChange }: StepWashStyleProps) {
  return (
    <div className="px-5 space-y-4">
      <div>
        <h2 className="text-lg font-bold mb-1">Choose Your Wash Style</h2>
        <p className="text-sm text-muted-foreground">
          Select how you'd like your laundry cleaned.
        </p>
      </div>

      <div className="space-y-3">
        {WASH_OPTIONS.map((option) => {
          const isSelected = value === option.value;
          return (
            <button
              key={option.value}
              role="button"
              aria-label={option.title}
              aria-pressed={isSelected}
              onClick={() => onChange(option.value)}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all min-h-[80px] ${
                isSelected
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                  : "border-border bg-card hover:border-primary/40"
              }`}
              data-testid={`wash-style-${option.value}`}
            >
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {option.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm leading-tight">{option.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  {option.description}
                </p>
              </div>
              {isSelected && (
                <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <svg
                    className="w-3 h-3 text-primary-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
