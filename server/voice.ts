/**
 * Voice Order API — server/voice.ts
 *
 * Endpoints:
 *   POST /api/voice/transcribe  — multipart audio upload → { text, language, durationMs }
 *   POST /api/voice/extract     — { transcript, language } → structured order fields
 *
 * Rules (non-negotiable):
 *  - English is primary; Spanish is supported as beta.
 *  - NEVER invent prices, fees, service-area claims. Fields go to existing quote endpoint on client.
 *  - Does NOT call findBestVendor / calculateQuotePrice from here.
 *  - Language other than "en" / "es" returns warning: "language_unsupported".
 *  - Per-IP rate limit: 5 transcribes/min (in-memory, acceptable for v1).
 */

import { type Express, type Request, type Response } from "express";
import multer from "multer";
import OpenAI from "openai";
import { Readable } from "stream";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

// ─── OpenAI client ────────────────────────────────────────────
function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  return new OpenAI({ apiKey });
}

// ─── Rate limiter (5 transcribes / min per IP) ────────────────
interface RateBucket {
  count: number;
  resetAt: number;
}
const rateBuckets = new Map<string, RateBucket>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

function checkVoiceRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT) return false;
  bucket.count += 1;
  return true;
}

// Clean up stale buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  Array.from(rateBuckets.entries()).forEach(([ip, bucket]) => {
    if (now > bucket.resetAt) rateBuckets.delete(ip);
  });
}, 5 * 60_000);

// ─── Multer — memory storage (audio blobs < 25 MB for Whisper) ─
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Accept common audio MIME types
    const ALLOWED_MIME = [
      "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg",
      "audio/wav", "audio/x-wav", "audio/flac", "audio/m4a",
      "audio/mp3", "application/octet-stream",
    ];
    cb(null, ALLOWED_MIME.includes(file.mimetype) || file.mimetype.startsWith("audio/"));
  },
});

// ─── Extraction JSON Schema ────────────────────────────────────
const EXTRACT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    serviceType: {
      type: ["string", "null"],
      enum: ["wash_fold", "dry_cleaning", "comforters", "alterations", "mixed", null],
    },
    bagSize: {
      type: ["string", "null"],
      enum: ["small", "medium", "large", "xl", null],
    },
    deliverySpeed: {
      type: ["string", "null"],
      enum: ["standard", "next_day", "same_day", null],
    },
    pickupAddress: { type: ["string", "null"] },
    pickupWindow: {
      type: ["object", "null"],
      properties: {
        date: { type: "string" },
        timeStart: { type: "string" },
        timeEnd: { type: "string" },
      },
      additionalProperties: false,
    },
    preferences: {
      type: "object",
      properties: {
        detergent: { type: "string" },
        washTemp: { type: "string" },
        addons: { type: "array", items: { type: "string" } },
        notes: { type: "string" },
      },
      additionalProperties: false,
    },
    confidence: {
      type: "object",
      properties: {
        service: { type: "number" },
        bagSize: { type: "number" },
        address: { type: "number" },
        window: { type: "number" },
      },
      required: ["service", "bagSize", "address", "window"],
      additionalProperties: false,
    },
    missingFields: { type: "array", items: { type: "string" } },
    language: { type: "string", enum: ["en", "es"] },
  },
  required: [
    "serviceType", "bagSize", "deliverySpeed", "pickupAddress",
    "pickupWindow", "preferences", "confidence", "missingFields", "language",
  ],
  additionalProperties: false,
};

const EXTRACTION_SYSTEM_PROMPT = `You are a structured data extractor for Offload, a laundry pickup-and-delivery service operating in New York City.

Your ONLY job is to parse a spoken order transcript and return a JSON object matching the provided schema.

STRICT RULES — violating any of these is an error:
1. NEVER invent, guess, or output any prices, dollar amounts, fees, or costs. Leave those fields absent.
2. NEVER make claims about service areas, coverage zones, or availability.
3. NEVER add extra fields or commentary outside the JSON schema.
4. All enum fields MUST use only the exact permitted values or null.

Valid values:
- serviceType: "wash_fold" | "dry_cleaning" | "comforters" | "alterations" | "mixed" | null
- bagSize: "small" | "medium" | "large" | "xl" | null
  (small ≈ 10-15 lbs, medium ≈ 20-25 lbs, large ≈ 30-35 lbs, xl ≈ 40+ lbs)
- deliverySpeed: "standard" | "next_day" | "same_day" | null

For confidence scores, output a number 0.0–1.0 per field.
For missingFields, list which of ["serviceType","bagSize","deliverySpeed","pickupAddress","pickupWindow"] are absent or unclear.
For language, output "en" if the transcript is English, "es" if Spanish.

Respond ONLY with valid JSON matching the schema — no prose, no markdown fences.`;

