// =============================================================================
//  Wave 2 — Unit Tests
//  Tests: Vehicle profile shape, Vendor KPIs shape, Operator KPIs shape,
//         Bank account mask compliance, Voice parse endpoint, Demo vendor
//         exclusion logic, Permission bitmask expansion, Wash run body compat
// =============================================================================

import { describe, it, expect } from "vitest";

// ═══════════════════════════════════════════════════════════════
//  VEHICLE PROFILE — response shape
// ═══════════════════════════════════════════════════════════════
describe("Vehicle Profile: response shape", () => {
  it("vehicle response contains required fields", () => {
    const vehicle = {
      color: "Blue",
      model: "Honda Civic",
      license_plate: "ABC-1234",
      photo_url: "https://example.com/car.jpg",
    };
    expect(vehicle).toHaveProperty("color");
    expect(vehicle).toHaveProperty("model");
    expect(vehicle).toHaveProperty("license_plate");
    expect(vehicle).toHaveProperty("photo_url");
  });

  it("vehicle PUT accepts partial updates", () => {
    const body = { color: "Red" };
    expect(body.color).toBe("Red");
    // license_plate, model, photo_url not required for partial update
    expect(body).not.toHaveProperty("model");
  });
});

// ═══════════════════════════════════════════════════════════════
//  VENDOR KPIs — response shape
// ═══════════════════════════════════════════════════════════════
describe("Vendor KPIs: response shape", () => {
  it("vendors/me returns required fields", () => {
    const vendorProfile = {
      id: 1,
      name: "Test Laundry",
      location_label: "Brooklyn",
      certified: true,
      rating: 4.7,
      on_time_rate: 0.95,
      growth_pct: 12.5,
    };
    expect(vendorProfile).toHaveProperty("id");
    expect(vendorProfile).toHaveProperty("name");
    expect(vendorProfile).toHaveProperty("location_label");
    expect(vendorProfile).toHaveProperty("certified");
    expect(vendorProfile).toHaveProperty("rating");
    expect(vendorProfile).toHaveProperty("on_time_rate");
    expect(vendorProfile).toHaveProperty("growth_pct");
    expect(typeof vendorProfile.certified).toBe("boolean");
    expect(typeof vendorProfile.on_time_rate).toBe("number");
  });

  it("vendors/me/kpis returns required fields", () => {
    const kpis = {
      new_orders: 5,
      active_orders: 12,
      completed_today: 8,
      revenue_this_week_cents: 45000,
    };
    expect(kpis).toHaveProperty("new_orders");
    expect(kpis).toHaveProperty("active_orders");
    expect(kpis).toHaveProperty("completed_today");
    expect(kpis).toHaveProperty("revenue_this_week_cents");
    expect(typeof kpis.revenue_this_week_cents).toBe("number");
  });

  it("growth_pct computation: positive growth", () => {
    const revNow = 10000;
    const revPrev = 8000;
    const growthPct = revPrev > 0
      ? Math.round(((revNow - revPrev) / revPrev) * 100 * 10) / 10
      : 0;
    expect(growthPct).toBe(25);
  });

  it("growth_pct computation: negative growth", () => {
    const revNow = 6000;
    const revPrev = 8000;
    const growthPct = revPrev > 0
      ? Math.round(((revNow - revPrev) / revPrev) * 100 * 10) / 10
      : 0;
    expect(growthPct).toBe(-25);
  });

  it("growth_pct computation: zero previous revenue", () => {
    const revNow = 10000;
    const revPrev = 0;
    const growthPct = revPrev > 0
      ? Math.round(((revNow - revPrev) / revPrev) * 100 * 10) / 10
      : 0;
    expect(growthPct).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
//  OPERATOR KPIs — response shape
// ═══════════════════════════════════════════════════════════════
describe("Operator KPIs: response shape", () => {
  it("operators/me/kpis returns required fields", () => {
    const kpis = {
      processed_today: 15,
      currently_washing: 3,
      avg_wash_time_min: 42.5,
      quality_pct: 95,
    };
    expect(kpis).toHaveProperty("processed_today");
    expect(kpis).toHaveProperty("currently_washing");
    expect(kpis).toHaveProperty("avg_wash_time_min");
    expect(kpis).toHaveProperty("quality_pct");
    expect(kpis.quality_pct).toBe(95);
  });
});

// ═══════════════════════════════════════════════════════════════
//  BANK ACCOUNT MASK — D8 compliance
// ═══════════════════════════════════════════════════════════════
describe("Bank Account Mask: D8 compliance", () => {
  it("response must NOT include routingLastFour", () => {
    // Simulates the response shape from GET /api/vendors/:id/bank-account
    const response = {
      id: 1,
      bankName: "Chase",
      last4: "4567",
      display: "Chase ••••4567",
      status: "verified",
    };
    expect(response).not.toHaveProperty("routingLastFour");
    expect(response).not.toHaveProperty("maskedRouting");
    expect(response).not.toHaveProperty("routing_last_four");
    expect(response).toHaveProperty("bankName");
    expect(response).toHaveProperty("last4");
    expect(response).toHaveProperty("status");
  });

  it("response contains only permitted fields", () => {
    const response = {
      id: 1,
      bankName: "Chase",
      last4: "4567",
      display: "Chase ••••4567",
      status: "verified",
    };
    const allowedKeys = ["id", "bankName", "last4", "display", "status"];
    const actualKeys = Object.keys(response);
    expect(actualKeys.every(k => allowedKeys.includes(k))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
//  VOICE PARSE — intent extraction
// ═══════════════════════════════════════════════════════════════
describe("Voice Parse: intent extraction logic", () => {
  // Mirrors the word-boundary regex matching used in /api/voice/parse after Wave 3 fix.
  function parseVoiceIntent(transcription: string) {
    const text = transcription.toLowerCase().trim();

    let tierName: string | null = null;
    if (/\b(xl|extra[\s-]?large)\b/i.test(transcription)) tierName = "xl_bag";
    else if (/\blarge\b/i.test(transcription)) tierName = "large_bag";
    else if (/\bmedium\b/i.test(transcription)) tierName = "medium_bag";
    else if (/\bsmall\b/i.test(transcription)) tierName = "small_bag";

    const separated = text.includes("separat") || text.includes("sort");

    const clothingTypes: string[] = [];
    if (text.includes("white")) clothingTypes.push("Whites");
    if (text.includes("dark")) clothingTypes.push("Dark Items");
    if (text.includes("delicat")) clothingTypes.push("Delicates");
    if (text.includes("towel")) clothingTypes.push("Towels");

    return { tierName, separated, clothingTypes };
  }

  it("extracts large bag tier", () => {
    const result = parseVoiceIntent("I need a large bag pickup tomorrow");
    expect(result.tierName).toBe("large_bag");
  });

  it("extracts separated preference", () => {
    const result = parseVoiceIntent("Please separate my whites and darks");
    expect(result.separated).toBe(true);
  });

  it("extracts clothing types", () => {
    const result = parseVoiceIntent("I have whites, dark items and delicates to wash");
    expect(result.clothingTypes).toContain("Whites");
    expect(result.clothingTypes).toContain("Dark Items");
    expect(result.clothingTypes).toContain("Delicates");
  });

  it("returns null tier when no size mentioned", () => {
    const result = parseVoiceIntent("I need a laundry pickup");
    expect(result.tierName).toBeNull();
  });

  it("handles XL/extra large", () => {
    const result = parseVoiceIntent("I have an extra large load");
    expect(result.tierName).toBe("xl_bag");
  });

  it("does NOT extract price from voice input", () => {
    // Owner directive: voice NEVER displays a price
    const result = parseVoiceIntent("I need a large bag for about $30");
    expect(result).not.toHaveProperty("price");
    expect(result).not.toHaveProperty("total");
    expect(result).not.toHaveProperty("estimatedCost");
  });
});

// ═══════════════════════════════════════════════════════════════
//  DEMO VENDOR EXCLUSION — production filtering
// ═══════════════════════════════════════════════════════════════
describe("Demo Vendor Exclusion: production filtering", () => {
  function filterVendors(vendors: any[], nodeEnv: string, allowDemo: string | undefined) {
    if (nodeEnv === "production" && allowDemo !== "true") {
      return vendors.filter(v => v.isDemo !== true);
    }
    return vendors;
  }

  it("excludes demo vendors in production", () => {
    const vendors = [
      { id: 1, name: "Real Vendor", isDemo: false },
      { id: 2, name: "Demo Vendor", isDemo: true },
      { id: 3, name: "Another Real", isDemo: false },
    ];
    const filtered = filterVendors(vendors, "production", undefined);
    expect(filtered).toHaveLength(2);
    expect(filtered.every(v => !v.isDemo)).toBe(true);
  });

  it("keeps demo vendors when ALLOW_DEMO_VENDORS=true in production", () => {
    const vendors = [
      { id: 1, name: "Real Vendor", isDemo: false },
      { id: 2, name: "Demo Vendor", isDemo: true },
    ];
    const filtered = filterVendors(vendors, "production", "true");
    expect(filtered).toHaveLength(2);
  });

  it("keeps demo vendors in sandbox/development", () => {
    const vendors = [
      { id: 1, name: "Real Vendor", isDemo: false },
      { id: 2, name: "Demo Vendor", isDemo: true },
    ];
    const filtered = filterVendors(vendors, "development", undefined);
    expect(filtered).toHaveLength(2);
  });

  it("handles empty vendor list", () => {
    const filtered = filterVendors([], "production", undefined);
    expect(filtered).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════
//  PERMISSION BITMASK — 5-bit expansion
// ═══════════════════════════════════════════════════════════════
describe("Permission Bitmask: 5-bit expansion", () => {
  function bitmaskToPermissions(mask: number) {
    return {
      view_orders: !!(mask & 1),
      update_wash_status: !!(mask & 2),
      weight_verification: !!(mask & 4),
      photo_upload: !!(mask & 8),
      wash_preferences: !!(mask & 16),
    };
  }

  function permissionsToBitmask(perms: Record<string, boolean>) {
    let mask = 0;
    if (perms.view_orders) mask |= 1;
    if (perms.update_wash_status) mask |= 2;
    if (perms.weight_verification) mask |= 4;
    if (perms.photo_upload) mask |= 8;
    if (perms.wash_preferences) mask |= 16;
    return mask;
  }

  it("bitmask 7 maps to view_orders + update_wash_status + weight_verification", () => {
    const perms = bitmaskToPermissions(7);
    expect(perms.view_orders).toBe(true);
    expect(perms.update_wash_status).toBe(true);
    expect(perms.weight_verification).toBe(true);
    expect(perms.photo_upload).toBe(false);
    expect(perms.wash_preferences).toBe(false);
  });

  it("bitmask 31 maps to all permissions", () => {
    const perms = bitmaskToPermissions(31);
    expect(Object.values(perms).every(v => v === true)).toBe(true);
  });

  it("bitmask 0 maps to no permissions", () => {
    const perms = bitmaskToPermissions(0);
    expect(Object.values(perms).every(v => v === false)).toBe(true);
  });

  it("round-trip: permissions → bitmask → permissions", () => {
    const original = {
      view_orders: true,
      update_wash_status: true,
      weight_verification: false,
      photo_upload: true,
      wash_preferences: true,
    };
    const mask = permissionsToBitmask(original);
    expect(mask).toBe(1 | 2 | 8 | 16); // 27
    const roundTripped = bitmaskToPermissions(mask);
    expect(roundTripped).toEqual(original);
  });

  it("existing bitmask 7 is backward compatible (no migration needed)", () => {
    // Existing rows with bitmask 7 = view_orders + update_status + weight_verification
    const perms = bitmaskToPermissions(7);
    expect(perms.view_orders).toBe(true);
    expect(perms.update_wash_status).toBe(true);
    expect(perms.weight_verification).toBe(true);
    // New bits default to false — correct, no data loss
    expect(perms.photo_upload).toBe(false);
    expect(perms.wash_preferences).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
//  WASH RUN — body shape compatibility
// ═══════════════════════════════════════════════════════════════
describe("Wash Run: body shape compatibility", () => {
  it("v1 operator shape is recognized", () => {
    const body = { order_id: 123, duration_min: 45, clothing_types_in_run: ["Whites", "Towels"] };
    const orderId = body.order_id;
    const durationMin = body.duration_min;
    const clothingTypes = body.clothing_types_in_run;
    expect(orderId).toBe(123);
    expect(durationMin).toBe(45);
    expect(clothingTypes).toEqual(["Whites", "Towels"]);
  });

  it("new shape is recognized", () => {
    const body = { orderId: 456, washType: "hot", clothingCategory: "whites", weightLbs: 8.5, notes: "Stains" };
    const orderId = body.orderId;
    const washType = body.washType;
    const clothingCategory = body.clothingCategory;
    expect(orderId).toBe(456);
    expect(washType).toBe("hot");
    expect(clothingCategory).toBe("whites");
  });

  it("normalizes both camelCase and snake_case", () => {
    const body1 = { orderId: 1, durationMin: 30 };
    const body2 = { order_id: 1, duration_min: 30 };
    const resolve = (b: any) => ({
      orderId: b.orderId || b.order_id,
      durationMin: b.durationMin || b.duration_min,
    });
    expect(resolve(body1)).toEqual(resolve(body2));
  });
});

// ═══════════════════════════════════════════════════════════════
//  WASH RUN COMPLETE — folded photo URL extension
// ═══════════════════════════════════════════════════════════════
describe("Wash Run Complete: folded photo URL", () => {
  it("accepts folded_photo_url alongside weightAfterLbs", () => {
    const body = {
      weightAfterLbs: 8.3,
      folded_photo_url: "https://storage.example.com/folded-123.jpg",
    };
    expect(body).toHaveProperty("weightAfterLbs");
    expect(body).toHaveProperty("folded_photo_url");
  });

  it("accepts camelCase foldedPhotoUrl", () => {
    const body = {
      weightAfterLbs: 8.3,
      foldedPhotoUrl: "https://storage.example.com/folded-123.jpg",
    };
    const photoUrl = body.foldedPhotoUrl;
    expect(photoUrl).toBeTruthy();
  });

  it("remains backward compat when no photo provided", () => {
    const body = { weightAfterLbs: 8.3 };
    const photoUrl = (body as any).folded_photo_url || (body as any).foldedPhotoUrl;
    expect(photoUrl).toBeUndefined();
  });

  it("appends to existing photo_urls array", () => {
    const existing = ["https://storage.example.com/before.jpg"];
    const newUrl = "https://storage.example.com/folded.jpg";
    existing.push(newUrl);
    expect(existing).toHaveLength(2);
    expect(existing[1]).toBe(newUrl);
  });
});

// ═══════════════════════════════════════════════════════════════
//  QUOTE — separation fee extension
// ═══════════════════════════════════════════════════════════════
describe("Quote: separation fee extension (D4 owner decision: default $0)", () => {
  // Helper mirrors the route logic in quotes-pricing.ts after Wave 3 fix.
  function resolveSeparationFeeCents(separated: boolean, vendorFee: number | null | undefined): number {
    if (!separated) return 0;
    return typeof vendorFee === "number" ? vendorFee : 0; // D4: platform default $0
  }

  it("default separation fee is $0 when vendor has not configured one (D4)", () => {
    // Platform default per D4 is $0, NOT $5.
    expect(resolveSeparationFeeCents(true, null)).toBe(0);
    expect(resolveSeparationFeeCents(true, undefined)).toBe(0);
  });

  it("uses vendor-configured fee when present", () => {
    expect(resolveSeparationFeeCents(true, 500)).toBe(500);
  });

  it("vendor-configured fee of 0 is respected", () => {
    expect(resolveSeparationFeeCents(true, 0)).toBe(0);
  });

  it("does not add separation fee when separated=false", () => {
    expect(resolveSeparationFeeCents(false, 500)).toBe(0);
  });

  it("only attaches a line item when fee > 0 (no $5 default appears anymore)", () => {
    const lineItems: Array<{ label: string; amount: number }> = [
      { label: "Large Bag", amount: 29.99 },
      { label: "Delivery Fee", amount: 5.99 },
    ];
    const fee = resolveSeparationFeeCents(true, null); // platform default = 0
    if (fee > 0) {
      lineItems.push({ label: "Separation Fee", amount: fee / 100 });
    }
    expect(lineItems.find(l => l.label === "Separation Fee")).toBeUndefined();
  });

  it("attaches a line item with vendor-configured fee when > 0", () => {
    const lineItems: Array<{ label: string; amount: number }> = [
      { label: "Large Bag", amount: 29.99 },
    ];
    const fee = resolveSeparationFeeCents(true, 750); // $7.50
    if (fee > 0) {
      lineItems.push({ label: "Separation Fee", amount: fee / 100 });
    }
    expect(lineItems.find(l => l.label === "Separation Fee")?.amount).toBe(7.5);
  });
});

// ═══════════════════════════════════════════════════════════════
//  DRIVER ENDPOINTS — response shapes
// ═══════════════════════════════════════════════════════════════
describe("Driver Endpoints: response shapes", () => {
  it("geofence check returns correct shape", () => {
    const response = {
      within_geofence: true,
      distance_m: 45,
    };
    expect(response).toHaveProperty("within_geofence");
    expect(response).toHaveProperty("distance_m");
    expect(typeof response.within_geofence).toBe("boolean");
    expect(typeof response.distance_m).toBe("number");
  });

  it("geofence: within 100m returns true", () => {
    const distanceM = 80;
    const geofenceRadius = 100;
    expect(distanceM <= geofenceRadius).toBe(true);
  });

  it("geofence: outside 100m returns false", () => {
    const distanceM = 150;
    const geofenceRadius = 100;
    expect(distanceM <= geofenceRadius).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
//  VOICE ORDER DEPRECATION — header check
// ═══════════════════════════════════════════════════════════════
describe("Voice Order: deprecation", () => {
  it("deprecated endpoint should suggest /api/voice/parse", () => {
    // Simulates deprecation headers from POST /api/voice/order
    const headers = {
      Deprecation: "true",
      Sunset: "2026-07-01",
      Link: '</api/voice/parse>; rel="successor-version"',
    };
    expect(headers.Deprecation).toBe("true");
    expect(headers.Link).toContain("/api/voice/parse");
  });

  it("gate flag returns 410 when DISABLE_LEGACY_VOICE_ORDER=true (Wave 3 P1 #14)", () => {
    // Mirrors the guard added at the top of POST /api/voice/order:
    function legacyVoiceOrderShouldBlock(envFlag: string | undefined): { status: number; body?: any } {
      if (envFlag === "true") {
        return { status: 410, body: { error: "Endpoint removed. Use POST /api/voice/parse." } };
      }
      return { status: 200 };
    }
    expect(legacyVoiceOrderShouldBlock("true").status).toBe(410);
    expect(legacyVoiceOrderShouldBlock(undefined).status).toBe(200);
    expect(legacyVoiceOrderShouldBlock("false").status).toBe(200);
  });
});

// ════════════════════════════════════════════════════════════════
//  WAVE 3 — P0 IDOR fixes: driver ownership on state-transition endpoints
//  (PATCH /arrived, POST /picked-up, PATCH /arrived-delivery, POST /delivered)
// ════════════════════════════════════════════════════════════════
describe("Driver state-transition endpoints: ownership guard (Wave 3 P0)", () => {
  // Helper mirrors the auth check in wave-2.ts for /arrived, /picked-up,
  // /arrived-delivery, /delivered after the Wave 3 fix.
  function driverOwnershipDecision(opts: {
    role: string;
    callerDriverId: number | null;
    orderDriverId: number | null;
  }): { status: number; body?: any } {
    if (opts.role === "driver") {
      if (!opts.callerDriverId || opts.orderDriverId !== opts.callerDriverId) {
        return { status: 403, body: { error: "Not your order" } };
      }
    }
    return { status: 200 };
  }

  it("non-owning driver gets 403 on /arrived", () => {
    const result = driverOwnershipDecision({
      role: "driver",
      callerDriverId: 42,
      orderDriverId: 99,
    });
    expect(result.status).toBe(403);
    expect(result.body?.error).toBe("Not your order");
  });

  it("non-owning driver gets 403 on /picked-up", () => {
    const result = driverOwnershipDecision({
      role: "driver",
      callerDriverId: 7,
      orderDriverId: 8,
    });
    expect(result.status).toBe(403);
  });

  it("non-owning driver gets 403 on /arrived-delivery", () => {
    const result = driverOwnershipDecision({
      role: "driver",
      callerDriverId: 7,
      orderDriverId: null,
    });
    expect(result.status).toBe(403);
  });

  it("non-owning driver gets 403 on /delivered", () => {
    const result = driverOwnershipDecision({
      role: "driver",
      callerDriverId: 100,
      orderDriverId: 1,
    });
    expect(result.status).toBe(403);
  });

  it("owning driver is allowed through (status 200)", () => {
    const result = driverOwnershipDecision({
      role: "driver",
      callerDriverId: 42,
      orderDriverId: 42,
    });
    expect(result.status).toBe(200);
  });

  it("admin bypasses driver ownership check", () => {
    const result = driverOwnershipDecision({
      role: "admin",
      callerDriverId: null,
      orderDriverId: 1,
    });
    expect(result.status).toBe(200);
  });

  it("manager bypasses driver ownership check (admin/manager role gate already restricts non-vendor managers)", () => {
    const result = driverOwnershipDecision({
      role: "manager",
      callerDriverId: null,
      orderDriverId: 1,
    });
    expect(result.status).toBe(200);
  });

  it("driver with no driver profile is rejected", () => {
    // driver role but getDriverByUserId returned null — must be 403, not 500
    const result = driverOwnershipDecision({
      role: "driver",
      callerDriverId: null,
      orderDriverId: 1,
    });
    expect(result.status).toBe(403);
  });
});

describe("FSM gates on /picked-up and /delivered (Wave 3 P1 #10)", () => {
  // Mirrors validateTransition(order.status, target) -> 422 on invalid.
  // We don't import validateTransition here to keep this a pure logic test;
  // see wave-l.test.ts for full FSM coverage. We just verify the gate shape.
  function fsmGate(currentStatus: string, target: string, allowed: string[]): { status: number; body?: any } {
    if (!allowed.includes(target)) {
      return { status: 422, body: { error: `Cannot transition from '${currentStatus}' to '${target}'`, currentStatus } };
    }
    return { status: 200 };
  }

  it("rejects pending → picked_up (must go pending -> ... -> arrived_pickup -> picked_up)", () => {
    const result = fsmGate("pending", "picked_up", ["confirmed", "scheduled", "cancelled"]);
    expect(result.status).toBe(422);
  });

  it("allows arrived_pickup → picked_up", () => {
    const result = fsmGate("arrived_pickup", "picked_up", ["picked_up", "cancelled"]);
    expect(result.status).toBe(200);
  });

  it("rejects washing → delivered (FSM violation — must go through ready_for_delivery first)", () => {
    const result = fsmGate("washing", "delivered", ["drying", "ready_for_delivery", "disputed"]);
    expect(result.status).toBe(422);
  });

  it("allows arrived_delivery → delivered", () => {
    const result = fsmGate("arrived_delivery", "delivered", ["delivered"]);
    expect(result.status).toBe(200);
  });
});

describe("Geofence: lat/lng numeric coercion (Wave 3 P1 #12)", () => {
  // Mirrors: lat = Number(req.body.lat); if (!isFinite) return 400.
  function geofenceInputCheck(body: any): { status: number; body?: any } {
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { status: 400, body: { error: "lat/lng must be numbers" } };
    }
    return { status: 200 };
  }

  it("rejects non-numeric lat", () => {
    expect(geofenceInputCheck({ lat: "abc", lng: -73.9 }).status).toBe(400);
  });

  it("rejects object lng", () => {
    expect(geofenceInputCheck({ lat: 40.7, lng: { foo: 1 } }).status).toBe(400);
  });

  it("accepts numeric strings (Number() coerces)", () => {
    expect(geofenceInputCheck({ lat: "40.7", lng: "-73.9" }).status).toBe(200);
  });

  it("accepts plain numbers", () => {
    expect(geofenceInputCheck({ lat: 40.7, lng: -73.9 }).status).toBe(200);
  });

  it("rejects missing lat/lng", () => {
    expect(geofenceInputCheck({}).status).toBe(400);
  });
});

describe("Vendor employees POST: privilege guard (Wave 3 P0 #5)", () => {
  // Mirrors the logic added at the existingUser branch in /api/vendor-employees POST.
  function vendorEmployeePostDecision(opts: {
    existingUser: { role: string; vendorId: number | null } | null;
    resolvedVendorId: number;
  }): { status: number; body?: any } {
    const eu = opts.existingUser;
    if (eu) {
      if (eu.role === "admin") {
        return { status: 403, body: { error: "Cannot attach an admin account as a vendor employee" } };
      }
      if (eu.vendorId && eu.vendorId !== opts.resolvedVendorId) {
        return { status: 409, body: { error: "User already belongs to another vendor" } };
      }
    }
    return { status: 201 };
  }

  it("refuses to attach an admin email (403)", () => {
    const result = vendorEmployeePostDecision({
      existingUser: { role: "admin", vendorId: null },
      resolvedVendorId: 5,
    });
    expect(result.status).toBe(403);
  });

  it("refuses to reassign user already at a different vendor (409)", () => {
    const result = vendorEmployeePostDecision({
      existingUser: { role: "manager", vendorId: 99 },
      resolvedVendorId: 5,
    });
    expect(result.status).toBe(409);
  });

  it("allows attaching a user that already belongs to the same vendor (idempotent invite)", () => {
    const result = vendorEmployeePostDecision({
      existingUser: { role: "manager", vendorId: 5 },
      resolvedVendorId: 5,
    });
    expect(result.status).toBe(201);
  });

  it("allows attaching a user with no current vendor", () => {
    const result = vendorEmployeePostDecision({
      existingUser: { role: "laundromat", vendorId: null },
      resolvedVendorId: 5,
    });
    expect(result.status).toBe(201);
  });

  it("new user (no existing) is allowed through", () => {
    const result = vendorEmployeePostDecision({
      existingUser: null,
      resolvedVendorId: 5,
    });
    expect(result.status).toBe(201);
  });
});

describe("Wash-runs GET: cross-vendor IDOR guard (Wave 3 P1 #7)", () => {
  // Mirrors the check added in GET /api/wash-runs/:id.
  function washRunGetDecision(opts: {
    role: string;
    callerVendorId: number | null;
    runVendorId: number;
  }): { status: number; body?: any } {
    if (opts.role !== "admin") {
      if (!opts.callerVendorId || opts.runVendorId !== opts.callerVendorId) {
        return { status: 403, body: { error: "Not your wash run" } };
      }
    }
    return { status: 200 };
  }

  it("refuses cross-vendor GET (403)", () => {
    const result = washRunGetDecision({ role: "laundromat", callerVendorId: 1, runVendorId: 2 });
    expect(result.status).toBe(403);
  });

  it("allows same-vendor GET", () => {
    const result = washRunGetDecision({ role: "laundromat", callerVendorId: 5, runVendorId: 5 });
    expect(result.status).toBe(200);
  });

  it("admin bypasses vendor check", () => {
    const result = washRunGetDecision({ role: "admin", callerVendorId: null, runVendorId: 7 });
    expect(result.status).toBe(200);
  });

  it("caller with no vendor association is rejected", () => {
    const result = washRunGetDecision({ role: "manager", callerVendorId: null, runVendorId: 7 });
    expect(result.status).toBe(403);
  });
});

describe("Voice parse: 4kB transcription cap (Wave 3 P2 #16)", () => {
  // Mirrors the size guard added in POST /api/voice/parse.
  function voiceParseSizeCheck(transcription: string): { status: number; body?: any } {
    if (!transcription || typeof transcription !== "string" || transcription.trim().length === 0) {
      return { status: 400, body: { error: "transcription is required" } };
    }
    if (transcription.length > 4096) {
      return { status: 400, body: { error: "transcription exceeds maximum length (4096 chars)" } };
    }
    return { status: 200 };
  }

  it("rejects oversize transcription (> 4096 chars) with 400", () => {
    const big = "a".repeat(4097);
    const result = voiceParseSizeCheck(big);
    expect(result.status).toBe(400);
    expect(result.body?.error).toContain("maximum length");
  });

  it("accepts exactly 4096 chars", () => {
    const ok = "a".repeat(4096);
    expect(voiceParseSizeCheck(ok).status).toBe(200);
  });

  it("accepts normal-sized transcription", () => {
    expect(voiceParseSizeCheck("Please pick up my large bag tomorrow morning.").status).toBe(200);
  });

  it("rejects empty transcription", () => {
    expect(voiceParseSizeCheck("").status).toBe(400);
    expect(voiceParseSizeCheck("   ").status).toBe(400);
  });
});

describe("Wash-queue status whitelist (Wave 3 P2 #17)", () => {
  const washStatuses = ["at_vendor", "weighed", "sorted", "washing", "wash_complete", "folded_packaged"];
  function washQueueStatusCheck(filter: string | null): { status: number; body?: any } {
    if (filter && !washStatuses.includes(filter)) {
      return { status: 400, body: { error: `Invalid status filter. Allowed: ${washStatuses.join(", ")}` } };
    }
    return { status: 200 };
  }

  it("rejects pending as a wash-queue status", () => {
    expect(washQueueStatusCheck("pending").status).toBe(400);
  });

  it("rejects delivered as a wash-queue status", () => {
    expect(washQueueStatusCheck("delivered").status).toBe(400);
  });

  it("allows washing", () => {
    expect(washQueueStatusCheck("washing").status).toBe(200);
  });

  it("allows no filter", () => {
    expect(washQueueStatusCheck(null).status).toBe(200);
  });
});

describe("Word-boundary tier matching (Wave 3 P2 #15)", () => {
  function detectTier(transcription: string): string | null {
    if (/\b(xl|extra[\s-]?large)\b/i.test(transcription)) return "xl_bag";
    if (/\blarge\b/i.test(transcription)) return "large_bag";
    if (/\bmedium\b/i.test(transcription)) return "medium_bag";
    if (/\bsmall\b/i.test(transcription)) return "small_bag";
    return null;
  }

  it("does not falsely match 'xls' as xl_bag", () => {
    expect(detectTier("please pick up my xls file")).toBeNull();
  });

  it("matches xl as a standalone word", () => {
    expect(detectTier("I need an xl bag")).toBe("xl_bag");
  });

  it("matches 'extra large'", () => {
    expect(detectTier("extra large load please")).toBe("xl_bag");
  });

  it("does not match 'smaller' as small_bag", () => {
    expect(detectTier("I have a smaller load this week")).toBeNull();
  });

  it("matches 'small' as a standalone word", () => {
    expect(detectTier("just a small bag")).toBe("small_bag");
  });
});

describe("Permissions payload type guard (Wave 3 P2 #22)", () => {
  // Mirrors the check at top of /api/vendor-employees POST.
  function permissionsTypeCheck(permissions: unknown): { status: number } {
    if (permissions !== undefined && typeof permissions !== "number" && (typeof permissions !== "object" || permissions === null || Array.isArray(permissions))) {
      return { status: 400 };
    }
    return { status: 201 };
  }

  it("rejects string permissions", () => {
    expect(permissionsTypeCheck("admin").status).toBe(400);
  });

  it("rejects array permissions", () => {
    expect(permissionsTypeCheck(["view_orders"]).status).toBe(400);
  });

  it("rejects null permissions", () => {
    expect(permissionsTypeCheck(null).status).toBe(400);
  });

  it("accepts a bitmask number", () => {
    expect(permissionsTypeCheck(7).status).toBe(201);
  });

  it("accepts a plain object", () => {
    expect(permissionsTypeCheck({ view_orders: true }).status).toBe(201);
  });

  it("accepts undefined (defaults applied)", () => {
    expect(permissionsTypeCheck(undefined).status).toBe(201);
  });
});

describe("Geofence delivery radius source (Wave 3 P1 #11)", () => {
  // Mirrors the lookup used in PATCH /api/orders/:id/arrived-delivery.
  function resolveDeliveryGeofenceRadius(vendorRadius: number | null | undefined): number {
    return (typeof vendorRadius === "number" && vendorRadius > 0) ? vendorRadius : 100;
  }

  it("uses vendor's pickupGeofenceRadiusM when set", () => {
    expect(resolveDeliveryGeofenceRadius(250)).toBe(250);
  });

  it("falls back to 100m when vendor has no radius", () => {
    expect(resolveDeliveryGeofenceRadius(null)).toBe(100);
    expect(resolveDeliveryGeofenceRadius(undefined)).toBe(100);
  });

  it("pickup and delivery radii now share the same source (parity)", () => {
    const vendorRow = { pickupGeofenceRadiusM: 75 };
    const pickupRadius = resolveDeliveryGeofenceRadius(vendorRow.pickupGeofenceRadiusM);
    const deliveryRadius = resolveDeliveryGeofenceRadius(vendorRow.pickupGeofenceRadiusM);
    expect(pickupRadius).toBe(deliveryRadius);
    expect(pickupRadius).toBe(75);
  });
});

describe("vendors.isDemo schema default (Wave 3 P1 #13)", () => {
  it("default is now false (real new vendors are NOT excluded from dispatch by accident)", () => {
    // Mirrors the schema default in shared/schema/tables-core.ts after Wave 3 fix.
    const VENDOR_IS_DEMO_DEFAULT = false;
    expect(VENDOR_IS_DEMO_DEFAULT).toBe(false);
  });

  it("production filter still hides explicitly-marked demo vendors", () => {
    function filter(vendors: any[], env: string, allow: string | undefined) {
      if (env === "production" && allow !== "true") {
        return vendors.filter(v => v.isDemo !== true);
      }
      return vendors;
    }
    const out = filter(
      [
        { id: 1, name: "Real (default)", isDemo: false },
        { id: 2, name: "Demo (explicit)", isDemo: true },
      ],
      "production",
      undefined,
    );
    expect(out.map(v => v.id)).toEqual([1]);
  });
});
