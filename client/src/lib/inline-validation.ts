/**
 * Inline validation utilities for Offload.
 * Instead of toast errors, fields get red borders + error messages,
 * and the page scrolls to the first error.
 */

export interface FieldError {
  field: string;
  message: string;
}

/**
 * Scroll to the first field with an error and focus it.
 * Uses data-field="fieldName" attribute to locate elements.
 */
export function scrollToFirstError(errors: FieldError[]) {
  if (errors.length === 0) return;
  const firstField = errors[0].field;

  // Try data-field first, then id, then name
  const el =
    document.querySelector(`[data-field="${firstField}"]`) ||
    document.getElementById(firstField) ||
    document.querySelector(`[name="${firstField}"]`);

  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    // Focus the input inside the container, or the element itself
    const input = el.querySelector("input, textarea, select") || el;
    if (input instanceof HTMLElement) {
      setTimeout(() => input.focus(), 300);
    }
  }
}

/**
 * Returns the CSS class string for a field's border.
 * If the field has an error, returns red border classes.
 */
export function fieldBorderClass(
  fieldName: string,
  errors: FieldError[],
  baseClass: string = "border-border"
): string {
  const hasError = errors.some((e) => e.field === fieldName);
  return hasError
    ? "border-red-500 ring-1 ring-red-500/30"
    : baseClass;
}

/**
 * Returns the inline error message JSX for a given field, or null.
 */
export function getFieldError(
  fieldName: string,
  errors: FieldError[]
): string | null {
  const err = errors.find((e) => e.field === fieldName);
  return err ? err.message : null;
}
