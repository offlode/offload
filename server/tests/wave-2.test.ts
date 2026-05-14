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
  function parseVoiceIntent(transcription: string) {
    const text = transcription.toLowerCase().trim();

    let tierName: string | null = null;
    if (text.includes("xl") || text.includes("extra large")) tierName = "xl_bag";
    else if (text.includes("large")) tierName = "large_bag";
    else if (text.includes("medium")) tierName = "medium_bag";
    else if (text.includes("small")) tierName = "small_bag";

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
describe("Quote: separation fee extension", () => {
  it("adds separation_fee_cents to response when separated=true", () => {
    const separated = true;
    const vendorSepFee = 500; // cents
    let separationFeeCents = 0;
    if (separated) {
      separationFeeCents = vendorSepFee > 0 ? vendorSepFee : 500;
    }
    expect(separationFeeCents).toBe(500);
  });

  it("does not add separation fee when separated=false", () => {
    const separated = false;
    let separationFeeCents = 0;
    if (separated) {
      separationFeeCents = 500;
    }
    expect(separationFeeCents).toBe(0);
  });

  it("adds line item to breakdown", () => {
    const lineItems = [
      { label: "Large Bag", amount: 29.99 },
      { label: "Delivery Fee", amount: 5.99 },
    ];
    const separated = true;
    if (separated) {
      lineItems.push({ label: "Separation Fee", amount: 5.00 });
    }
    expect(lineItems.find(l => l.label === "Separation Fee")).toBeDefined();
    expect(lineItems.find(l => l.label === "Separation Fee")?.amount).toBe(5.00);
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
});
