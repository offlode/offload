export function pick<T extends Record<string, any>, K extends string>(obj: T, allowedFields: readonly K[]): Partial<Record<K, any>> {
  const out: Partial<Record<K, any>> = {};
  if (!obj || typeof obj !== "object") return out;
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(obj, field) && (obj as any)[field] !== undefined) {
      (out as any)[field] = (obj as any)[field];
    }
  }
  return out;
}
