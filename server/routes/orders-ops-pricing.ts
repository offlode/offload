import type { Express } from "express";
import { z } from "zod";
import {
  LOYALTY_TIERS, PRICING_TIERS,
} from "@shared/schema";
import { storage } from "../storage";
import { pricingConfig } from "../pricing-config-service";
import { calculatePricing, getSurgePricingTierAsync, getDemandMultiplier } from "../lib/pricing";
import { logAdminAction } from "../audit-helpers";
import { requireAuth } from "../session";
import { now, notifyUser } from "../engines";

export function registerOrdersOpsPricingRoutes(app: Express) {
  // ─────────────────────────────────────────────────────────
  //  PRICING CALCULATOR (basic)
  // ─────────────────────────────────────────────────────────

  app.post("/api/pricing/calculate", requireAuth(), async (req, res) => {
    const PricingBody = z.object({ bags: z.union([z.string(), z.array(z.any())]), deliverySpeed: z.string().optional() }).strip();
    const parsedPricing = PricingBody.safeParse(req.body);
    if (!parsedPricing.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedPricing.error.issues });
    }
    const { bags, deliverySpeed } = parsedPricing.data;
    let parsedBags: any[];
    try {
      parsedBags = typeof bags === "string" ? JSON.parse(bags) : bags;
    } catch (_) {
      return res.status(400).json({ error: "Invalid bags format" });
    }
    const validBagTypes = Object.keys(PRICING_TIERS);
    for (const bag of parsedBags) {
      if (bag.type && !validBagTypes.includes(bag.type)) {
        return res.status(400).json({ error: `Invalid bag type '${bag.type}'. Must be one of: ${validBagTypes.join(", ")}` });
      }
    }
    res.json(await calculatePricing(parsedBags, deliverySpeed || "standard"));
  });

  // ─────────────────────────────────────────────────────────
  //  DYNAMIC PRICING ESTIMATE (with surge)
  // ─────────────────────────────────────────────────────────

  app.get("/api/pricing/estimate", requireAuth(), async (req, res) => {
    try {
      const { serviceType, bags, deliverySpeed, pickupTime } = req.query;
      let parsedBags: any[];
      try {
        parsedBags = bags ? JSON.parse(bags as string) : [{ type: "medium", quantity: 1 }];
      } catch (_) {
        parsedBags = [{ type: "medium", quantity: 1 }];
      }
      const speed = (deliverySpeed as string) || "48h";

      const basePrice = await calculatePricing(parsedBags, speed);
      const surge = await getSurgePricingTierAsync(pickupTime as string | undefined);
      const demandMultiplier = await getDemandMultiplier((serviceType as string) || "wash_fold");

      const surgedSubtotal = Math.round(basePrice.subtotal * surge.multiplier * demandMultiplier * 100) / 100;
      const surgedTax = Math.round(surgedSubtotal * (await pricingConfig.getTaxRate()) * 100) / 100;
      const surgedTotal = Math.round((surgedSubtotal + surgedTax + basePrice.deliveryFee) * 100) / 100;

      res.json({
        serviceType: serviceType || "wash_fold",
        bags: parsedBags,
        deliverySpeed: speed,
        pickupTime: pickupTime || new Date().toISOString(),
        basePrice: {
          subtotal: basePrice.subtotal,
          tax: basePrice.tax,
          deliveryFee: basePrice.deliveryFee,
          total: basePrice.total,
        },
        surgePricing: {
          tier: surge.tier,
          multiplier: surge.multiplier,
          reason: surge.reason,
          demandMultiplier,
        },
        finalPrice: {
          subtotal: surgedSubtotal,
          tax: surgedTax,
          deliveryFee: basePrice.deliveryFee,
          total: surgedTotal,
        },
        aiPricingTier: surge.tier,
        savings: surge.tier === "off_peak" ? Math.round((basePrice.total - surgedTotal) * 100) / 100 : 0,
      });
    } catch (err: any) {
      console.error("[/api/pricing/calculate] error:", err);
      res.status(400).json({ error: "Pricing calculation failed", code: "PRICING_ERROR" });
    }
  });

  // ─────────────────────────────────────────────────────────
  //  LOYALTY SYSTEM
  // ─────────────────────────────────────────────────────────

  app.get("/api/loyalty/:userId", requireAuth(), async (req, res) => {
    const cuL = (req as any).currentUser;
    if (cuL.role !== "admin" && cuL.role !== "manager" && cuL.id !== Number(String(req.params.userId))) {
      return res.status(403).json({ error: "Access denied" });
    }
    const userId = Number(String(req.params.userId));
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const transactions = await storage.getLoyaltyTransactions(userId);
    const tier = user.loyaltyTier || "bronze";
    const tierInfo = LOYALTY_TIERS[tier as keyof typeof LOYALTY_TIERS];
    const nextTierEntry = Object.entries(LOYALTY_TIERS).find(([t, info]) => info.minPoints > (user.loyaltyPoints || 0));

    res.json({
      userId,
      points: user.loyaltyPoints || 0,
      tier,
      tierInfo: {
        ...tierInfo,
        name: tier,
      },
      nextTier: nextTierEntry ? nextTierEntry[0] : null,
      pointsToNext: nextTierEntry ? nextTierEntry[1].minPoints - (user.loyaltyPoints || 0) : null,
      dollarValue: Math.floor((user.loyaltyPoints || 0) / 100),
      perks: tierInfo?.perks || [],
      transactions,
      totalEarned: transactions.filter(t => t.points > 0).reduce((sum, t) => sum + t.points, 0),
      totalRedeemed: Math.abs(transactions.filter(t => t.points < 0).reduce((sum, t) => sum + t.points, 0)),
    });
  });

  app.post("/api/loyalty/redeem", requireAuth(), async (req, res) => {
    const RedeemBody = z.object({ userId: z.number(), points: z.number(), orderId: z.number().optional() }).strip();
    const parsedRedeem = RedeemBody.safeParse(req.body);
    if (!parsedRedeem.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedRedeem.error.issues });
    }
    const { userId, points, orderId } = parsedRedeem.data;
    const currentUser = (req as any).currentUser;
    if (userId !== currentUser.id && !["admin", "manager"].includes(currentUser.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (points % 100 !== 0) {
      return res.status(400).json({ error: "Points must be redeemable in multiples of 100" });
    }

    const user = await storage.getUser(Number(userId));
    if (!user) return res.status(404).json({ error: "User not found" });
    if ((user.loyaltyPoints || 0) < points) {
      return res.status(400).json({ error: `Insufficient points. You have ${user.loyaltyPoints || 0} points.` });
    }

    const loyaltyConfig = await pricingConfig.getLoyaltyConfig();
    const dollarValue = points / loyaltyConfig.pointsPerDollarRedeemed;
    const newBalance = (user.loyaltyPoints || 0) - points;

    await storage.updateUser(Number(userId), { loyaltyPoints: newBalance });

    const transaction = await storage.createLoyaltyTransaction({
      userId: Number(userId),
      orderId: orderId || null,
      type: "redeemed",
      points: -points,
      description: `Redeemed ${points} points for $${dollarValue.toFixed(2)} credit${orderId ? ` on order #${orderId}` : ""}`,
      createdAt: now(),
    });

    await notifyUser(Number(userId), null, "loyalty",
      "Points Redeemed",
      `You redeemed ${points} points for $${dollarValue.toFixed(2)} credit.`,
      "/profile"
    );

    res.json({
      success: true,
      pointsRedeemed: points,
      dollarValue,
      newBalance,
      transaction,
    });
  });

  // ─────────────────────────────────────────────────────────
  //  REFERRAL SYSTEM
  // ─────────────────────────────────────────────────────────

  app.get("/api/referrals/:userId", requireAuth(), async (req, res) => {
    const cuR = (req as any).currentUser;
    if (cuR.role !== "admin" && cuR.role !== "manager" && cuR.id !== Number(String(req.params.userId))) {
      return res.status(403).json({ error: "Access denied" });
    }
    const userId = Number(String(req.params.userId));
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const referrals_ = await storage.getReferralsByUser(userId);
    const asReferrer = referrals_.filter(r => r.referrerId === userId);
    const asReferee = referrals_.filter(r => r.refereeId === userId);

    const completedCount = asReferrer.filter(r => r.status !== "pending").length;
    const pendingCount = asReferrer.filter(r => r.status === "pending").length;
    const totalRewards = asReferrer
      .filter(r => r.status === "rewarded")
      .reduce((sum, r) => sum + (r.referrerReward || 0), 0);

    // Enrich referrals with user info. F16: only admin/manager sees referee email (PII).
    const isAdmin = cuR.role === "admin" || cuR.role === "manager";
    const enrichedReferrals = asReferrer.map(async r => {
      const referee = await storage.getUser(r.refereeId);
      return {
        ...r,
        refereeName: referee ? referee.name : "Unknown",
        ...(isAdmin ? { refereeEmail: referee ? referee.email : null } : {}),
      };
    });

    res.json({
      userId,
      referralCode: user.referralCode,
      referralLink: `https://offload.app/signup?ref=${user.referralCode}`,
      stats: {
        totalReferrals: asReferrer.length,
        completed: completedCount,
        pending: pendingCount,
        totalEarned: totalRewards,
      },
      referrals: enrichedReferrals,
      referredBy: asReferee.length > 0 ? {
        referralId: asReferee[0].id,
        status: asReferee[0].status,
      } : null,
    });
  });

  app.post("/api/referrals/apply", requireAuth(), async (req, res) => {
    // F1: ALWAYS derive userId from session — never trust client body.
    const currentUser = (req as any).currentUser;
    const ReferralBody = z.object({ referralCode: z.string().min(1) }).strip();
    const parsedReferral = ReferralBody.safeParse(req.body);
    if (!parsedReferral.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedReferral.error.issues });
    }
    const { referralCode } = parsedReferral.data;
    if (!referralCode) {
      return res.status(400).json({ error: "referralCode is required" });
    }
    const userId = currentUser.id;

    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.referredBy) {
      return res.status(409).json({ error: "User has already been referred" });
    }

    // Find referrer
    const allCustomers = await storage.getUsersByRole("customer");
    const referrer = allCustomers.find(u => u.referralCode === referralCode);
    if (!referrer) {
      return res.status(404).json({ error: "Invalid referral code" });
    }
    if (referrer.id === userId) {
      return res.status(400).json({ error: "Cannot refer yourself" });
    }

    // Create referral record
    const referral = await storage.createReferral({
      referrerId: referrer.id,
      refereeId: userId,
      status: "pending",
      referrerReward: 10,
      refereeReward: 10,
      createdAt: now(),
    });

    // Update user's referredBy
    await storage.updateUser(userId, { referredBy: referrer.id });

    // Give referee 100 bonus points
    await storage.updateUser(Number(userId), {
      loyaltyPoints: (user.loyaltyPoints || 0) + 100,
    });
    await storage.createLoyaltyTransaction({
      userId: Number(userId),
      type: "referral",
      points: 100,
      description: `Referral bonus for using code ${referralCode}`,
      createdAt: now(),
    });

    await notifyUser(referrer.id, null, "system",
      "New Referral!",
      `${user.name} signed up using your referral code. You'll earn 1,000 points when they complete their first order.`,
      "/profile"
    );

    res.status(201).json({
      success: true,
      referral,
      bonusPointsAwarded: 100,
    });
  });

  // ─────────────────────────────────────────────────────────
  //  PROMO CODE SYSTEM
  // ─────────────────────────────────────────────────────────

  app.post("/api/promo/validate", requireAuth(), async (req, res) => {
    const PromoBody = z.object({ code: z.string().min(1), orderTotal: z.number().optional(), userId: z.number().optional() }).strip();
    const parsedPromo = PromoBody.safeParse(req.body);
    if (!parsedPromo.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedPromo.error.issues });
    }
    const { code, orderTotal, userId } = parsedPromo.data;
    if (!code) return res.status(400).json({ error: "Promo code is required" });

    const promo = await storage.getPromoCode(code.toUpperCase());
    if (!promo) {
      return res.status(404).json({ error: "Promo code not found", valid: false });
    }
    if (!promo.isActive) {
      return res.status(400).json({ error: "This promo code is no longer active", valid: false });
    }
    if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) {
      return res.status(400).json({ error: "This promo code has expired", valid: false });
    }
    if (promo.maxUses && promo.maxUses > 0 && (promo.usedCount || 0) >= promo.maxUses) {
      return res.status(400).json({ error: "This promo code has reached its usage limit", valid: false });
    }
    if (promo.minOrderAmount && orderTotal && orderTotal < promo.minOrderAmount) {
      return res.status(400).json({
        error: `Minimum order of $${promo.minOrderAmount.toFixed(2)} required`,
        valid: false,
        minOrderAmount: promo.minOrderAmount,
      });
    }

    // Calculate discount
    let discountAmount = 0;
    let discountDescription = "";
    const total = orderTotal || 0;

    if (promo.type === "percentage") {
      discountAmount = Math.round(total * (promo.value / 100) * 100) / 100;
      discountDescription = `${promo.value}% off`;
    } else if (promo.type === "fixed") {
      discountAmount = Math.min(promo.value, total);
      discountDescription = `$${promo.value.toFixed(2)} off`;
    } else if (promo.type === "free_delivery") {
      discountDescription = "Free delivery";
    }

    res.json({
      valid: true,
      code: promo.code,
      type: promo.type,
      value: promo.value,
      discountAmount,
      discountDescription,
      expiresAt: promo.expiresAt,
      usesRemaining: promo.maxUses ? promo.maxUses - (promo.usedCount || 0) : null,
    });
  });

  app.get("/api/admin/promos", requireAuth(["admin"]), async (_req, res) => {
    res.json(await storage.getPromoCodes());
  });

  app.post("/api/admin/promos", requireAuth(["admin"]), async (req, res) => {
    // P2-031: validate percentage value is 0-100
    const PromoCreateBody = z.object({
      code: z.string().min(1),
      type: z.enum(["percentage", "fixed", "free_delivery"]),
      value: z.number(),
      minOrderAmount: z.number().optional(),
      maxUses: z.number().optional(),
      expiresAt: z.string().optional().nullable(),
    }).strip().refine(
      (v) => v.type !== "percentage" || (v.value >= 0 && v.value <= 100),
      { message: "Percentage promo value must be between 0 and 100" }
    );
    const parsedPromo = PromoCreateBody.safeParse(req.body);
    if (!parsedPromo.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedPromo.error.issues });
    }
    const { code, type, value, minOrderAmount, maxUses, expiresAt } = parsedPromo.data;

    const existing = await storage.getPromoCode(code.toUpperCase());
    if (existing) {
      return res.status(409).json({ error: "Promo code already exists" });
    }

    const promo = await storage.createPromoCode({
      code: code.toUpperCase(),
      type,
      value,
      minOrderAmount: minOrderAmount || 0,
      maxUses: maxUses || 0,
      usedCount: 0,
      isActive: true,
      expiresAt: expiresAt || null,
      createdAt: now(),
    });
    logAdminAction(req, { action: "promo.create", entityType: "promo", entityId: promo.id, newValue: { code: promo.code, type, value } });

    res.status(201).json(promo);
  });

  app.patch("/api/admin/promos/:id", requireAuth(["admin"]), async (req, res) => {
    const PromoPatch = z.object({
      code: z.string().optional(),
      type: z.enum(["percentage", "fixed", "free_delivery"]).optional(),
      value: z.number().optional(),
      minOrderAmount: z.number().optional(),
      maxUses: z.number().optional(),
      isActive: z.preprocess((v) => typeof v === "number" ? v === 1 : v, z.boolean().optional()),
      expiresAt: z.string().optional().nullable(),
    }).strip();
    const parsed = PromoPatch.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
    }
    const promoId = Number(String(req.params.id));
    const updated = await storage.updatePromoCode(promoId, parsed.data);
    if (!updated) return res.status(404).json({ error: "Promo code not found" });
    logAdminAction(req, { action: "promo.update", entityType: "promo", entityId: promoId, newValue: parsed.data });
    res.json(updated);
  });

  app.delete("/api/admin/promos/:id", requireAuth(["admin"]), async (req, res) => {
    const promoId = Number(String(req.params.id));
    const updated = await storage.updatePromoCode(promoId, { isActive: false });
    if (!updated) return res.status(404).json({ error: "Promo code not found" });
    logAdminAction(req, { action: "promo.deactivate", entityType: "promo", entityId: promoId });
    res.json({ success: true, message: "Promo code deactivated" });
  });
}
