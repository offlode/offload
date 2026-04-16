import type { FieldError } from "@/lib/inline-validation";

/**
 * Renders inline error text beneath a form field.
 * Shows nothing if there's no error for the given field.
 */
export function InlineFieldError({
  field,
  errors,
}: {
  field: string;
  errors: FieldError[];
}) {
  const err = errors.find((e) => e.field === field);
  if (!err) return null;
  return (
    <p className="text-xs text-red-500 mt-1 animate-in fade-in duration-200">
      {err.message}
    </p>
  );
}
