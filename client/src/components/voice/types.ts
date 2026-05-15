/**
 * Voice Order types and pure helper functions.
 */

// ─── Types ────────────────────────────────────────────────────

export interface VoiceOrderProps {
  open: boolean;
  onClose: () => void;
}

export interface PickupWindow {
  date?: string;
  timeStart?: string;
  timeEnd?: string;
}

export interface Preferences {
  detergent?: string;
  washTemp?: string;
  addons?: string[];
  notes?: string;
}

export interface ExtractedOrder {
  serviceType: "wash_fold" | "dry_cleaning" | "comforters" | "alterations" | "mixed" | null;
  bagSize: "small" | "medium" | "large" | "xl" | null;
  tierName?: string | null;
  deliverySpeed: "standard" | "next_day" | "same_day" | null;
  pickupAddress: string | null;
  scheduledPickup?: string | null;
  separated?: boolean;
  clothingTypes?: string[];
  special_instructions?: string | null;
  pickupWindow: PickupWindow | null;
  preferences: Preferences;
  confidence: { service: number; bagSize: number; address: number; window: number };
  missingFields: string[];
  language: "en" | "es";
}

// ─── Helpers ──────────────────────────────────────────────────

/** Map voice extraction deliverySpeed → schedule page speed value */
export function mapDeliverySpeed(s: string | null): string {
  if (s === "same_day") return "same_day";
  if (s === "next_day") return "24h";
  return "48h"; // "standard" or null → default
}

/** Map voice bagSize → schedule tier name */
export function mapBagSize(b: string | null): string | null {
  if (!b) return null;
  const map: Record<string, string> = {
    small: "small_bag",
    medium: "medium_bag",
    large: "large_bag",
    xl: "xl_bag",
  };
  return map[b] ?? null;
}

export const CONFIDENCE_THRESHOLD = 0.6;

export function isSpanishLowConfidence(extracted: ExtractedOrder | null, lang: "en" | "es"): boolean {
  if (lang !== "es" || !extracted) return false;
  const { service, bagSize } = extracted.confidence;
  return service < CONFIDENCE_THRESHOLD || bagSize < CONFIDENCE_THRESHOLD;
}

export function bagSizeFromTier(tierName: string | null | undefined): ExtractedOrder["bagSize"] {
  if (!tierName) return null;
  const normalized = tierName.replace(/_bag$/, "");
  if (normalized === "small" || normalized === "medium" || normalized === "large" || normalized === "xl") {
    return normalized;
  }
  return null;
}

export function normalizeVoiceParseResponse(data: any, fallbackLanguage: "en" | "es"): ExtractedOrder {
  const scheduled = data.scheduledPickup ? new Date(data.scheduledPickup) : null;
  const pickupWindow = scheduled && !Number.isNaN(scheduled.getTime())
    ? { date: scheduled.toISOString().split("T")[0] }
    : null;

  return {
    serviceType: data.serviceType ?? null,
    bagSize: data.bagSize ?? bagSizeFromTier(data.tierName),
    tierName: data.tierName ?? null,
    deliverySpeed: data.deliverySpeed ?? null,
    pickupAddress: data.pickupAddress ?? null,
    scheduledPickup: data.scheduledPickup ?? null,
    separated: data.separated === true,
    clothingTypes: Array.isArray(data.clothingTypes) ? data.clothingTypes : [],
    special_instructions: data.special_instructions ?? null,
    pickupWindow,
    preferences: { notes: data.special_instructions ?? "" },
    confidence: data.confidence ?? { service: 1, bagSize: 1, address: 1, window: 1 },
    missingFields: Array.isArray(data.missingFields) ? data.missingFields : [],
    language: data.language === "es" ? "es" : fallbackLanguage,
  };
}

// ─── Web Speech API helpers ──────────────────────────────────

// Web Speech API types (not always in lib.dom)
export type SpeechRecognitionAny = any;

/** Check if Web Speech API (SpeechRecognition) is available */
export function hasSpeechRecognition(): boolean {
  return !!(
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition
  );
}

export function getSpeechRecognition(): (new () => SpeechRecognitionAny) | null {
  return (
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition ||
    null
  );
}

/** Speak a text string via SpeechSynthesis (verbal confirmation) */
export function speak(text: string, lang: "en" | "es") {
  if (!window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === "es" ? "es-ES" : "en-US";
  utterance.rate = 1.0;
  utterance.volume = 0.8;
  window.speechSynthesis.speak(utterance);
}
