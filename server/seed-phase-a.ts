import { randomBytes } from "crypto";
import { pool, storage, integrityReady } from "./storage";
import { hashPassword } from "./lib/auth";

function generateId(): string {
  return randomBytes(16).toString("hex");
}

function now(): string {
  return new Date().toISOString();
}

export async function seedPhaseA(): Promise<void> {
  // Wait for tables to be created
  await integrityReady;

  console.log("[seed-phase-a] Starting Phase A seed...");

  // 1. Ensure super_admin user exists
  const superAdminEmail = "chaim.fischer@tudelu.com";
  let superAdmin = await storage.getUserByEmail(superAdminEmail);
  if (!superAdmin) {
    superAdmin = await storage.createUser({
      username: superAdminEmail,
      email: superAdminEmail,
      name: "Chaim Fischer",
      role: "super_admin",
      password: hashPassword("OffloadOwner2026!"),
      phone: "",
      memberSince: new Date().toISOString().slice(0, 10),
    });
    console.log("[seed-phase-a] Created super_admin user:", superAdminEmail);
  } else if (superAdmin.role !== "super_admin") {
    await storage.updateUser(superAdmin.id, { role: "super_admin" });
    console.log("[seed-phase-a] Upgraded existing user to super_admin:", superAdminEmail);
  }

  // 2. Create demo laundromats
  const lm1Id = generateId();
  const lm2Id = generateId();

  // Check if laundromats already exist (by name)
  const { rows: existingLms } = await pool.query(
    `SELECT id, name FROM laundromats WHERE name IN ($1, $2)`,
    ["Brooklyn Laundry Co", "Manhattan Wash Express"],
  );

  const existingNames = existingLms.map((r: any) => r.name);

  // Create owner users
  let owner1 = await storage.getUserByEmail("owner1@offload.test");
  if (!owner1) {
    owner1 = await storage.createUser({
      username: "owner1@offload.test",
      email: "owner1@offload.test",
      name: "Brooklyn Owner",
      role: "laundromat_owner",
      password: hashPassword("DemoOwner2026!"),
      phone: "",
      memberSince: new Date().toISOString().slice(0, 10),
    });
    console.log("[seed-phase-a] Created owner1 user");
  }

  let owner2 = await storage.getUserByEmail("owner2@offload.test");
  if (!owner2) {
    owner2 = await storage.createUser({
      username: "owner2@offload.test",
      email: "owner2@offload.test",
      name: "Manhattan Owner",
      role: "laundromat_owner",
      password: hashPassword("DemoOwner2026!"),
      phone: "",
      memberSince: new Date().toISOString().slice(0, 10),
    });
    console.log("[seed-phase-a] Created owner2 user");
  }

  // Brooklyn Laundry Co
  let brooklynId = lm1Id;
  if (!existingNames.includes("Brooklyn Laundry Co")) {
    await pool.query(
      `INSERT INTO laundromats (
        id, name, owner_user_id, address_line1, city, state, zip,
        lat, lng, service_radius_miles, certified, active,
        accepts_standard, accepts_signature, accepts_custom,
        signature_premium_cents, capacity_bags_per_day,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [
        lm1Id, "Brooklyn Laundry Co", owner1.id,
        "350 5th Ave", "New York", "NY", "10118",
        40.7484, -73.9857, 10, true, true,
        true, true, true, 500, 100,
        now(), now(),
      ],
    );
    console.log("[seed-phase-a] Created Brooklyn Laundry Co");
  } else {
    brooklynId = existingLms.find((r: any) => r.name === "Brooklyn Laundry Co")!.id;
  }

  // Manhattan Wash Express
  let manhattanId = lm2Id;
  if (!existingNames.includes("Manhattan Wash Express")) {
    await pool.query(
      `INSERT INTO laundromats (
        id, name, owner_user_id, address_line1, city, state, zip,
        lat, lng, service_radius_miles, certified, active,
        accepts_standard, accepts_signature, accepts_custom,
        signature_premium_cents, capacity_bags_per_day,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [
        lm2Id, "Manhattan Wash Express", owner2.id,
        "200 W 41st St", "New York", "NY", "10036",
        40.7580, -73.9855, 10, false, true,
        true, true, true, 500, 100,
        now(), now(),
      ],
    );
    console.log("[seed-phase-a] Created Manhattan Wash Express");
  } else {
    manhattanId = existingLms.find((r: any) => r.name === "Manhattan Wash Express")!.id;
  }

  // Set laundromat_id on owners
  await pool.query(`UPDATE users SET laundromat_id = $1 WHERE id = $2`, [brooklynId, owner1.id]);
  await pool.query(`UPDATE users SET laundromat_id = $1 WHERE id = $2`, [manhattanId, owner2.id]);

  // Create employee users
  let emp1 = await storage.getUserByEmail("emp1@offload.test");
  if (!emp1) {
    emp1 = await storage.createUser({
      username: "emp1@offload.test",
      email: "emp1@offload.test",
      name: "Brooklyn Employee",
      role: "laundromat_employee",
      password: hashPassword("DemoEmployee2026!"),
      phone: "",
      memberSince: new Date().toISOString().slice(0, 10),
    });
    await pool.query(`UPDATE users SET laundromat_id = $1 WHERE id = $2`, [brooklynId, emp1.id]);
    console.log("[seed-phase-a] Created emp1 user");
  }

  let emp2 = await storage.getUserByEmail("emp2@offload.test");
  if (!emp2) {
    emp2 = await storage.createUser({
      username: "emp2@offload.test",
      email: "emp2@offload.test",
      name: "Manhattan Employee",
      role: "laundromat_employee",
      password: hashPassword("DemoEmployee2026!"),
      phone: "",
      memberSince: new Date().toISOString().slice(0, 10),
    });
    await pool.query(`UPDATE users SET laundromat_id = $1 WHERE id = $2`, [manhattanId, emp2.id]);
    console.log("[seed-phase-a] Created emp2 user");
  }

  console.log("[seed-phase-a] Phase A seed complete.");
}
