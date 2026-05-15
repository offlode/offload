import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CLOTHING_TYPES } from "@/lib/design-tokens";

interface StepClothingTypesProps {
  selected: string[];
  customTypes: string[];
  onSelectedChange: (types: string[]) => void;
  onCustomTypesChange: (types: string[]) => void;
}

export function StepClothingTypes({
  selected,
  customTypes,
  onSelectedChange,
  onCustomTypesChange,
}: StepClothingTypesProps) {
  const [customInput, setCustomInput] = useState("");

  const toggleType = (type: string) => {
    if (selected.includes(type)) {
      onSelectedChange(selected.filter(t => t !== type));
    } else {
      onSelectedChange([...selected, type]);
    }
  };

  const addCustomType = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    if (customTypes.includes(trimmed) || CLOTHING_TYPES.includes(trimmed as typeof CLOTHING_TYPES[number])) return;
    onCustomTypesChange([...customTypes, trimmed]);
    onSelectedChange([...selected, trimmed]);
    setCustomInput("");
  };

  const allTypes = [...CLOTHING_TYPES, ...customTypes];

  return (
    <div className="px-5 space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight mb-1">Select Clothing Types</h2>
        <p className="text-sm text-muted-foreground">
          Choose which types of clothing to separate. Tap to select.
        </p>
      </div>

      {/* Type chips */}
      <div className="flex flex-wrap gap-2">
        {allTypes.map(type => {
          const isActive = selected.includes(type);
          return (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium min-h-[44px] transition-all duration-200 ${
                isActive
                  ? "bg-primary text-primary-foreground ring-1 ring-primary/30"
                  : "bg-card border border-border text-foreground hover:border-primary/30"
              }`}
              data-testid={`type-${type.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {isActive && <Check className="w-3 h-3" />}
              {type}
            </button>
          );
        })}
      </div>

      {/* Add custom type */}
      <Card className="p-4 rounded-2xl">
        <p className="text-xs font-semibold mb-2 text-muted-foreground">Add Custom Type</p>
        <div className="flex gap-2">
          <Input
            value={customInput}
            onChange={e => setCustomInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addCustomType()}
            placeholder="e.g. Uniforms, Curtains..."
            className="h-10 text-sm"
            data-testid="input-custom-type"
          />
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={addCustomType}
            disabled={!customInput.trim()}
            data-testid="button-add-custom-type"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </Card>

      {/* Selection summary */}
      {selected.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {selected.length} type{selected.length !== 1 ? "s" : ""} selected
        </p>
      )}
    </div>
  );
}
