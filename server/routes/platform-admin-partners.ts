import type { Express } from "express";
import { z } from "zod";
import { randomBytes } from "crypto";
import { Resend } from "resend";
import { storage } from "../storage";
import { logAdminAction } from "../audit-helpers";
import { hashPassword } from "../lib/auth";
import { requireAuth } from "../session";
import { now, notifyUser } from "../engines";

// Auto-screening helper — returns {score, flags, recommendation}
function computeApplicationScore(app: any): { score: number; flags: string[]; recommendation: "approve" | "review" | "decline" } {
  const flags: string[] = [];
  let score = 0;

  // Universal acknowledgement check (mandatory for both)
  if (!app.agreesToQualityStandards) flags.push("missing_quality_standards_ack");
  if (!app.agreesToPricing) flags.push("missing_pricing_ack");
  if (!app.agreesToTermsOfService) flags.push("missing_tos_ack");
  if (!app.agreesToBackgroundCheck) flags.push("missing_background_check_ack");

  // Universal contact check
  if (!app.fullName || !app.email || !app.phone) flags.push("missing_contact");
  if (app.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(app.email)) flags.push("bad_email");

  if (app.applicantType === "driver") {
    // Required driver fields
    if (!app.vehicleType) flags.push("missing_vehicle_type");
    if (!app.licensePlate) flags.push("missing_license_plate");
    if (!app.driversLicenseNumber) flags.push("missing_dl_number");
    if (!app.driversLicenseExpiry) flags.push("missing_dl_expiry");
    if (!app.insuranceCarrier || !app.insurancePolicyNumber) flags.push("missing_insurance");
    if (!app.hasCleanDrivingRecord) flags.push("no_clean_driving_record");
    if (!app.ownsSmartphone) flags.push("no_smartphone");
    if (!app.consentBackgroundCheck) flags.push("no_bg_consent");

    // License expiry must be > 6 months out
    if (app.driversLicenseExpiry) {
      const exp = new Date(app.driversLicenseExpiry);
      const sixMonths = new Date();
      sixMonths.setMonth(sixMonths.getMonth() + 6);
      if (exp < sixMonths) flags.push("dl_expiring_soon");
    }
    // Insurance expiry must be > 30 days out
    if (app.insuranceExpiry) {
      const exp = new Date(app.insuranceExpiry);
      const thirty = new Date();
      thirty.setDate(thirty.getDate() + 30);
      if (exp < thirty) flags.push("insurance_expiring_soon");
    }
    if ((app.yearsDriving ?? 0) < 1) flags.push("low_driving_experience");
    if ((app.hoursPerWeek ?? 0) < 10) flags.push("low_hours_committed");

    // Score
    score = 100;
    const heavyFlags = ["missing_quality_standards_ack","missing_pricing_ack","missing_tos_ack","missing_background_check_ack","no_clean_driving_record","missing_insurance","missing_dl_number","no_bg_consent"];
    const lightFlags = ["dl_expiring_soon","insurance_expiring_soon","low_driving_experience","low_hours_committed","no_smartphone","missing_vehicle_type","missing_license_plate","missing_dl_expiry","missing_contact","bad_email"];
    for (const f of flags) {
      if (heavyFlags.includes(f)) score -= 25;
      else if (lightFlags.includes(f)) score -= 8;
      else score -= 5;
    }
  } else if (app.applicantType === "laundromat") {
    // Required laundromat fields
    if (!app.businessName) flags.push("missing_business_name");
    if (!app.ein) flags.push("missing_ein");
    if (!app.addressLine || !app.city || !app.state || !app.zip) flags.push("missing_business_address");
    if (!app.numberOfWashers || app.numberOfWashers < 4) flags.push("insufficient_washers");
    if (!app.numberOfDryers || app.numberOfDryers < 4) flags.push("insufficient_dryers");
    if (!app.dailyCapacityLbs || app.dailyCapacityLbs < 200) flags.push("low_capacity");
    if (!app.operatingHoursJson) flags.push("missing_operating_hours");
    if (!app.servicesOfferedJson) flags.push("missing_services_offered");
    if (!app.hasInsurance) flags.push("missing_business_insurance");
    if (!app.insuranceCarrierBiz) flags.push("missing_insurance_carrier");
    if ((app.yearsInBusiness ?? 0) < 1) flags.push("new_business");

    score = 100;
    const heavyFlags = ["missing_quality_standards_ack","missing_pricing_ack","missing_tos_ack","missing_background_check_ack","missing_business_name","missing_ein","missing_business_insurance","insufficient_washers","insufficient_dryers","low_capacity"];
    const lightFlags = ["new_business","missing_business_address","missing_operating_hours","missing_services_offered","missing_insurance_carrier","missing_contact","bad_email"];
    for (const f of flags) {
      if (heavyFlags.includes(f)) score -= 25;
      else if (lightFlags.includes(f)) score -= 8;
      else score -= 5;
    }
  } else {
    flags.push("invalid_applicant_type");
    score = 0;
  }

  score = Math.max(0, Math.min(100, score));
  let recommendation: "approve" | "review" | "decline";
  if (score >= 85 && flags.length === 0) recommendation = "approve";
  else if (score < 50) recommendation = "decline";
  else recommendation = "review";

  return { score, flags, recommendation };
}

