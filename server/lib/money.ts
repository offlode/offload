export function centsToDollars(cents: number | null | undefined): number {
  return cents == null ? 0 : Math.round(cents) / 100;
}

export function dollarsToCents(dollars: number | null | undefined): number {
  return dollars == null ? 0 : Math.round(dollars * 100);
}

/**
 * Dual-write a legacy dollar field and its canonical _cents shadow.
 * Example: setMoney("tip", 250) => { tip: 2.5, tipCents: 250 }
 */
export function setMoney<Field extends string>(field: Field, cents: number | null | undefined): Record<Field | `${Field}Cents`, number> {
  const safeCents = cents == null ? 0 : Math.round(cents);
  return {
    [field]: safeCents / 100,
    [`${field}Cents`]: safeCents,
  } as Record<Field | `${Field}Cents`, number>;
}

export function addMoneyCents<T extends Record<string, any>>(data: T, fields: string[]): T {
  const out = { ...data } as Record<string, any>;
  for (const field of fields) {
    const centsField = `${field}Cents`;
    if (out[field] != null && out[centsField] == null) out[centsField] = dollarsToCents(Number(out[field]));
    if (out[centsField] != null && out[field] == null) out[field] = centsToDollars(Number(out[centsField]));
  }
  return out as T;
}