// ─── Route registration ────────────────────────────────────────
export function registerVoiceRoutes(app: Express): void {

  // ── POST /api/voice/transcribe ──────────────────────────────
  app.post(
    "/api/voice/transcribe",
    upload.single("audio"),
    async (req: Request, res: Response): Promise<void> => {
      // Rate limit check
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
      if (!checkVoiceRateLimit(ip)) {
        res.status(429).json({ error: "Rate limit exceeded. Max 5 transcriptions per minute.", retryHint: "Wait 60 seconds and try again." });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: "No audio file provided. Use multipart field name: audio" });
        return;
      }

      const startMs = Date.now();

      // Write buffer to a temp file so the OpenAI SDK can upload it correctly
      const ext = req.file.originalname
        ? path.extname(req.file.originalname) || ".webm"
        : ".webm";
      const tmpPath = path.join(os.tmpdir(), `voice_${Date.now()}${ext}`);

      try {
        fs.writeFileSync(tmpPath, req.file.buffer);

        const openai = getOpenAI();
        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(tmpPath) as any,
          model: "whisper-1",
          response_format: "verbose_json",
          // Let Whisper auto-detect language; we inspect the returned `language` field
        });

        const durationMs = Date.now() - startMs;
        const detectedLang = (transcription as any).language || "en";
        const text = transcription.text || "";

        // Normalise Whisper's full language names to codes
        const langCode = normaliseLanguage(detectedLang);

        if (langCode !== "en" && langCode !== "es") {
          res.json({
            text,
            language: langCode,
            durationMs,
            warning: "language_unsupported",
          });
          return;
        }

        res.json({ text, language: langCode, durationMs });
      } catch (err: any) {
        console.error("[Voice] transcribe error:", err?.message || err);
        res.status(500).json({ error: "Transcription failed", retryHint: "Check audio format and try again." });
      } finally {
        // Clean up temp file
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      }
    },
  );

  // ── POST /api/voice/extract ─────────────────────────────────
  app.post("/api/voice/extract", async (req: Request, res: Response): Promise<void> => {
    const { transcript, language } = req.body as { transcript?: string; language?: string };

    if (!transcript || typeof transcript !== "string" || transcript.trim().length === 0) {
      res.status(400).json({ error: "transcript is required", retryHint: "Provide a non-empty transcript string." });
      return;
    }

    const lang = language || "en";
    if (lang !== "en" && lang !== "es") {
      res.status(422).json({
        error: "Unsupported language",
        retryHint: "Only English (en) and Spanish (es) are supported. Use the English transcript.",
      });
      return;
    }

    try {
      const openai = getOpenAI();

      // Try json_schema first (GPT-4o-mini supports it); fall back to json_object
      let parsed: any;
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "voice_order_extraction",
              strict: true,
              schema: EXTRACT_RESPONSE_SCHEMA,
            },
          } as any,
          messages: [
            { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
            {
              role: "user",
              content: `Transcript (language: ${lang}):\n${transcript.trim()}`,
            },
          ],
          max_tokens: 512,
          temperature: 0,
        });
        const raw = completion.choices[0]?.message?.content || "{}";
        parsed = JSON.parse(raw);
      } catch (schemaErr: any) {
        // Fallback to json_object if json_schema not supported
        if (schemaErr?.status === 400 || schemaErr?.message?.includes("json_schema")) {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
              {
                role: "user",
                content: `Transcript (language: ${lang}):\n${transcript.trim()}`,
              },
            ],
            max_tokens: 512,
            temperature: 0,
          });
          const raw = completion.choices[0]?.message?.content || "{}";
          parsed = JSON.parse(raw);
        } else {
          throw schemaErr;
        }
      }

      // Validate required top-level shape
      if (!parsed || typeof parsed !== "object") {
        res.status(422).json({ error: "Extraction returned invalid JSON", retryHint: "Try re-recording your order." });
        return;
      }

      // Sanitise confidence object (defaults)
      if (!parsed.confidence || typeof parsed.confidence !== "object") {
        parsed.confidence = { service: 0, bagSize: 0, address: 0, window: 0 };
      }
      if (!Array.isArray(parsed.missingFields)) parsed.missingFields = [];
      if (!parsed.preferences || typeof parsed.preferences !== "object") parsed.preferences = {};
      parsed.language = lang;

      res.json(parsed);
    } catch (err: any) {
      console.error("[Voice] extract error:", err?.message || err);
      res.status(422).json({
        error: "Extraction failed",
        retryHint: "Re-record your order or type it manually.",
      });
    }
  });
}

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Map Whisper's verbose language names (e.g. "english", "spanish") to ISO-639-1 codes.
 * Whisper returns lowercase full names in verbose_json mode.
 */
function normaliseLanguage(lang: string): string {
  const l = lang.toLowerCase().trim();
  if (l === "en" || l === "english") return "en";
  if (l === "es" || l === "spanish" || l === "español") return "es";
  // Return the raw value; caller checks for "en"/"es" and emits warning otherwise
  return l;
}
