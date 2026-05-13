import { addMoneyCents, dollarsToCents as moneyDollarsToCents } from "../lib/money";

// ── Dual-write helpers: add shadow _cents columns from dollar values ──
function dollarToCents(v: number | null | undefined): number | null {
  return v != null ? moneyDollarsToCents(v) : null;
}
const ORDER_MONEY_FIELDS = [
  "subtotal", "tax", "deliveryFee", "discount", "tip", "total",
  "tierFlatPrice", "overageCharge", "finalPrice", "vendorPayout", "driverPayout",
  "platformFee", "pickupDistanceFee", "floorFee", "handoffFee", "windowDiscount",
  "pickupWaitFee",
];
const QUOTE_MONEY_FIELDS = [
  "laundryServicePrice", "speedSurcharge", "deliveryFee", "preferredVendorSurcharge",
  "addOnsTotal", "subtotal", "taxAmount", "discount", "total", "tierFlatPrice",
  "pickupDistanceFee", "floorFee", "handoffFee", "windowDiscount", "promoDiscount",
];
export function addOrderCents<T extends Record<string, any>>(data: T): T {
  return addMoneyCents(data, ORDER_MONEY_FIELDS);
}
export function addQuoteCents<T extends Record<string, any>>(data: T): T {
  return addMoneyCents(data, QUOTE_MONEY_FIELDS);
}
export function addVendorCents<T extends Record<string, any>>(data: T): T {
  const d = { ...data } as any;
  if (d.payoutRate != null && d.payoutRateCents == null) d.payoutRateCents = dollarToCents(d.payoutRate);
  if (d.totalEarnings != null && d.totalEarningsCents == null) d.totalEarningsCents = dollarToCents(d.totalEarnings);
  if (d.pendingPayout != null && d.pendingPayoutCents == null) d.pendingPayoutCents = dollarToCents(d.pendingPayout);
  return d;
}
export function addDriverCents<T extends Record<string, any>>(data: T): T {
  const d = { ...data } as any;
  if (d.payoutPerTrip != null && d.payoutPerTripCents == null) d.payoutPerTripCents = dollarToCents(d.payoutPerTrip);
  if (d.totalEarnings != null && d.totalEarningsCents == null) d.totalEarningsCents = dollarToCents(d.totalEarnings);
  if (d.pendingPayout != null && d.pendingPayoutCents == null) d.pendingPayoutCents = dollarToCents(d.pendingPayout);
  return d;
}
export function addUserCents<T extends Record<string, any>>(data: T): T {
  const d = { ...data } as any;
  if (d.totalSpent != null && d.totalSpentCents == null) d.totalSpentCents = dollarToCents(d.totalSpent);
  return d;
}
export function addDisputeCents<T extends Record<string, any>>(data: T): T {
  const d = { ...data } as any;
  if (d.creditAmount != null && d.creditAmountCents == null) d.creditAmountCents = dollarToCents(d.creditAmount);
  if (d.refundAmount != null && d.refundAmountCents == null) d.refundAmountCents = dollarToCents(d.refundAmount);
  return d;
}
export function addPromoCents<T extends Record<string, any>>(data: T): T {
  const d = { ...data } as any;
  if (d.value != null && d.valueCents == null) d.valueCents = dollarToCents(d.value);
  if (d.minOrderAmount != null && d.minOrderAmountCents == null) d.minOrderAmountCents = dollarToCents(d.minOrderAmount);
  return d;
}
export function addReferralCents<T extends Record<string, any>>(data: T): T {
  const d = { ...data } as any;
  if (d.referrerReward != null && d.referrerRewardCents == null) d.referrerRewardCents = dollarToCents(d.referrerReward);
  if (d.refereeReward != null && d.refereeRewardCents == null) d.refereeRewardCents = dollarToCents(d.refereeReward);
  return d;
}
export function addConsentCents<T extends Record<string, any>>(data: T): T {
  const d = { ...data } as any;
  if (d.additionalCharge != null && d.additionalChargeCents == null) d.additionalChargeCents = dollarToCents(d.additionalCharge);
  return d;
}
export function addServiceTypeCents<T extends Record<string, any>>(data: T): T {
  const d = { ...data } as any;
  if (d.basePrice != null && d.basePriceCents == null) d.basePriceCents = dollarToCents(d.basePrice);
  return d;
}
export function addPricingTierCents<T extends Record<string, any>>(data: T): T {
  const d = { ...data } as any;
  if (d.flatPrice != null && d.flatPriceCents == null) d.flatPriceCents = dollarToCents(d.flatPrice);
  if (d.overageRate != null && d.overageRateCents == null) d.overageRateCents = dollarToCents(d.overageRate);
  return d;
}
export function addAddOnCents<T extends Record<string, any>>(data: T): T {
  const d = { ...data } as any;
  if (d.price != null && d.priceCents == null) d.priceCents = dollarToCents(d.price);
  return d;
}
export function addOrderAddOnCents<T extends Record<string, any>>(data: T): T {
  const d = { ...data } as any;
  if (d.unitPrice != null && d.unitPriceCents == null) d.unitPriceCents = dollarToCents(d.unitPrice);
  if (d.total != null && d.totalCents == null) d.totalCents = dollarToCents(d.total);
  return d;
}
export function addPaymentTxnCents<T extends Record<string, any>>(data: T): T {
  const d = { ...data } as any;
  if (d.platformFee != null && d.platformFeeCents == null) d.platformFeeCents = dollarToCents(d.platformFee);
  return d;
}
