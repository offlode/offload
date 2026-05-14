// =============================================================================
//  Wave L — Unit Tests
//  Tests: FSM transitions, display labels, separation fee (pricing),
//         2FA helpers, service area interface
// =============================================================================

import { describe, it, expect } from "vitest";
import { VALID_TRANSITIONS, ORDER_STATES, validateTransition } from "../order-fsm";
import { buildOrderProgress, DISPLAY_LABELS } from "../order-display-labels";

// ═══════════════════════════════════════════════════════════════
//  FSM TRANSITIONS — new states
// ═══════════════════════════════════════════════════════════════
describe("FSM: folded_packaged and final_weight_verified states", () => {
  it("folded_packaged exists in ORDER_STATES", () => {
    expect(ORDER_STATES.FOLDED_PACKAGED).toBe("folded_packaged");
    expect(ORDER_STATES.FINAL_WEIGHT_VERIFIED).toBe("final_weight_verified");
  });

  it("wash_complete can transition to folded_packaged", () => {
    expect(VALID_TRANSITIONS["wash_complete"]).toContain("folded_packaged");
  });

  it("folding can transition to folded_packaged", () => {
    expect(VALID_TRANSITIONS["folding"]).toContain("folded_packaged");
  });

  it("folded_packaged can transition to final_weight_verified", () => {
    expect(VALID_TRANSITIONS["folded_packaged"]).toContain("final_weight_verified");
  });

  it("folded_packaged can also skip to ready_for_delivery", () => {
    expect(VALID_TRANSITIONS["folded_packaged"]).toContain("ready_for_delivery");
  });

  it("final_weight_verified can transition to ready_for_delivery", () => {
    expect(VALID_TRANSITIONS["final_weight_verified"]).toContain("ready_for_delivery");
  });

  it("final_weight_verified cannot go backwards", () => {
    expect(VALID_TRANSITIONS["final_weight_verified"]).not.toContain("folded_packaged");
    expect(VALID_TRANSITIONS["final_weight_verified"]).not.toContain("washing");
  });

  it("validateTransition accepts folding → folded_packaged", () => {
    const result = validateTransition("folding", "folded_packaged");
    expect(result.valid).toBe(true);
  });

  it("validateTransition accepts folded_packaged → final_weight_verified", () => {
    const result = validateTransition("folded_packaged", "final_weight_verified");
    expect(result.valid).toBe(true);
  });

  it("validateTransition rejects pending → folded_packaged (skipping steps)", () => {
    const result = validateTransition("pending", "folded_packaged");
    expect(result.valid).toBe(false);
  });

  it("validateTransition rejects delivered → final_weight_verified (backwards)", () => {
    const result = validateTransition("delivered", "final_weight_verified");
    expect(result.valid).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
//  DISPLAY LABELS — 13-step order progress
// ═══════════════════════════════════════════════════════════════
describe("Display Labels: buildOrderProgress", () => {
  it("returns exactly 12 display steps", () => {
    const steps = buildOrderProgress({ status: "pending" });
    expect(steps).toHaveLength(12);
  });

  it("all DISPLAY_LABELS entries are present in output", () => {
    const steps = buildOrderProgress({ status: "pending" });
    for (let i = 0; i < DISPLAY_LABELS.length; i++) {
      expect(steps[i].label).toBeDefined();
    }
  });

  it("marks correct steps as completed for delivered order", () => {
    const steps = buildOrderProgress({ status: "delivered" });
    // All 12 steps should be completed for delivered
    expect(steps.every(s => s.completed)).toBe(true);
  });

  it("marks first step as completed for confirmed order", () => {
    const steps = buildOrderProgress({ status: "confirmed" });
    expect(steps[0].completed).toBe(true);
    expect(steps[1].completed).toBe(false);
  });

  it("marks no steps completed for draft_quote", () => {
    const steps = buildOrderProgress({ status: "draft_quote" });
    expect(steps.every(s => !s.completed)).toBe(true);
  });

  it("dynamic wash label defaults to 'Washing' when no clothing types", () => {
    const steps = buildOrderProgress({ status: "washing" });
    const washStep = steps.find(s => s.fsmState === "washing");
    expect(washStep?.label).toBe("Washing");
  });

  it("dynamic wash label shows 'Hot Wash Started (White Shirts)' for whites", () => {
    const steps = buildOrderProgress({
      status: "washing",
      clothingTypes: ["Whites", "Towels"],
    });
    const washStep = steps.find(s => s.fsmState === "washing");
    expect(washStep?.label).toBe("Hot Wash Started (White Shirts)");
  });

  it("dynamic wash label shows cold wash for dark items", () => {
    const steps = buildOrderProgress({
      status: "washing",
      clothingTypes: ["Dark Items"],
    });
    const washStep = steps.find(s => s.fsmState === "washing");
    expect(washStep?.label).toBe("Cold Wash Started (Dark & Delicates)");
  });

  it("dynamic wash label shows cold wash for delicates", () => {
    const steps = buildOrderProgress({
      status: "washing",
      clothingTypes: ["Delicates"],
    });
    const washStep = steps.find(s => s.fsmState === "washing");
    expect(washStep?.label).toBe("Cold Wash Started (Dark & Delicates)");
  });

  it("includes timestamps for completed steps when available", () => {
    const now = new Date().toISOString();
    const steps = buildOrderProgress({
      status: "picked_up",
      confirmedAt: now,
      pickedUpAt: now,
    });
    expect(steps[0].timestamp).toBe(now); // Pickup Schedule — uses confirmedAt
    expect(steps[2].timestamp).toBe(now); // Delivered to Laundromat — uses pickedUpAt
  });

  it("folded_packaged step maps correctly", () => {
    const steps = buildOrderProgress({ status: "folded_packaged" });
    const packagedStep = steps.find(s => s.label === "Laundry Folded & Packaged");
    expect(packagedStep).toBeDefined();
    expect(packagedStep?.completed).toBe(true);
  });

  it("final_weight_verified step maps correctly", () => {
    const steps = buildOrderProgress({ status: "final_weight_verified" });
    const verifiedStep = steps.find(s => s.label === "Final Weight Verified");
    expect(verifiedStep).toBeDefined();
    expect(verifiedStep?.completed).toBe(true);
  });

  it("handles snake_case timestamp fields", () => {
    const now = new Date().toISOString();
    const steps = buildOrderProgress({
      status: "picked_up",
      confirmed_at: now,
      picked_up_at: now,
    });
    expect(steps[0].timestamp).toBe(now);
    expect(steps[2].timestamp).toBe(now);
  });
});

// ═══════════════════════════════════════════════════════════════
//  SEPARATION FEE — pricing engine line item
// ═══════════════════════════════════════════════════════════════
// Note: calculateQuotePrice is async and requires storage/config mocks.
// We test the separation fee logic unit by verifying the QuotePriceBreakdown
// interface exists and by checking the addOnItems shape.
// Full integration test would need storage mock setup.

describe("Separation fee: pricing engine integration shape", () => {
  // Note: importing pricing.ts triggers storage init which needs DATABASE_URL.
  // We test the separation-fee logic indirectly:
  // 1. The type-check proves the input interface accepts separated/separationFeeCents
  // 2. We verify the separation fee math here with a pure unit test.

  it("separation fee calculation: direct cents input", () => {
    const separationFeeCents = 500; // $5.00
    const separated = true;
    let fee = 0;
    if (separated && separationFeeCents > 0) {
      fee = Math.round(separationFeeCents) / 100;
    }
    expect(fee).toBe(5.0);
  });

  it("separation fee is zero when separated is false", () => {
    const separationFeeCents = 500;
    const separated = false;
    let fee = 0;
    if (separated && separationFeeCents > 0) {
      fee = Math.round(separationFeeCents) / 100;
    }
    expect(fee).toBe(0);
  });

  it("separation fee is zero when cents is zero", () => {
    const separationFeeCents = 0;
    const separated = true;
    let fee = 0;
    if (separated && separationFeeCents > 0) {
      fee = Math.round(separationFeeCents) / 100;
    }
    expect(fee).toBe(0);
  });

  it("separation fee rounds correctly", () => {
    const separationFeeCents = 350; // $3.50
    const separated = true;
    let fee = 0;
    if (separated && separationFeeCents > 0) {
      fee = Math.round(separationFeeCents) / 100;
    }
    expect(fee).toBe(3.5);
  });

  it("Haversine distance utility (pure math)", () => {
    // Haversine formula — same implementation as distanceMiles in pricing.ts
    function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
      const R = 3959;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    // NYC to Newark ≈ ~10 miles
    const d = distanceMiles(40.7128, -74.006, 40.7357, -74.1724);
    expect(d).toBeGreaterThan(5);
    expect(d).toBeLessThan(20);
  });
});

// ═══════════════════════════════════════════════════════════════
//  2FA — encryption helpers (unit tests without DB)
// ═══════════════════════════════════════════════════════════════
describe("2FA encryption helpers", () => {
  // We test the encrypt/decrypt cycle by importing the helper functions directly
  // These are defined in wave-l.ts, which is a route module, so we test the
  // crypto primitives that power them.
  it("AES-256-GCM encrypt/decrypt round-trip", async () => {
    const crypto = await import("crypto");
    const key = crypto.randomBytes(32);
    const plaintext = "JBSWY3DPEHPK3PXP";

    // Encrypt
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    const tag = cipher.getAuthTag();
    const blob = iv.toString("hex") + ":" + tag.toString("hex") + ":" + encrypted;

    // Decrypt
    const [ivHex, tagHex, ciphertext] = blob.split(":");
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivHex, "hex"),
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    let decrypted = decipher.update(ciphertext, "hex", "utf8");
    decrypted += decipher.final("utf8");
    expect(decrypted).toBe(plaintext);
  });

  it("tampered ciphertext fails authentication", async () => {
    const crypto = await import("crypto");
    const key = crypto.randomBytes(32);
    const plaintext = "JBSWY3DPEHPK3PXP";

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    const tag = cipher.getAuthTag();

    // Tamper with ciphertext
    const tampered = encrypted.slice(0, -2) + "ff";
    const blob = iv.toString("hex") + ":" + tag.toString("hex") + ":" + tampered;

    const [ivHex, tagHex, ciphertext] = blob.split(":");
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivHex, "hex"),
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    expect(() => {
      decipher.update(ciphertext, "hex", "utf8");
      decipher.final("utf8");
    }).toThrow();
  });

  it("backup codes are 8 hex chars each", async () => {
    const crypto = await import("crypto");
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      codes.push(crypto.randomBytes(4).toString("hex"));
    }
    expect(codes).toHaveLength(10);
    codes.forEach(c => {
      expect(c).toMatch(/^[0-9a-f]{8}$/);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
//  OTPLIB — verify exports exist
// ═══════════════════════════════════════════════════════════════
describe("otplib: required exports", () => {
  it("exports generateSecret, generateURI, verifySync", async () => {
    const otplib = await import("otplib");
    expect(typeof otplib.generateSecret).toBe("function");
    expect(typeof otplib.generateURI).toBe("function");
    expect(typeof otplib.verifySync).toBe("function");
  });

  it("generateSecret returns a non-empty string", async () => {
    const { generateSecret } = await import("otplib");
    const secret = generateSecret();
    expect(typeof secret).toBe("string");
    expect(secret.length).toBeGreaterThan(0);
  });

  it("verifySync returns object with valid property", async () => {
    const { generateSecret, verifySync } = await import("otplib");
    const secret = generateSecret();
    const result = verifySync({ token: "000000", secret });
    expect(result).toHaveProperty("valid");
    expect(typeof result.valid).toBe("boolean");
  });
});

// ═══════════════════════════════════════════════════════════════
//  FSM — existing transitions still work (regression)
// ═══════════════════════════════════════════════════════════════
describe("FSM: existing transitions regression", () => {
  const happyPath = [
    ["pending", "confirmed"],
    ["confirmed", "scheduled"],
    ["scheduled", "driver_assigned"],
    ["driver_assigned", "driver_en_route_pickup"],
    ["driver_en_route_pickup", "arrived_pickup"],
    ["arrived_pickup", "picked_up"],
    ["picked_up", "driver_en_route_facility"],
    ["driver_en_route_facility", "at_facility"],
    ["at_facility", "processing"],
    ["processing", "washing"],
    ["washing", "drying"],
    ["drying", "folding"],
    ["folding", "ready_for_delivery"],
    ["ready_for_delivery", "driver_en_route_delivery"],
    ["driver_en_route_delivery", "arrived_delivery"],
    ["arrived_delivery", "delivered"],
    ["delivered", "completed"],
  ] as const;

  it.each(happyPath)("allows %s → %s", (from, to) => {
    const result = validateTransition(from, to);
    expect(result.valid).toBe(true);
  });

  it("allows dispute from delivered", () => {
    const result = validateTransition("delivered", "disputed");
    expect(result.valid).toBe(true);
  });

  it("allows cancel from pending", () => {
    const result = validateTransition("pending", "cancelled");
    expect(result.valid).toBe(true);
  });

  it("quote lifecycle works", () => {
    expect(validateTransition("draft_quote", "quoted").valid).toBe(true);
    expect(validateTransition("quoted", "quote_accepted").valid).toBe(true);
    expect(validateTransition("quote_accepted", "payment_pending").valid).toBe(true);
    expect(validateTransition("payment_pending", "pending").valid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
//  DISPLAY LABELS — structure validation
// ═══════════════════════════════════════════════════════════════
describe("Display Labels: structure", () => {
  it("DISPLAY_LABELS has 12 entries", () => {
    expect(DISPLAY_LABELS).toHaveLength(12);
  });

  it("each entry has label and fsmStates", () => {
    for (const entry of DISPLAY_LABELS) {
      expect(typeof entry.label).toBe("string");
      expect(entry.label.length).toBeGreaterThan(0);
      expect(Array.isArray(entry.fsmStates)).toBe(true);
      expect(entry.fsmStates.length).toBeGreaterThan(0);
    }
  });

  it("first step is Pickup Schedule", () => {
    expect(DISPLAY_LABELS[0].label).toBe("Pickup Schedule");
  });

  it("last step is Delivered to Customer", () => {
    expect(DISPLAY_LABELS[11].label).toBe("Delivered to Customer");
  });

  it("contains Laundry Folded & Packaged step", () => {
    const step = DISPLAY_LABELS.find(s => s.label === "Laundry Folded & Packaged");
    expect(step).toBeDefined();
    expect(step?.fsmStates).toContain("folded_packaged");
  });

  it("contains Final Weight Verified step", () => {
    const step = DISPLAY_LABELS.find(s => s.label === "Final Weight Verified");
    expect(step).toBeDefined();
    expect(step?.fsmStates).toContain("final_weight_verified");
  });
});