// Send email helper (uses Resend if configured, otherwise no-op log)
async function sendPartnerEmail(toEmail: string, toName: string, subject: string, html: string) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[Email STUB] To: ${toEmail} / Subject: ${subject}`);
    return;
  }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: "Offload <notifications@offloadusa.com>",
      to: toEmail,
      subject,
      html,
    });
  } catch (err) {
    console.error("[Email] Failed to send partner email:", err);
  }
}

export function registerPlatformAdminPartnersRoutes(app: Express) {

  // POST /api/partner-applications — public endpoint, anyone can apply
  app.post("/api/partner-applications", async (req, res) => {
    try {
      const PartnerAppBody = z.object({
        applicantType: z.enum(["driver", "laundromat"]),
        fullName: z.string().min(1),
        email: z.string().email(),
        phone: z.string().min(1),
        addressLine: z.string().optional().nullable(),
        city: z.string().optional().nullable(),
        state: z.string().optional().nullable(),
        zip: z.string().optional().nullable(),
        serviceZips: z.string().optional().nullable(),
        vehicleType: z.string().optional().nullable(),
        licensePlate: z.string().optional().nullable(),
        driversLicenseNumber: z.string().optional().nullable(),
        driversLicenseState: z.string().optional().nullable(),
        driversLicenseExpiry: z.string().optional().nullable(),
        insuranceCarrier: z.string().optional().nullable(),
        insurancePolicyNumber: z.string().optional().nullable(),
        insuranceExpiry: z.string().optional().nullable(),
        hasCleanDrivingRecord: z.number().optional().nullable(),
        yearsDriving: z.number().optional().nullable(),
        availabilityJson: z.string().optional().nullable(),
        hoursPerWeek: z.number().optional().nullable(),
        ownsSmartphone: z.number().optional().nullable(),
        consentBackgroundCheck: z.number().optional().nullable(),
        businessName: z.string().optional().nullable(),
        businessLegalEntity: z.string().optional().nullable(),
        ein: z.string().optional().nullable(),
        yearsInBusiness: z.number().optional().nullable(),
        numberOfWashers: z.number().optional().nullable(),
        numberOfDryers: z.number().optional().nullable(),
        largestMachineLbs: z.number().optional().nullable(),
        dailyCapacityLbs: z.number().optional().nullable(),
        operatingHoursJson: z.string().optional().nullable(),
        servicesOfferedJson: z.string().optional().nullable(),
        acceptsCommercial: z.number().optional().nullable(),
        acceptsRushSameDay: z.number().optional().nullable(),
        hasDryCleaningOnSite: z.number().optional().nullable(),
        acceptsHypoallergenic: z.number().optional().nullable(),
        hasInsurance: z.number().optional().nullable(),
        insuranceCarrierBiz: z.string().optional().nullable(),
        agreesToQualityStandards: z.number().default(0),
        agreesToPricing: z.number().default(0),
        agreesToTermsOfService: z.number().default(0),
        agreesToBackgroundCheck: z.number().default(0),
        whyJoin: z.string().optional().nullable(),
        references: z.string().optional().nullable(),
      }).strip();
      const parsed = PartnerAppBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
      }
      const body = parsed.data;

      const screen = computeApplicationScore(body);

      // Check for duplicate pending application (same email + type)
      const existing = (await storage.getPartnerApplications({ applicantType: body.applicantType }))
        .filter((a: any) => a.email?.toLowerCase() === body.email.toLowerCase() && ["pending_review", "auto_flagged"].includes(a.status));
      if (existing.length > 0) {
        return res.status(409).json({ error: "An application with this email is already pending review", applicationId: existing[0].id });
      }

      // Determine status
      let status = "pending_review";
      if (screen.recommendation === "decline") status = "auto_flagged";
      else if (screen.flags.length > 0) status = "auto_flagged";

      const created = await storage.createPartnerApplication({
        ...body,
        status,
        autoScreenScore: screen.score,
        autoScreenFlags: JSON.stringify(screen.flags),
        autoScreenRecommendation: screen.recommendation,
        ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.socket.remoteAddress || null,
        userAgent: req.headers["user-agent"] || null,
        createdAt: now(),
      });

      // Notify admins
      try {
        const adminUsers = await storage.getUsersByRole("admin");
        const managerUsers = await storage.getUsersByRole("manager");
        const admins = [...adminUsers, ...managerUsers];
        for (const u of admins) {
          await notifyUser(u.id, null, "system",
            `New ${body.applicantType} application`,
            `${body.fullName} applied to be a ${body.applicantType}. Auto-score: ${screen.score}/100 — ${screen.recommendation}.`,
            `/applications/${created.id}`,
          );
        }
      } catch (err) {
        console.error("[PartnerApp] Failed to notify admins:", err);
      }

      // Acknowledgement email to applicant
      const partnerType = body.applicantType === "driver" ? "Driver" : "Laundromat Partner";
      sendPartnerEmail(body.email, body.fullName,
        `Your Offload ${partnerType} application is in review`,
        `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#1a1a1a;">
          <h1 style="color:#5B4BC4;font-size:22px;margin:0 0 16px;">Offload</h1>
          <h2 style="font-size:18px;">Thanks for applying, ${body.fullName.split(" ")[0]}</h2>
          <p style="line-height:1.6;color:#555;">We received your application to join Offload as a <strong>${partnerType.toLowerCase()}</strong>. Our team typically reviews applications within 1-2 business days.</p>
          <p style="line-height:1.6;color:#555;">You'll get an email at <strong>${body.email}</strong> as soon as a decision is made. If approved, that email will contain your sign-in link and temporary password.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
          <p style="color:#aaa;font-size:11px;text-align:center;">&copy; ${new Date().getFullYear()} Offload USA</p>
        </div>`,
      ).catch(() => {});

      res.status(201).json({
        ok: true,
        applicationId: created.id,
        status: created.status,
      });
    } catch (err: any) {
      console.error("[PartnerApp] create error:", err);
      res.status(500).json({ error: "Failed to submit application", code: "APPLICATION_ERROR" });
    }
  });

  // GET /api/admin/partner-applications — admin list with filters
  app.get("/api/admin/partner-applications", requireAuth(["admin", "manager"]), async (req, res) => {
    const status = req.query.status as string | undefined;
    const applicantType = req.query.applicantType as string | undefined;
    const apps = await storage.getPartnerApplications({ status, applicantType });
    res.json(apps);
  });

  // GET /api/admin/partner-applications/:id — detail
  app.get("/api/admin/partner-applications/:id", requireAuth(["admin", "manager"]), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
    const app = await storage.getPartnerApplication(id);
    if (!app) return res.status(404).json({ error: "Not found" });
    res.json(app);
  });

  // POST /api/admin/partner-applications/:id/approve
  app.post("/api/admin/partner-applications/:id/approve", requireAuth(["admin", "manager"]), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
      const app = await storage.getPartnerApplication(id);
      if (!app) return res.status(404).json({ error: "Not found" });
      if (app.status === "approved") return res.status(409).json({ error: "Already approved" });
      if (app.status === "declined") return res.status(409).json({ error: "Already declined — cannot approve" });

      // F17: use currentUser (the codebase-wide pattern), not req.user.
      const reviewerId = (req as any).currentUser?.id;

      // Check if user already exists with this email
      let user = await storage.getUserByEmail(app.email);
      let tempPassword: string | null = null;
      if (!user) {
        // Create new user
        tempPassword = randomBytes(8).toString("hex"); // 16 char temp password
        // Unique username from email + random suffix
        const baseUsername = app.email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
        const username = baseUsername + "_" + randomBytes(3).toString("hex");
        user = await storage.createUser({
          username,
          email: app.email,
          name: app.fullName,
          phone: app.phone,
          password: hashPassword(tempPassword),
          role: app.applicantType === "driver" ? "driver" : "laundromat",
        });
      } else {
        // Existing user — promote role if customer
        if (user.role === "customer") {
          await storage.updateUser(user.id, { role: app.applicantType === "driver" ? "driver" : "laundromat" });
        }
      }

      let driverId: number | null = null;
      let vendorId: number | null = null;

      if (app.applicantType === "driver") {
        const driver = await storage.createDriver({
          userId: user.id,
          name: app.fullName,
          phone: app.phone,
          vehicleType: app.vehicleType || "car",
          licensePlate: app.licensePlate || "",
          status: "offline",
        } as any);
        driverId = driver.id;
      } else {
        // Laundromat — create vendor record
        const vendor = await storage.createVendor({
          name: app.businessName || app.fullName,
          phone: app.phone,
          address: [app.addressLine, app.city, app.state, app.zip].filter(Boolean).join(", "),
          city: app.city || "",
          email: app.email,
          status: "active",
          operatingHours: app.operatingHoursJson || null,
          operatingHoursJson: app.operatingHoursJson || null,
          // D7: copy business-detail fields from application to vendor
          businessName: app.businessName || null,
          contactEmail: app.email || null,
          businessAddress: app.addressLine || null,
          businessCity: app.city || null,
          businessState: app.state || null,
          businessZip: app.zip || null,
          offersDryCleaning: app.hasDryCleaningOnSite ? 1 : 0,
          offersComforters: 1,
          offersCommercial: app.acceptsCommercial ? 1 : 0,
        } as any);
        vendorId = vendor.id;
      }

      // Update application record
      await storage.updatePartnerApplication(id, {
        status: "approved",
        reviewedByUserId: reviewerId,
        reviewedAt: now(),
        resultUserId: user.id,
        resultDriverId: driverId,
        resultVendorId: vendorId,
      });

      // Welcome email
      const isDriver = app.applicantType === "driver";
      const portalUrl = isDriver ? "https://offloadusa.com/driver" : "https://admin.offloadusa.com";
      const portalLabel = isDriver ? "Driver Portal" : "Laundromat Operations Console";
      sendPartnerEmail(app.email, app.fullName,
        `You're approved — Welcome to Offload`,
        `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#1a1a1a;">
          <h1 style="color:#5B4BC4;font-size:22px;margin:0 0 16px;">Offload</h1>
          <h2 style="font-size:20px;">Welcome aboard, ${app.fullName.split(" ")[0]}.</h2>
          <p style="line-height:1.6;color:#555;">Your application to join as a <strong>${isDriver ? "driver" : "laundromat partner"}</strong> has been <strong style="color:#10A37F;">approved</strong>. You can now sign in to your portal.</p>
          ${tempPassword ? `<div style="background:#f5f5f7;padding:16px;border-radius:8px;margin:20px 0;">
            <p style="margin:0 0 8px;font-size:13px;color:#888;">Temporary password (please change after first login):</p>
            <code style="font-size:16px;color:#1a1a1a;">${tempPassword}</code>
          </div>` : '<p style="color:#888;font-size:13px;">Sign in with your existing Offload password.</p>'}
          <div style="text-align:center;margin:28px 0;">
            <a href="${portalUrl}" style="background:#5B4BC4;color:#fff;padding:14px 36px;text-decoration:none;border-radius:8px;font-weight:600;">Open ${portalLabel}</a>
          </div>
          <p style="line-height:1.6;color:#555;font-size:14px;">Questions? Email <a href="mailto:partners@offloadusa.com" style="color:#5B4BC4;">partners@offloadusa.com</a>.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
          <p style="color:#aaa;font-size:11px;text-align:center;">&copy; ${new Date().getFullYear()} Offload USA</p>
        </div>`,
      ).catch(() => {});

      // In-app notification too
      await notifyUser(user.id, null, "system",
        `Welcome to Offload`,
        `Your ${isDriver ? "driver" : "laundromat partner"} application is approved.`,
        isDriver ? "/driver" : "/",
      );

      // F17: do NOT echo tempPassword in JSON response. It is delivered via email only.
      logAdminAction(req, { action: "partner_application.approve", entityType: "partner_application", entityId: app.id, newValue: { userId: user.id, driverId, vendorId } });
      res.json({ ok: true, userId: user.id, driverId, vendorId, tempPasswordSent: !!tempPassword });
    } catch (err: any) {
      console.error("[PartnerApp] approve error:", err);
      res.status(500).json({ error: "Failed to approve application", code: "APPLICATION_ERROR" });
    }
  });

  // POST /api/admin/partner-applications/:id/decline
  app.post("/api/admin/partner-applications/:id/decline", requireAuth(["admin", "manager"]), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
      const reason = String(req.body?.reason || "").trim();
      if (!reason) return res.status(400).json({ error: "Decline reason is required" });

      const app = await storage.getPartnerApplication(id);
      if (!app) return res.status(404).json({ error: "Not found" });
      if (app.status === "approved") return res.status(409).json({ error: "Already approved — cannot decline" });
      if (app.status === "declined") return res.status(409).json({ error: "Already declined" });

      // F17: use currentUser pattern.
      const reviewerId = (req as any).currentUser?.id;
      await storage.updatePartnerApplication(id, {
        status: "declined",
        reviewedByUserId: reviewerId,
        reviewedAt: now(),
        declineReason: reason,
      });

      // Notify applicant
      sendPartnerEmail(app.email, app.fullName,
        `Update on your Offload application`,
        `<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#1a1a1a;">
          <h1 style="color:#5B4BC4;font-size:22px;margin:0 0 16px;">Offload</h1>
          <h2 style="font-size:18px;">Hi ${app.fullName.split(" ")[0]},</h2>
          <p style="line-height:1.6;color:#555;">Thank you for applying to join Offload. After reviewing your application, we're unable to move forward at this time.</p>
          <div style="background:#f5f5f7;padding:16px;border-radius:8px;margin:20px 0;">
            <p style="margin:0 0 4px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.5px;">Reason</p>
            <p style="margin:0;color:#1a1a1a;font-size:14px;line-height:1.6;">${reason}</p>
          </div>
          <p style="line-height:1.6;color:#555;font-size:14px;">If you believe this was made in error, or your situation has changed, please email <a href="mailto:partners@offloadusa.com" style="color:#5B4BC4;">partners@offloadusa.com</a>.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
          <p style="color:#aaa;font-size:11px;text-align:center;">&copy; ${new Date().getFullYear()} Offload USA</p>
        </div>`,
      ).catch(() => {});

      logAdminAction(req, { action: "partner_application.decline", entityType: "partner_application", entityId: String(req.params.id), newValue: { reason: req.body.reason } });
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[PartnerApp] decline error:", err);
      res.status(500).json({ error: "Failed to decline application", code: "APPLICATION_ERROR" });
    }
  });

  // GET /api/admin/partner-applications/stats — counts
  app.get("/api/admin/partner-applications/stats/summary", requireAuth(["admin", "manager"]), async (_req, res) => {
    const all = await storage.getPartnerApplications();
    res.json({
      total: all.length,
      pending: all.filter((a: any) => a.status === "pending_review").length,
      autoFlagged: all.filter((a: any) => a.status === "auto_flagged").length,
      approved: all.filter((a: any) => a.status === "approved").length,
      declined: all.filter((a: any) => a.status === "declined").length,
      driverApps: all.filter((a: any) => a.applicantType === "driver").length,
      laundromatApps: all.filter((a: any) => a.applicantType === "laundromat").length,
    });
  });

}
