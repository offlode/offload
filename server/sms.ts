import twilio from "twilio";

let missingConfigLogged = false;
let client: ReturnType<typeof twilio> | null = null;

export async function sendSMS(to: string, body: string): Promise<void> {
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
