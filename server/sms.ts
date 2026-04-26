import twilio from "twilio";

let missingConfigLogged = false;
let client: ReturnType<typeof twilio> | null = null;

let smsDisabledLogged = false;

export async function sendSMS(to: string, body: string): Promise<void> {
  // Hard gate: SMS is OFF unless ENABLE_SMS is explicitly set to "true".
  // Per product decision (2026-04-26): notifications are email + in-app only.
  if ((process.env.ENABLE_SMS || "").toLowerCase() !== "true") {
    if (!smsDisabledLogged) {
      console.log("[SMS] Disabled (ENABLE_SMS!=true). Set ENABLE_SMS=true to turn on.");
      smsDisabledLogged = true;
    }
    return;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !from) {
    if (!missingConfigLogged) {
      console.log("[SMS] Skipped (no Twilio config)");
      missingConfigLogged = true;
    }
    return;
  }

  if (!to) return;

  try {
    client ||= twilio(accountSid, authToken);
    await client.messages.create({ to, from, body });
  } catch (err) {
    console.error("[SMS] Send failed", err);
  }
}
