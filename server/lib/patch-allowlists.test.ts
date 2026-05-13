import {
  VENDOR_SELF_UPDATE_FIELDS,
  DRIVER_SELF_UPDATE_FIELDS,
  ORDER_UPDATE_FIELDS,
  DISPUTE_ADMIN_UPDATE_FIELDS,
  PAYMENT_METHOD_UPDATE_FIELDS,
} from "./patch-allowlists";

// Unit-test stubs for Wave B allowlists. Wire these into the project test runner
// when one is added; they intentionally document fields that must stay blocked.
describe("Wave B PATCH allowlists", () => {
  it("blocks vendor self-service financial/scoring mass assignment fields", () => {
    expect(VENDOR_SELF_UPDATE_FIELDS).not.toContain("payoutRate");
    expect(VENDOR_SELF_UPDATE_FIELDS).not.toContain("totalEarnings");
    expect(VENDOR_SELF_UPDATE_FIELDS).not.toContain("aiHealthScore");
  });

  it("blocks driver self-service payout/performance mass assignment fields", () => {
    expect(DRIVER_SELF_UPDATE_FIELDS).not.toContain("payoutPerTrip");
    expect(DRIVER_SELF_UPDATE_FIELDS).not.toContain("totalEarnings");
    expect(DRIVER_SELF_UPDATE_FIELDS).not.toContain("completedTrips");
  });

  it("keeps general order updates to the documented role-filtered surface", () => {
    expect(ORDER_UPDATE_FIELDS).toContain("status");
    expect(ORDER_UPDATE_FIELDS).not.toContain("customerId");
    expect(ORDER_UPDATE_FIELDS).not.toContain("paymentStatus");
  });

  it("keeps dispute updates on admin resolution fields only", () => {
    expect(DISPUTE_ADMIN_UPDATE_FIELDS).toContain("status");
    expect(DISPUTE_ADMIN_UPDATE_FIELDS).not.toContain("customerId");
    expect(DISPUTE_ADMIN_UPDATE_FIELDS).not.toContain("orderId");
  });

  it("keeps payment method updates away from ownership fields", () => {
    expect(PAYMENT_METHOD_UPDATE_FIELDS).toContain("isDefault");
    expect(PAYMENT_METHOD_UPDATE_FIELDS).not.toContain("userId");
  });
});
