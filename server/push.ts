import apn from "apn";
import { storage } from "./storage";

// ════════════════════════════════════════════════════════════════
//  APNs provider (iOS)
// ════════════════════════════════════════════════════════════════

let apnProvider: apn.Provider | null = null;
let apnWarningLogged = false;

function getApnProvider(): apn.Provider | null {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const bundleId = process.env.APNS_BUNDLE_ID || "com.offloadusa.app";
  const keyPath = process.env.APNS_KEY_PATH;

  if (!keyId || !teamId || !keyPath || !bundleId) {
    if (!apnWarningLogged) {
      console.log("[Push] APNs skipped (no config)");
      apnWarningLogged = true;
    }
    return null;
  }

  if (!apnProvider) {
    apnProvider = new apn.Provider({
      token: { key: keyPath, keyId, teamId },
      production: process.env.NODE_ENV === "production",
    });
  }

  return apnProvider;
}

// ════════════════════════════════════════════════════════════════
//  FCM (Android) — Firebase Admin SDK
// ════════════════════════════════════════════════════════════════

let fcmInitialized = false;
let fcmWarningLogged = false;

function getFcmMessaging(): import("firebase-admin/messaging").Messaging | null {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    if (!fcmWarningLogged) {
      console.log("[Push] FCM skipped (FIREBASE_SERVICE_ACCOUNT_JSON not set)");
      fcmWarningLogged = true;
    }
    return null;
  }

  if (!fcmInitialized) {
    try {
      // Dynamic import to avoid requiring firebase-admin when not configured
      const admin = require("firebase-admin") as typeof import("firebase-admin");
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      fcmInitialized = true;
    } catch (err) {
      console.error("[Push] FCM initialization failed", err);
      return null;
    }
  }

  try {
    const { getMessaging } = require("firebase-admin/messaging") as typeof import("firebase-admin/messaging");
    return getMessaging();
  } catch {
    return null;
  }
}

// ════════════════════════════════════════════════════════════════
//  Unified push sender
// ════════════════════════════════════════════════════════════════

export async function sendPushToUser(
  userId: number,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  const allTokens = await storage.getPushTokensByUser(userId);
  if (allTokens.length === 0) return;

  const iosTokens = allTokens.filter((t) => t.platform === "ios");
  const androidTokens = allTokens.filter((t) => t.platform === "android");

  // Send to iOS via APNs
  if (iosTokens.length > 0) {
    await sendApns(iosTokens, title, body, data);
  }

  // Send to Android via FCM
  if (androidTokens.length > 0) {
    await sendFcm(androidTokens, title, body, data);
  }
}

// ────────────────────────────────────────────────────────────────
//  APNs send
// ────────────────────────────────────────────────────────────────

async function sendApns(
  tokens: Array<{ userId: number; token: string; platform: string }>,
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<void> {
  const provider = getApnProvider();
  if (!provider) return;

  const bundleId = process.env.APNS_BUNDLE_ID || "com.offloadusa.app";
  const notification = new apn.Notification();
  notification.topic = bundleId;
  notification.alert = { title, body };
  notification.sound = "default";
  notification.payload = data;

  try {
    const result = await provider.send(notification, tokens.map((t) => t.token));
    for (const failed of result.failed || []) {
      const token = String(failed.device || "");
      const status = failed.status;
      if (token && (status === "410" || failed.response?.reason === "BadDeviceToken")) {
        const record = tokens.find((t) => t.token === token);
        if (record) await storage.deletePushToken(record.userId, record.token);
      }
      console.warn("[Push] APNs delivery failed", failed.response || failed.error || failed.status);
    }
  } catch (err) {
    console.error("[Push] APNs send failed", err);
  }
}

// ────────────────────────────────────────────────────────────────
//  FCM send
// ────────────────────────────────────────────────────────────────

async function sendFcm(
  tokens: Array<{ userId: number; token: string; platform: string }>,
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<void> {
  const messaging = getFcmMessaging();
  if (!messaging) return;

  // Convert data values to strings (FCM requires string values)
  const stringData: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    stringData[key] = String(value);
  }

  for (const tokenRecord of tokens) {
    try {
      await messaging.send({
        token: tokenRecord.token,
        notification: { title, body },
        data: stringData,
        android: {
          priority: "high",
          notification: {
            sound: "default",
            channelId: "offload_orders",
          },
        },
      });
    } catch (err: any) {
      const errorCode = err?.code || err?.errorInfo?.code || "";
      if (
        errorCode === "messaging/registration-token-not-registered" ||
        errorCode === "messaging/invalid-registration-token"
      ) {
        await storage.deletePushToken(tokenRecord.userId, tokenRecord.token);
      }
      console.warn("[Push] FCM delivery failed", tokenRecord.token.slice(0, 10) + "...", errorCode);
    }
  }
}
