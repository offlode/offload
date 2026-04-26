import apn from "apn";
import { storage } from "./storage";

let provider: apn.Provider | null = null;
let configWarningLogged = false;

function getProvider(): apn.Provider | null {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const bundleId = process.env.APNS_BUNDLE_ID || "com.offloadusa.app";
  const keyPath = process.env.APNS_KEY_PATH;

  if (!keyId || !teamId || !keyPath || !bundleId) {
    if (!configWarningLogged) {
      console.log("[Push] Skipped (no APNs config)");
      configWarningLogged = true;
    }
    return null;
  }

  if (!provider) {
    provider = new apn.Provider({
      token: { key: keyPath, keyId, teamId },
      production: process.env.NODE_ENV === "production",
    });
  }

  return provider;
}

export async function sendPushToUser(
  userId: number,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  const apnProvider = getProvider();
  if (!apnProvider) return;

  const bundleId = process.env.APNS_BUNDLE_ID || "com.offloadusa.app";
  const tokens = storage.getPushTokensByUser(userId).filter((t) => t.platform === "ios");
  if (tokens.length === 0) return;

  const notification = new apn.Notification();
  notification.topic = bundleId;
  notification.alert = { title, body };
  notification.sound = "default";
  notification.payload = data;

  try {
    const result = await apnProvider.send(notification, tokens.map((t) => t.token));
    for (const failed of result.failed || []) {
      const token = String(failed.device || "");
      const status = failed.status;
      if (token && (status === "410" || failed.response?.reason === "BadDeviceToken")) {
        const record = tokens.find((t) => t.token === token);
        if (record) storage.deletePushToken(record.userId, record.token);
      }
      console.warn("[Push] APNs delivery failed", failed.response || failed.error || failed.status);
    }
  } catch (err) {
    console.error("[Push] APNs send failed", err);
  }
}
